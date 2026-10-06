// =============================================================================
// PEDIDOS PENDENTES -- resgate manual de Pix que o webhook nao confirmou
// =============================================================================
// QUANDO ESTA TELA E USADA
//
// O cliente pagou o Pix, mostra o comprovante no celular, mas o tablet continua
// dizendo "aguardando". Isso acontece quando o aviso da InfinitePay (webhook)
// nao chega ate o servidor -- internet do barco oscilando, por exemplo. O
// pedido fica pendente, vence em 15 minutos, e o cliente vai embora sem as
// fotos.
//
// Aqui o operador abre o pedido, digita o NSU do comprovante e o servidor
// confere a transacao direto na InfinitePay antes de liberar.
//
// O QUE ESTA TELA NAO FAZ
//
// Ela nao marca nada como pago. Toda a decisao acontece na Edge Function
// payment-recover: valor conferido no provedor, transacao nao reutilizada,
// dentro da janela de recuperacao. Se a conferencia nao passar, a tela so
// mostra o motivo -- nao existe botao que force a liberacao.
// =============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, ActivityIndicator, StatusBar, RefreshControl, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { pendingPaymentsService } from '../services/pendingPayments';
import { infinitePayService, mensagemDeErro } from '../services/infinitepay';
import { authService } from '../services/auth';
import { colors, spacing, radius } from '../utils/theme';

const formatarValor = (centavos) =>
  `R$ ${(centavos / 100).toFixed(2).replace('.', ',')}`;

