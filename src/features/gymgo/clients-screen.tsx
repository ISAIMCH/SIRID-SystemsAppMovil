import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { api, getApiErrorMessage } from './api';
import { useAuth } from './auth-context';
import { ActionButton, AppHeader, Eyebrow, Field, Notice, Page, SectionTitle, Surface } from './ui';
import { palette } from './theme';
import type { Routine } from './types';

export default function ClientsScreen() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [coachId, setCoachId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [isLoadingRoutines, setIsLoadingRoutines] = useState(!isAdmin);

  useEffect(() => {
    if (isAdmin) return;
    let isCurrent = true;
    api.get<{ routines: Routine[] }>('/routines')
      .then((response) => {
        if (isCurrent) setRoutines(response.data.routines);
      })
      .catch((requestError: unknown) => {
        if (isCurrent) setError(getApiErrorMessage(requestError, 'No se pudo cargar la cartera.'));
      })
      .finally(() => {
        if (isCurrent) setIsLoadingRoutines(false);
      });
    return () => { isCurrent = false; };
  }, [isAdmin]);

  async function createAndAssignClient() {
    setMessage('');
    setError('');
    if (name.trim().length < 2 || !email.trim() || password.length < 10) {
      setError('Completa nombre, correo y una contraseña de al menos 10 caracteres.');
      return;
    }

    setIsSaving(true);
    try {
      await api.post('/auth/users', {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        role: 'Cliente',
        membershipStatus: 'pending',
        ...(coachId.trim() ? { assignedCoach: coachId.trim() } : {}),
      });
      setMessage(`Se creó la cuenta de ${name.trim()}. La membresía quedó pendiente de activación.`);
      setName('');
      setEmail('');
      setPassword('');
      setCoachId('');
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No se pudo crear o asignar al cliente.'));
    } finally {
      setIsSaving(false);
    }
  }

  const clientsWithRoutines = new Map<string, Routine[]>();
  for (const routine of routines) {
    const clientRoutines = clientsWithRoutines.get(routine.assignedTo) ?? [];
    clientRoutines.push(routine);
    clientsWithRoutines.set(routine.assignedTo, clientRoutines);
  }

  return (
    <Page>
      <AppHeader
        title={isAdmin ? 'Asignar clientes' : 'Mis clientes'}
        detail={isAdmin ? 'Crea una cuenta y vincúlala con un Coach.' : 'Clientes con rutinas asignadas a tu perfil.'}
      />

      {isAdmin ? (
        <>
          <View style={styles.formHeading}>
            <Eyebrow>NUEVA MEMBRESÍA</Eyebrow>
            <SectionTitle>Datos del cliente</SectionTitle>
          </View>
          <Surface style={styles.form}>
            <Field label="Nombre completo" autoCapitalize="words" value={name} onChangeText={setName} />
            <Field label="Correo electrónico" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
            <Field label="Contraseña inicial" secureTextEntry value={password} onChangeText={setPassword} />
            <Field label="ID de Coach (opcional)" autoCapitalize="none" value={coachId} onChangeText={setCoachId} />
            <Notice>La cuenta se registra con membresía pendiente. Actívala desde la administración antes de permitir el acceso QR.</Notice>
            {message ? <Notice>{message}</Notice> : null}
            {error ? <Notice error>{error}</Notice> : null}
            <ActionButton onPress={() => void createAndAssignClient()} disabled={isSaving}>
              {isSaving ? <ActivityIndicator color={palette.white} /> : 'Crear cliente'}
            </ActionButton>
          </Surface>
          <Text style={styles.caption}>El Coach se identifica por su ID de usuario, disponible al crear su cuenta desde el sistema Admin.</Text>
        </>
      ) : (
        <>
          <SectionTitle>{`${clientsWithRoutines.size} clientes con plan`}</SectionTitle>
          {isLoadingRoutines ? <ActivityIndicator color={palette.green} size="large" /> : null}
          {error ? <Notice error>{error}</Notice> : null}
          {!isLoadingRoutines && !error && clientsWithRoutines.size === 0 ? (
            <Notice>Tus clientes aparecerán aquí cuando tengan una rutina publicada.</Notice>
          ) : null}
          {[...clientsWithRoutines.entries()].map(([clientId, clientRoutines]) => (
            <Surface key={clientId} style={styles.clientRow}>
              <View style={styles.clientAvatar}><Text style={styles.avatarText}>{clientRoutines[0].title.slice(0, 1).toUpperCase()}</Text></View>
              <View style={styles.clientDetails}>
                <Text style={styles.clientName}>Cliente · {clientId.slice(-6).toUpperCase()}</Text>
                <Text style={styles.clientMeta}>{clientRoutines.length} rutinas · {clientRoutines[0].goal ?? 'Objetivo por definir'}</Text>
              </View>
              <Text style={styles.clientArrow}>›</Text>
            </Surface>
          ))}
          <Notice>La API actual entrega los identificadores de cliente desde las rutinas, pero todavía no expone un directorio con nombres y perfiles.</Notice>
        </>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  formHeading: { gap: 8 },
  form: { gap: 15 },
  caption: { color: palette.muted, fontSize: 12, lineHeight: 18 },
  clientRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  clientAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: palette.lime, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: palette.deepGreen, fontSize: 16, fontWeight: '800' },
  clientDetails: { flex: 1, gap: 4 },
  clientName: { color: palette.ink, fontSize: 14, fontWeight: '800' },
  clientMeta: { color: palette.muted, fontSize: 12 },
  clientArrow: { color: palette.green, fontSize: 24, lineHeight: 26 },
});