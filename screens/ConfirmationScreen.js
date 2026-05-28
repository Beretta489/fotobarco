import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Image, Animated, StatusBar, Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, radius } from '../utils/theme';

export default function ConfirmationScreen({ route, navigation }) {
  const { order, photos } = route.params;
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const dolphinBounce = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, tension: 50, friction: 7, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(dolphinBounce, { toValue: -12, duration: 600, useNativeDriver: true }),
        Animated.timing(dolphinBounce, { toValue: 0, duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const downloadLink = `https://jangadashow.com.br/fotos/${order.download_token}`;

  const handleWhatsApp = () => {
    const msg = `🐬 Jangada Show\n\nSuas fotos do passeio estão prontas!\n\nAcesse: ${downloadLink}`;
    Linking.openURL(`whatsapp://send?text=${encodeURIComponent(msg)}`);
  };

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
            Suas fotos estão prontas 🌊
          </Text>

          {/* Thumbnails */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbRow}>
            {photos.map((photo) => (
              <Image key={photo.id} source={{ uri: photo.url }} style={styles.thumb} />
            ))}
          </ScrollView>

          {/* Link */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>🔗 SEU LINK DE DOWNLOAD</Text>
            <Text style={styles.downloadLink}>{downloadLink}</Text>
            <View style={styles.expiryRow}>
              <Text style={styles.expiry}>⏰ Disponível por 30 dias</Text>
            </View>
          </View>

          {/* WhatsApp */}
          <TouchableOpacity
            style={styles.whatsappBtn}
            onPress={handleWhatsApp}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={['#25D366', '#128C7E']}
              style={styles.btnGrad}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            >
              <Text style={styles.btnText}>📱 Enviar link via WhatsApp</Text>
            </LinearGradient>
          </TouchableOpacity>

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

const styles = StyleSheet.create({
  container: { flex: 1 },
  sun: {
    position: 'absolute', top: -80, right: -80,
    width: 260, height: 260, borderRadius: 130,
    backgroundColor: colors.gold, opacity: 0.08,
  },
  content: {
    alignItems: 'center', padding: spacing.xl,
    paddingTop: spacing.xxl, gap: spacing.lg,
  },
  dolphin: { fontSize: 56 },
  successWrap: { marginBottom: spacing.xs },
  successCircle: {
    width: 90, height: 90, borderRadius: 45,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.success, shadowOpacity: 0.5,
    shadowOffset: { width: 0, height: 8 }, shadowRadius: 20,
    elevation: 12,
  },
  successIcon: { fontSize: 48, color: colors.white, fontWeight: '900' },
  textWrap: { alignItems: 'center', width: '100%', gap: spacing.lg },
  title: {
    fontSize: 30, fontWeight: '900', color: colors.white,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16, color: colors.accentLight,
    textAlign: 'center', lineHeight: 24,
  },
  thumbRow: { width: '100%' },
  thumb: {
    width: 90, height: 90, borderRadius: radius.sm,
    marginRight: spacing.sm, borderWidth: 2, borderColor: colors.gold,
  },
  card: {
    width: '100%', backgroundColor: colors.cardBg,
    borderWidth: 1, borderColor: colors.cardBorder,
    borderRadius: radius.lg, padding: spacing.lg,
    gap: spacing.sm, alignItems: 'center',
  },
  cardLabel: {
    fontSize: 11, letterSpacing: 2,
    color: colors.gold, fontWeight: '800',
  },
  downloadLink: {
    fontSize: 13, color: colors.accentLight,
    textAlign: 'center', lineHeight: 20,
  },
  expiryRow: { flexDirection: 'row', alignItems: 'center' },
  expiry: { fontSize: 13, color: colors.gray400 },
  whatsappBtn: { width: '100%', borderRadius: radius.full, overflow: 'hidden' },
  btnGrad: { paddingVertical: spacing.lg, alignItems: 'center' },
  btnText: { fontSize: 18, fontWeight: '800', color: colors.white },
  newBtn: {
    width: '100%', paddingVertical: spacing.lg, alignItems: 'center',
    borderRadius: radius.full, borderWidth: 2,
    borderColor: 'rgba(255,214,10,0.4)',
  },
  newBtnText: { fontSize: 18, fontWeight: '700', color: colors.gold },
  thanks: {
    fontSize: 13, color: 'rgba(255,255,255,0.3)',
    textAlign: 'center', letterSpacing: 1,
    marginTop: spacing.sm, marginBottom: spacing.xl,
  },
});