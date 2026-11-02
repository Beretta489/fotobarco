import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Image, ActivityIndicator, StatusBar, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../services/supabase';
import { sessionsService } from '../services/sessions';
import { colors, spacing, radius } from '../utils/theme';
import { useScale, useScaledStyles } from '../utils/responsive';

const FIXED_SESSIONS = [
  { id: 's1', name: 'Passeio 09:00', time: '09:00' },
  { id: 's2', name: 'Passeio 10:15', time: '10:15' },
  { id: 's3', name: 'Passeio 11:45', time: '11:45' },
  { id: 's4', name: 'Passeio 13:30', time: '13:30' },
  { id: 's5', name: 'Passeio 14:45', time: '14:45' },
  { id: 's6', name: 'Passeio 16:00', time: '16:00' },
];

function getMiddlePhoto(photos) {
  if (!photos || photos.length === 0) return null;
  return photos[Math.floor(photos.length / 2)]?.url;
}

const COLS = 3;

// Horarios: grade 3x2 ocupando ~53% da largura (o resto fica pro golfinho),
// limitada pela altura para as duas linhas caberem abaixo do cabecalho.
const SESSIONS_SHARE = 0.53;
const SESSION_COLS = 3;

// Golfinho: ocupa a coluna dele mantendo a proporcao da imagem (840x546),
// sem passar da altura da grade de horarios.
const DOLPHIN_RATIO = 840 / 546;

