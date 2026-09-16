import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, StatusBar, useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, radius } from '../utils/theme';
import { EXTRAS_CATALOG, buildExtras } from '../utils/extras';

const H_PADDING = spacing.lg;
const GAP = spacing.md;

export default function ExtrasScreen({ route, navigation }) {
  const { session, group, photoIds, photos, total, packageType } = route.params;
  const { width } = useWindowDimensions();

  // 4 cards por fileira em telas largas (tablet deitado), 3 nas mais estreitas.
  const numColumns = width >= 820 ? 4 : 3;
  const cardWidth = Math.floor(
    (width - H_PADDING * 2 - GAP * (numColumns - 1)) / numColumns
  );

  const [quantities, setQuantities] = useState({});

  const inc = (id) =>
    setQuantities((q) => ({ ...q, [id]: (q[id] || 0) + 1 }));

  const dec = (id) =>
    setQuantities((q) => {
      const next = { ...q };
      const value = (next[id] || 0) - 1;
      if (value <= 0) delete next[id];
      else next[id] = value;
      return next;
    });

  const { extras, extrasTotal } = useMemo(() => buildExtras(quantities), [quantities]);
  const itemCount = useMemo(
    () => extras.reduce((sum, e) => sum + e.quantity, 0),
    [extras]
  );

  const handleContinue = () => {
    navigation.navigate('Checkout', {
      session,
      group,
      photoIds,
      photos,
      total,
      packageType,
      extras,
      extrasTotal,
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
          <View>
            <Text style={styles.title}>Consumiu algo a bordo?</Text>
            <Text style={styles.subtitle}>Toque no + para adicionar (opcional)</Text>
          </View>
        </View>
        <View style={{ width: 70 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {EXTRAS_CATALOG.map((category) => (
          <View key={category.id} style={styles.section}>
            <Text style={styles.sectionLabel}>
              {category.icon}  {category.title.toUpperCase()}
            </Text>
            <View style={styles.grid}>
              {category.items.map((item) => {
                const qty = quantities[item.id] || 0;
                const active = qty > 0;
                return (
                  <View
                    key={item.id}
                    style={[styles.card, active && styles.cardActive, { width: cardWidth }]}
                  >
                    <View style={styles.cardBody}>
                      <Text style={styles.cardEmoji}>{item.emoji}</Text>
                      <Text style={styles.cardName} numberOfLines={2}>{item.name}</Text>
                      <Text style={styles.cardPrice}>R$ {item.price.toFixed(2)}</Text>
                    </View>

                    <View style={styles.actionRow}>
                      {active ? (
                        <View style={styles.stepper}>
                          <TouchableOpacity
                            style={styles.stepBtn}
                            onPress={() => dec(item.id)}
                            hitSlop={8}
                            activeOpacity={0.8}
                          >
                            <Text style={styles.stepBtnText}>−</Text>
                          </TouchableOpacity>
                          <Text style={styles.stepQty}>{qty}</Text>
                          <TouchableOpacity
                            style={styles.stepBtnPlus}
                            onPress={() => inc(item.id)}
                            hitSlop={8}
                            activeOpacity={0.8}
                          >
                            <Text style={styles.stepBtnPlusText}>+</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={styles.addBtn}
                          onPress={() => inc(item.id)}
                          hitSlop={8}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.addBtnText}>+</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        ))}
        <View style={{ height: 120 }} />
      </ScrollView>

      <View style={styles.footer}>
        {itemCount > 0 && (
          <View style={styles.footerSummary}>
            <Text style={styles.footerCount}>
              {itemCount} {itemCount === 1 ? 'item' : 'itens'}
            </Text>
            <Text style={styles.footerTotal}>+ R$ {extrasTotal.toFixed(2)}</Text>
          </View>
        )}
        <TouchableOpacity
          style={styles.continueBtn}
          onPress={handleContinue}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={[colors.gold, colors.goldDark]}
            style={styles.continueGrad}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          >
            <Text style={styles.continueText}>
              {itemCount > 0 ? 'CONTINUAR →' : 'PULAR ETAPA →'}
            </Text>
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
  backText: { color: colors.accentLight, fontSize: 17, fontWeight: '600' },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1, justifyContent: 'center' },
  dolphin: { fontSize: 28 },
  title: { fontSize: 18, fontWeight: '900', color: colors.white },
  subtitle: { fontSize: 12, color: colors.gold, fontWeight: '700', marginTop: 2 },
  content: { padding: spacing.lg, gap: spacing.xl },
  section: { gap: spacing.md },
  sectionLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 2, color: colors.gray400 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  card: {
    minHeight: 168,
    backgroundColor: colors.cardBg,
    borderWidth: 1, borderColor: colors.cardBorder,
    borderRadius: radius.lg,
    padding: spacing.md,
    justifyContent: 'space-between',
  },
  cardActive: { borderColor: colors.gold, borderWidth: 2, backgroundColor: 'rgba(255,214,10,0.10)' },
  cardBody: { gap: spacing.xs },
  cardEmoji: { fontSize: 40 },
  cardName: { fontSize: 15, fontWeight: '700', color: colors.white, lineHeight: 19 },
  cardPrice: { fontSize: 16, fontWeight: '900', color: colors.gold },
  actionRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: spacing.sm },
  addBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.gold,
    alignItems: 'center', justifyContent: 'center',
  },
  addBtnText: { fontSize: 28, fontWeight: '900', color: colors.primary, lineHeight: 30 },
  stepper: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: radius.full, padding: 4,
  },
  stepBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  stepBtnText: { fontSize: 24, fontWeight: '900', color: colors.white, lineHeight: 26 },
  stepQty: { fontSize: 18, fontWeight: '900', color: colors.white, minWidth: 22, textAlign: 'center' },
  stepBtnPlus: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.gold,
    alignItems: 'center', justifyContent: 'center',
  },
  stepBtnPlusText: { fontSize: 24, fontWeight: '900', color: colors.primary, lineHeight: 26 },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: spacing.lg, backgroundColor: '#003566',
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
    gap: spacing.sm,
  },
  footerSummary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xs },
  footerCount: { fontSize: 15, color: colors.accentLight, fontWeight: '700' },
  footerTotal: { fontSize: 20, fontWeight: '900', color: colors.gold },
  continueBtn: { borderRadius: radius.full, overflow: 'hidden' },
  continueGrad: { paddingVertical: spacing.lg, alignItems: 'center' },
  continueText: { fontSize: 18, fontWeight: '900', letterSpacing: 1, color: colors.primary },
});
