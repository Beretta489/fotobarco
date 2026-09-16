import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  StatusBar, Animated, TextInput, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, radius } from '../utils/theme';

export default function PhoneScreen({ route, navigation }) {
  const { session, group, photoIds, photos, total, packageType, extras = [] } = route.params;
  const [phone, setPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const dolphinBounce = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeIn, { toValue: 1, duration: 700, useNativeDriver: true }).start();

    const bounceLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(dolphinBounce, { toValue: -8, duration: 1200, useNativeDriver: true }),
        Animated.timing(dolphinBounce, { toValue: 0, duration: 1200, useNativeDriver: true }),
      ])
    );
    bounceLoop.start();
    return () => bounceLoop.stop();
  }, []);

  const VALID_DDD = ['11','12','13','14','15','16','17','18','19','21','22','24','27','28','31','32','33','34','35','36','37','38','41','42','43','44','45','46','47','48','49','51','53','54','55','61','62','63','64','65','66','67','68','69','71','73','74','75','77','79','81','82','83','84','85','86','87','88','89','91','92','93','94','95','96','97','98','99'];

  // Esta tela NAO cria mais o pedido.
  //
  // Antes ela chamava ordersService.create() com o 'total' calculado no app --
  // e a policy do banco aceitava qualquer valor. Agora o pedido nasce dentro da
  // Edge Function payment-intent-create, que recalcula o preco pelo catalogo do
  // servidor. Aqui so coletamos telefone e forma de pagamento.
  const handleContinue = () => {
    const normalized = phone.replace(/\D/g, '');
    const ddd = normalized.substring(0, 2);
    const num = normalized.substring(2);
    if (!VALID_DDD.includes(ddd) || (num.length !== 8 && num.length !== 9)) {
      setError('Número inválido. Use DDD + número (ex: 84 99999-8888).');
      return;
    }
    setError('');

    navigation.navigate('Payment', {
      // Dados do pedido -- a cobranca e aberta na tela seguinte.
      session,
      group,
      photoIds,
      photos,
      packageType,
      extras,
      clientPhone: normalized,
      paymentMethod,
      // 'total' segue apenas para EXIBICAO enquanto o servidor nao responde.
      // O valor cobrado de verdade vem de volta da Edge Function.
      totalEstimado: total,
    });
  };

  return (
    <LinearGradient
      colors={['#001F5B', '#003D8F', '#0077B6', '#00B4D8']}
      style={styles.container}
      start={{ x: 0, y: 0 }} end={{ x: 0.2, y: 1 }}
    >
      <StatusBar hidden />
      <View style={styles.sun} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.headerBrand}>⛵ Jangalancha Show</Text>
        <View style={{ width: 70 }} />
      </View>

      <Animated.View style={[styles.content, { opacity: fadeIn }]}>

        {/* Golfinho */}
        <Animated.View style={{ transform: [{ translateY: dolphinBounce }] }}>
          <Text style={styles.dolphin}>🐬</Text>
        </Animated.View>

        <Text style={styles.title}>Para onde enviamos{'\n'}suas fotos?</Text>
        <Text style={styles.subtitle}>
          Digite o celular que vai receber o link de download
        </Text>

        {/* Input */}
        <View style={styles.inputCard}>
          <Text style={styles.inputLabel}>NÚMERO DE CELULAR</Text>
          <View style={styles.phoneRow}>
            <View style={styles.ddiBox}>
              <Text style={styles.ddiText}>+55</Text>
            </View>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={(t) => { setPhone(t); setError(''); }}
              keyboardType="phone-pad"
              placeholder="84 99999-8888"
              placeholderTextColor={colors.gray400}
              maxLength={15}
              autoFocus
            />
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        {/* Info */}
        <View style={styles.infoWrap}>
          {[
            '📱 Você receberá o link via WhatsApp',
            '☁️ Fotos disponíveis por 30 dias',
            '📸 Download em alta resolução',
          ].map((item) => (
            <Text key={item} style={styles.infoItem}>{item}</Text>
          ))}
        </View>

        {/* Método de pagamento */}
        <View style={styles.payCard}>
          <Text style={styles.payLabel}>FORMA DE PAGAMENTO</Text>
          <View style={styles.payRow}>
            {[
              { id: 'pix',    rotulo: '⚡ Pix' },
              { id: 'credit', rotulo: '💳 Crédito' },
              { id: 'debit',  rotulo: '💳 Débito' },
            ].map((opcao) => (
              <TouchableOpacity
                key={opcao.id}
                style={[styles.payBtn, paymentMethod === opcao.id && styles.payBtnActive]}
                onPress={() => setPaymentMethod(opcao.id)}
                activeOpacity={0.85}
              >
                <Text
                  style={[styles.payText, paymentMethod === opcao.id && styles.payTextActive]}
                  numberOfLines={1}
                >
                  {opcao.rotulo}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Crédito e débito cobram no proprio tablet, por aproximacao. */}
          <Text style={styles.payHint}>
            {paymentMethod === 'pix'
              ? 'QR Code na tela — o cliente paga pelo celular dele'
              : 'Maquininha no tablet — o cliente aproxima o cartão'}
          </Text>
        </View>

        {/* Botão */}
        <TouchableOpacity
          style={styles.continueBtn}
          onPress={handleContinue}
          disabled={loading}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={[colors.gold, colors.goldDark]}
            style={styles.continueGrad}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          >
            {loading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={styles.continueText}>IR PARA PAGAMENTO →</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>

      </Animated.View>
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
  backText: { color: colors.accentLight, fontSize: 17, fontWeight: '600' },
  headerBrand: { fontSize: 16, fontWeight: '800', color: colors.white, letterSpacing: 1 },
  content: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: spacing.xl, gap: spacing.lg,
  },
  dolphin: { fontSize: 64 },
  title: {
    fontSize: 30, fontWeight: '900', color: colors.white,
    textAlign: 'center', lineHeight: 38,
  },
  subtitle: {
    fontSize: 15, color: colors.accentLight,
    textAlign: 'center', lineHeight: 22,
  },
  inputCard: {
    width: '100%', backgroundColor: colors.cardBg,
    borderWidth: 1, borderColor: 'rgba(255,214,10,0.3)',
    borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md,
  },
  inputLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 2, color: colors.gray400 },
  phoneRow: { flexDirection: 'row', gap: spacing.sm },
  ddiBox: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(0,180,216,0.3)',
    borderRadius: radius.md, padding: spacing.md,
    alignItems: 'center', justifyContent: 'center', minWidth: 64,
  },
  ddiText: { fontSize: 18, color: colors.white, fontWeight: '700' },
  input: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(0,180,216,0.3)',
    borderRadius: radius.md, padding: spacing.md,
    fontSize: 24, color: colors.white, letterSpacing: 3,
  },
  error: { color: colors.error, fontSize: 14, textAlign: 'center' },
  infoWrap: { gap: spacing.sm, alignSelf: 'flex-start' },
  infoItem: { fontSize: 14, color: colors.accentLight },
  payCard: {
    width: '100%', backgroundColor: colors.cardBg,
    borderWidth: 1, borderColor: 'rgba(255,214,10,0.3)',
    borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm,
  },
  payLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 2, color: colors.gray400 },
  payRow: {
    flexDirection: 'row', gap: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: radius.full, padding: 4,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  payBtn: {
    flex: 1, paddingVertical: spacing.sm, paddingHorizontal: 2,
    alignItems: 'center', borderRadius: radius.full,
  },
  payBtnActive: { backgroundColor: colors.gold },
  // Fonte e letterSpacing menores que antes: agora sao 3 opcoes na mesma linha,
  // e "Crédito"/"Débito" precisam caber sem quebrar em tablet estreito.
  payText: { fontSize: 13, fontWeight: '700', color: colors.accentLight, letterSpacing: 0.5 },
  payTextActive: { color: colors.primary },
  payHint: { fontSize: 12, color: colors.gray400, textAlign: 'center', marginTop: 2 },
  continueBtn: { width: '100%', borderRadius: radius.full, overflow: 'hidden' },
  continueGrad: { paddingVertical: spacing.lg + 2, alignItems: 'center' },
  continueText: { fontSize: 20, fontWeight: '900', letterSpacing: 2, color: colors.primary },
});