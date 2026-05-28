import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, radius } from '../utils/theme';

export default function PackageSelectScreen({ route, navigation }) {
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
      savings: `economia de R$ ${(totalPhotos * 15 - 100).toFixed(2)}`,
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
        navigation.navigate('Checkout', {
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
        <View style={{ width: 70 }} />
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

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>🐬 Jangalancha Show garante:</Text>
          {[
            '📸 Fotos em alta resolução',
            '🔗 Link para download no celular',
            '☁️ Disponível por 30 dias na nuvem',
            '📱 Compartilhe via WhatsApp',
          ].map((item) => (
            <Text key={item} style={styles.infoItem}>{item}</Text>
          ))}
        </View>
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
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  backText: { color: colors.accentLight, fontSize: 17, fontWeight: '600' },
  headerCenter: {
    flexDirection: 'row', alignItems: 'center',
    gap: 8, flex: 1, justifyContent: 'center',
  },
  dolphin: { fontSize: 24 },
  title: { fontSize: 20, fontWeight: '900', color: colors.white },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 40 },
  subtitle: {
    fontSize: 16, color: colors.accentLight,
    textAlign: 'center', lineHeight: 26, fontWeight: '400',
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(144,224,239,0.2)',
    borderRadius: radius.lg, padding: spacing.lg,
    gap: spacing.sm, position: 'relative', overflow: 'hidden',
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
    paddingHorizontal: spacing.md, paddingVertical: 4,
    borderRadius: radius.full, alignSelf: 'flex-start',
    marginBottom: spacing.xs,
  },
  featuredBadgeText: {
    fontSize: 11, fontWeight: '900',
    letterSpacing: 1, color: colors.primary,
  },
  cardContent: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
  },
  cardIcon: { fontSize: 40 },
  cardInfo: { flex: 1, gap: 4 },
  tag: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm, paddingVertical: 3,
    borderRadius: radius.full, borderWidth: 1, marginBottom: 2,
  },
  tagText: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  cardTitle: { fontSize: 19, fontWeight: '900', color: colors.white },
  cardDescription: { fontSize: 13, color: 'rgba(255,255,255,0.55)' },
  cardPricing: { alignItems: 'flex-end', gap: 2 },
  perPhoto: { fontSize: 11, color: colors.gray400, letterSpacing: 1 },
  cardPrice: { fontSize: 26, fontWeight: '900', color: colors.gold },
  savings: { fontSize: 12, color: colors.success, fontWeight: '700' },
  arrow: { color: colors.accentLight, fontSize: 20, textAlign: 'right' },
  infoCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(144,224,239,0.15)',
    borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm,
  },
  infoTitle: { fontSize: 15, fontWeight: '800', color: colors.gold, marginBottom: 4 },
  infoItem: { fontSize: 14, color: colors.accentLight },
});