export default function SelectGroupScreen({ navigation }) {
  const k = useScale();
  const styles = useScaledStyles(createStyles);
  const [step, setStep] = useState('session');
  const [selectedSession, setSelectedSession] = useState(null);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const dolphinBounce = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(dolphinBounce, { toValue: -10, duration: 1200, useNativeDriver: true }),
        Animated.timing(dolphinBounce, { toValue: 0, duration: 1200, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const handleSelectSession = async (session) => {
    setSelectedSession(session);
    setLoading(true);
    setError('');
    try {
      // "Hoje" no fuso do aparelho, nao em UTC. O bot grava scheduled_at em
      // hora local; usando o dia UTC, depois das 21h (Fortaleza, UTC-3) o app
      // ja procurava as sessoes do dia seguinte e nao achava nenhuma.
      const inicioDoDia = new Date();
      inicioDoDia.setHours(0, 0, 0, 0);
      const fimDoDia = new Date(inicioDoDia);
      fimDoDia.setDate(fimDoDia.getDate() + 1);

      const { data: sessions, error: dbError } = await supabase
        .from('sessions')
        .select('*, groups(*)')
        .eq('active', true)
        .eq('name', `Passeio ${session.time}`)
        .gte('scheduled_at', inicioDoDia.toISOString())
        .lt('scheduled_at', fimDoDia.toISOString());

      if (dbError || !sessions || sessions.length === 0) {
        setError('Nenhuma sessão ativa para este horário. Fale com o atendente.');
        setLoading(false);
        return;
      }

      const match = sessions[0];
      const groupsData = await sessionsService.getGroupsBySession(match.id);
      setGroups(groupsData);
      setSelectedSession({ ...session, supabase_id: match.id });
      setStep('groups');
    } catch (e) {
      setError('Erro ao carregar grupos. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectGroup = (group) => {
    navigation.navigate('PhotoGallery', {
      session: {
        id: selectedSession.supabase_id,
        name: `${selectedSession.name} — ${group.name}`,
      },
      group,
    });
  };

  const rows = [];
  for (let i = 0; i < groups.length; i += COLS) {
    rows.push(groups.slice(i, i + COLS));
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#001F5B', '#003D8F', '#0077B6', '#00B4D8']}
        style={styles.gradient}
        start={{ x: 0, y: 0 }} end={{ x: 0.2, y: 1 }}
      >
        <StatusBar hidden />

        <View style={styles.header}>
          <TouchableOpacity onPress={() => step === 'groups' ? setStep('session') : navigation.goBack()}>
            <Text style={styles.backText}>← Voltar</Text>
          </TouchableOpacity>
          <Text style={styles.headerBrand}>⛵ Jangalancha Show</Text>
          <View style={{ width: Math.round(90 * k) }} />
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.gold} />
            <Text style={styles.loadingText}>Carregando grupos...</Text>
          </View>
        ) : step === 'session' ? (

          <View style={styles.sessionContent}>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <View style={styles.mainRow}>
              <Animated.View style={[styles.dolphinWrap, { transform: [{ translateY: dolphinBounce }] }]}>
                <Image
                  source={require('../assets/golfinho_final.png')}
                  style={styles.dolphinImage}
                  resizeMode="contain"
                />
              </Animated.View>

              <View style={styles.sessionsWrap}>
                <View style={styles.sessionsGrid}>
                  {FIXED_SESSIONS.map((session) => (
                    <TouchableOpacity
                      key={session.id}
                      style={styles.sessionCard}
                      onPress={() => handleSelectSession(session)}
                      activeOpacity={0.82}
                    >
                      <LinearGradient
                        colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0.06)']}
                        style={styles.sessionCardInner}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                      >
                        <Text style={styles.sessionTime}>{session.time}</Text>
                        <Text style={styles.sessionHoras}>horas</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          </View>

        ) : groups.length === 0 ? (
          <View style={styles.loadingWrap}>
            <Text style={styles.emptyText}>
              Nenhum grupo encontrado para este passeio.{'\n'}Fale com o atendente.
            </Text>
            <TouchableOpacity style={styles.backBtn} onPress={() => setStep('session')}>
              <Text style={styles.backBtnText}>← Voltar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.groupsOuter}>
            <Text style={styles.groupInstruction}>
              👆 Toque no grupo onde você aparece nas fotos
            </Text>
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {rows.map((row, rowIndex) => (
                <View key={rowIndex} style={styles.row}>
                  {row.map((group) => (
                    <TouchableOpacity
                      key={group.id}
                      style={styles.groupCard}
                      onPress={() => handleSelectGroup(group)}
                      activeOpacity={0.85}
                    >
                      {getMiddlePhoto(group.photos) ? (
                        <Image
                          source={{ uri: getMiddlePhoto(group.photos) }}
                          style={styles.groupThumb}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={[styles.groupThumb, styles.groupThumbEmpty]}>
                          <Text style={styles.groupThumbEmptyText}>📸</Text>
                        </View>
                      )}
                      <LinearGradient
                        colors={['transparent', 'rgba(0,15,50,0.9)']}
                        style={styles.groupOverlay}
                      />
                      <View style={styles.groupInfo}>
                        <Text style={styles.groupLabel}>{group.name}</Text>
                      </View>
                      <View style={styles.tapHint}>
                        <Text style={styles.tapHintText}>Sou eu! →</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </ScrollView>
          </View>
        )}
      </LinearGradient>
    </View>
  );
}

const createStyles = (k, width, height) => {
  const z = (n) => Math.round(n * k);
  const CARD_SIZE = Math.floor((width - z(spacing.lg) * 2 - z(spacing.sm) * (COLS - 1)) / COLS) - 1;
  const SESSION_GAP = z(spacing.md);
  const SESSIONS_AREA = (width - z(spacing.lg) * 2) * SESSIONS_SHARE;
  const SESSION_MAX_H = (height - z(140) - SESSION_GAP) / 2;
  const SESSION_CARD_W = Math.floor((SESSIONS_AREA - SESSION_GAP * (SESSION_COLS - 1)) / SESSION_COLS) - 1;
  const SESSION_CARD_H = Math.min(SESSION_CARD_W * 1.05, SESSION_MAX_H);
  const SESSIONS_GRID_H = SESSION_CARD_H * 2 + SESSION_GAP;
  const DOLPHIN_COL_W = (width - z(spacing.lg) * 2) * (1 - SESSIONS_SHARE) - z(spacing.lg);
  const DOLPHIN_W = Math.min(DOLPHIN_COL_W, SESSIONS_GRID_H * DOLPHIN_RATIO);
  const DOLPHIN_H = DOLPHIN_W / DOLPHIN_RATIO;
  return StyleSheet.create({
  container: { flex: 1 },
  gradient: { flex: 1, flexDirection: 'column' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: z(spacing.lg), paddingTop: z(spacing.xl), paddingBottom: z(spacing.md),
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
    flexShrink: 0,
  },
  backText: { color: colors.accentLight, fontSize: z(20), fontWeight: '600' },
  headerBrand: { fontSize: z(22), fontWeight: '800', color: colors.white, letterSpacing: z(1) },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: z(spacing.md) },
  loadingText: { color: colors.gold, fontSize: z(16), fontWeight: '600' },
  emptyText: { color: colors.accentLight, fontSize: z(16), textAlign: 'center', lineHeight: z(26) },
  errorText: {
    color: colors.error, fontSize: z(14), textAlign: 'center',
    marginBottom: z(spacing.md), paddingHorizontal: z(spacing.lg),
  },
  backBtn: {
    marginTop: z(spacing.lg), paddingVertical: z(spacing.md),
    paddingHorizontal: z(spacing.xl), borderRadius: z(radius.full),
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  backBtnText: { color: colors.white, fontSize: z(16), fontWeight: '600' },
  sessionContent: { flex: 1, justifyContent: 'center' },
  mainRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', paddingHorizontal: z(spacing.lg), gap: 0,
  },
  dolphinWrap: { alignItems: 'center', justifyContent: 'center', flex: 1 - SESSIONS_SHARE },
  dolphinImage: { width: DOLPHIN_W, height: DOLPHIN_H },
  sessionsWrap: { flex: SESSIONS_SHARE, alignItems: 'center', justifyContent: 'center' },
  sessionsGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: SESSION_GAP, justifyContent: 'center',
  },
  sessionCard: {
    width: SESSION_CARD_W, height: SESSION_CARD_H,
    borderRadius: z(radius.lg), overflow: 'hidden',
    borderWidth: 2, borderColor: 'rgba(144,224,239,0.45)',
  },
  sessionCardInner: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: z(spacing.sm),
  },
  sessionTime: { fontSize: Math.round(SESSION_CARD_W * 0.26), fontWeight: '900', color: colors.white },
  sessionHoras: { fontSize: z(20), fontWeight: '600', color: colors.accentLight },
  groupsOuter: { flex: 1, flexDirection: 'column' },
  groupInstruction: {
    fontSize: z(15), color: colors.gold, fontWeight: '700',
    textAlign: 'center', paddingVertical: z(spacing.md), flexShrink: 0,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,214,10,0.15)',
    backgroundColor: 'rgba(255,214,10,0.05)',
  },
  scrollContent: { padding: z(spacing.lg) },
  row: { flexDirection: 'row', gap: z(spacing.sm), marginBottom: z(spacing.sm) },
  groupCard: {
    width: CARD_SIZE, height: CARD_SIZE * 1.15,
    borderRadius: z(radius.md), overflow: 'hidden',
    borderWidth: 2, borderColor: 'rgba(255,214,10,0.25)',
  },
  groupThumb: { width: '100%', height: '100%' },
  groupThumbEmpty: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  groupThumbEmptyText: { fontSize: z(48) },
  groupOverlay: { ...StyleSheet.absoluteFillObject },
  groupInfo: {
    position: 'absolute', bottom: z(36), left: 0, right: 0, alignItems: 'center',
  },
  groupLabel: { fontSize: z(16), fontWeight: '900', color: colors.white },
  tapHint: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(255,214,10,0.9)', paddingVertical: z(7), alignItems: 'center',
  },
  tapHintText: { fontSize: z(13), fontWeight: '900', color: colors.primary, letterSpacing: z(1) },
});
};
