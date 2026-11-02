import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable,
  Image, StatusBar, Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, radius } from '../utils/theme';
import { useScale, useScaledStyles } from '../utils/responsive';

const COLS = 3;
const PRICE_PER_PHOTO = 15.00;

export default function SelectPhotosScreen({ route, navigation }) {
  const k = useScale();
  const styles = useScaledStyles(createStyles);
  const { session, photos, maxSelect, total, packageType, group } = route.params;
  const [selected, setSelected] = useState(new Set());
  const [previewPhoto, setPreviewPhoto] = useState(null);

  const isHalf = packageType === 'half';
  const isSingle = packageType === 'single';
  const totalPrice = isSingle ? selected.size * PRICE_PER_PHOTO : total;

  const toggleSelect = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (maxSelect && next.size >= maxSelect) return prev;
        next.add(id);
      }
      return next;
    });
  }, [maxSelect]);

  const canCheckout = isHalf ? selected.size === maxSelect : selected.size > 0;

  const currentIndex = previewPhoto ? photos.findIndex(p => p.id === previewPhoto.id) : -1;
  const canPrev = currentIndex > 0;
  const canNext = currentIndex < photos.length - 1;

  const rows = [];
  for (let i = 0; i < photos.length; i += COLS) {
    rows.push(photos.slice(i, i + COLS));
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#003566', '#0077B6', '#00B4D8']}
        style={styles.gradient}
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
              <Text style={styles.title}>
                {isHalf ? 'Pacote Metade' : 'Fotos Avulsas'}
              </Text>
              <Text style={styles.subtitle}>
                {isHalf
                  ? `Selecione ${maxSelect} fotos (${selected.size}/${maxSelect})`
                  : `${selected.size} foto${selected.size !== 1 ? 's' : ''} · R$ ${totalPrice.toFixed(2)}`
                }
              </Text>
            </View>
          </View>
          <View style={{ width: Math.round(90 * k) }} />
        </View>

        {isHalf && (
          <View style={styles.progressWrap}>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${(selected.size / maxSelect) * 100}%` }]} />
            </View>
            <Text style={styles.progressText}>
              {selected.size === maxSelect
                ? '⭐ Seleção completa! Pode continuar.'
                : `Faltam ${maxSelect - selected.size} foto${maxSelect - selected.size !== 1 ? 's' : ''}`
              }
            </Text>
          </View>
        )}

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.grid}
          showsVerticalScrollIndicator={true}
        >
          {rows.map((row, rowIndex) => (
            <View key={rowIndex} style={styles.row}>
              {row.map((item) => {
                const isSelected = selected.has(item.id);
                const isDisabled = isHalf && !isSelected && selected.size >= maxSelect;
                return (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() => toggleSelect(item.id)}
                    activeOpacity={0.8}
                    style={[
                      styles.photoWrap,
                      isSelected && styles.photoWrapSelected,
                      isDisabled && styles.photoWrapDisabled,
                    ]}
                  >
                    <Image
                      source={{ uri: item.url }}
                      style={[styles.photo, isDisabled && styles.photoDisabled]}
                      resizeMode="cover"
                    />
                    {isSelected && (
                      <View style={styles.checkOverlay}>
                        <View style={styles.checkBadge}>
                          <Text style={styles.checkMark}>✓</Text>
                        </View>
                      </View>
                    )}
                    {isSingle && !isSelected && (
                      <Text style={styles.priceTag}>R$ {PRICE_PER_PHOTO.toFixed(2)}</Text>
                    )}
                    <Pressable
                      style={styles.zoomBtn}
                      onPress={() => setPreviewPhoto(item)}
                      hitSlop={8}
                    >
                      <Text style={styles.zoomIcon}>🔍</Text>
                    </Pressable>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
          <View style={{ height: Math.round(120 * k) }} />
        </ScrollView>

        <View style={styles.bottomBar}>
          {canCheckout ? (
            <TouchableOpacity
              style={styles.checkoutBtn}
              onPress={() => navigation.navigate('Extras', {
                session,
                group,
                photoIds: [...selected],
                photos: photos.filter(p => selected.has(p.id)),
                total: totalPrice,
                packageType,
              })}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={[colors.gold, colors.goldDark]}
                style={styles.checkoutGrad}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              >
                <Text style={styles.checkoutText}>
                  CONTINUAR · R$ {totalPrice.toFixed(2)} →
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <View style={styles.hintBar}>
              <Text style={styles.hintText}>
                {isHalf
                  ? `👆 Selecione ${maxSelect - selected.size} foto${maxSelect - selected.size !== 1 ? 's' : ''} para continuar`
                  : '👆 Toque para selecionar • Segure para ampliar'
                }
              </Text>
            </View>
          )}
        </View>
      </LinearGradient>

      <Modal
        visible={!!previewPhoto}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewPhoto(null)}
      >
        {previewPhoto && (
          <View style={styles.modalOverlay}>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setPreviewPhoto(null)}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>

            <Text style={styles.photoCounter}>
              🐬 {currentIndex + 1} / {photos.length}
            </Text>

            <View style={styles.navRow}>
              <TouchableOpacity
                style={[styles.navBtn, !canPrev && styles.navBtnDisabled]}
                onPress={() => canPrev && setPreviewPhoto(photos[currentIndex - 1])}
              >
                <Text style={styles.navBtnText}>‹</Text>
              </TouchableOpacity>

              <Image
                source={{ uri: previewPhoto.url }}
                style={styles.previewImage}
                resizeMode="contain"
              />

              <TouchableOpacity
                style={[styles.navBtn, !canNext && styles.navBtnDisabled]}
                onPress={() => canNext && setPreviewPhoto(photos[currentIndex + 1])}
              >
                <Text style={styles.navBtnText}>›</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalActions}>
              {selected.has(previewPhoto.id) ? (
                <TouchableOpacity
                  style={styles.removeBtn}
                  onPress={() => toggleSelect(previewPhoto.id)}
                >
                  <Text style={styles.removeBtnText}>✕ Remover seleção</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.addBtn,
                    isHalf && selected.size >= maxSelect && styles.addBtnDisabled,
                  ]}
                  onPress={() => toggleSelect(previewPhoto.id)}
                  disabled={isHalf && selected.size >= maxSelect}
                >
                  <LinearGradient
                    colors={
                      isHalf && selected.size >= maxSelect
                        ? ['#333', '#222']
                        : [colors.gold, colors.goldDark]
                    }
                    style={styles.addBtnGrad}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  >
                    <Text style={[
                      styles.addBtnText,
                      { color: isHalf && selected.size >= maxSelect ? colors.white : colors.primary }
                    ]}>
                      {isHalf && selected.size >= maxSelect
                        ? 'Limite atingido'
                        : '+ Selecionar esta foto'
                      }
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </Modal>
    </View>
  );
}

const createStyles = (k, width, height) => {
  const z = (n) => Math.round(n * k);
  const PHOTO_SIZE = Math.floor((width - z(spacing.lg) * 2 - z(spacing.sm) * (COLS - 1)) / COLS) - 1;
  return StyleSheet.create({
  container: { flex: 1 },
  gradient: { flex: 1 },
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
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: z(spacing.sm), flex: 1, justifyContent: 'center' },
  dolphin: { fontSize: z(32) },
  title: { fontSize: z(24), fontWeight: '900', color: colors.white },
  subtitle: { fontSize: z(15), color: colors.gold, fontWeight: '700', marginTop: z(2) },
  progressWrap: {
    paddingHorizontal: z(spacing.lg), paddingVertical: z(spacing.sm),
    gap: z(spacing.xs), borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,214,10,0.05)',
  },
  progressBar: {
    height: z(6), backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: z(radius.full), overflow: 'hidden',
  },
  progressFill: {
    height: '100%', backgroundColor: colors.gold,
    borderRadius: z(radius.full),
  },
  progressText: { fontSize: z(13), color: colors.gold, textAlign: 'center', fontWeight: '700' },
  scrollView: { flex: 1 },
  grid: { padding: z(spacing.lg) },
  row: { flexDirection: 'row', gap: z(spacing.sm), marginBottom: z(spacing.sm) },
  photoWrap: {
    width: PHOTO_SIZE, height: PHOTO_SIZE * 1.1,
    borderRadius: z(radius.sm), overflow: 'hidden',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.1)',
  },
  photoWrapSelected: { borderColor: colors.gold, borderWidth: 3 },
  photoWrapDisabled: { opacity: 0.35 },
  photo: { width: '100%', height: '100%' },
  photoDisabled: { opacity: 0.5 },
  checkOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'flex-end', justifyContent: 'flex-start',
    padding: z(spacing.xs), backgroundColor: 'rgba(255,214,10,0.25)',
  },
  checkBadge: {
    width: z(32), height: z(32), borderRadius: z(16),
    backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.white,
  },
  checkMark: { color: colors.primary, fontSize: z(18), fontWeight: '900' },
  priceTag: {
    position: 'absolute', bottom: z(6), left: z(6),
    backgroundColor: 'rgba(0,0,0,0.65)', color: colors.gold,
    fontSize: z(12), fontWeight: '800', paddingHorizontal: z(6),
    paddingVertical: z(2), borderRadius: z(4),
  },
  zoomBtn: {
    position: 'absolute', bottom: z(6), right: z(6),
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: z(12), padding: z(4),
  },
  zoomIcon: { fontSize: z(12) },
  bottomBar: {
    padding: z(spacing.lg), borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#003566',
  },
  checkoutBtn: { borderRadius: z(radius.full), overflow: 'hidden' },
  checkoutGrad: { paddingVertical: z(spacing.lg), alignItems: 'center' },
  checkoutText: { fontSize: z(18), fontWeight: '900', letterSpacing: z(1), color: colors.primary },
  hintBar: { paddingVertical: z(spacing.md), alignItems: 'center' },
  hintText: { fontSize: z(14), color: colors.accentLight, textAlign: 'center' },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,20,50,0.97)',
    alignItems: 'center', justifyContent: 'center', padding: z(spacing.lg),
  },
  closeBtn: {
    position: 'absolute', top: z(spacing.xl), right: z(spacing.xl),
    width: z(44), height: z(44), borderRadius: z(22),
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center', zIndex: 10,
  },
  closeBtnText: { color: colors.white, fontSize: z(20), fontWeight: '700' },
  photoCounter: {
    position: 'absolute', top: z(spacing.xl + 8),
    left: 0, right: 0, textAlign: 'center',
    color: colors.gold, fontSize: z(15), fontWeight: '700',
  },
  navRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: z(spacing.md), width: '100%',
  },
  navBtn: {
    width: z(52), height: z(52), borderRadius: z(26),
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  navBtnDisabled: { opacity: 0.2 },
  navBtnText: { color: colors.white, fontSize: z(32), fontWeight: '300' },
  previewImage: { width: width * 0.82, height: height * 0.75, borderRadius: z(radius.lg) },
  modalActions: { marginTop: z(spacing.lg), width: '100%', maxWidth: z(400) },
  addBtn: { borderRadius: z(radius.full), overflow: 'hidden' },
  addBtnDisabled: { opacity: 0.6 },
  addBtnGrad: { paddingVertical: z(spacing.md), alignItems: 'center' },
  addBtnText: { fontSize: z(18), fontWeight: '900' },
  removeBtn: {
    paddingVertical: z(spacing.md), alignItems: 'center',
    borderRadius: z(radius.full), borderWidth: 2, borderColor: colors.error,
  },
  removeBtnText: { fontSize: z(18), fontWeight: '800', color: colors.error },
});
};