import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Image, Animated, StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, radius } from '../utils/theme';
import { useScaledStyles } from '../utils/responsive';

function formatarTelefone(t) {
  const d = String(t).replace(/D/g, '');
  if (d.length < 10) return d;
  return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
}

export default function ConfirmationScreen({ route, navigation }) {
  const styles = useScaledStyles(createStyles);
  const { order, photos } = route.params;
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const dolphinBounce = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, tension: 50, friction: 7, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
    ]).start();

    const bounceLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(dolphinBounce, { toValue: -12, duration: 600, useNativeDriver: true }),
        Animated.timing(dolphinBounce, { toValue: 0, duration: 600, useNativeDriver: true }),
      ])
    );
    bounceLoop.start();
    return () => bounceLoop.stop();
  }, []);

  return (
    <LinearGradient
      colors={['#003566', '#0077B6', '#00B4D8']}
      style={styles.container}
      start={{ x: 0, y: 0 }} end={{ x: 0.3, y: 1 }}
    >
      <StatusBar hidden />
      <View style={styles.sun} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Golfinho animado */}
        <Animated.Text style={[styles.dolphin, { transform: [{ translateY: dolphinBounce }] }]}>
          🐬
        </Animated.Text>

        {/* Ícone de sucesso */}
        <Animated.View style={[styles.successWrap, { transform: [{ scale: scaleAnim }] }]}>
          <LinearGradient
            colors={[colors.success, '#009970']}
            style={styles.successCircle}
          >
            <Text style={styles.successIcon}>✓</Text>
          </LinearGradient>
        </Animated.View>

        <Animated.View style={[styles.textWrap, { opacity: fadeAnim }]}>
          <Text style={styles.title}>Pagamento Confirmado!</Text>
          <Text style={styles.subtitle}>
            Obrigado por escolher a Jangada Show!{'\n'}
            Suas fotos estão a caminho 🌊
          </Text>

          {/* Thumbnails */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbRow}>
            {photos.map((photo) => (
              <Image key={photo.id} source={{ uri: photo.url }} style={styles.thumb} />
            ))}
          </ScrollView>

          {/* Aviso de envio */}
          <View style={styles.card}>
            <Text style={styles.cardIcon}>📱</Text>
            <Text style={styles.cardTitle}>Suas fotos serão enviadas por WhatsApp</Text>
            {order.client_phone ? (
              <Text style={styles.cardText}>para o número {formatarTelefone(order.client_phone)}</Text>
            ) : null}
          </View>

          {/* Voltar */}
          <TouchableOpacity
            style={styles.newBtn}
            onPress={() => navigation.popToTop()}
            activeOpacity={0.85}
          >
            <Text style={styles.newBtnText}>🐬 Voltar ao início</Text>
          </TouchableOpacity>

          <Text style={styles.thanks}>
            Jangada Show • Obrigado pela visita! 🌊
          </Text>
        </Animated.View>
      </ScrollView>
    </LinearGradient>
  );
}

const createStyles = (k) => {
  const z = (n) => Math.round(n * k);
  return StyleSheet.create({
  container: { flex: 1 },
  sun: {
    position: 'absolute', top: z(-80), right: z(-80),
    width: z(260), height: z(260), borderRadius: z(130),
    backgroundColor: colors.gold, opacity: 0.08,
  },
  content: {
    alignItems: 'center', padding: z(spacing.xl),
    paddingTop: z(spacing.xxl), gap: z(spacing.lg),
  },
  dolphin: { fontSize: z(56) },
  successWrap: { marginBottom: z(spacing.xs) },
  successCircle: {
    width: z(90), height: z(90), borderRadius: z(45),
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.success, shadowOpacity: 0.5,
    shadowOffset: { width: 0, height: z(8) }, shadowRadius: z(20),
    elevation: 12,
  },
  successIcon: { fontSize: z(48), color: colors.white, fontWeight: '900' },
  textWrap: { alignItems: 'center', width: '100%', gap: z(spacing.lg) },
  title: {
    fontSize: z(30), fontWeight: '900', color: colors.white,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: z(16), color: colors.accentLight,
    textAlign: 'center', lineHeight: z(24),
  },
  thumbRow: { width: '100%' },
  thumb: {
    width: z(90), height: z(90), borderRadius: z(radius.sm),
    marginRight: z(spacing.sm), borderWidth: 2, borderColor: colors.gold,
  },
  card: {
    width: '100%', backgroundColor: colors.cardBg,
    borderWidth: 1, borderColor: colors.cardBorder,
    borderRadius: z(radius.lg), padding: z(spacing.lg),
    gap: z(spacing.sm), alignItems: 'center',
  },
  cardIcon: { fontSize: z(44) },
  cardTitle: {
    fontSize: z(22), fontWeight: '900', color: colors.white, textAlign: 'center',
  },
  cardText: { fontSize: z(17), color: colors.accentLight, textAlign: 'center' },
  newBtn: {
    width: '100%', paddingVertical: z(spacing.lg), alignItems: 'center',
    borderRadius: z(radius.full), borderWidth: 2,
    borderColor: 'rgba(255,214,10,0.4)',
  },
  newBtnText: { fontSize: z(18), fontWeight: '700', color: colors.gold },
  thanks: {
    fontSize: z(13), color: 'rgba(255,255,255,0.3)',
    textAlign: 'center', letterSpacing: z(1),
    marginTop: z(spacing.sm), marginBottom: z(spacing.xl),
  },
});
};