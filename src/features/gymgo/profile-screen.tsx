import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { api, getApiErrorMessage } from './api';
import { useAuth, type GymGoUser } from './auth-context';
import { FloatingCard, IconBadge } from './fit-ui';
import { membershipLabel } from './membership-status';
import { Notice, Page } from './ui';
import { makeStyles } from '@/theme/make-styles';
import type { ThemeColors } from '@/theme/tokens';
import { useTheme } from '@/theme/theme-provider';

function bmiInfo(bmi: number, colors: ThemeColors) {
  if (bmi < 18.5) return { label: 'Bajo peso', color: colors.info };
  if (bmi < 25) return { label: 'Peso saludable', color: colors.accent };
  if (bmi < 30) return { label: 'Sobrepeso', color: colors.warning };
  return { label: 'Obesidad', color: colors.danger };
}

function parseNumber(value: string) {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) && value.trim() !== '' ? parsed : null;
}

function formatDate(value?: string) {
  return value ? new Date(value).toLocaleDateString('es-MX') : '—';
}

export default function ProfileScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
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
  // Peso y altura son opcionales: si se capturan, deben estar en rango.
  const isWeightValid = weight.trim() === '' || (weightKg !== null && weightKg >= 20 && weightKg <= 400);
  const isHeightValid = height.trim() === '' || (heightCm !== null && heightCm >= 80 && heightCm <= 260);
  const isValid = name.trim().length >= 2 && email.includes('@') && (!phoneDigits || phoneDigits.length === 10)
    && isWeightValid && isHeightValid;
  const bmi = isValid && weightKg !== null && heightCm !== null ? weightKg / ((heightCm / 100) ** 2) : null;
  const info = bmi ? bmiInfo(bmi, colors) : null;
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
        weightKg: weightKg ?? undefined,
        heightCm: heightCm ?? undefined,
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
          <IconBadge name="arrow-back" color={colors.text} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>Datos personales y físicos</Text>
          <Text style={styles.subtitle}>{user?.name} {user?.lastName || ''}</Text>
        </View>
      </View>

      <FloatingCard style={styles.bmiCard}>
        <View style={styles.bmiTop}>
          <IconBadge name="monitor-weight" color={info?.color ?? colors.textSecondary} size={52} />
          <View>
            <Text style={styles.bmiLabel}>Tu IMC</Text>
            <Text style={[styles.bmiValue, { color: info?.color ?? colors.textSecondary }]}>{bmi ? bmi.toFixed(1) : '—'}</Text>
          </View>
        </View>
        <Text style={styles.bmiCategory}>{info?.label ?? 'Ingresa tu peso y altura'}</Text>
        <View style={styles.scale}>
          <View style={[styles.segment, { backgroundColor: colors.infoSoft, flex: 4.5 }]} />
          <View style={[styles.segment, { backgroundColor: colors.accentFill, flex: 6.5 }]} />
          <View style={[styles.segment, { backgroundColor: colors.warningSoft, flex: 5 }]} />
          <View style={[styles.segment, { backgroundColor: colors.dangerSoft, flex: 8 }]} />
          {bmi ? <View style={[styles.marker, { left: `${markerPosition}%` }]} /> : null}
        </View>
      </FloatingCard>

      <FloatingCard style={styles.form}>
        <Text style={styles.sectionTitle}>Datos personales</Text>
        <View style={styles.inputRow}>
          <IconBadge name="person" color={colors.accent} />
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Nombre</Text>
            <TextInput autoCapitalize="words" value={name} onChangeText={(value) => { setName(value); setSaved(false); }} placeholder="Nombre" placeholderTextColor={colors.textSecondary} style={styles.input} />
          </View>
        </View>
        <View style={styles.inputRow}>
          <IconBadge name="badge" color={colors.info} />
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Apellido</Text>
            <TextInput autoCapitalize="words" value={lastName} onChangeText={(value) => { setLastName(value); setSaved(false); }} placeholder="Apellido" placeholderTextColor={colors.textSecondary} style={styles.input} />
          </View>
        </View>
        <View style={styles.inputRow}>
          <IconBadge name="email" color={colors.info} />
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Correo</Text>
            <TextInput keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={(value) => { setEmail(value); setSaved(false); }} placeholder="correo@ejemplo.com" placeholderTextColor={colors.textSecondary} style={styles.input} />
          </View>
        </View>
        <View style={styles.inputRow}>
          <IconBadge name="phone" color={colors.info} />
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Teléfono</Text>
            <TextInput keyboardType="phone-pad" value={phone} onChangeText={(value) => { setPhone(value); setSaved(false); }} placeholder="10 dígitos" placeholderTextColor={colors.textSecondary} style={styles.input} />
          </View>
        </View>
        <View style={styles.inputRow}>
          <IconBadge name="flag" color={colors.warning} />
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Objetivo</Text>
            <TextInput value={goal} onChangeText={(value) => { setGoal(value); setSaved(false); }} placeholder="Ej. ganar masa muscular" placeholderTextColor={colors.textSecondary} style={styles.input} />
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
          <IconBadge name="fitness-center" color={colors.info} />
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Peso (kg)</Text>
            <TextInput keyboardType="decimal-pad" value={weight} onChangeText={(value) => { setWeight(value); setSaved(false); }} placeholder="70" placeholderTextColor={colors.textSecondary} style={styles.input} />
          </View>
        </View>
        <View style={styles.inputRow}>
          <IconBadge name="height" color={colors.info} />
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Altura (cm)</Text>
            <TextInput keyboardType="decimal-pad" value={height} onChangeText={(value) => { setHeight(value); setSaved(false); }} placeholder="170" placeholderTextColor={colors.textSecondary} style={styles.input} />
          </View>
        </View>
        {error ? <Notice error>{error}</Notice> : null}
        {saved ? <Notice>Datos guardados correctamente.</Notice> : null}
        <Pressable accessibilityRole="button" disabled={!isValid || isSaving} onPress={() => void save()} style={[styles.saveButton, (!isValid || isSaving) && styles.disabled]}>
          {isSaving ? <ActivityIndicator color={colors.onPrimary} /> : <><MaterialIcons name="check" size={20} color={colors.onPrimary} /><Text style={styles.saveText}>Guardar datos</Text></>}
        </Pressable>
        {!isValid && (weight || height || email || phone) ? <Text style={styles.helper}>Correo válido, teléfono de 10 dígitos y, si los capturas, peso (20–400 kg) y altura (80–260 cm).</Text> : null}
      </FloatingCard>

      <FloatingCard style={styles.infoCard}>
        <Text style={styles.sectionTitle}>Membresía</Text>
        <InfoRow label="Estado" value={membershipLabel(user?.membership)} />
        <InfoRow label="Inicio" value={formatDate(user?.membership?.startsAt)} />
        <InfoRow label="Vencimiento" value={formatDate(user?.membership?.expiresAt)} />
        <Text style={styles.sectionTitle}>Coach asignado</Text>
        <InfoRow label="Coach" value={typeof user?.assignedCoach === 'object' ? user.assignedCoach?.name ?? 'Asignado' : user?.assignedCoach ? 'Coach asignado' : 'Sin Coach asignado'} />
      </FloatingCard>
    </Page>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return <View style={styles.infoRow}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View>;
}

