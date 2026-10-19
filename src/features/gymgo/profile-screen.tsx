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

function formatDate(value?: string) {
  return value ? new Date(value).toLocaleDateString('es-MX') : '—';
}

const membershipLabels = { active: 'Activa', pending: 'Pendiente', suspended: 'Suspendida', expired: 'Vencida' } as const;

export default function ProfileScreen() {
  const { user, updateUser } = useAuth();
  const [weight, setWeight] = useState(user?.weightKg?.toString() ?? '');
  const [height, setHeight] = useState(user?.heightCm?.toString() ?? '');
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [goal, setGoal] = useState(user?.goal ?? '');
  const [experienceLevel, setExperienceLevel] = useState<GymGoUser['experienceLevel']>(user?.experienceLevel);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const weightKg = parseNumber(weight);
  const heightCm = parseNumber(height);
  const phoneDigits = phone.replace(/\D/g, '');
  const isValid = name.trim().length >= 2 && email.includes('@') && (!phoneDigits || phoneDigits.length === 10)
    && weightKg !== null && heightCm !== null && weightKg >= 20 && weightKg <= 400 && heightCm >= 80 && heightCm <= 260;
  const bmi = isValid ? weightKg / ((heightCm / 100) ** 2) : null;
  const info = bmi ? bmiInfo(bmi) : null;
  const markerPosition = bmi ? Math.min(100, Math.max(0, ((bmi - 14) / 24) * 100)) : 0;

  async function save() {
    if (!isValid) return;
    setError('');
    setSaved(false);
    setIsSaving(true);
    try {
      const response = await api.patch<{ user: GymGoUser }>('/auth/me/physical', {
        name: name.trim(),
        email: email.trim(),
        lastName: lastName.trim(),
        phone: phoneDigits,
        goal: goal.trim(),
        experienceLevel,
        weightKg,
        heightCm,
      });
      updateUser(response.data.user);
      setName(response.data.user.name);
      setEmail(response.data.user.email);
      setLastName(response.data.user.lastName ?? '');
      setPhone(response.data.user.phone ?? '');
      setGoal(response.data.user.goal ?? '');
      setExperienceLevel(response.data.user.experienceLevel);
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
          <Text style={styles.title}>Datos personales y físicos</Text>
          <Text style={styles.subtitle}>{user?.name} {user?.lastName || ''}</Text>
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
        <Text style={styles.sectionTitle}>Datos personales</Text>
        <View style={styles.inputRow}>
          <IconBadge name="person" color={palette.neon} />
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Nombre</Text>
            <TextInput autoCapitalize="words" value={name} onChangeText={(value) => { setName(value); setSaved(false); }} placeholder="Nombre" placeholderTextColor="#71717A" style={styles.input} />
          </View>
        </View>
        <View style={styles.inputRow}>
          <IconBadge name="badge" color={palette.cyan} />
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Apellido</Text>
            <TextInput autoCapitalize="words" value={lastName} onChangeText={(value) => { setLastName(value); setSaved(false); }} placeholder="Apellido" placeholderTextColor="#71717A" style={styles.input} />
          </View>
        </View>
        <View style={styles.inputRow}>
          <IconBadge name="email" color={palette.violet} />
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Correo</Text>
            <TextInput keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={(value) => { setEmail(value); setSaved(false); }} placeholder="correo@ejemplo.com" placeholderTextColor="#71717A" style={styles.input} />
          </View>
        </View>
        <View style={styles.inputRow}>
          <IconBadge name="phone" color={palette.cyan} />
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Teléfono</Text>
            <TextInput keyboardType="phone-pad" value={phone} onChangeText={(value) => { setPhone(value); setSaved(false); }} placeholder="10 dígitos" placeholderTextColor="#71717A" style={styles.input} />
          </View>
        </View>
        <View style={styles.inputRow}>
          <IconBadge name="flag" color={palette.orange} />
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Objetivo</Text>
            <TextInput value={goal} onChangeText={(value) => { setGoal(value); setSaved(false); }} placeholder="Ej. ganar masa muscular" placeholderTextColor="#71717A" style={styles.input} />
          </View>
        </View>
        <Text style={styles.inputLabel}>Experiencia</Text>
        <View style={styles.experienceOptions}>
          {(['principiante', 'intermedio', 'avanzado'] as const).map((option) => (
            <Pressable key={option} accessibilityRole="radio" accessibilityState={{ selected: experienceLevel === option }} onPress={() => { setExperienceLevel(option); setSaved(false); }} style={[styles.experienceChip, experienceLevel === option && styles.experienceChipSelected]}>
              <Text style={[styles.experienceText, experienceLevel === option && styles.experienceTextSelected]}>{option}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.sectionTitle}>Medidas físicas</Text>
        <View style={styles.inputRow}>
          <IconBadge name="fitness-center" color={palette.violet} />
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Peso (kg)</Text>
            <TextInput keyboardType="decimal-pad" value={weight} onChangeText={(value) => { setWeight(value); setSaved(false); }} placeholder="70" placeholderTextColor="#71717A" style={styles.input} />
          </View>
        </View>
        <View style={styles.inputRow}>
          <IconBadge name="height" color={palette.cyan} />
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Altura (cm)</Text>
            <TextInput keyboardType="decimal-pad" value={height} onChangeText={(value) => { setHeight(value); setSaved(false); }} placeholder="170" placeholderTextColor="#71717A" style={styles.input} />
          </View>
        </View>
        {error ? <Notice error>{error}</Notice> : null}
        {saved ? <Notice>Datos guardados correctamente.</Notice> : null}
        <Pressable accessibilityRole="button" disabled={!isValid || isSaving} onPress={() => void save()} style={[styles.saveButton, (!isValid || isSaving) && styles.disabled]}>
          {isSaving ? <ActivityIndicator color={palette.deepGreen} /> : <><MaterialIcons name="check" size={20} color={palette.deepGreen} /><Text style={styles.saveText}>Guardar datos</Text></>}
        </Pressable>
        {!isValid && (weight || height || email || phone) ? <Text style={styles.helper}>Correo válido, teléfono de 10 dígitos y peso/altura dentro de rango.</Text> : null}
      </FloatingCard>

      <FloatingCard style={styles.infoCard}>
        <Text style={styles.sectionTitle}>Membresía</Text>
        <InfoRow label="Estado" value={membershipLabels[user?.membership?.status ?? 'pending']} />
        <InfoRow label="Inicio" value={formatDate(user?.membership?.startsAt)} />
        <InfoRow label="Vencimiento" value={formatDate(user?.membership?.expiresAt)} />
        <Text style={styles.sectionTitle}>Coach asignado</Text>
        <InfoRow label="Coach" value={typeof user?.assignedCoach === 'object' ? user.assignedCoach?.name ?? 'Asignado' : user?.assignedCoach ? 'Coach asignado' : 'Sin Coach asignado'} />
      </FloatingCard>
    </Page>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <View style={styles.infoRow}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View>;
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
  infoCard: { gap: 12, padding: 22 },
  sectionTitle: { color: '#F4F8F5', fontSize: 16, fontWeight: '800' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  inputGroup: { flex: 1, gap: 6 },
  inputLabel: { color: '#F4F8F5', fontSize: 13, fontWeight: '700' },
  input: { height: 50, borderRadius: 10, borderWidth: 1, borderColor: '#27272A', backgroundColor: '#18181B', color: '#FFFFFF', paddingHorizontal: 16, fontSize: 18, fontWeight: '700' },
  experienceOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  experienceChip: { borderRadius: 10, backgroundColor: '#27272A', borderWidth: 1, borderColor: '#3F3F46', paddingHorizontal: 14, paddingVertical: 10 },
  experienceChipSelected: { backgroundColor: '#10FF85', borderColor: '#10FF85' },
  experienceText: { color: '#D4D4D8', fontSize: 12, fontWeight: '700' },
  experienceTextSelected: { color: '#081009' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, borderBottomWidth: 1, borderBottomColor: '#27342E', paddingVertical: 8 },
  infoLabel: { color: '#91A098', fontSize: 13 },
  infoValue: { flex: 1, color: '#F4F8F5', fontSize: 13, fontWeight: '800', textAlign: 'right' },
  saveButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 56, borderRadius: 10, backgroundColor: '#10FF85' },
  saveText: { color: '#081009', fontSize: 15, fontWeight: '900' },
  disabled: { opacity: 0.5 },
  helper: { color: '#91A098', fontSize: 12 },
});
