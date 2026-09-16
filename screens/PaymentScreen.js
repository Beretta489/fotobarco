// =============================================================================
// TELA DE PAGAMENTO -- Pix (QR Code) e Cartao (InfiniteTap)
// =============================================================================
// Dois fluxos com formatos opostos:
//
//   PIX     -> mostra QR Code na tela; o cliente escaneia com o celular dele.
//              O app fica aqui, perguntando ao servidor se ja caiu.
//
//   CARTAO  -> SAI do app, abre o InfinitePay, o cliente aproxima o cartao no
//              proprio tablet, e o resultado volta por deeplink.
//
// REGRA QUE VALE PARA OS DOIS:
//   Esta tela nunca decide que um pagamento aconteceu. Ela so mostra o que o
//   servidor respondeu. O retorno do deeplink e tratado como "o cliente voltou",
//   nunca como "o cliente pagou" -- quem confirma e a Edge Function.
// =============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Clipboard, ActivityIndicator, StatusBar, Animated, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
import { infinitePayService, mensagemDeErro } from '../services/infinitepay';
import { onTapResult, limparResultadoPendente } from '../utils/deeplink';
import { colors, spacing, radius } from '../utils/theme';

const PIX_POLL_MS = 3000;

// Fases da tela. Deixar explicito evita o emaranhado de booleanos que a versao
// anterior tinha (loading + confirming + errorMsg se sobrepondo).
const FASE = {
  CRIANDO: 'criando',           // pedindo a cobranca ao servidor
  PIX_AGUARDANDO: 'pix',        // QR na tela, perguntando se caiu
  TAP_ABRINDO: 'tap_abrindo',   // saindo para o app InfinitePay
  TAP_AGUARDANDO: 'tap_espera', // fora do app, esperando voltar
  CONFIRMANDO: 'confirmando',   // servidor conferindo com a InfinitePay
  ERRO: 'erro',
};

