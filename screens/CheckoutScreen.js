import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Image, ActivityIndicator, StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, radius } from '../utils/theme';

export default function CheckoutScreen({ route, navigation }) {
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
        <View style={{ width: 100 }} />
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

        <View style={styles.card}>
          <Text style={styles.benefitsTitle}>🐬 Jangalancha Show garante:</Text>
          {[
            '📸 Fotos em alta resolução',
            '🔗 Link para download no celular',
            '📱 Compartilhamento via WhatsApp',
            '☁️ Acesso por 30 dias na nuvem',
          ].map((item) => (
            <Text key={item} style={styles.feature}>{item}</Text>
          ))}
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
  content: { padding: spacing.lg, paddingBottom: 120, gap: spacing.lg },
  packageBadge: {
    backgroundColor: 'rgba(255,214,10,0.15)',
    borderWidth: 1, borderColor: 'rgba(255,214,10,0.3)',
    borderRadius: radius.full, paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg, alignSelf: 'center',
  },
  packageBadgeText: { fontSize: 15, fontWeight: '800', color: colors.gold },
  section: { gap: spacing.sm },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 2, color: colors.gray400 },
  thumbRow: { marginTop: spacing.xs },
  thumb: {
    width: 88, height: 88, borderRadius: radius.sm,
    marginRight: spacing.sm, borderWidth: 2, borderColor: colors.gold,
  },
  card: {
    backgroundColor: colors.cardBg,
    borderWidth: 1, borderColor: colors.cardBorder,
    borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { fontSize: 15, color: colors.accentLight },
  rowValue: { fontSize: 15, color: colors.white, fontWeight: '700' },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  totalLabel: { fontSize: 18, fontWeight: '900', color: colors.white, letterSpacing: 2 },
  totalValue: { fontSize: 28, fontWeight: '900', color: colors.gold },
  benefitsTitle: { fontSize: 15, fontWeight: '800', color: colors.gold, marginBottom: 4 },
  feature: { fontSize: 15, color: colors.accentLight },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: spacing.lg, backgroundColor: '#003566',
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
  },
  payBtn: { borderRadius: radius.full, overflow: 'hidden' },
  payGrad: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', paddingVertical: spacing.lg, gap: spacing.sm,
  },
  payIcon: { fontSize: 20 },
  payText: { fontSize: 19, fontWeight: '900', letterSpacing: 2, color: colors.primary },
});