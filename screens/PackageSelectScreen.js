import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, radius } from '../utils/theme';
import { useScale, useScaledStyles } from '../utils/responsive';

export default function PackageSelectScreen({ route, navigation }) {
  const k = useScale();
  const styles = useScaledStyles(createStyles);
  const { session, photos, group } = route.params;
  const [selected, setSelected] = useState(null);

  const totalPhotos = photos.length;
  const halfPhotos = Math.ceil(totalPhotos / 2);

  const packages = [
    {
      id: 'all',
      icon: '📦',
      title: 'Pacote Completo',
      description: `Todas as ${totalPhotos} fotos do passeio`,
      price: 100.00,
      tag: 'MAIS POPULAR',
      tagColor: colors.gold,
      savings: (totalPhotos * 15 - 100) > 0 ? `economia de R$ ${(totalPhotos * 15 - 100).toFixed(2)}` : null,
    },
    {
      id: 'half',
      icon: '🎯',
      title: 'Pacote Metade',
      description: `Escolha ${halfPhotos} fotos do passeio`,
      price: 60.00,
      tag: 'CUSTO BENEFÍCIO',
      tagColor: colors.accentLight,
      savings: null,
    },
    {
      id: 'single',
      icon: '🖼️',
      title: 'Fotos Avulsas',
      description: 'Escolha exatamente as fotos que quer',
      price: 15.00,
      tag: 'A PARTIR DE',
      tagColor: colors.gray400,
      savings: null,
    },
  ];

  const handleSelect = (pkg) => {
    setSelected(pkg.id);
    setTimeout(() => {
      if (pkg.id === 'all') {
        navigation.navigate('Extras', {
          session,
          group,
          photoIds: photos.map(p => p.id),
          photos,
          total: 100.00,
          packageType: 'all',
        });
      } else if (pkg.id === 'half') {
        navigation.navigate('SelectPhotos', {
          session, group, photos,
          maxSelect: halfPhotos,
          total: 60.00,
          packageType: 'half',
        });
      } else {
        navigation.navigate('SelectPhotos', {
          session, group, photos,
          maxSelect: null,
          total: null,
          packageType: 'single',
        });
      }
    }, 200);
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
          <Text style={styles.title}>Escolha seu Pacote</Text>
        </View>
        <View style={{ width: Math.round(90 * k) }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.subtitle}>
          Você tirou {totalPhotos} fotos incríveis!{'\n'}Como deseja levar suas memórias?
        </Text>

        {packages.map((pkg) => (
          <TouchableOpacity
            key={pkg.id}
            style={[
              styles.card,
              selected === pkg.id && styles.cardSelected,
              pkg.id === 'all' && styles.cardFeatured,
            ]}
            onPress={() => handleSelect(pkg)}
            activeOpacity={0.85}
          >
            {pkg.id === 'all' && (
              <View style={styles.featuredBadge}>
                <Text style={styles.featuredBadgeText}>⭐ MAIS POPULAR</Text>
              </View>
            )}

            <View style={styles.cardContent}>
              <Text style={styles.cardIcon}>{pkg.icon}</Text>
              <View style={styles.cardInfo}>
                <View style={[styles.tag, { borderColor: pkg.tagColor + '55', backgroundColor: pkg.tagColor + '22' }]}>
                  <Text style={[styles.tagText, { color: pkg.tagColor }]}>{pkg.tag}</Text>
                </View>
                <Text style={styles.cardTitle}>{pkg.title}</Text>
                <Text style={styles.cardDescription}>{pkg.description}</Text>
              </View>
              <View style={styles.cardPricing}>
                {pkg.id === 'single' && (
                  <Text style={styles.perPhoto}>por foto</Text>
                )}
                <Text style={styles.cardPrice}>
                  R$ {pkg.price.toFixed(2)}
                </Text>
                {pkg.savings && (
                  <Text style={styles.savings}>{pkg.savings}</Text>
                )}
              </View>
            </View>
            <Text style={styles.arrow}>→</Text>
          </TouchableOpacity>
        ))}

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
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: z(spacing.lg), paddingTop: z(spacing.xl), paddingBottom: z(spacing.md),
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  backText: { color: colors.accentLight, fontSize: z(20), fontWeight: '600' },
  headerCenter: {
    flexDirection: 'row', alignItems: 'center',
    gap: z(8), flex: 1, justifyContent: 'center',
  },
  dolphin: { fontSize: z(32) },
  title: { fontSize: z(24), fontWeight: '900', color: colors.white },
  content: { padding: z(spacing.lg), gap: z(spacing.lg), paddingBottom: z(40) },
  subtitle: {
    fontSize: z(16), color: colors.accentLight,
    textAlign: 'center', lineHeight: z(26), fontWeight: '400',
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(144,224,239,0.2)',
    borderRadius: z(radius.lg), padding: z(spacing.lg),
    gap: z(spacing.sm), position: 'relative', overflow: 'hidden',
  },
  cardFeatured: {
    backgroundColor: 'rgba(255,214,10,0.1)',
    borderColor: 'rgba(255,214,10,0.4)',
    borderWidth: 2,
  },
  cardSelected: {
    borderColor: colors.gold,
    backgroundColor: 'rgba(255,214,10,0.15)',
  },
  featuredBadge: {
    backgroundColor: colors.gold,
    paddingHorizontal: z(spacing.md), paddingVertical: z(4),
    borderRadius: z(radius.full), alignSelf: 'flex-start',
    marginBottom: z(spacing.xs),
  },
  featuredBadgeText: {
    fontSize: z(11), fontWeight: '900',
    letterSpacing: z(1), color: colors.primary,
  },
  cardContent: {
    flexDirection: 'row', alignItems: 'center', gap: z(spacing.md),
  },
  cardIcon: { fontSize: z(40) },
  cardInfo: { flex: 1, gap: z(4) },
  tag: {
    alignSelf: 'flex-start',
    paddingHorizontal: z(spacing.sm), paddingVertical: z(3),
    borderRadius: z(radius.full), borderWidth: 1, marginBottom: z(2),
  },
  tagText: { fontSize: z(10), fontWeight: '800', letterSpacing: z(1) },
  cardTitle: { fontSize: z(19), fontWeight: '900', color: colors.white },
  cardDescription: { fontSize: z(13), color: 'rgba(255,255,255,0.55)' },
  cardPricing: { alignItems: 'flex-end', gap: z(2) },
  perPhoto: { fontSize: z(11), color: colors.gray400, letterSpacing: z(1) },
  cardPrice: { fontSize: z(26), fontWeight: '900', color: colors.gold },
  savings: { fontSize: z(12), color: colors.success, fontWeight: '700' },
  arrow: { color: colors.accentLight, fontSize: z(20), textAlign: 'right' },
});
};