import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Clipboard, ActivityIndicator, StatusBar, Animated, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
import { ordersService } from '../services/orders';
import { efiService, infinitiPayService, zapiService } from '../services/payments';
import { colors, spacing, radius } from '../utils/theme';

const PIX_POLL_MS = 3000;
const CREDIT_POLL_MS = 5000;

export default function PaymentScreen({ route, navigation }) {
  const { order, total, photos, paymentMethod: initialMethod } = route.params;

  const [method, setMethod] = useState(initialMethod === 'credit' ? 'credit' : 'pix');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const [pix, setPix] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);

  const [creditLink, setCreditLink] = useState(null);
  const [whatsSent, setWhatsSent] = useState(false);

  const pulse = useRef(new Animated.Value(1)).current;
  const pollRef = useRef(null);
  const timerRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.04, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
    ).start();
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    setLoading(true);
    setErrorMsg('');
    setPix(null);
    setCreditLink(null);
    setWhatsSent(false);
    clearPollers();

    if (method === 'pix') {
      startPix();
    } else {
      startCredit();
    }

    return () => clearPollers();
  }, [method]);

  const clearPollers = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const finalizeOrder = async () => {
    if (confirming) return;
    setConfirming(true);
    try {
      const confirmed = await ordersService.confirmPayment(order.id);
      clearPollers();
      if (mountedRef.current) {
        navigation.replace('Confirmation', { order: confirmed, photos });
      }
    } catch (e) {
      if (mountedRef.current) {
        setErrorMsg('Pagamento detectado, mas houve erro ao salvar. Tente novamente.');
        setConfirming(false);
      }
    }
  };

  const startPix = async () => {
    try {
      const charge = await efiService.createCharge(order.id, total, order.client_phone);
      if (!mountedRef.current) return;
      setPix(charge);
      const remaining = Math.max(0, Math.floor((charge.expiresAt - Date.now()) / 1000));
      setTimeLeft(remaining);
      setLoading(false);

      timerRef.current = setInterval(() => {
        setTimeLeft((t) => {
          if (t <= 1) { clearInterval(timerRef.current); timerRef.current = null; return 0; }
          return t - 1;
        });
      }, 1000);

      pollRef.current = setInterval(async () => {
        try {
          const s = await efiService.getChargeStatus(charge.txid);
          if (s.status === 'CONCLUIDA') {
            clearPollers();
            await finalizeOrder();
          }
        } catch (_) {}
      }, PIX_POLL_MS);
    } catch (e) {
      if (!mountedRef.current) return;
      setLoading(false);
      setErrorMsg('Não foi possível gerar o QR Code Pix. Tente novamente.');
    }
  };

  const startCredit = async () => {
    try {
      const link = await infinitiPayService.createPaymentLink(
        order.id,
        total,
        `Pedido ${order.id.substring(0, 8)} - Jangalancha Show`,
      );
      if (!mountedRef.current) return;
      setCreditLink(link);
      setLoading(false);

      try {
        await zapiService.sendPaymentLink(order.client_phone, link.url, total);
        if (mountedRef.current) setWhatsSent(true);
      } catch (_) {
        if (mountedRef.current) setWhatsSent(false);
      }

      pollRef.current = setInterval(async () => {
        try {
          const s = await infinitiPayService.getPaymentStatus(link.id);
          const ok = ['paid', 'approved', 'completed', 'confirmed', 'succeeded']
            .includes(String(s.status).toLowerCase());
          if (ok) {
            clearPollers();
            await finalizeOrder();
          }
        } catch (_) {}
      }, CREDIT_POLL_MS);
    } catch (e) {
      if (!mountedRef.current) return;
      setLoading(false);
      setErrorMsg('Não foi possível gerar o link de pagamento. Tente novamente.');
    }
  };

  const handleCopy = () => {
    if (!pix?.copyPaste) return;
    Clipboard.setString(pix.copyPaste);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleCopyLink = () => {
    if (!creditLink?.url) return;
    Clipboard.setString(creditLink.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timerStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const isExpired = method === 'pix' && pix && timeLeft === 0;

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
          <Text style={styles.title}>
            {method === 'pix' ? 'Pagamento via Pix' : 'Pagamento Crédito'}
          </Text>
        </View>
        <View style={{ width: 70 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.amountCard}>
          <Text style={styles.amountLabel}>VALOR A PAGAR</Text>
          <Text style={styles.amount}>R$ {Number(total).toFixed(2)}</Text>
          <Text style={styles.amountSub}>Jangalancha Show</Text>
        </View>

        <View style={styles.methodRow}>
          <TouchableOpacity
            style={[styles.methodBtn, method === 'pix' && styles.methodBtnActive]}
            onPress={() => setMethod('pix')}
            activeOpacity={0.85}
          >
            <Text style={[styles.methodText, method === 'pix' && styles.methodTextActive]}>
              ⚡ Pix
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.methodBtn, method === 'credit' && styles.methodBtnActive]}
            onPress={() => setMethod('credit')}
            activeOpacity={0.85}
          >
            <Text style={[styles.methodText, method === 'credit' && styles.methodTextActive]}>
              💳 Crédito
            </Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.gold} size="large" />
            <Text style={styles.loadingText}>
              {method === 'pix' ? 'Gerando QR Code Pix...' : 'Gerando link de pagamento...'}
            </Text>
          </View>
        ) : errorMsg ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{errorMsg}</Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => {
                setErrorMsg('');
                setLoading(true);
                if (method === 'pix') startPix(); else startCredit();
              }}
            >
              <Text style={styles.retryText}>Tentar novamente</Text>
            </TouchableOpacity>
          </View>
        ) : method === 'pix' ? (
          <>
            <Text style={styles.instruction}>
              Abra o app do seu banco e escaneie o QR Code:
            </Text>

            <Animated.View style={[styles.qrWrapper, { transform: [{ scale: pulse }] }]}>
              <View style={styles.qrInner}>
                {pix?.copyPaste ? (
                  <QRCode
                    value={pix.copyPaste}
                    size={200}
                    color="#003566"
                    backgroundColor="#FFFFFF"
                  />
                ) : (
                  <ActivityIndicator color={colors.primary} />
                )}
              </View>
            </Animated.View>

            <View style={[styles.timerBadge, isExpired && styles.timerExpired]}>
              <Text style={styles.timerIcon}>{isExpired ? '⏰' : '⏱'}</Text>
              <Text style={[styles.timerText, isExpired && { color: colors.error }]}>
                {isExpired ? 'QR Code expirado' : `Expira em ${timerStr}`}
              </Text>
            </View>

            <TouchableOpacity style={styles.copyBtn} onPress={handleCopy} disabled={!pix?.copyPaste}>
              <Text style={styles.copyText}>
                {copied ? '✓ Copiado!' : '📋 Copiar código Pix'}
              </Text>
            </TouchableOpacity>

            <View style={styles.waitBox}>
              <ActivityIndicator color={colors.gold} />
              <Text style={styles.waitText}>
                Aguardando confirmação do pagamento...
              </Text>
            </View>
          </>
        ) : (
          <>
            <View style={styles.waitBox}>
              <Text style={styles.waitEmoji}>📲</Text>
              <Text style={styles.waitTitle}>
                {whatsSent ? 'Link enviado por WhatsApp!' : 'Link gerado'}
              </Text>
              <Text style={styles.waitText}>
                {whatsSent
                  ? `Enviamos o link de pagamento para ${formatPhone(order.client_phone)}.`
                  : `Não conseguimos enviar via WhatsApp. Use o link abaixo.`}
              </Text>
            </View>

            {creditLink?.url ? (
              <View style={styles.linkCard}>
                <Text style={styles.linkLabel}>🔗 LINK DE PAGAMENTO</Text>
                <Text style={styles.linkUrl} numberOfLines={3}>{creditLink.url}</Text>
                <TouchableOpacity style={styles.copyBtn} onPress={handleCopyLink}>
                  <Text style={styles.copyText}>
                    {copied ? '✓ Copiado!' : '📋 Copiar link'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <View style={styles.waitBox}>
              <ActivityIndicator color={colors.gold} />
              <Text style={styles.waitText}>
                Aguardando confirmação do pagamento...
              </Text>
            </View>
          </>
        )}

        {confirming ? (
          <View style={styles.waitBox}>
            <ActivityIndicator color={colors.success} />
            <Text style={styles.waitText}>Confirmando pagamento...</Text>
          </View>
        ) : null}
      </ScrollView>
    </LinearGradient>
  );
}

