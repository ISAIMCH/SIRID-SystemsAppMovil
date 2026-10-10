import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { api, getApiErrorMessage } from './api';
import { useAuth, type GymGoUser } from './auth-context';
import { FloatingCard, IconBadge } from './fit-ui';
import { palette } from './theme';
import { Notice, Page } from './ui';

function bmiInfo(bmi: number) {
  if (bmi < 18.5) return { label: 'Bajo peso', color: palette.cyan };
  if (bmi < 25) return { label: 'Peso saludable', color: palette.neon };
  if (bmi < 30) return { label: 'Sobrepeso', color: palette.orange };
  return { label: 'Obesidad', color: palette.danger };
}

function parseNumber(value: string) {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) && value.trim() !== '' ? parsed : null;
}

export default function ProfileScreen() {
  const { user, updateUser } = useAuth();
  const [weight, setWeight] = useState(user?.weightKg?.toString() ?? '');
  const [height, setHeight] = useState(user?.heightCm?.toString() ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const weightKg = parseNumber(weight);
  const heightCm = parseNumber(height);
  const isValid = weightKg !== null && heightCm !== null && weightKg >= 20 && weightKg <= 400 && heightCm >= 80 && heightCm <= 260;
  const bmi = isValid ? weightKg / ((heightCm / 100) ** 2) : null;
  const info = bmi ? bmiInfo(bmi) : null;
  const markerPosition = bmi ? Math.min(100, Math.max(0, ((bmi - 14) / 24) * 100)) : 0;

  async function save() {
    if (!isValid) return;
    setError('');
    setSaved(false);
    setIsSaving(true);
    try {
      const response = await api.patch<{ user: GymGoUser }>('/auth/me/physical', { weightKg, heightCm });
      updateUser(response.data.user);
      setSaved(true);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No se pudieron guardar tus datos.'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Page dark>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => { if (router.canGoBack()) { router.back(); } else { router.push('/(main)/billing'); } }}>
          <IconBadge name="arrow-back" color="#F4F8F5" />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>Perfil físico</Text>
          <Text style={styles.subtitle}>{user?.name}</Text>
        </View>
      </View>

      <FloatingCard style={styles.bmiCard}>
        <View style={styles.bmiTop}>
          <IconBadge name="monitor-weight" color={info?.color ?? palette.muted} size={52} />
          <View>
            <Text style={styles.bmiLabel}>Tu IMC</Text>
            <Text style={[styles.bmiValue, { color: info?.color ?? palette.muted }]}>{bmi ? bmi.toFixed(1) : '—'}</Text>
          </View>
        </View>
        <Text style={styles.bmiCategory}>{info?.label ?? 'Ingresa tu peso y altura'}</Text>
        <View style={styles.scale}>
          <View style={[styles.segment, { backgroundColor: palette.cyan, flex: 4.5 }]} />
          <View style={[styles.segment, { backgroundColor: palette.neon, flex: 6.5 }]} />
          <View style={[styles.segment, { backgroundColor: palette.orange, flex: 5 }]} />
          <View style={[styles.segment, { backgroundColor: palette.danger, flex: 8 }]} />
          {bmi ? <View style={[styles.marker, { left: `${markerPosition}%` }]} /> : null}
        </View>
      </FloatingCard>

      <FloatingCard style={styles.form}>
        <View style={styles.inputRow}>
          <IconBadge name="fitness-center" color={palette.violet} />
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Peso (kg)</Text>
            <TextInput keyboardType="decimal-pad" value={weight} onChangeText={(value) => { setWeight(value); setSaved(false); }} placeholder="70" placeholderTextColor={palette.muted} style={styles.input} />
          </View>
        </View>
        <View style={styles.inputRow}>
          <IconBadge name="height" color={palette.cyan} />
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Altura (cm)</Text>
            <TextInput keyboardType="decimal-pad" value={height} onChangeText={(value) => { setHeight(value); setSaved(false); }} placeholder="170" placeholderTextColor={palette.muted} style={styles.input} />
          </View>
        </View>
        {error ? <Notice error>{error}</Notice> : null}
        {saved ? <Notice>Datos guardados correctamente.</Notice> : null}
        <Pressable accessibilityRole="button" disabled={!isValid || isSaving} onPress={() => void save()} style={[styles.saveButton, (!isValid || isSaving) && styles.disabled]}>
          {isSaving ? <ActivityIndicator color={palette.deepGreen} /> : <><MaterialIcons name="check" size={20} color={palette.deepGreen} /><Text style={styles.saveText}>Guardar datos</Text></>}
        </Pressable>
        {!isValid && (weight || height) ? <Text style={styles.helper}>Peso entre 20 y 400 kg, altura entre 80 y 260 cm.</Text> : null}
      </FloatingCard>
    </Page>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerText: { flex: 1 },
  title: { color: '#F4F8F5', fontSize: 26, fontWeight: '800' },
  subtitle: { color: '#91A098', fontSize: 14 },
  bmiCard: { gap: 14, padding: 22 },
  bmiTop: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  bmiLabel: { color: '#91A098', fontSize: 13, fontWeight: '700' },
  bmiValue: { fontSize: 42, lineHeight: 48, fontWeight: '900' },
  bmiCategory: { color: '#F4F8F5', fontSize: 16, fontWeight: '700' },
  scale: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'visible', gap: 2, marginTop: 6 },
  segment: { height: 10, borderRadius: 5 },
  marker: { position: 'absolute', top: -5, width: 6, height: 20, borderRadius: 3, backgroundColor: '#F4F8F5', marginLeft: -3 },
  form: { gap: 16, padding: 22 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  inputGroup: { flex: 1, gap: 6 },
  inputLabel: { color: '#F4F8F5', fontSize: 13, fontWeight: '700' },
  input: { height: 50, borderRadius: 16, borderWidth: 1, borderColor: '#27342E', backgroundColor: '#141A17', color: '#F4F8F5', paddingHorizontal: 16, fontSize: 18, fontWeight: '700' },
  saveButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 52, borderRadius: 18, backgroundColor: palette.neon },
  saveText: { color: palette.deepGreen, fontSize: 15, fontWeight: '800' },
  disabled: { opacity: 0.5 },
  helper: { color: '#91A098', fontSize: 12 },
});
