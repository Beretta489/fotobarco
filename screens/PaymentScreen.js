import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Clipboard, ActivityIndicator, StatusBar, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
import { ordersService } from '../services/orders';
import { colors, spacing, radius } from '../utils/theme';

const COUNTDOWN = 300;

export default function PaymentScreen({ route, navigation }) {
  const { order, total, pixData, photos } = route.params;
  const [timeLeft, setTimeLeft] = useState(COUNTDOWN);
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) { clearInterval(timer); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.04, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const handleCopy = () => {
    Clipboard.setString(pixData.copyPaste);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleConfirmPayment = async () => {
    setConfirming(true);
    try {
      const confirmed = await ordersService.confirmPayment(order.id);
      navigation.replace('Confirmation', { order: confirmed, photos });
    } catch (e) {
      alert('Erro ao confirmar. Tente novamente.');
    } finally {
      setConfirming(false);
    }
  };

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timerStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const isExpired = timeLeft === 0;

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
          <Text style={styles.title}>Pagamento via Pix</Text>
        </View>
        <View style={{ width: 70 }} />
      </View>

      <View style={styles.content}>
        <View style={styles.amountCard}>
          <Text style={styles.amountLabel}>VALOR A PAGAR</Text>
          <Text style={styles.amount}>R$ {Number(total).toFixed(2)}</Text>
          <Text style={styles.amountSub}>Jangalancha Show</Text>
        </View>

        <Text style={styles.instruction}>
          Abra o app do seu banco e escaneie o QR Code:
        </Text>

        <Animated.View style={[styles.qrWrapper, { transform: [{ scale: pulse }] }]}>
          <View style={styles.qrInner}>
            <QRCode
              value={pixData.copyPaste}
              size={200}
              color="#003566"
              backgroundColor="#FFFFFF"
            />
          </View>
        </Animated.View>

        <View style={[styles.timerBadge, isExpired && styles.timerExpired]}>
          <Text style={styles.timerIcon}>{isExpired ? '⏰' : '⏱'}</Text>
          <Text style={[styles.timerText, isExpired && { color: colors.error }]}>
            {isExpired ? 'QR Code expirado' : `Expira em ${timerStr}`}
          </Text>
        </View>

        <TouchableOpacity style={styles.copyBtn} onPress={handleCopy}>
          <Text style={styles.copyText}>
            {copied ? '✓ Copiado!' : '📋 Copiar código Pix'}
          </Text>
        </TouchableOpacity>

        <View style={styles.demoSection}>
          <Text style={styles.demoNote}>
            ℹ️ Em produção a confirmação é automática via webhook.{'\n'}
            Para demonstração, toque após pagar:
          </Text>
          <TouchableOpacity
            style={styles.confirmBtn}
            onPress={handleConfirmPayment}
            disabled={confirming || isExpired}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={confirming || isExpired
                ? ['#333', '#222']
                : [colors.success, '#009970']
              }
              style={styles.confirmGrad}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            >
              {confirming ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.confirmText}>✓ CONFIRMAR PAGAMENTO</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
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
  title: { fontSize: 20, fontWeight: '900', color: colors.white },
  content: {
    flex: 1, alignItems: 'center',
    paddingHorizontal: spacing.xl, gap: spacing.lg, paddingTop: spacing.md,
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
  instruction: { fontSize: 15, color: colors.accentLight, textAlign: 'center' },
  qrWrapper: {
    padding: 6, borderRadius: radius.lg,
    borderWidth: 3, borderColor: colors.gold,
    backgroundColor: colors.white,
    shadowColor: colors.gold, shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 4 }, shadowRadius: 12,
    elevation: 8,
  },
  qrInner: { padding: 12, borderRadius: radius.md, backgroundColor: colors.white },
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
  demoSection: { alignItems: 'center', gap: spacing.md, width: '100%' },
  demoNote: {
    fontSize: 13, color: colors.gray400, textAlign: 'center',
    backgroundColor: 'rgba(255,165,2,0.08)', borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1, borderColor: 'rgba(255,165,2,0.2)',
  },
  confirmBtn: { borderRadius: radius.full, overflow: 'hidden', width: '100%' },
  confirmGrad: { paddingVertical: spacing.lg, alignItems: 'center' },
  confirmText: { fontSize: 18, fontWeight: '800', letterSpacing: 2, color: colors.white },
});