function formatPhone(p) {
  const d = String(p || '').replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return p || '';
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
    alignItems: 'center',
    paddingHorizontal: spacing.xl, gap: spacing.lg,
    paddingTop: spacing.md, paddingBottom: spacing.xl,
  },
  amountCard: {
    backgroundColor: 'rgba(255,214,10,0.12)',
    borderRadius: radius.lg, borderWidth: 1,
    borderColor: 'rgba(255,214,10,0.3)',
    paddingVertical: spacing.md, paddingHorizontal: spacing.xl,
    alignItems: 'center', width: '100%',
  },
  amountLabel: { fontSize: 11, letterSpacing: 2, color: colors.gray400, fontWeight: '700' },
  amount: { fontSize: 42, fontWeight: '900', color: colors.gold },
  amountSub: { fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  methodRow: {
    flexDirection: 'row', gap: spacing.sm, width: '100%',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: radius.full, padding: 4,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  methodBtn: {
    flex: 1, paddingVertical: spacing.sm, alignItems: 'center',
    borderRadius: radius.full,
  },
  methodBtnActive: { backgroundColor: colors.gold },
  methodText: { fontSize: 15, fontWeight: '700', color: colors.accentLight, letterSpacing: 1 },
  methodTextActive: { color: colors.primary },
  instruction: { fontSize: 15, color: colors.accentLight, textAlign: 'center' },
  qrWrapper: {
    padding: 6, borderRadius: radius.lg,
    borderWidth: 3, borderColor: colors.gold,
    backgroundColor: colors.white,
    shadowColor: colors.gold, shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 4 }, shadowRadius: 12,
    elevation: 8,
  },
  qrInner: {
    padding: 12, borderRadius: radius.md, backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
    minWidth: 224, minHeight: 224,
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
  loadingBox: {
    alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.xl,
  },
  loadingText: { color: colors.accentLight, fontSize: 15 },
  errorBox: {
    width: '100%',
    backgroundColor: 'rgba(255,71,87,0.1)',
    borderColor: 'rgba(255,71,87,0.3)', borderWidth: 1,
    borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md,
    alignItems: 'center',
  },
  errorText: { color: colors.error, fontSize: 15, textAlign: 'center' },
  retryBtn: {
    backgroundColor: colors.gold, borderRadius: radius.full,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.xl,
  },
  retryText: { color: colors.primary, fontWeight: '800' },
  waitBox: {
    alignItems: 'center', gap: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: radius.lg, padding: spacing.lg,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    width: '100%',
  },
  waitEmoji: { fontSize: 36 },
  waitTitle: { fontSize: 17, fontWeight: '800', color: colors.white, textAlign: 'center' },
  waitText: { fontSize: 14, color: colors.accentLight, textAlign: 'center' },
  linkCard: {
    width: '100%', backgroundColor: colors.cardBg,
    borderWidth: 1, borderColor: colors.cardBorder,
    borderRadius: radius.lg, padding: spacing.lg,
    gap: spacing.sm, alignItems: 'center',
  },
  linkLabel: { fontSize: 11, letterSpacing: 2, color: colors.gold, fontWeight: '800' },
  linkUrl: { fontSize: 13, color: colors.accentLight, textAlign: 'center', lineHeight: 20 },
});