const useStyles = makeStyles(({ colors }) => ({
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerText: { flex: 1 },
  title: { color: colors.text, fontSize: 30, lineHeight: 33, fontWeight: '800', fontFamily: 'display' },
  subtitle: { color: colors.textSecondary, fontSize: 14 },
  bmiCard: { gap: 14, padding: 22 },
  bmiTop: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  bmiLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  bmiValue: { fontSize: 52, lineHeight: 56, fontWeight: '800', fontFamily: 'display' },
  bmiCategory: { color: colors.text, fontSize: 16, fontWeight: '700' },
  scale: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'visible', gap: 2, marginTop: 6 },
  segment: { height: 10, borderRadius: 5 },
  marker: { position: 'absolute', top: -5, width: 6, height: 20, borderRadius: 3, backgroundColor: colors.text, marginLeft: -3 },
  form: { gap: 16, padding: 22 },
  infoCard: { gap: 12, padding: 22 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  inputGroup: { flex: 1, gap: 6 },
  inputLabel: { color: colors.text, fontSize: 14, fontWeight: '600' },
  input: { height: 52, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surfaceRaised, color: colors.text, paddingHorizontal: 16, fontSize: 16, fontWeight: '500' },
  experienceOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  experienceChip: { minHeight: 40, justifyContent: 'center', borderRadius: 999, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16 },
  experienceChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  experienceText: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  experienceTextSelected: { color: colors.onPrimary, fontWeight: '700' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 8 },
  infoLabel: { color: colors.textSecondary, fontSize: 14 },
  infoValue: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '600', textAlign: 'right' },
  saveButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 56, borderRadius: 14, backgroundColor: colors.primary },
  saveText: { color: colors.onPrimary, fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  helper: { color: colors.textSecondary, fontSize: 13 },
}));
