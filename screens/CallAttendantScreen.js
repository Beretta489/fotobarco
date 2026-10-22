// =============================================================================
// CHAME O ATENDENTE -- credito, debito ou dinheiro
// =============================================================================
// O cliente escolheu pagar com o atendente. Esta tela abre o pedido no servidor
// (que calcula o valor REAL) e fica parada mostrando o valor ate o atendente
// chegar e tocar no botao, que leva para a tela da senha.
//
// Nada aqui libera foto. Quem libera e o servidor, depois de conferir a senha
// em AttendantConfirmScreen.
// =============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, StatusBar, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { infinitePayService, mensagemDeErro } from '../services/infinitepay';
import { colors, spacing, radius } from '../utils/theme';

export const ROTULO_METODO = {
  credit: '💳 Cartão de crédito',
  debit: '💳 Cartão de débito',
  cash: '💵 Dinheiro',
};

export default function CallAttendantScreen({ route, navigation }) {
  const {
    session, group, photoIds, photos, packageType,
    extras = [], clientPhone, paymentMethod, totalEstimado = 0,
  } = route.params;

  const [intent, setIntent] = useState(null);
  const [erro, setErro] = useState('');
  const [criando, setCriando] = useState(true);

  const pulse = useRef(new Animated.Value(1)).current;
  const montadoRef = useRef(true);
  const criandoRef = useRef(false);   // trava contra criar dois pedidos

  useEffect(() => {
    montadoRef.current = true;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => { montadoRef.current = false; loop.stop(); };
  }, [pulse]);

  const abrirPedido = useCallback(async () => {
    if (criandoRef.current) return;
    criandoRef.current = true;
    setErro('');
    setCriando(true);

    try {
      const resposta = await infinitePayService.createIntent({
        sessionId: session.id,
        groupId: group?.id,
        packageType,
        photoIds,
        extras,
        clientPhone,
        paymentMethod,
      });
      if (montadoRef.current) setIntent(resposta);
    } catch (e) {
      if (montadoRef.current) setErro(mensagemDeErro(e.code));
    } finally {
      criandoRef.current = false;
      if (montadoRef.current) setCriando(false);
    }
  }, [session, group, packageType, photoIds, extras, clientPhone, paymentMethod]);

  useEffect(() => { abrirPedido(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const valorExibido = intent ? intent.amountCents / 100 : totalEstimado;

  const irParaConfirmacao = () => {
    if (!intent) return;
    navigation.navigate('AttendantConfirm', {
      intent,
      photos,
      clientPhone,
      paymentMethod,
    });
  };

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
          <Text style={styles.title}>Pagamento</Text>
        </View>
        <View style={{ width: 70 }} />
      </View>

      <View style={styles.content}>
        <Animated.Text style={[styles.bell, { transform: [{ scale: pulse }] }]}>
          🙋
        </Animated.Text>

        <Text style={styles.callTitle}>Chame o atendente</Text>
        <Text style={styles.callSubtitle}>
          Este pagamento é feito direto com um{'\n'}atendente da Jangalancha Show.
        </Text>

        <View style={styles.amountCard}>
          <Text style={styles.amountLabel}>VALOR A PAGAR</Text>
          <Text style={styles.amount}>R$ {Number(valorExibido).toFixed(2)}</Text>
          <Text style={styles.amountSub}>{ROTULO_METODO[paymentMethod]}</Text>
        </View>

        {criando && (
          <View style={styles.box}>
            <ActivityIndicator color={colors.gold} />
            <Text style={styles.boxText}>Registrando o pedido...</Text>
          </View>
        )}

        {!criando && erro ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{erro}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={abrirPedido}>
              <Text style={styles.retryText}>Tentar novamente</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {intent && (
          <TouchableOpacity
            style={styles.attendantBtn}
            onPress={irParaConfirmacao}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={[colors.gold, colors.goldDark]}
              style={styles.attendantGrad}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            >
              <Text style={styles.attendantText}>SOU O ATENDENTE</Text>
              <Text style={styles.attendantSub}>Toque para confirmar o pagamento</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>
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
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: spacing.xl, gap: spacing.lg,
  },
  bell: { fontSize: 88 },
  callTitle: { fontSize: 34, fontWeight: '900', color: colors.white, textAlign: 'center' },
  callSubtitle: {
    fontSize: 17, color: colors.accentLight,
    textAlign: 'center', lineHeight: 24,
  },
  amountCard: {
    backgroundColor: 'rgba(255,214,10,0.12)',
    borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(255,214,10,0.3)',
    paddingVertical: spacing.md, paddingHorizontal: spacing.xl,
    alignItems: 'center', width: '100%',
  },
  amountLabel: { fontSize: 11, letterSpacing: 2, color: colors.gray400, fontWeight: '700' },
  amount: { fontSize: 42, fontWeight: '900', color: colors.gold },
  amountSub: { fontSize: 15, color: colors.white, marginTop: 2, fontWeight: '700' },
  box: {
    alignItems: 'center', gap: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: radius.lg, padding: spacing.lg,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', width: '100%',
  },
  boxText: { fontSize: 14, color: colors.accentLight, textAlign: 'center' },
  errorBox: {
    width: '100%', backgroundColor: 'rgba(255,71,87,0.1)',
    borderColor: 'rgba(255,71,87,0.3)', borderWidth: 1,
    borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md, alignItems: 'center',
  },
  errorText: { color: colors.error, fontSize: 15, textAlign: 'center' },
  retryBtn: {
    backgroundColor: colors.gold, borderRadius: radius.full,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.lg,
  },
  retryText: { color: colors.primary, fontWeight: '800' },
  attendantBtn: { width: '100%', borderRadius: radius.lg, overflow: 'hidden', marginTop: spacing.md },
  attendantGrad: { paddingVertical: spacing.lg, alignItems: 'center', gap: 4 },
  attendantText: { fontSize: 22, fontWeight: '900', letterSpacing: 2, color: colors.primary },
  attendantSub: { fontSize: 14, fontWeight: '600', color: colors.primary },
});
