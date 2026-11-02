import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Image, ActivityIndicator, StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, radius } from '../utils/theme';
import { useScale, useScaledStyles } from '../utils/responsive';

export default function CheckoutScreen({ route, navigation }) {
  const k = useScale();
  const styles = useScaledStyles(createStyles);
  const { session, photoIds, photos, total, packageType, group, extras = [], extrasTotal = 0 } = route.params;
  const [loading, setLoading] = useState(false);

  const grandTotal = total + extrasTotal;

  const packageLabel = {
    all: '📦 Pacote Completo',
    half: '🎯 Pacote Metade',
    single: '🖼️ Fotos Avulsas',
  };

  const handleCheckout = () => {
    navigation.navigate('Phone', {
      session,
      group,
      photoIds,
      photos,
      total: grandTotal,
      packageType,
      extras,
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
          <Text style={styles.title}>Resumo do Pedido</Text>
        </View>
        <View style={{ width: Math.round(100 * k) }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        <View style={styles.packageBadge}>
          <Text style={styles.packageBadgeText}>
            {packageLabel[packageType] || '🖼️ Fotos Selecionadas'}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>FOTOS SELECIONADAS ({photos.length})</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbRow}>
            {photos.map((photo) => (
              <Image key={photo.id} source={{ uri: photo.url }} style={styles.thumb} />
            ))}
          </ScrollView>
        </View>

        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>
              {packageType === 'single'
                ? `${photos.length} foto${photos.length > 1 ? 's' : ''} × R$ 15,00`
                : packageLabel[packageType]
              }
            </Text>
            <Text style={styles.rowValue}>R$ {total.toFixed(2)}</Text>
          </View>

          {extras.length > 0 && (
            <>
              <View style={styles.divider} />
              {extras.map((extra) => (
                <View key={extra.id} style={styles.row}>
                  <Text style={styles.rowLabel}>{extra.quantity}× {extra.name}</Text>
                  <Text style={styles.rowValue}>R$ {extra.subtotal.toFixed(2)}</Text>
                </View>
              ))}
            </>
          )}

          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.totalLabel}>TOTAL</Text>
            <Text style={styles.totalValue}>R$ {grandTotal.toFixed(2)}</Text>
          </View>
        </View>

      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.payBtn}
          onPress={handleCheckout}
          disabled={loading}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={[colors.gold, colors.goldDark]}
            style={styles.payGrad}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          >
            {loading ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <>
                <Text style={styles.payIcon}>📱</Text>
                <Text style={styles.payText}>CONTINUAR · R$ {grandTotal.toFixed(2)}</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
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
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: z(8), flex: 1, justifyContent: 'center' },
  dolphin: { fontSize: z(32) },
  title: { fontSize: z(24), fontWeight: '900', color: colors.white },
  content: { padding: z(spacing.lg), paddingBottom: z(120), gap: z(spacing.lg) },
  packageBadge: {
    backgroundColor: 'rgba(255,214,10,0.15)',
    borderWidth: 1, borderColor: 'rgba(255,214,10,0.3)',
    borderRadius: z(radius.full), paddingVertical: z(spacing.sm),
    paddingHorizontal: z(spacing.lg), alignSelf: 'center',
  },
  packageBadgeText: { fontSize: z(15), fontWeight: '800', color: colors.gold },
  section: { gap: z(spacing.sm) },
  sectionLabel: { fontSize: z(11), fontWeight: '700', letterSpacing: z(2), color: colors.gray400 },
  thumbRow: { marginTop: z(spacing.xs) },
  thumb: {
    width: z(88), height: z(88), borderRadius: z(radius.sm),
    marginRight: z(spacing.sm), borderWidth: 2, borderColor: colors.gold,
  },
  card: {
    backgroundColor: colors.cardBg,
    borderWidth: 1, borderColor: colors.cardBorder,
    borderRadius: z(radius.lg), padding: z(spacing.lg), gap: z(spacing.md),
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { fontSize: z(15), color: colors.accentLight },
  rowValue: { fontSize: z(15), color: colors.white, fontWeight: '700' },
  divider: { height: z(1), backgroundColor: 'rgba(255,255,255,0.08)' },
  totalLabel: { fontSize: z(18), fontWeight: '900', color: colors.white, letterSpacing: z(2) },
  totalValue: { fontSize: z(28), fontWeight: '900', color: colors.gold },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: z(spacing.lg), backgroundColor: '#003566',
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
  },
  payBtn: { borderRadius: z(radius.full), overflow: 'hidden' },
  payGrad: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', paddingVertical: z(spacing.lg), gap: z(spacing.sm),
  },
  payIcon: { fontSize: z(20) },
  payText: { fontSize: z(19), fontWeight: '900', letterSpacing: z(2), color: colors.primary },
});
};