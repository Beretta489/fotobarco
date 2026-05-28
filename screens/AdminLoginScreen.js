import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, StatusBar, KeyboardAvoidingView, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../services/supabase';
import { colors, spacing, radius } from '../utils/theme';

export default function AdminLoginScreen({ navigation }) {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!phone || phone.length < 10) {
      setError('Digite um número de celular válido.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      // Normaliza o número — remove tudo que não é dígito
      const normalized = phone.replace(/\D/g, '');

      const { data, error: dbError } = await supabase
        .from('authorized_phones')
        .select('*')
        .eq('phone', normalized)
        .single();

      if (dbError || !data) {
        setError('Número não autorizado. Fale com o administrador.');
        return;
      }

      navigation.replace('AdminDashboard');
    } catch (e) {
      setError('Erro ao verificar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient
      colors={['#003566', '#0077B6', '#00B4D8']}
      style={styles.container}
      start={{ x: 0, y: 0 }} end={{ x: 0.3, y: 1 }}
    >
      <StatusBar hidden />
      <View style={styles.sun} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.inner}
      >
        <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Voltar</Text>
        </TouchableOpacity>

        <View style={styles.logoWrap}>
          <Text style={styles.logoEmoji}>🔐</Text>
          <Text style={styles.title}>Área Administrativa</Text>
          <Text style={styles.subtitle}>Jangalancha Show</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputWrap}>
            <Text style={styles.label}>NÚMERO DE CELULAR</Text>
            <View style={styles.phoneRow}>
              <View style={styles.ddiBox}>
                <Text style={styles.ddiText}>+55</Text>
              </View>
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={(t) => { setPhone(t); setError(''); }}
                keyboardType="phone-pad"
                placeholder="84 99999-8888"
                placeholderTextColor={colors.gray400}
                maxLength={15}
              />
            </View>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={styles.loginBtn}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={[colors.gold, colors.goldDark]}
              style={styles.loginGrad}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            >
              {loading ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text style={styles.loginText}>ENTRAR →</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
  inner: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: spacing.xl,
  },
  back: { position: 'absolute', top: spacing.xl, left: spacing.xl },
  backText: { color: colors.accentLight, fontSize: 18, fontWeight: '500' },
  logoWrap: { alignItems: 'center', marginBottom: spacing.xxl },
  logoEmoji: { fontSize: 56, marginBottom: spacing.md },
  title: { fontSize: 28, fontWeight: '900', color: colors.white, letterSpacing: 1 },
  subtitle: { fontSize: 15, color: colors.accentLight, marginTop: spacing.xs, letterSpacing: 2 },
  form: { width: '100%', maxWidth: 400, gap: spacing.lg },
  inputWrap: { gap: spacing.xs },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 2, color: colors.gray400 },
  phoneRow: { flexDirection: 'row', gap: spacing.sm },
  ddiBox: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(0,180,216,0.3)',
    borderRadius: radius.md, padding: spacing.md,
    alignItems: 'center', justifyContent: 'center',
    minWidth: 64,
  },
  ddiText: { fontSize: 16, color: colors.white, fontWeight: '700' },
  input: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(0,180,216,0.3)',
    borderRadius: radius.md, padding: spacing.md,
    fontSize: 20, color: colors.white, letterSpacing: 2,
  },
  error: { color: colors.error, textAlign: 'center', fontSize: 14 },
  loginBtn: { borderRadius: radius.full, overflow: 'hidden', marginTop: spacing.sm },
  loginGrad: { paddingVertical: spacing.lg, alignItems: 'center' },
  loginText: { fontSize: 18, fontWeight: '900', letterSpacing: 3, color: colors.primary },
});