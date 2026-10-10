import { MaterialIcons } from '@expo/vector-icons';
import { Redirect, router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { api, getApiErrorMessage } from './api';
import { useAuth } from './auth-context';
import { CoachSelect } from './coach-select';
import { FloatingCard, IconBadge } from './fit-ui';
import { SelectField } from './select-field';
import { palette } from './theme';
import type { MembershipPlan } from './types';
import { ActionButton, AppHeader, Field, Notice, Page, SectionTitle } from './ui';

type ManagedRole = 'Coach' | 'Cliente';
type CreatedUser = { id: string; name: string; email: string; role: ManagedRole };

const OTHER_GOAL = 'Otro';
const clientGoals = ['ganar masa muscular', 'perder grasa', 'definición', 'fuerza', 'acondicionamiento', OTHER_GOAL];
const clientDays = [
  { value: 1, label: 'L' }, { value: 2, label: 'M' }, { value: 3, label: 'X' },
  { value: 4, label: 'J' }, { value: 5, label: 'V' }, { value: 6, label: 'S' }, { value: 0, label: 'D' },
];
const currency = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });

function estimatedExpiry(days: number) {
  return new Date(Date.now() + days * 86400000).toLocaleDateString('es-MX');
}

export default function StaffScreen({ initialRole = 'Coach', hideRoleSelector = false }: { initialRole?: ManagedRole; hideRoleSelector?: boolean }) {
  const { user } = useAuth();
  const [role, setRole] = useState<ManagedRole>(initialRole);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [goal, setGoal] = useState('');
  const [customGoal, setCustomGoal] = useState('');
  const [experienceLevel, setExperienceLevel] = useState<'principiante' | 'intermedio' | 'avanzado' | ''>('');
  const [availableTrainingDays, setAvailableTrainingDays] = useState<number[]>([]);
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [planId, setPlanId] = useState('');
  const [coachId, setCoachId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [createdUser, setCreatedUser] = useState<CreatedUser | null>(null);

  useEffect(() => {
    let isCurrent = true;
    api.get<{ plans: MembershipPlan[] }>('/plans')
      .then((response) => {
        if (isCurrent) setPlans(response.data.plans);
      })
      .catch(() => {
        if (isCurrent) setPlans([]);
      });
    return () => { isCurrent = false; };
  }, []);

  if (user?.role !== 'Admin') return <Redirect href="/(main)" />;

  const selectedPlan = plans.find((plan) => plan._id === planId);

  function changeRole(nextRole: ManagedRole) {
    setRole(nextRole);
    setError('');
    setCreatedUser(null);
  }

  async function createUser() {
    setError('');
    setCreatedUser(null);

    const digits = phone.replace(/\D/g, '');
    const finalGoal = goal === OTHER_GOAL ? customGoal.trim() : goal;

    if (name.trim().length < 2) return setError('Escribe un nombre de al menos 2 caracteres.');
    if (!email.trim()) return setError('Escribe el correo electrónico de la cuenta.');
    if (password.length < 10) return setError('La contraseña inicial debe tener al menos 10 caracteres.');
    if (digits && digits.length !== 10) return setError('El teléfono debe tener 10 dígitos.');
    if (role === 'Cliente') {
      if (!finalGoal) return setError('Selecciona o escribe el objetivo deportivo del cliente.');
      if (!experienceLevel) return setError('Selecciona el nivel de experiencia del cliente.');
      if (availableTrainingDays.length === 0) return setError('Selecciona al menos un día disponible.');
      if (!selectedPlan) return setError('Selecciona un plan de membresía.');
    }

    setIsSubmitting(true);
    try {
      const response = await api.post<{ user: CreatedUser }>('/auth/users', {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        role,
        ...(digits ? { phone: digits } : {}),
        ...(role === 'Coach' && address.trim() ? { address: address.trim() } : {}),
        ...(role === 'Cliente'
          ? {
              membershipStatus: 'pending',
              goal: finalGoal,
              experienceLevel,
              availableTrainingDays,
              membershipPlanId: planId,
              ...(coachId ? { assignedCoach: coachId } : {}),
            }
          : {}),
      });

      setCreatedUser(response.data.user);
      setName('');
      setEmail('');
      setPassword('');
      setPhone('');
      setAddress('');
      setGoal('');
      setCustomGoal('');
      setExperienceLevel('');
      setAvailableTrainingDays([]);
      setPlanId('');
      setCoachId('');
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No se pudo crear la cuenta. Intenta de nuevo.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Page admin>
      <AppHeader title="Gestión de personal" detail="Crea cuentas de Coach y Cliente para tu gimnasio." />

      {!hideRoleSelector ? <View accessibilityRole="tablist" style={styles.roleSelector}>
        {(['Coach', 'Cliente'] as const).map((option) => {
          const selected = role === option;
          return (
            <Pressable
              key={option}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => changeRole(option)}
              style={[styles.roleOption, selected && styles.selectedRole]}>
              <IconBadge name={option === 'Coach' ? 'sports' : 'person'} color={selected ? palette.neon : palette.muted} size={40} />
              <Text style={[styles.roleLabel, selected && styles.selectedRoleLabel]}>{option}</Text>
            </Pressable>
          );
        })}
      </View> : null}

      <FloatingCard style={styles.form}>
        <Field label="Nombre completo" autoCapitalize="words" autoComplete="name" value={name} onChangeText={setName} />
        <Field label="Correo electrónico" autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} />
        <Field label="Contraseña inicial" autoCapitalize="none" autoComplete="new-password" secureTextEntry value={password} onChangeText={setPassword} />
        <Field label="Teléfono (10 dígitos)" keyboardType="phone-pad" maxLength={14} value={phone} onChangeText={setPhone} />

        {role === 'Coach' ? (
          <>
            <Field label="Dirección" autoCapitalize="sentences" value={address} onChangeText={setAddress} />
            <Notice>Comparte las credenciales iniciales con el Coach de forma segura para que pueda iniciar sesión.</Notice>
          </>
        ) : (
          <>
            <View style={styles.group}>
              <Text style={styles.label}>Objetivo deportivo</Text>
              <View style={styles.options}>
                {clientGoals.map((option) => (
                  <Choice key={option} label={option} selected={goal === option} onPress={() => setGoal(option)} />
                ))}
              </View>
              {goal === OTHER_GOAL ? (
                <Field label="Escribe el objetivo" placeholder="Ej. preparación para media maratón" maxLength={120} value={customGoal} onChangeText={setCustomGoal} />
              ) : null}
            </View>
            <View style={styles.group}>
              <Text style={styles.label}>Nivel de experiencia</Text>
              <View style={styles.options}>
                {(['principiante', 'intermedio', 'avanzado'] as const).map((option) => (
                  <Choice key={option} label={option} selected={experienceLevel === option} onPress={() => setExperienceLevel(option)} />
                ))}
              </View>
            </View>
            <View style={styles.group}>
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

            <SectionTitle accessory={(
              <Pressable accessibilityRole="button" onPress={() => router.push('/(main)/plans' as Href)}>
                <Text style={styles.link}>Administrar planes</Text>
              </Pressable>
            )}>
              Plan de membresía
            </SectionTitle>
            <SelectField
              label="Plan"
              placeholder="Selecciona un plan"
              emptyText="No hay planes activos. Crea uno en Administrar planes."
              options={plans.map((plan) => ({ value: plan._id, label: plan.name, hint: `${currency.format(plan.price)} · ${plan.durationInDays} días` }))}
              value={planId}
              onChange={setPlanId}
            />
            {selectedPlan ? (
              <View style={styles.planSummary}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Precio</Text>
                  <Text style={styles.summaryValue}>{currency.format(selectedPlan.price)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Duración</Text>
                  <Text style={styles.summaryValue}>{selectedPlan.durationInDays} días</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Vencimiento estimado</Text>
                  <Text style={styles.summaryValue}>{estimatedExpiry(selectedPlan.durationInDays)}</Text>
                </View>
                {selectedPlan.specifications.map((line) => (
                  <View key={line} style={styles.bullet}>
                    <MaterialIcons name="check-circle" size={15} color={palette.neon} />
                    <Text style={styles.bulletText}>{line}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            <CoachSelect value={coachId} onChange={setCoachId} />
            <Notice>El cliente se crea con membresía pendiente. La fecha de vencimiento se fija al confirmar su primer pago.</Notice>
          </>
        )}

        {error ? <Notice error>{error}</Notice> : null}
        {createdUser ? <Notice>Cuenta de {createdUser.role} creada para {createdUser.name}.</Notice> : null}

        <ActionButton onPress={() => void createUser()} disabled={isSubmitting}>
          {isSubmitting ? <ActivityIndicator color={palette.white} /> : `Crear ${role.toLowerCase()}`}
        </ActionButton>
      </FloatingCard>
    </Page>
  );
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress} style={[styles.choice, selected && styles.optionSelected]}>
      <Text style={[styles.choiceText, selected && styles.optionTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  group: { gap: 8 },
  label: { color: palette.ink, fontSize: 13, fontWeight: '700' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { borderRadius: 20, backgroundColor: '#F2F4EE', paddingHorizontal: 14, paddingVertical: 9 },
  choiceText: { color: palette.ink, fontSize: 12, fontWeight: '700' },
  optionSelected: { backgroundColor: palette.deepGreen },
  optionTextSelected: { color: palette.white },
  dayOptions: { flexDirection: 'row', justifyContent: 'space-between', gap: 7 },
  dayChip: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#F2F4EE', justifyContent: 'center', alignItems: 'center' },
  dayText: { color: palette.ink, fontSize: 12, fontWeight: '800' },
  roleSelector: { flexDirection: 'row', gap: 12 },
  roleOption: { flex: 1, alignItems: 'center', gap: 8, borderRadius: 24, backgroundColor: 'rgba(255, 255, 255, 0.7)', borderWidth: 1, borderColor: 'rgba(0, 0, 0, 0.05)', paddingVertical: 16 },
  selectedRole: { backgroundColor: '#0F2A24' },
  roleLabel: { color: palette.ink, fontSize: 15, fontWeight: '800' },
  selectedRoleLabel: { color: palette.white },
  form: { gap: 16, padding: 20 },
  link: { color: palette.cyan, fontSize: 13, fontWeight: '800' },
  planSummary: { gap: 8, backgroundColor: 'rgba(255, 255, 255, 0.7)', borderWidth: 1, borderColor: 'rgba(0, 0, 0, 0.05)', borderRadius: 16, padding: 14 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  summaryLabel: { color: palette.muted, fontSize: 13 },
  summaryValue: { color: palette.ink, fontSize: 14, fontWeight: '800' },
  bullet: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bulletText: { flex: 1, color: palette.ink, fontSize: 12 },
});
