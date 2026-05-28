import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Image, ActivityIndicator, StatusBar, Dimensions, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../services/supabase';
import { sessionsService } from '../services/sessions';
import { colors, spacing, radius } from '../utils/theme';

const { width, height } = Dimensions.get('window');

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
const CARD_SIZE = (width - spacing.lg * 2 - spacing.sm * (COLS - 1)) / COLS;

export default function SelectGroupScreen({ navigation }) {
  const [step, setStep] = useState('session');
  const [selectedSession, setSelectedSession] = useState(null);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const dolphinBounce = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(dolphinBounce, { toValue: -10, duration: 1200, useNativeDriver: true }),
        Animated.timing(dolphinBounce, { toValue: 0, duration: 1200, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const handleSelectSession = async (session) => {
    setSelectedSession(session);
    setLoading(true);
    setError('');
    try {
      const { data: sessions, error: dbError } = await supabase
        .from('sessions')
        .select('*, groups(*)')
        .eq('active', true)
        .ilike('name', `%${session.time}%`);

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
          <View style={{ width: 70 }} />
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
            <View style={styles.scrollContent}>
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
            </View>
          </View>
        )}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', height: '100vh', overflow: 'hidden' },
  gradient: { flex: 1, height: '100%', flexDirection: 'column' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
    flexShrink: 0,
  },
  backText: { color: colors.accentLight, fontSize: 17, fontWeight: '600' },
  headerBrand: { fontSize: 16, fontWeight: '800', color: colors.white, letterSpacing: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  loadingText: { color: colors.gold, fontSize: 16, fontWeight: '600' },
  emptyText: { color: colors.accentLight, fontSize: 16, textAlign: 'center', lineHeight: 26 },
  errorText: {
    color: colors.error, fontSize: 14, textAlign: 'center',
    marginBottom: spacing.md, paddingHorizontal: spacing.lg,
  },
  backBtn: {
    marginTop: spacing.lg, paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl, borderRadius: radius.full,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  backBtnText: { color: colors.white, fontSize: 16, fontWeight: '600' },
  sessionContent: { flex: 1, justifyContent: 'center' },
  mainRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', paddingHorizontal: spacing.lg, gap: 0,
  },
  dolphinWrap: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  dolphinImage: { width: width * 0.46, height: height * 0.72 },
  sessionsWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sessionsGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: spacing.lg, justifyContent: 'center',
  },
  sessionCard: {
    width: 160, borderRadius: radius.lg, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(144,224,239,0.35)',
  },
  sessionCardInner: {
    paddingVertical: spacing.xl + 8, alignItems: 'center',
    gap: 6, minHeight: 110, justifyContent: 'center',
  },
  sessionTime: { fontSize: 38, fontWeight: '900', color: colors.white },
  sessionHoras: { fontSize: 14, color: colors.accentLight },
  groupsOuter: { flex: 1, overflow: 'hidden', flexDirection: 'column' },
  groupInstruction: {
    fontSize: 15, color: colors.gold, fontWeight: '700',
    textAlign: 'center', paddingVertical: spacing.md, flexShrink: 0,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,214,10,0.15)',
    backgroundColor: 'rgba(255,214,10,0.05)',
  },
  scrollContent: { flex: 1, overflowY: 'auto', padding: spacing.lg },
  row: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  groupCard: {
    width: CARD_SIZE, height: CARD_SIZE * 1.15,
    borderRadius: radius.md, overflow: 'hidden',
    borderWidth: 2, borderColor: 'rgba(255,214,10,0.25)',
  },
  groupThumb: { width: '100%', height: '100%' },
  groupThumbEmpty: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  groupThumbEmptyText: { fontSize: 48 },
  groupOverlay: { ...StyleSheet.absoluteFillObject },
  groupInfo: {
    position: 'absolute', bottom: 36, left: 0, right: 0, alignItems: 'center',
  },
  groupLabel: { fontSize: 16, fontWeight: '900', color: colors.white },
  tapHint: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(255,214,10,0.9)', paddingVertical: 7, alignItems: 'center',
  },
  tapHintText: { fontSize: 13, fontWeight: '900', color: colors.primary, letterSpacing: 1 },
});