import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated, StatusBar, ImageBackground,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, radius } from '../utils/theme';
import { useScaledStyles } from '../utils/responsive';

export default function WelcomeScreen({ navigation }) {
  const styles = useScaledStyles(createStyles);
  const pulse = useRef(new Animated.Value(1)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn, { toValue: 1, duration: 1000, useNativeDriver: true }),
      Animated.timing(slideUp, { toValue: 0, duration: 1000, useNativeDriver: true }),
    ]).start();

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.05, duration: 1600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1600, useNativeDriver: true }),
      ])
    );
    pulseLoop.start();
    return () => pulseLoop.stop();
  }, []);

  return (
    <ImageBackground
      source={require('../assets/LogoJanga.webp')}
      style={styles.background}
      resizeMode="cover"
    >
      <StatusBar hidden />

      {/* Overlay gradiente suave */}
      <LinearGradient
        colors={[
          'rgba(0,15,50,0.1)',
          'rgba(0,20,60,0.3)',
          'rgba(0,15,50,0.7)',
          'rgba(0,10,40,0.92)',
        ]}
        style={styles.overlay}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />

      {/* Assinatura FotoBarco — canto superior esquerdo */}
      <Animated.View style={[styles.signature, { opacity: fadeIn }]}>
        <Text style={styles.signatureText}>FOTO</Text>
        <Text style={styles.signatureAccent}>BARCO</Text>
      </Animated.View>

      {/* Conteúdo principal — parte inferior */}
      <Animated.View style={[
        styles.content,
        { opacity: fadeIn, transform: [{ translateY: slideUp }] }
      ]}>
        {/* Botão CTA */}
        <Animated.View style={[styles.btnWrap, { transform: [{ scale: pulse }] }]}>
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={() => navigation.navigate('EnterCode')}
            activeOpacity={0.88}
          >
            <LinearGradient
              colors={[colors.gold, colors.goldDark]}
              style={styles.ctaGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.ctaText}>VER MINHAS FOTOS</Text>
              <Text style={styles.ctaIcon}>→</Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>

      </Animated.View>

    </ImageBackground>
  );
}

const createStyles = (k) => {
  const z = (n) => Math.round(n * k);
  return StyleSheet.create({
  background: {
    flex: 1, width: '100%', height: '100%',
    alignItems: 'center', justifyContent: 'flex-end',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },

  signature: {
    position: 'absolute', top: z(spacing.xl), left: z(spacing.xl),
    flexDirection: 'row', alignItems: 'baseline',
    gap: z(4), zIndex: 10,
  },
  signatureText: {
    fontSize: z(14), fontWeight: '900',
    letterSpacing: z(3), color: 'rgba(255,255,255,0.5)',
  },
  signatureAccent: {
    fontSize: z(14), fontWeight: '900',
    letterSpacing: z(3), color: 'rgba(255,214,10,0.6)',
  },

  content: {
    width: '100%', paddingHorizontal: z(spacing.xl),
    paddingBottom: z(spacing.xxl + spacing.xl),
    zIndex: 5, alignItems: 'center',
  },

  btnWrap: { width: '100%', marginBottom: z(spacing.md) },
  ctaButton: {
    borderRadius: z(radius.full), overflow: 'hidden',
    shadowColor: colors.gold, shadowOpacity: 0.5,
    shadowOffset: { width: 0, height: z(6) }, shadowRadius: z(16),
    elevation: 10,
  },
  ctaGradient: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: z(spacing.lg + 2),
    paddingHorizontal: z(spacing.xl),
    gap: z(spacing.md),
  },
  ctaText: {
    fontSize: z(20), fontWeight: '900',
    letterSpacing: z(3), color: colors.primary,
  },
  ctaIcon: {
    fontSize: z(22), color: colors.primary, fontWeight: '700',
  },
});
};
