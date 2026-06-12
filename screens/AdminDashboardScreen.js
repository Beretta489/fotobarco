import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, StatusBar, TextInput, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { sessionsService } from '../services/sessions';
import { photosService } from '../services/photos';
import { ordersService } from '../services/orders';
import { authService } from '../services/auth';
import { colors, spacing, radius } from '../utils/theme';

const HORARIOS = [
  '09:00', '10:15', '11:45', '13:30', '14:45', '16:00'
];

export default function AdminDashboardScreen({ navigation }) {
  const [tab, setTab] = useState('dashboard');
  const [dashboard, setDashboard] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const [newGroupNames, setNewGroupNames] = useState({});
  const [expandedSession, setExpandedSession] = useState(null);

  const mounted = useRef(true);
  useEffect(() => {
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const session = await authService.getSession();
      if (!session) {
        navigation.replace('AdminLogin');
        return;
      }
      const [dash, sess] = await Promise.all([
        ordersService.getDashboard(),
        sessionsService.getAll(),
      ]);
      if (!mounted.current) return;
      setDashboard(dash);
      setSessions(sess);
    } catch (e) {
      if (!mounted.current) return;
      Alert.alert('Erro', 'Falha ao carregar dados.');
    } finally {
      if (mounted.current) setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await authService.signOut();
    } catch (_) {}
    navigation.replace('Welcome');
  };

  const handleCreateSession = async (time) => {
    const today = new Date();
    const [h, m] = time.split(':');
    today.setHours(parseInt(h), parseInt(m), 0, 0);

    try {
      await sessionsService.create(`Passeio ${time}`, today.toISOString());
      loadData();
      Alert.alert('✅ Sucesso', `Sessão ${time} criada!`);
    } catch (e) {
      Alert.alert('Erro', 'Falha ao criar sessão.');
    }
  };

  const handleCreateGroup = async (sessionId) => {
    const name = (newGroupNames[sessionId] || '').trim();
    if (!name) return;
    try {
      await sessionsService.createGroup(sessionId, name);
      setNewGroupNames(prev => ({ ...prev, [sessionId]: '' }));
      loadData();
    } catch (e) {
      Alert.alert('Erro', 'Falha ao criar grupo.');
    }
  };

  const handleUploadPhotos = async (session, group) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão necessária', 'Permita acesso à galeria.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (result.canceled) return;
    setUploading(true);
    try {
      const results = await Promise.allSettled(
        result.assets.map(asset => {
          const fileName = asset.uri.split('/').pop();
          return photosService.upload(session.id, group.id, asset.uri, fileName);
        })
      );
      const failed = results.filter(r => r.status === 'rejected').length;
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      if (failed > 0) {
        Alert.alert('Upload parcial', `${succeeded} enviada(s), ${failed} falharam.`);
      } else {
        Alert.alert('✅ Sucesso', `${succeeded} foto(s) enviada(s)!`);
      }
      loadData();
    } finally {
      if (mounted.current) setUploading(false);
    }
  };

  const handleDeactivate = async (id) => {
    try {
      await sessionsService.deactivate(id);
      loadData();
    } catch (e) {
      Alert.alert('Erro', 'Falha ao encerrar sessão.');
    }
  };

  if (loading) {
    return (
      <LinearGradient colors={['#003566', '#00B4D8']} style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.gold} />
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={['#003566', '#0077B6', '#00B4D8']}
      style={styles.container}
      start={{ x: 0, y: 0 }} end={{ x: 0.3, y: 1 }}
    >
      <StatusBar hidden />
      <View style={styles.sun} />

      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>🐬 Admin — Jangalancha Show</Text>
          <Text style={styles.headerSub}>Painel de controle</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Sair</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        {[
          { key: 'dashboard', label: '📊 Dashboard' },
          { key: 'sessions', label: '📸 Sessões' },
          { key: 'create', label: '➕ Nova Sessão' },
        ].map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, tab === t.key && styles.tabActive]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {tab === 'dashboard' && dashboard && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Hoje</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>R$ {dashboard.totalRevenue.toFixed(2)}</Text>
                <Text style={styles.statLabel}>Faturamento</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{dashboard.totalOrders}</Text>
                <Text style={styles.statLabel}>Pedidos</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{dashboard.totalPhotos}</Text>
                <Text style={styles.statLabel}>Fotos vendidas</Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Últimos pedidos</Text>
            {dashboard.orders.length === 0 ? (
              <Text style={styles.emptyText}>Nenhum pedido hoje ainda.</Text>
            ) : (
              dashboard.orders.map((order) => (
                <View key={order.id} style={styles.orderCard}>
                  <View>
                    <Text style={styles.orderDate}>
                      {new Date(order.paid_at).toLocaleTimeString('pt-BR', {
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </Text>
                    <Text style={styles.orderPhone}>{order.client_phone}</Text>
                    <Text style={styles.orderStatus}>✓ Pago</Text>
                  </View>
                  <Text style={styles.orderTotal}>R$ {Number(order.total).toFixed(2)}</Text>
                </View>
              ))
            )}
          </View>
        )}

        {tab === 'sessions' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sessões ativas</Text>
            {sessions.filter(s => s.active).length === 0 ? (
              <Text style={styles.emptyText}>Nenhuma sessão ativa.</Text>
            ) : (
              sessions.filter(s => s.active).map((session) => (
                <View key={session.id} style={styles.sessionCard}>
                  <View style={styles.sessionHeader}>
                    <View>
                      <Text style={styles.sessionName}>{session.name}</Text>
                      <Text style={styles.sessionInfo}>
                        {session.groups?.[0]?.count || 0} grupos
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.deactivateBtn}
                      onPress={() => handleDeactivate(session.id)}
                    >
                      <Text style={styles.deactivateBtnText}>Encerrar</Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={styles.expandBtn}
                    onPress={() => setExpandedSession(
                      expandedSession === session.id ? null : session.id
                    )}
                  >
                    <Text style={styles.expandBtnText}>
                      {expandedSession === session.id ? '▲ Ocultar grupos' : '▼ Ver grupos'}
                    </Text>
                  </TouchableOpacity>

                  {expandedSession === session.id && (
                    <View style={styles.groupsList}>
                      {session.groups?.map((group) => (
                        <View key={group.id} style={styles.groupItem}>
                          <View>
                            <Text style={styles.groupName}>{group.name}</Text>
                            <Text style={styles.groupPhotos}>
                              {group.photos?.length || 0} fotos
                            </Text>
                          </View>
                          <TouchableOpacity
                            style={styles.uploadBtn}
                            onPress={() => handleUploadPhotos(session, group)}
                            disabled={uploading}
                          >
                            <LinearGradient
                              colors={[colors.success, '#009970']}
                              style={styles.uploadGrad}
                            >
                              {uploading ? (
                                <ActivityIndicator color={colors.white} size="small" />
                              ) : (
                                <Text style={styles.uploadText}>📤 Upload</Text>
                              )}
                            </LinearGradient>
                          </TouchableOpacity>
                        </View>
                      ))}

                      <View style={styles.addGroupWrap}>
                        <TextInput
                          style={styles.groupInput}
                          value={newGroupNames[session.id] || ''}
                          onChangeText={(v) =>
                            setNewGroupNames(prev => ({ ...prev, [session.id]: v }))
                          }
                          placeholder="Nome do grupo (ex: Família Silva)"
                          placeholderTextColor={colors.gray400}
                        />
                        <TouchableOpacity
                          style={styles.addGroupBtn}
                          onPress={() => handleCreateGroup(session.id)}
                        >
                          <LinearGradient
                            colors={[colors.accent, '#0077B6']}
                            style={styles.addGroupGrad}
                          >
                            <Text style={styles.addGroupText}>+ Grupo</Text>
                          </LinearGradient>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {tab === 'create' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Criar sessão de hoje</Text>
            <Text style={styles.sectionSubtitle}>
              Toque no horário para criar a sessão correspondente:
            </Text>
            <View style={styles.horariosGrid}>
              {HORARIOS.map((time) => {
                const exists = sessions.some(s => s.name.includes(time) && s.active);
                return (
                  <TouchableOpacity
                    key={time}
                    style={[styles.horarioCard, exists && styles.horarioCardExists]}
                    onPress={() => !exists && handleCreateSession(time)}
                    disabled={exists}
                    activeOpacity={exists ? 1 : 0.82}
                  >
                    <LinearGradient
                      colors={exists
                        ? ['rgba(0,200,150,0.2)', 'rgba(0,200,150,0.1)']
                        : ['rgba(255,255,255,0.15)', 'rgba(255,255,255,0.05)']
                      }
                      style={styles.horarioCardInner}
                    >
                      <Text style={styles.horarioTime}>{time}</Text>
                      <Text style={[styles.horarioStatus, exists && { color: colors.success }]}>
                        {exists ? '✓ Ativa' : 'Criar'}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.sectionTitle}>Sessões encerradas hoje</Text>
            {sessions.filter(s => !s.active).length === 0 ? (
              <Text style={styles.emptyText}>Nenhuma sessão encerrada ainda.</Text>
            ) : (
              sessions.filter(s => !s.active).map((session) => (
                <View key={session.id} style={styles.inactiveCard}>
                  <Text style={styles.inactiveName}>{session.name}</Text>
                  <Text style={styles.inactiveStatus}>Encerrada</Text>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sun: {
    position: 'absolute', top: -80, right: -80,
    width: 260, height: 260, borderRadius: 130,
    backgroundColor: colors.gold, opacity: 0.08,
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerTitle: { fontSize: 18, fontWeight: '900', color: colors.white },
  headerSub: { fontSize: 13, color: colors.gray400 },
  logoutBtn: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderRadius: radius.full, borderWidth: 1, borderColor: 'rgba(255,71,87,0.4)',
  },
  logoutText: { color: colors.error, fontSize: 14, fontWeight: '600' },
  tabs: {
    flexDirection: 'row', paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm, gap: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  tab: {
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    borderRadius: radius.full, borderWidth: 1, borderColor: 'transparent',
  },
  tabActive: {
    backgroundColor: 'rgba(255,214,10,0.15)',
    borderColor: 'rgba(255,214,10,0.4)',
  },
  tabText: { fontSize: 13, color: colors.gray400, fontWeight: '600' },
  tabTextActive: { color: colors.gold },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 40 },
  section: { gap: spacing.md },
  sectionTitle: {
    fontSize: 16, fontWeight: '800', color: colors.white,
    letterSpacing: 1, marginTop: spacing.sm,
  },
  sectionSubtitle: { fontSize: 14, color: colors.accentLight },
  statsGrid: { flexDirection: 'row', gap: spacing.sm },
  statCard: {
    flex: 1, backgroundColor: colors.cardBg,
    borderWidth: 1, borderColor: colors.cardBorder,
    borderRadius: radius.lg, padding: spacing.md, alignItems: 'center',
  },
  statValue: { fontSize: 20, fontWeight: '900', color: colors.gold },
  statLabel: { fontSize: 12, color: colors.gray400, marginTop: 4 },
  orderCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.cardBg, borderWidth: 1, borderColor: colors.cardBorder,
    borderRadius: radius.md, padding: spacing.md,
  },
  orderDate: { fontSize: 15, color: colors.white, fontWeight: '600' },
  orderPhone: { fontSize: 13, color: colors.accentLight },
  orderStatus: { fontSize: 13, color: colors.success },
  orderTotal: { fontSize: 20, fontWeight: '900', color: colors.gold },
  emptyText: {
    color: colors.gray400, fontSize: 15,
    textAlign: 'center', paddingVertical: spacing.xl,
  },
  sessionCard: {
    backgroundColor: colors.cardBg,
    borderWidth: 1, borderColor: colors.cardBorder,
    borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm,
  },
  sessionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  sessionName: { fontSize: 17, fontWeight: '800', color: colors.white },
  sessionInfo: { fontSize: 13, color: colors.gray400 },
  deactivateBtn: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderRadius: radius.full, borderWidth: 1, borderColor: 'rgba(255,71,87,0.4)',
  },
  deactivateBtnText: { color: colors.error, fontSize: 13, fontWeight: '600' },
  expandBtn: { alignSelf: 'flex-start' },
  expandBtnText: { color: colors.accentLight, fontSize: 13, fontWeight: '600' },
  groupsList: { gap: spacing.sm, marginTop: spacing.xs },
  groupItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: radius.md, padding: spacing.md,
  },
  groupName: { fontSize: 15, fontWeight: '700', color: colors.white },
  groupPhotos: { fontSize: 12, color: colors.gray400 },
  uploadBtn: { borderRadius: radius.md, overflow: 'hidden' },
  uploadGrad: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  uploadText: { fontSize: 13, fontWeight: '700', color: colors.white },
  addGroupWrap: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  groupInput: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(0,180,216,0.3)',
    borderRadius: radius.md, padding: spacing.md,
    fontSize: 14, color: colors.white,
  },
  addGroupBtn: { borderRadius: radius.md, overflow: 'hidden' },
  addGroupGrad: { paddingVertical: spacing.md, paddingHorizontal: spacing.md, justifyContent: 'center' },
  addGroupText: { fontSize: 13, fontWeight: '800', color: colors.white },
  horariosGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: spacing.md, justifyContent: 'center',
  },
  horarioCard: {
    width: 140, borderRadius: radius.lg, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(144,224,239,0.3)',
  },
  horarioCardExists: { borderColor: 'rgba(0,200,150,0.4)' },
  horarioCardInner: {
    paddingVertical: spacing.lg, alignItems: 'center',
    gap: 4, minHeight: 90, justifyContent: 'center',
  },
  horarioTime: { fontSize: 28, fontWeight: '900', color: colors.white },
  horarioStatus: { fontSize: 13, color: colors.accentLight, fontWeight: '600' },
  inactiveCard: {
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: radius.md, padding: spacing.md,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  inactiveName: { fontSize: 15, color: colors.gray400 },
  inactiveStatus: { fontSize: 13, color: colors.gray600 },
});
