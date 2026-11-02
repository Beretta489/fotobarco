import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, ActivityIndicator, StatusBar, Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { photosService } from '../services/photos';
import { colors, spacing, radius } from '../utils/theme';
import { useScale, useScaledStyles } from '../utils/responsive';

const COLS = 3;

export default function PhotoGalleryScreen({ route, navigation }) {
  const k = useScale();
  const styles = useScaledStyles(createStyles);
  const { session, group } = route.params;
  const insets = useSafeAreaInsets();
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [previewPhoto, setPreviewPhoto] = useState(null);

  useEffect(() => {
    loadPhotos();
  }, []);

  const loadPhotos = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await photosService.getByGroup(group.id);
      setPhotos(data);
    } catch (e) {
      setError('Erro ao carregar fotos. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

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
              <Text style={styles.sessionName}>{session.name}</Text>
              <Text style={styles.photoCount}>{photos.length} fotos do seu passeio</Text>
            </View>
          </View>
          <View style={{ width: Math.round(90 * k) }} />
        </View>

        <View style={styles.instructionBar}>
          <Text style={styles.instructionText}>
            👆 Toque para ampliar • Veja todas as suas fotos!
          </Text>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.gold} />
            <Text style={styles.loadingText}>Carregando suas fotos...</Text>
          </View>
        ) : error ? (
          <View style={styles.loadingWrap}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={loadPhotos}>
              <Text style={styles.retryText}>Tentar novamente</Text>
            </TouchableOpacity>
          </View>
        ) : photos.length === 0 ? (
          <View style={styles.loadingWrap}>
            <Text style={styles.emptyText}>
              Nenhuma foto encontrada.{'\n'}Fale com o atendente.
            </Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.grid}
            showsVerticalScrollIndicator={true}
          >
            {rows.map((row, rowIndex) => (
              <View key={rowIndex} style={styles.row}>
                {row.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() => setPreviewPhoto(item)}
                    activeOpacity={0.85}
                    style={styles.photoWrap}
                  >
                    <Image source={{ uri: item.url }} style={styles.photo} resizeMode="cover" />
                    <View style={styles.zoomHint}>
                      <Text style={styles.zoomIcon}>🔍</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
            <View style={{ height: Math.round(40 * k) }} />
          </ScrollView>
        )}

        <View style={[styles.bottomBar, { paddingBottom: spacing.lg + insets.bottom }]}>
          <TouchableOpacity
            style={styles.ctaBtn}
            onPress={() => navigation.navigate('PackageSelect', { session, photos, group })}
            activeOpacity={0.85}
            disabled={photos.length === 0}
          >
            <LinearGradient
              colors={photos.length === 0 ? ['#333', '#222'] : [colors.gold, colors.goldDark]}
              style={styles.ctaGrad}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            >
              <Text style={[styles.ctaText, photos.length === 0 && { color: colors.gray400 }]}>
                {photos.length === 0 ? 'Aguardando fotos...' : 'QUERO COMPRAR MINHAS FOTOS →'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
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

            <TouchableOpacity
              style={styles.closePreviewBtn}
              onPress={() => setPreviewPhoto(null)}
            >
              <Text style={styles.closePreviewText}>Fechar</Text>
            </TouchableOpacity>
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
  sessionName: { fontSize: z(24), fontWeight: '900', color: colors.white },
  photoCount: { fontSize: z(15), color: colors.gray400 },
  instructionBar: {
    paddingHorizontal: z(spacing.lg), paddingVertical: z(spacing.sm),
    backgroundColor: 'rgba(255,214,10,0.08)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,214,10,0.15)',
  },
  instructionText: { fontSize: z(13), color: colors.gold, textAlign: 'center', fontWeight: '600' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: z(spacing.md) },
  loadingText: { color: colors.gold, fontSize: z(16), fontWeight: '600' },
  errorText: { color: colors.error, fontSize: z(16), textAlign: 'center' },
  emptyText: { color: colors.accentLight, fontSize: z(16), textAlign: 'center', lineHeight: z(26) },
  retryBtn: {
    paddingVertical: z(spacing.md), paddingHorizontal: z(spacing.xl),
    borderRadius: z(radius.full), borderWidth: 1, borderColor: colors.accentLight,
  },
  retryText: { color: colors.accentLight, fontSize: z(15), fontWeight: '600' },
  scrollView: { flex: 1 },
  grid: { padding: z(spacing.lg) },
  row: { flexDirection: 'row', gap: z(spacing.sm), marginBottom: z(spacing.sm) },
  photoWrap: {
    width: PHOTO_SIZE, height: PHOTO_SIZE * 1.1,
    borderRadius: z(radius.sm), overflow: 'hidden',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.1)',
  },
  photo: { width: '100%', height: '100%' },
  zoomHint: {
    position: 'absolute', bottom: z(6), right: z(6),
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: z(12), padding: z(4),
  },
  zoomIcon: { fontSize: z(12) },
  bottomBar: {
    padding: z(spacing.lg), borderTopWidth: 1, flexShrink: 0,
    borderTopColor: 'rgba(255,255,255,0.08)', backgroundColor: '#003566',
  },
  ctaBtn: { borderRadius: z(radius.full), overflow: 'hidden' },
  ctaGrad: { paddingVertical: z(spacing.lg), alignItems: 'center' },
  ctaText: { fontSize: z(17), fontWeight: '900', letterSpacing: z(2), color: colors.primary },
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
  closePreviewBtn: {
    marginTop: z(spacing.lg), paddingVertical: z(spacing.md),
    paddingHorizontal: z(spacing.xl), borderRadius: z(radius.full),
    borderWidth: 2, borderColor: 'rgba(255,214,10,0.4)',
  },
  closePreviewText: { color: colors.gold, fontSize: z(16), fontWeight: '700' },
});
};