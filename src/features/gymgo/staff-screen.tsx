import { useState } from 'react';
import { Redirect } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { api, getApiErrorMessage } from './api';
import { useAuth } from './auth-context';
import { ActionButton, AppHeader, Eyebrow, Field, Notice, Page, SectionTitle, Surface } from './ui';
import { palette } from './theme';

type ManagedRole = 'Coach' | 'Cliente';
type CreatedUser = { id: string; name: string; email: string; role: ManagedRole };

export default function StaffScreen() {
  const { user } = useAuth();
  const [role, setRole] = useState<ManagedRole>('Coach');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [goal, setGoal] = useState('');
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
              ...(goal.trim() ? { goal: goal.trim() } : {}),
              ...(coachId.trim() ? { assignedCoach: coachId.trim() } : {}),
            }
          : {}),
      });

      setCreatedUser(response.data.user);
      setName('');
      setEmail('');
      setPassword('');
      setGoal('');
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
            <Field label="Objetivo de entrenamiento (opcional)" value={goal} onChangeText={setGoal} />
            <Field
              label="ID del Coach (opcional)"
              autoCapitalize="none"
              value={coachId}
              onChangeText={setCoachId}
            />
            <Notice>El Cliente se crea con membresía pendiente. Actívala antes de permitirle generar un QR de acceso.</Notice>
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

const styles = StyleSheet.create({
  intro: { gap: 8 },
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