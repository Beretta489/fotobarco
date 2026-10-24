// =============================================================================
// CONFIRMAR PAGAMENTO -- tela do atendente
// =============================================================================
// O atendente ja recebeu (maquininha ou dinheiro) e digita a senha. A senha vai
// para o servidor, que confere e libera o pedido. Este app nao sabe qual e a
// senha certa -- so repassa o que foi digitado.
// =============================================================================

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ActivityIndicator, StatusBar, KeyboardAvoidingView, Platform,
} from 'react-native';
import { CommonActions } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { infinitePayService, mensagemDeErro } from '../services/infinitepay';
import { ROTULO_METODO } from './CallAttendantScreen';
import { colors, spacing, radius } from '../utils/theme';

// Erros em que tentar de novo com este pedido nao adianta.
const ERROS_FINAIS = ['PAGAMENTO_EXPIRADO', 'PAGAMENTO_ENCERRADO', 'TENTATIVAS_EXCEDIDAS', 'PAGAMENTO_NAO_ENCONTRADO'];

export default function AttendantConfirmScreen({ route, navigation }) {
  const { intent, photos, clientPhone, paymentMethod } = route.params;

  const [senha, setSenha] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [encerrado, setEncerrado] = useState(false);

  const montadoRef = useRef(true);
  useEffect(() => () => { montadoRef.current = false; }, []);

  const valor = intent.amountCents / 100;

  const concluir = (resposta) => {
    const confirmacao = {
      name: 'Confirmation',
      params: {
        order: {
          id: resposta.orderId,
          download_token: resposta.downloadToken,
          download_expires_at: resposta.downloadExpiresAt,
          client_phone: clientPhone,
          total: valor,
        },
        photos,
      },
    };

    // Tira esta tela E a "chame o atendente" da pilha: voltar da confirmacao
    // nao pode cair de novo num pedido ja pago.
    navigation.dispatch((state) => {
      const routes = [...state.routes.slice(0, -2), confirmacao];
      return CommonActions.reset({ ...state, routes, index: routes.length - 1 });
    });
  };

  const confirmar = async () => {
    if (enviando || !senha) return;
    setEnviando(true);
    setErro('');

    try {
      const r = await infinitePayService.confirmarAtendente({
        orderNsu: intent.orderNsu,
        password: senha,
      });
      if (r.status === 'paid') {
        concluir(r);
        return;
      }
      if (montadoRef.current) setErro(mensagemDeErro(r.error));
    } catch (e) {
      if (!montadoRef.current) return;
      setErro(mensagemDeErro(e.code));
      if (ERROS_FINAIS.includes(e.code)) setEncerrado(true);
    } finally {
      if (montadoRef.current) {
        setEnviando(false);
        setSenha('');
      }
    }
  };

  return (
    <LinearGradient
      colors={['#001F5B', '#003D8F', '#0077B6']}
      style={styles.container}
      start={{ x: 0, y: 0 }} end={{ x: 0.2, y: 1 }}
    >
      <StatusBar hidden />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Área do atendente</Text>
        <View style={{ width: 90 }} />
      </View>

      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Text style={styles.lock}>🔐</Text>
        <Text style={styles.title}>Confirmar pagamento</Text>

        <View style={styles.amountCard}>
          <Text style={styles.amountLabel}>CONFIRA ANTES DE LIBERAR</Text>
          <Text style={styles.amount}>R$ {valor.toFixed(2)}</Text>
          <Text style={styles.amountSub}>{ROTULO_METODO[paymentMethod]}</Text>
          <Text style={styles.photosInfo}>
            {photos.length} foto{photos.length === 1 ? '' : 's'} · pedido {intent.orderNsu.slice(-6)}
          </Text>
        </View>

        <View style={styles.inputCard}>
          <Text style={styles.inputLabel}>SENHA DO ATENDENTE</Text>
          <TextInput
            style={styles.input}
            value={senha}
            onChangeText={(t) => { setSenha(t); setErro(''); }}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="••••••"
            placeholderTextColor={colors.gray400}
            editable={!enviando && !encerrado}
            onSubmitEditing={confirmar}
            returnKeyType="done"
            autoFocus
          />
          {erro ? <Text style={styles.error}>{erro}</Text> : null}
        </View>

        {encerrado ? (
          <TouchableOpacity style={styles.outlineBtn} onPress={() => navigation.popToTop()}>
            <Text style={styles.outlineText}>Voltar ao início</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.confirmBtn, (!senha || enviando) && { opacity: 0.6 }]}
            onPress={confirmar}
            disabled={!senha || enviando}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={[colors.success, '#009970']}
              style={styles.confirmGrad}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            >
              {enviando ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.confirmText}>✓ PAGAMENTO RECEBIDO — ENVIAR FOTOS</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        )}
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  backText: { color: colors.accentLight, fontSize: 20, fontWeight: '600' },
  headerTitle: { fontSize: 24, fontWeight: '800', color: colors.white, letterSpacing: 1 },
  content: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: spacing.xl, gap: spacing.lg,
  },
  lock: { fontSize: 56 },
  title: { fontSize: 28, fontWeight: '900', color: colors.white, textAlign: 'center' },
  amountCard: {
    backgroundColor: 'rgba(255,214,10,0.12)',
    borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(255,214,10,0.3)',
    paddingVertical: spacing.md, paddingHorizontal: spacing.xl,
    alignItems: 'center', width: '100%',
  },
  amountLabel: { fontSize: 11, letterSpacing: 2, color: colors.gray400, fontWeight: '700' },
  amount: { fontSize: 40, fontWeight: '900', color: colors.gold },
  amountSub: { fontSize: 15, color: colors.white, fontWeight: '700' },
  photosInfo: { fontSize: 13, color: colors.accentLight, marginTop: 4 },
  inputCard: {
    width: '100%', backgroundColor: colors.cardBg,
    borderWidth: 1, borderColor: 'rgba(255,214,10,0.3)',
    borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md,
  },
  inputLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 2, color: colors.gray400 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(0,180,216,0.3)',
    borderRadius: radius.md, padding: spacing.md,
    fontSize: 24, color: colors.white, letterSpacing: 4, textAlign: 'center',
  },
  error: { color: colors.error, fontSize: 14, textAlign: 'center' },
  confirmBtn: { width: '100%', borderRadius: radius.full, overflow: 'hidden' },
  confirmGrad: { paddingVertical: spacing.lg, alignItems: 'center' },
  confirmText: { fontSize: 17, fontWeight: '900', letterSpacing: 1, color: colors.white },
  outlineBtn: {
    width: '100%', paddingVertical: spacing.lg, alignItems: 'center',
    borderRadius: radius.full, borderWidth: 2, borderColor: 'rgba(255,214,10,0.4)',
  },
  outlineText: { fontSize: 18, fontWeight: '700', color: colors.gold },
});