const formatarQuando = (iso) => {
  const d = new Date(iso);
  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  const hora = d.toTimeString().slice(0, 5);
  if (mesmoDia) return `hoje ${hora}`;
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1)
    .toString().padStart(2, '0')} ${hora}`;
};

export default function PendingOrdersScreen({ navigation }) {
  const [itens, setItens] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);

  const [abertoId, setAbertoId] = useState(null);
  const [nsu, setNsu] = useState('');
  const [liberando, setLiberando] = useState(false);
  const [resultado, setResultado] = useState(null); // { tipo, texto, link? }

  // Pedidos liberados nesta sessao da tela. Eles continuam na lista de
  // proposito: se sumissem na hora, o link de download sumiria junto, e esse
  // link e exatamente o que o operador precisa passar para o cliente que esta
  // parado na frente dele. Some no proximo refresh.
  const [liberados, setLiberados] = useState({});

  const montado = useRef(true);
  useEffect(() => () => { montado.current = false; }, []);

  const carregar = useCallback(async () => {
    try {
      const sessao = await authService.getSession();
      if (!sessao) {
        navigation.replace('AdminLogin');
        return;
      }
      const lista = await pendingPaymentsService.listarPixPendentes();
      if (!montado.current) return;
      setItens(lista);
    } catch (_) {
      if (!montado.current) return;
      Alert.alert('Erro', 'Nao foi possivel carregar os pedidos pendentes.');
    } finally {
      if (montado.current) { setCarregando(false); setAtualizando(false); }
    }
  }, [navigation]);

  useEffect(() => { carregar(); }, [carregar]);

  const abrir = (item) => {
    // Trocar de pedido limpa o campo: um NSU digitado para um pedido nao pode
    // sobrar na tela e acabar enviado para outro por descuido.
    setAbertoId(abertoId === item.id ? null : item.id);
    setNsu('');
    setResultado(null);
  };

  const liberar = async (item) => {
    const limpo = nsu.trim();
    if (!limpo) {
      setResultado({ tipo: 'erro', texto: 'Digite o NSU do comprovante.' });
      return;
    }

    setLiberando(true);
    setResultado(null);

    try {
      const r = await infinitePayService.recuperarPix({
        orderNsu: item.order_nsu,
        transactionNsu: limpo,
      });

      if (!montado.current) return;

      const link = r.downloadToken
        ? `https://jangadashow.com.br/fotos/${r.downloadToken}`
        : null;

      setResultado({
        tipo: 'ok',
        texto: r.alreadyConfirmed
          ? 'Este pedido ja estava liberado. Link abaixo.'
          : 'Pagamento confirmado na InfinitePay. Pedido liberado.',
        link,
      });
      setLiberados((m) => ({ ...m, [item.id]: link }));
    } catch (e) {
      if (!montado.current) return;
      setResultado({ tipo: 'erro', texto: mensagemDeErro(e.code) });
    } finally {
      if (montado.current) setLiberando(false);
    }
  };

  if (carregando) {
    return (
      <LinearGradient colors={['#003566', '#0077B6', '#00B4D8']} style={styles.center}>
        <StatusBar hidden />
        <ActivityIndicator size="large" color={colors.gold} />
        <Text style={styles.carregandoTexto}>Carregando pendentes...</Text>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={['#003566', '#0077B6', '#00B4D8']}
      style={styles.container}
      start={{ x: 0, y: 0 }} end={{ x: 0.3, y: 1 }}
    >
      <StatusBar hidden />
      <View style={styles.sun} />

      <View style={styles.header}>
        <View style={styles.headerTextos}>
          <Text style={styles.headerTitle}>Pix pendentes</Text>
          <Text style={styles.headerSub}>
            Cliente pagou e o sistema nao percebeu? Libere pelo comprovante.
          </Text>
        </View>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.voltarBtn}>
          <Text style={styles.voltarTexto}>Voltar</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={atualizando}
            onRefresh={() => { setAtualizando(true); carregar(); }}
            tintColor={colors.gold}
          />
        }
      >
        {itens.length === 0 && (
          <View style={styles.vazio}>
            <Text style={styles.vazioTitulo}>Nenhum Pix pendente</Text>
            <Text style={styles.vazioTexto}>
              Todos os Pix dos ultimos dias foram confirmados automaticamente.
            </Text>
          </View>
        )}

        {itens.map((item) => {
          const aberto = abertoId === item.id;
          const liberado = item.id in liberados;
          const venceu = item.status === 'expired'
            || new Date(item.expires_at).getTime() < Date.now();

          return (
            <View key={item.id} style={[styles.card, aberto && styles.cardAberto]}>
              <TouchableOpacity onPress={() => abrir(item)} activeOpacity={0.8}>
                <View style={styles.cardTopo}>
                  <Text style={styles.cardValor}>{formatarValor(item.amount_cents)}</Text>
                  <View style={[
                    styles.selo,
                    liberado ? styles.seloLiberado
                      : venceu ? styles.seloVencido : styles.seloAguardando,
                  ]}>
                    <Text style={styles.seloTexto}>
                      {liberado ? 'liberado' : venceu ? 'vencido' : 'aguardando'}
                    </Text>
                  </View>
                </View>

                <Text style={styles.cardLinha}>
                  {formatarQuando(item.created_at)}
                  {item.orders?.client_phone ? `  ·  ${item.orders.client_phone}` : ''}
                </Text>
                {/* So o fim do nsu: o suficiente para o operador casar com a tela
                    do tablet, sem espalhar o identificador inteiro. */}
                <Text style={styles.cardNsu}>pedido ...{item.order_nsu.slice(-8)}</Text>
              </TouchableOpacity>

              {aberto && liberado && (
                <View style={styles.painel}>
                  <View style={[styles.resultado, styles.resultadoOk]}>
                    <Text style={styles.resultadoTexto}>
                      Pedido liberado. Passe o link para o cliente:
                    </Text>
                    <Text selectable style={styles.resultadoLink}>
                      {liberados[item.id] ?? 'link nao retornado pelo servidor'}
                    </Text>
                  </View>
                </View>
              )}

              {aberto && !liberado && (
                <View style={styles.painel}>
                  <Text style={styles.painelLabel}>
                    NSU DA TRANSACAO (no comprovante do cliente)
                  </Text>
                  <TextInput
                    style={styles.input}
                    value={nsu}
                    onChangeText={(t) => { setNsu(t); setResultado(null); }}
                    placeholder="cole ou digite o NSU"
                    placeholderTextColor={colors.gray400}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!liberando}
                  />

                  <TouchableOpacity
                    style={[styles.liberarBtn, liberando && styles.btnDesativado]}
                    onPress={() => liberar(item)}
                    disabled={liberando}
                    activeOpacity={0.85}
                  >
                    {liberando
                      ? <ActivityIndicator color={colors.primary} />
                      : <Text style={styles.liberarTexto}>Conferir e liberar</Text>}
                  </TouchableOpacity>

                  {resultado && (
                    <View style={[
                      styles.resultado,
                      resultado.tipo === 'ok' ? styles.resultadoOk : styles.resultadoErro,
                    ]}>
                      <Text style={styles.resultadoTexto}>{resultado.texto}</Text>
                      {resultado.link && (
                        <Text selectable style={styles.resultadoLink}>{resultado.link}</Text>
                      )}
                    </View>
                  )}

                  <Text style={styles.aviso}>
                    O servidor confere a transacao na InfinitePay antes de liberar.
                    Se o valor nao bater, o pedido nao sai.
                  </Text>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  carregandoTexto: { color: colors.accentLight, fontSize: 15 },
  sun: {
    position: 'absolute', top: -80, right: -80,
    width: 260, height: 260, borderRadius: 130,
    backgroundColor: colors.gold, opacity: 0.08,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.md,
    gap: spacing.md,
  },
  headerTextos: { flex: 1 },
  headerTitle: { fontSize: 20, fontWeight: '900', color: colors.white },
  headerSub: { fontSize: 13, color: colors.accentLight, marginTop: 2 },
  voltarBtn: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderRadius: radius.full, borderWidth: 1, borderColor: colors.cardBorder,
  },
  voltarTexto: { color: colors.white, fontWeight: '700' },

  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },

  vazio: {
    padding: spacing.xl, alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.cardBg, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.cardBorder,
  },
  vazioTitulo: { fontSize: 17, fontWeight: '800', color: colors.white },
  vazioTexto: { fontSize: 13, color: colors.gray400, textAlign: 'center' },

  card: {
    backgroundColor: colors.cardBg, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.cardBorder, padding: spacing.lg,
    gap: spacing.xs,
  },
  cardAberto: { borderColor: colors.gold },
  cardTopo: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: spacing.xs,
  },
  cardValor: { fontSize: 20, fontWeight: '900', color: colors.white },
  selo: { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.full },
  seloAguardando: { backgroundColor: 'rgba(255,165,2,0.22)' },
  seloVencido: { backgroundColor: 'rgba(255,71,87,0.22)' },
  seloLiberado: { backgroundColor: 'rgba(0,200,150,0.25)' },
  seloTexto: { fontSize: 11, fontWeight: '800', color: colors.white, letterSpacing: 1 },
  cardLinha: { fontSize: 13, color: colors.accentLight },
  cardNsu: { fontSize: 12, color: colors.gray400 },

  painel: {
    marginTop: spacing.md, paddingTop: spacing.md, gap: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.cardBorder,
  },
  painelLabel: {
    fontSize: 11, letterSpacing: 1.2, fontWeight: '800', color: colors.gold,
  },
  input: {
    backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.cardBorder,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    color: colors.white, fontSize: 15,
  },
  liberarBtn: {
    backgroundColor: colors.gold, borderRadius: radius.full,
    paddingVertical: spacing.md, alignItems: 'center',
  },
  btnDesativado: { opacity: 0.6 },
  liberarTexto: { fontSize: 16, fontWeight: '900', color: colors.primary },

  resultado: {
    borderRadius: radius.sm, padding: spacing.md, gap: spacing.xs,
    borderWidth: 1,
  },
  resultadoOk: {
    backgroundColor: 'rgba(0,200,150,0.15)', borderColor: colors.success,
  },
  resultadoErro: {
    backgroundColor: 'rgba(255,71,87,0.15)', borderColor: colors.error,
  },
  resultadoTexto: { fontSize: 14, color: colors.white, fontWeight: '600' },
  resultadoLink: { fontSize: 12, color: colors.accentLight },

  aviso: { fontSize: 11, color: colors.gray400, lineHeight: 16 },
});
