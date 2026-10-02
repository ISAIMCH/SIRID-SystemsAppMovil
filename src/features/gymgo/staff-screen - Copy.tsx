import { useState } from 'react';
import { Redirect } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { api, getApiErrorMessage } from './api';
import { useAuth } from './auth-context';
import { ActionButton, AppHeader, Eyebrow, Field, Notice, Page, SectionTitle, Surface } from './ui';
import { palette } from './theme';

type ManagedRole = 'Coach' | 'Cliente';
type CreatedUser = { id: string; name: string; email: string; role: ManagedRole };

const clientGoals = ['ganar masa muscular', 'perder grasa', 'definición', 'fuerza', 'acondicionamiento'];
const clientDays = [
  { value: 1, label: 'L' }, { value: 2, label: 'M' }, { value: 3, label: 'X' },
  { value: 4, label: 'J' }, { value: 5, label: 'V' }, { value: 6, label: 'S' }, { value: 0, label: 'D' },
];

export default function StaffScreen() {
  const { user } = useAuth();
  const [role, setRole] = useState<ManagedRole>('Coach');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [goal, setGoal] = useState('');
  const [experienceLevel, setExperienceLevel] = useState<'principiante' | 'intermedio' | 'avanzado' | ''>('');
  const [availableTrainingDays, setAvailableTrainingDays] = useState<number[]>([]);
  const [planName, setPlanName] = useState('');
  const [planPrice, setPlanPrice] = useState('');
  const [planDurationDays, setPlanDurationDays] = useState('30');
  const [coachId, setCoachId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [createdUser, setCreatedUser] = useState<CreatedUser | null>(null);

  if (user?.role !== 'Admin') return <Redirect href="/(main)" />;

  function changeRole(nextRole: ManagedRole) {
    setRole(nextRole);
    setError('');
    setCreatedUser(null);
  }

  async function createUser() {
    setError('');
    setCreatedUser(null);

    if (name.trim().length < 2) {
      setError('Escribe un nombre de al menos 2 caracteres.');
      return;
    }
    if (!email.trim()) {
      setError('Escribe el correo electrónico de la cuenta.');
      return;
    }
    if (password.length < 10) {
      setError('La contraseña inicial debe tener al menos 10 caracteres.');
      return;
    }
    if (role === 'Cliente' && coachId.trim() && !/^[a-f\d]{24}$/i.test(coachId.trim())) {
      setError('El ID del Coach debe contener 24 caracteres hexadecimales.');
      return;
    }
    if (role === 'Cliente' && !goal) {
      setError('Selecciona el objetivo deportivo del cliente.');
      return;
    }
    if (role === 'Cliente' && !experienceLevel) {
      setError('Selecciona el nivel de experiencia del cliente.');
      return;
    }
    if (role === 'Cliente' && availableTrainingDays.length === 0) {
      setError('Selecciona al menos un día disponible.');
      return;
    }
    const price = Number(planPrice);
    const durationDays = Number(planDurationDays);
    if (role === 'Cliente' && (!planName.trim() || !planPrice.trim() || !Number.isFinite(price) || price < 0)) {
      setError('Configura nombre y precio válido para la membresía del cliente.');
      return;
    }
    if (role === 'Cliente' && (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 730)) {
      setError('La duración del plan debe ser de 1 a 730 días.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await api.post<{ user: CreatedUser }>('/auth/users', {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        role,
        ...(role === 'Cliente'
          ? {
              membershipStatus: 'pending',
              goal,
              experienceLevel,
              availableTrainingDays,
              membershipPlanName: planName.trim(),
              membershipPrice: price,
              membershipDurationDays: durationDays,
              ...(coachId.trim() ? { assignedCoach: coachId.trim() } : {}),
            }
          : {}),
      });

      setCreatedUser(response.data.user);
      setName('');
      setEmail('');
      setPassword('');
      setGoal('');
      setExperienceLevel('');
      setAvailableTrainingDays([]);
      setPlanName('');
      setPlanPrice('');
      setPlanDurationDays('30');
      setCoachId('');
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No se pudo crear la cuenta. Intenta de nuevo.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Page>
      <AppHeader
        title="Gestión de personal"
        detail="Crea cuentas de Coach y Cliente para tu gimnasio."
      />

      <View style={styles.intro}>
        <Eyebrow>NUEVA CUENTA</Eyebrow>
        <SectionTitle>Selecciona el perfil</SectionTitle>
      </View>

      <View accessibilityRole="tablist" style={styles.roleSelector}>
        {(['Coach', 'Cliente'] as const).map((option) => {
          const selected = role === option;
          return (
            <Pressable
              key={option}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => changeRole(option)}
              style={[styles.roleOption, selected && styles.selectedRole]}>
              <Text style={[styles.roleLabel, selected && styles.selectedRoleLabel]}>{option}</Text>
              <Text style={[styles.roleDescription, selected && styles.selectedRoleLabel]}>
                {option === 'Coach' ? 'Entrenador del gimnasio' : 'Socio con acceso a rutinas'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Surface style={styles.form}>
        <Field
          label="Nombre completo"
          autoCapitalize="words"
          autoComplete="name"
          value={name}
          onChangeText={setName}
        />
        <Field
          label="Correo electrónico"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <Field
          label="Contraseña inicial"
          autoCapitalize="none"
          autoComplete="new-password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        {role === 'Cliente' ? (
          <>
            <View style={styles.profileGroup}>
              <Text style={styles.label}>Objetivo deportivo</Text>
              <View style={styles.options}>
                {clientGoals.map((option) => (
                  <Choice key={option} label={option} selected={goal === option} onPress={() => setGoal(option)} />
                ))}
              </View>
            </View>
            <View style={styles.profileGroup}>
              <Text style={styles.label}>Nivel de experiencia</Text>
              <View style={styles.options}>
                {(['principiante', 'intermedio', 'avanzado'] as const).map((option) => (
                  <Choice key={option} label={option} selected={experienceLevel === option} onPress={() => setExperienceLevel(option)} />
                ))}
              </View>
            </View>
            <View style={styles.profileGroup}>
              <Text style={styles.label}>Días disponibles para entrenar</Text>
              <View style={styles.dayOptions}>
                {clientDays.map((day) => {
                  const selected = availableTrainingDays.includes(day.value);
                  return (
                    <Pressable
                      key={day.value}
                      accessibilityRole="checkbox"
                      accessibilityLabel={['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][day.value]}
                      accessibilityState={{ checked: selected }}
                      onPress={() => setAvailableTrainingDays((current) => (
                        selected ? current.filter((value) => value !== day.value) : [...current, day.value]
                      ))}
                      style={[styles.dayChip, selected && styles.optionSelected]}>
                      <Text style={[styles.dayText, selected && styles.optionTextSelected]}>{day.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <SectionTitle>Plan de membresía</SectionTitle>
            <Field label="Nombre del plan" placeholder="Mensualidad" value={planName} onChangeText={setPlanName} />
            <Field label="Precio (MXN)" keyboardType="decimal-pad" value={planPrice} onChangeText={setPlanPrice} />
            <Field label="Duración (días)" keyboardType="number-pad" value={planDurationDays} onChangeText={setPlanDurationDays} />
            <Field
              label="ID del Coach (opcional)"
              autoCapitalize="none"
              value={coachId}
              onChangeText={setCoachId}
            />
            <Notice>El Cliente se crea con membresía pendiente. El plan, precio y duración habilitan la solicitud de pago; apruébala en Pago y membresía para activar el acceso.</Notice>
          </>
        ) : (
          <Notice>Comparte las credenciales iniciales con el Coach de forma segura para que pueda iniciar sesión.</Notice>
        )}

        {error ? <Notice error>{error}</Notice> : null}
        {createdUser ? (
          <Notice>
            Cuenta de {createdUser.role} creada. ID: {createdUser.id}
          </Notice>
        ) : null}

        <ActionButton onPress={() => void createUser()} disabled={isSubmitting}>
          {isSubmitting ? <ActivityIndicator color={palette.white} /> : `Crear ${role.toLowerCase()}`}
        </ActionButton>
      </Surface>
    </Page>
  );
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[styles.choice, selected && styles.optionSelected]}>
      <Text style={[styles.choiceText, selected && styles.optionTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  intro: { gap: 8 },
  profileGroup: { gap: 8 },
  label: { color: palette.ink, fontSize: 13, fontWeight: '700' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  choice: { minHeight: 36, justifyContent: 'center', borderWidth: 1, borderColor: palette.line, borderRadius: 7, backgroundColor: palette.surface, paddingHorizontal: 10, paddingVertical: 6 },
  choiceText: { color: palette.ink, fontSize: 11, fontWeight: '700' },
  optionSelected: { backgroundColor: palette.deepGreen, borderColor: palette.deepGreen },
  optionTextSelected: { color: palette.white },
  dayOptions: { flexDirection: 'row', justifyContent: 'space-between', gap: 7 },
  dayChip: { width: 38, height: 38, borderWidth: 1, borderColor: palette.line, borderRadius: 19, backgroundColor: palette.surface, justifyContent: 'center', alignItems: 'center' },
  dayText: { color: palette.ink, fontSize: 12, fontWeight: '800' },
  roleSelector: { flexDirection: 'row', gap: 10 },
  roleOption: {
    flex: 1,
    minHeight: 80,
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 8,
    backgroundColor: palette.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  selectedRole: { backgroundColor: palette.deepGreen, borderColor: palette.deepGreen },
  roleLabel: { color: palette.ink, fontSize: 15, fontWeight: '800' },
  roleDescription: { color: palette.muted, fontSize: 11, lineHeight: 15 },
  selectedRoleLabel: { color: palette.white },
  form: { gap: 15 },
});