export default function PaymentScreen({ route, navigation }) {
  const {
    session, group, photoIds, photos, packageType,
    extras = [], clientPhone, paymentMethod = 'pix', totalEstimado = 0,
  } = route.params;

  const ehPix = paymentMethod === 'pix';

  const [fase, setFase] = useState(FASE.CRIANDO);
  const [erro, setErro] = useState('');
  const [podeRepetir, setPodeRepetir] = useState(true);
  const [intent, setIntent] = useState(null);
  const [copiado, setCopiado] = useState(false);
  const [tempoRestante, setTempoRestante] = useState(0);

  const pulse = useRef(new Animated.Value(1)).current;
  const pollRef = useRef(null);
  const timerRef = useRef(null);
  const montadoRef = useRef(true);
  const criandoRef = useRef(false);   // trava contra criar duas cobrancas

  // O retorno do Tap pode chegar ANTES de 'intent' existir no estado -- basta o
  // cliente pagar muito rapido, ou o Android reabrir o app pelo proprio
  // deeplink. Ler o intent por ref (em vez do estado capturado no closure) e
  // guardar o retorno orfao evita perder um pagamento ja efetuado.
  const intentRef = useRef(null);
  const retornoOrfaoRef = useRef(null);

  // Valor exibido: enquanto o servidor nao responde, usa a estimativa da tela
  // anterior. Assim que o intent chega, passa a mostrar o valor REAL cobrado.
  const valorExibido = intent ? intent.amountCents / 100 : totalEstimado;

  const limparTimers = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  // ---------------------------------------------------------------- montagem --
  useEffect(() => {
    montadoRef.current = true;
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.04, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
    ).start();

    return () => {
      montadoRef.current = false;
      limparTimers();
      // Retorno que chegue depois de sair da tela nao interessa mais.
      limparResultadoPendente();
    };
  }, [limparTimers, pulse]);

  // ------------------------------------------------- conclusao do pagamento --
  const concluir = useCallback((resposta) => {
    limparTimers();
    if (!montadoRef.current) return;

    // ConfirmationScreen espera um objeto de pedido com download_token.
    navigation.replace('Confirmation', {
      order: {
        id: resposta.orderId,
        download_token: resposta.downloadToken,
        download_expires_at: resposta.downloadExpiresAt,
        client_phone: clientPhone,
        total: valorExibido,
      },
      photos,
    });
  }, [navigation, photos, clientPhone, valorExibido, limparTimers]);

  const falhar = useCallback((codigo, permiteRepetir = true) => {
    limparTimers();
    if (!montadoRef.current) return;
    setErro(mensagemDeErro(codigo));
    setPodeRepetir(permiteRepetir);
    setFase(FASE.ERRO);
  }, [limparTimers]);

  // ------------------------------------------------------ 1. abrir cobranca --
  const abrirCobranca = useCallback(async () => {
    // Sem esta trava, um toque duplo em "tentar novamente" criaria dois pedidos
    // e o cliente poderia ser cobrado duas vezes.
    if (criandoRef.current) return;
    criandoRef.current = true;

    limparTimers();
    setErro('');
    setFase(FASE.CRIANDO);

    try {
      const resposta = await infinitePayService.createIntent({
        sessionId: session.id,
        groupId: group?.id,
        packageType,
        photoIds,
        extras,
        clientPhone,
        paymentMethod,
        installments: 1,
      });

      if (!montadoRef.current) return;
      setIntent(resposta);

      const restante = Math.max(
        0,
        Math.floor((new Date(resposta.expiresAt).getTime() - Date.now()) / 1000),
      );
      setTempoRestante(restante);

      timerRef.current = setInterval(() => {
        setTempoRestante((t) => {
          if (t <= 1) { clearInterval(timerRef.current); timerRef.current = null; return 0; }
          return t - 1;
        });
      }, 1000);

      if (ehPix) {
        setFase(FASE.PIX_AGUARDANDO);
        iniciarPollingPix(resposta.orderNsu);
      } else {
        setFase(FASE.TAP_ABRINDO);
        await abrirTap(resposta.deeplink);
      }
    } catch (e) {
      falhar(e.code, true);
    } finally {
      criandoRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, group, packageType, photoIds, extras, clientPhone, paymentMethod, ehPix]);

  useEffect(() => { abrirCobranca(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------- 2a. PIX ----
  // Quem confirma o Pix e o webhook da InfinitePay; este polling so le o
  // resultado que o webhook ja gravou no banco.
  const iniciarPollingPix = useCallback((orderNsu) => {
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      try {
        const r = await infinitePayService.checkPixStatus(orderNsu);
        if (!montadoRef.current) return;

        if (r.status === 'paid') {
          concluir(r);
        } else if (r.status === 'expired' || r.status === 'failed') {
          falhar(r.error || 'PAGAMENTO_EXPIRADO', true);
        }
        // 'pending' = segue esperando, sem mexer na tela.
      } catch (_) {
        // Falha de rede durante o polling e ignorada de proposito: a proxima
        // volta tenta de novo. Derrubar a tela por um soluco de internet faria
        // o operador refazer um pedido que talvez ja tenha sido pago.
      }
    }, PIX_POLL_MS);
  }, [concluir, falhar]);

  // ------------------------------------------------------------ 2b. CARTAO --
  const abrirTap = useCallback(async (deeplink) => {
    try {
      await infinitePayService.openTap(deeplink);
      if (montadoRef.current) setFase(FASE.TAP_AGUARDANDO);
    } catch (e) {
      falhar(e.code, true);
    }
  }, [falhar]);

  /** Manda o retorno do Tap para o servidor conferir. */
  const processarRetornoTap = useCallback(async (resultado) => {
    if (!montadoRef.current) return;
    setFase(FASE.CONFIRMANDO);

    try {
      const r = await infinitePayService.confirmTap({
        orderNsu: resultado.orderNsu,
        transactionNsu: resultado.transactionNsu,
        aut: resultado.aut,
        cardBrand: resultado.cardBrand,
        warning: resultado.warning,
      });
      if (r.status === 'paid') concluir(r);
      else falhar(r.error || 'PAGAMENTO_NAO_CONFIRMADO', true);
    } catch (e) {
      // PROVEDOR_INDISPONIVEL vem com retry: o dinheiro pode ter sido
      // capturado, entao oferecemos reconferir em vez de refazer o pedido.
      falhar(e.code, true);
    }
  }, [concluir, falhar]);

  // Mantem a ref em dia e resgata um retorno que tenha chegado cedo demais.
  useEffect(() => {
    intentRef.current = intent;
    if (intent && retornoOrfaoRef.current) {
      const pendente = retornoOrfaoRef.current;
      retornoOrfaoRef.current = null;
      if (pendente.orderNsu === intent.orderNsu) processarRetornoTap(pendente);
    }
  }, [intent, processarRetornoTap]);

  // Escuta o retorno do InfiniteTap. Inscrito uma unica vez (nao depende de
  // 'intent'), para nao haver janela em que o listener esta fora do ar.
  useEffect(() => {
    if (ehPix) return undefined;

    const cancelar = onTapResult((resultado) => {
      if (!montadoRef.current) return;

      const atual = intentRef.current;
      if (!atual) {
        // Cobranca ainda nao registrada no estado: guarda em vez de descartar.
        // Descartar aqui significaria perder um pagamento ja efetuado.
        retornoOrfaoRef.current = resultado;
        return;
      }
      if (resultado.orderNsu !== atual.orderNsu) return;  // retorno de outro pedido

      processarRetornoTap(resultado);
    });

    return cancelar;
  }, [ehPix, processarRetornoTap]);

  /** Reconfere sem criar pedido novo -- para quando a confirmacao falhou. */
  const reconferir = useCallback(async () => {
    if (!intent) return;
    setErro('');
    setFase(FASE.CONFIRMANDO);
    try {
      const r = await infinitePayService.checkPixStatus(intent.orderNsu);
      if (r.status === 'paid') concluir(r);
      else falhar(r.error || 'PAGAMENTO_NAO_CONFIRMADO', true);
    } catch (e) {
      falhar(e.code, true);
    }
  }, [intent, concluir, falhar]);

  const copiarLink = () => {
    if (!intent?.checkoutUrl) return;
    Clipboard.setString(intent.checkoutUrl);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  // ------------------------------------------------------------------ render --
  const minutos = Math.floor(tempoRestante / 60);
  const segundos = tempoRestante % 60;
  const relogio = `${String(minutos).padStart(2, '0')}:${String(segundos).padStart(2, '0')}`;
  const expirou = tempoRestante === 0 && intent && fase === FASE.PIX_AGUARDANDO;

  const titulo = ehPix ? 'Pagamento via Pix'
    : paymentMethod === 'debit' ? 'Pagamento Débito' : 'Pagamento Crédito';

  return (
    <LinearGradient
      colors={['#003566', '#0077B6', '#00B4D8']}
      style={styles.container}
      start={{ x: 0, y: 0 }} end={{ x: 0.3, y: 1 }}
    >
      <StatusBar hidden />
      <View style={styles.sun} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Voltar</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.dolphin}>🐬</Text>
          <Text style={styles.title}>{titulo}</Text>
        </View>
        <View style={{ width: 70 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        <View style={styles.amountCard}>
          <Text style={styles.amountLabel}>VALOR A PAGAR</Text>
          <Text style={styles.amount}>R$ {Number(valorExibido).toFixed(2)}</Text>
          <Text style={styles.amountSub}>Jangalancha Show</Text>
        </View>

        {/* ---------------------------------------------------- criando ---- */}
        {fase === FASE.CRIANDO && (
          <View style={styles.box}>
            <ActivityIndicator color={colors.gold} size="large" />
            <Text style={styles.boxText}>
              {ehPix ? 'Gerando o Pix...' : 'Preparando a maquininha...'}
            </Text>
          </View>
        )}

        {/* ------------------------------------------------------- erro ---- */}
        {fase === FASE.ERRO && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{erro}</Text>
            <View style={styles.errorActions}>
              {intent && (
                <TouchableOpacity style={styles.secondaryBtn} onPress={reconferir}>
                  <Text style={styles.secondaryText}>Já paguei — verificar</Text>
                </TouchableOpacity>
              )}
              {podeRepetir && (
                <TouchableOpacity style={styles.retryBtn} onPress={abrirCobranca}>
                  <Text style={styles.retryText}>Tentar novamente</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* -------------------------------------------------------- PIX ---- */}
        {fase === FASE.PIX_AGUARDANDO && intent?.checkoutUrl && (
          <>
            <Text style={styles.instruction}>
              Peça para o cliente escanear com a câmera do celular:
            </Text>

            <Animated.View style={[styles.qrWrapper, { transform: [{ scale: pulse }] }]}>
              <View style={styles.qrInner}>
                <QRCode
                  value={intent.checkoutUrl}
                  size={200}
                  color="#003566"
                  backgroundColor="#FFFFFF"
                />
              </View>
            </Animated.View>

            <View style={[styles.timerBadge, expirou && styles.timerExpired]}>
              <Text style={styles.timerIcon}>{expirou ? '⏰' : '⏱'}</Text>
              <Text style={[styles.timerText, expirou && { color: colors.error }]}>
                {expirou ? 'Pix expirado' : `Expira em ${relogio}`}
              </Text>
            </View>

            <TouchableOpacity style={styles.copyBtn} onPress={copiarLink}>
              <Text style={styles.copyText}>
                {copiado ? '✓ Link copiado!' : '📋 Copiar link de pagamento'}
              </Text>
            </TouchableOpacity>

            <View style={styles.box}>
              <ActivityIndicator color={colors.gold} />
              <Text style={styles.boxText}>Aguardando confirmação do pagamento...</Text>
            </View>
          </>
        )}

        {/* ----------------------------------------------------- CARTAO ---- */}
        {(fase === FASE.TAP_ABRINDO || fase === FASE.TAP_AGUARDANDO) && (
          <View style={styles.box}>
            <Text style={styles.bigEmoji}>💳</Text>
            <Text style={styles.boxTitle}>
              {fase === FASE.TAP_ABRINDO ? 'Abrindo a maquininha...' : 'Aguardando o pagamento'}
            </Text>
            <Text style={styles.boxText}>
              Peça para o cliente aproximar o cartão no aparelho.{'\n'}
              Ao terminar, você volta para cá automaticamente.
            </Text>
            <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.sm }} />

            {/* Saida manual: se o app InfinitePay travar ou o operador voltar
                sem concluir, da para reconferir sem refazer o pedido. */}
            {fase === FASE.TAP_AGUARDANDO && (
              <TouchableOpacity style={styles.secondaryBtn} onPress={reconferir}>
                <Text style={styles.secondaryText}>Verificar pagamento</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ------------------------------------------------- confirmando ---- */}
        {fase === FASE.CONFIRMANDO && (
          <View style={styles.box}>
            <ActivityIndicator color={colors.success} size="large" />
            <Text style={styles.boxTitle}>Confirmando pagamento...</Text>
            <Text style={styles.boxText}>Conferindo com a InfinitePay. Não feche o app.</Text>
          </View>
        )}

      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  sun: {
    position: 'absolute', top: -80, right: -80,
    width: 260, height: 260, borderRadius: 130,
    backgroundColor: colors.gold, opacity: 0.08,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  backText: { color: colors.accentLight, fontSize: 15, fontWeight: '600' },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'center' },
  dolphin: { fontSize: 20 },
  title: { fontSize: 18, fontWeight: '900', color: colors.white },
  content: {
    alignItems: 'center', paddingHorizontal: spacing.xl, gap: spacing.lg,
    paddingTop: spacing.md, paddingBottom: spacing.xl,
  },
  amountCard: {
    backgroundColor: 'rgba(255,214,10,0.12)',
    borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(255,214,10,0.3)',
    paddingVertical: spacing.md, paddingHorizontal: spacing.xl,
    alignItems: 'center', width: '100%',
  },
  amountLabel: { fontSize: 11, letterSpacing: 2, color: colors.gray400, fontWeight: '700' },
  amount: { fontSize: 42, fontWeight: '900', color: colors.gold },
  amountSub: { fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  instruction: { fontSize: 15, color: colors.accentLight, textAlign: 'center' },
  qrWrapper: {
    padding: 6, borderRadius: radius.lg,
    borderWidth: 3, borderColor: colors.gold, backgroundColor: colors.white,
    shadowColor: colors.gold, shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 4 }, shadowRadius: 12, elevation: 8,
  },
  qrInner: {
    padding: 12, borderRadius: radius.md, backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center', minWidth: 224, minHeight: 224,
  },
  timerBadge: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: radius.full,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.lg,
  },
  timerExpired: { backgroundColor: 'rgba(255,71,87,0.15)' },
  timerIcon: { fontSize: 18 },
  timerText: { fontSize: 18, fontWeight: '700', color: colors.accentLight },
  copyBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: radius.full,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.xl,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  copyText: { fontSize: 16, color: colors.white, fontWeight: '600' },
  box: {
    alignItems: 'center', gap: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: radius.lg, padding: spacing.lg,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', width: '100%',
  },
  bigEmoji: { fontSize: 44 },
  boxTitle: { fontSize: 17, fontWeight: '800', color: colors.white, textAlign: 'center' },
  boxText: { fontSize: 14, color: colors.accentLight, textAlign: 'center', lineHeight: 20 },
  errorBox: {
    width: '100%', backgroundColor: 'rgba(255,71,87,0.1)',
    borderColor: 'rgba(255,71,87,0.3)', borderWidth: 1,
    borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md, alignItems: 'center',
  },
  errorText: { color: colors.error, fontSize: 15, textAlign: 'center' },
  errorActions: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', justifyContent: 'center' },
  retryBtn: {
    backgroundColor: colors.gold, borderRadius: radius.full,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.lg,
  },
  retryText: { color: colors.primary, fontWeight: '800' },
  secondaryBtn: {
    backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: radius.full,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.lg,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', marginTop: spacing.sm,
  },
  secondaryText: { color: colors.white, fontWeight: '700' },
});
