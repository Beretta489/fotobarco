import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, StatusBar, Dimensions, Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, radius } from '../utils/theme';

const { width, height } = Dimensions.get('window');
const COLS = 3;
const PHOTO_SIZE = (width - spacing.lg * 2 - spacing.sm * (COLS - 1)) / COLS;
const PRICE_PER_PHOTO = 15.00;

export default function SelectPhotosScreen({ route, navigation }) {
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
          <View style={{ width: 70 }} />
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
                    <TouchableOpacity
                      style={styles.zoomBtn}
                      onPress={() => setPreviewPhoto(item)}
                    >
                      <Text style={styles.zoomIcon}>🔍</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
          <View style={{ height: 120 }} />
        </ScrollView>

        <View style={styles.bottomBar}>
          {canCheckout ? (
            <TouchableOpacity
              style={styles.checkoutBtn}
              onPress={() => navigation.navigate('Checkout', {
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

const styles = StyleSheet.create({
  container: { width: '100%', height: '100vh', overflow: 'hidden' },
  gradient: { flex: 1, height: '100%' },
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
  progressWrap: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    gap: spacing.xs, borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,214,10,0.05)',
  },
  progressBar: {
    height: 6, backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: radius.full, overflow: 'hidden',
  },
  progressFill: {
    height: '100%', backgroundColor: colors.gold,
    borderRadius: radius.full,
  },
  progressText: { fontSize: 13, color: colors.gold, textAlign: 'center', fontWeight: '700' },
  scrollView: { flex: 1 },
  grid: { padding: spacing.lg },
  row: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  photoWrap: {
    width: PHOTO_SIZE, height: PHOTO_SIZE * 1.1,
    borderRadius: radius.sm, overflow: 'hidden',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.1)',
  },
  photoWrapSelected: { borderColor: colors.gold, borderWidth: 3 },
  photoWrapDisabled: { opacity: 0.35 },
  photo: { width: '100%', height: '100%' },
  photoDisabled: { opacity: 0.5 },
  checkOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'flex-end', justifyContent: 'flex-start',
    padding: spacing.xs, backgroundColor: 'rgba(255,214,10,0.25)',
  },
  checkBadge: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.white,
  },
  checkMark: { color: colors.primary, fontSize: 18, fontWeight: '900' },
  priceTag: {
    position: 'absolute', bottom: 6, left: 6,
    backgroundColor: 'rgba(0,0,0,0.65)', color: colors.gold,
    fontSize: 12, fontWeight: '800', paddingHorizontal: 6,
    paddingVertical: 2, borderRadius: 4,
  },
  zoomBtn: {
    position: 'absolute', bottom: 6, right: 6,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12, padding: 4,
  },
  zoomIcon: { fontSize: 12 },
  bottomBar: {
    padding: spacing.lg, borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#003566',
  },
  checkoutBtn: { borderRadius: radius.full, overflow: 'hidden' },
  checkoutGrad: { paddingVertical: spacing.lg, alignItems: 'center' },
  checkoutText: { fontSize: 18, fontWeight: '900', letterSpacing: 1, color: colors.primary },
  hintBar: { paddingVertical: spacing.md, alignItems: 'center' },
  hintText: { fontSize: 14, color: colors.accentLight, textAlign: 'center' },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,20,50,0.97)',
    alignItems: 'center', justifyContent: 'center', padding: spacing.lg,
  },
  closeBtn: {
    position: 'absolute', top: spacing.xl, right: spacing.xl,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center', zIndex: 10,
  },
  closeBtnText: { color: colors.white, fontSize: 20, fontWeight: '700' },
  photoCounter: {
    position: 'absolute', top: spacing.xl + 8,
    left: 0, right: 0, textAlign: 'center',
    color: colors.gold, fontSize: 15, fontWeight: '700',
  },
  navRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: spacing.md, width: '100%',
  },
  navBtn: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  navBtnDisabled: { opacity: 0.2 },
  navBtnText: { color: colors.white, fontSize: 32, fontWeight: '300' },
  previewImage: { width: width * 0.82, height: height * 0.75, borderRadius: radius.lg },
  modalActions: { marginTop: spacing.lg, width: '100%', maxWidth: 400 },
  addBtn: { borderRadius: radius.full, overflow: 'hidden' },
  addBtnDisabled: { opacity: 0.6 },
  addBtnGrad: { paddingVertical: spacing.md, alignItems: 'center' },
  addBtnText: { fontSize: 18, fontWeight: '900' },
  removeBtn: {
    paddingVertical: spacing.md, alignItems: 'center',
    borderRadius: radius.full, borderWidth: 2, borderColor: colors.error,
  },
  removeBtnText: { fontSize: 18, fontWeight: '800', color: colors.error },
});