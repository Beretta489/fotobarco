import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, ActivityIndicator, StatusBar, Dimensions, Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { photosService } from '../services/photos';
import { colors, spacing, radius } from '../utils/theme';

const { width, height } = Dimensions.get('window');
const COLS = 3;
const PHOTO_SIZE = (width - spacing.lg * 2 - spacing.sm * (COLS - 1)) / COLS;

export default function PhotoGalleryScreen({ route, navigation }) {
  const { session, group } = route.params;
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
          <View style={{ width: 70 }} />
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
            <View style={{ height: 40 }} />
          </ScrollView>
        )}

        <View style={styles.bottomBar}>
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
  sessionName: { fontSize: 18, fontWeight: '900', color: colors.white },
  photoCount: { fontSize: 12, color: colors.gray400 },
  instructionBar: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    backgroundColor: 'rgba(255,214,10,0.08)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,214,10,0.15)',
  },
  instructionText: { fontSize: 13, color: colors.gold, textAlign: 'center', fontWeight: '600' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  loadingText: { color: colors.gold, fontSize: 16, fontWeight: '600' },
  errorText: { color: colors.error, fontSize: 16, textAlign: 'center' },
  emptyText: { color: colors.accentLight, fontSize: 16, textAlign: 'center', lineHeight: 26 },
  retryBtn: {
    paddingVertical: spacing.md, paddingHorizontal: spacing.xl,
    borderRadius: radius.full, borderWidth: 1, borderColor: colors.accentLight,
  },
  retryText: { color: colors.accentLight, fontSize: 15, fontWeight: '600' },
  scrollView: { flex: 1 },
  grid: { padding: spacing.lg },
  row: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  photoWrap: {
    width: PHOTO_SIZE, height: PHOTO_SIZE * 1.1,
    borderRadius: radius.sm, overflow: 'hidden',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.1)',
  },
  photo: { width: '100%', height: '100%' },
  zoomHint: {
    position: 'absolute', bottom: 6, right: 6,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12, padding: 4,
  },
  zoomIcon: { fontSize: 12 },
  bottomBar: {
    padding: spacing.lg, borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)', backgroundColor: '#003566',
  },
  ctaBtn: { borderRadius: radius.full, overflow: 'hidden' },
  ctaGrad: { paddingVertical: spacing.lg, alignItems: 'center' },
  ctaText: { fontSize: 17, fontWeight: '900', letterSpacing: 2, color: colors.primary },
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
  closePreviewBtn: {
    marginTop: spacing.lg, paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl, borderRadius: radius.full,
    borderWidth: 2, borderColor: 'rgba(255,214,10,0.4)',
  },
  closePreviewText: { color: colors.gold, fontSize: 16, fontWeight: '700' },
});