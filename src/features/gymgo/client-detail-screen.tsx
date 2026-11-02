import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { api, getApiErrorMessage } from './api';
import { useAuth } from './auth-context';
import ClientProgress from './client-progress';
import { CoachRoutineList } from './coach-routine-list';
import { CoachSelect } from './coach-select';
import type { DirectoryClient } from './directory-types';
import { FloatingCard, IconBadge } from './fit-ui';
import { membershipDisplayStatus, membershipLabel } from './membership-status';
import { routineEditorHref } from './routine-links';
import { palette } from './theme';
import type { Routine } from './types';
import { ActionButton, Field, Notice, Page, SectionTitle } from './ui';

const experienceLabels: Record<NonNullable<DirectoryClient['experienceLevel']>, string> = {
  principiante: 'Principiante',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
};

function formatDate(value?: string) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Sin fecha' : date.toLocaleDateString();
}

export default function ClientDetailScreen() {
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const [person, setPerson] = useState<DirectoryClient | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryNumber, setRetryNumber] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [routines, setRoutines] = useState<Routine[] | null>(null);
  const [routinesError, setRoutinesError] = useState('');
  const [routinesReload, setRoutinesReload] = useState(0);
  const isCoachViewer = user?.role === 'Coach';

  useFocusEffect(useCallback(() => {
    let isCurrent = true;
    api.get<{ user: DirectoryClient }>(`/auth/users/${clientId}`)
      .then((response) => {
        if (isCurrent) setPerson(response.data.user);
      })
      .catch((requestError: unknown) => {
        if (isCurrent) setError(getApiErrorMessage(requestError, 'No se pudo cargar el perfil.'));
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });
    return () => { isCurrent = false; };
  // retryNumber is a manual "reintentar" trigger.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, retryNumber]));

  // The Coach sees the client's routines here; reloads after returning from the editor.
  useFocusEffect(useCallback(() => {
    if (!isCoachViewer) return undefined;
    let isCurrent = true;
    api.get<{ routines: Routine[] }>('/routines', { params: { clientId } })
      .then((response) => {
        if (!isCurrent) return;
        setRoutines(response.data.routines);
        setRoutinesError('');
      })
      .catch((requestError: unknown) => {
        if (isCurrent) setRoutinesError(getApiErrorMessage(requestError, 'No se pudieron cargar las rutinas del cliente.'));
      });
    return () => { isCurrent = false; };
  // routinesReload reloads after a routine is activated.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, isCoachViewer, routinesReload]));

  const isCoach = person?.role === 'Coach';

  return (
    <Page admin={isAdmin} dark={user?.role === 'Coach'}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver al directorio"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => { if (router.canGoBack()) { router.back(); } else { router.push('/(main)/billing'); } }}>
          <IconBadge name="arrow-back" color={isAdmin ? '#18181B' : '#FFFFFF'} />
        </Pressable>
        <View style={styles.flex}>
          <Text style={[styles.title, isAdmin && styles.adminTitle]}>{person ? [person.name, person.lastName].filter(Boolean).join(' ') : 'Perfil'}</Text>
          <Text style={[styles.subtitle, isAdmin && styles.adminSubtitle]}>{person ? (isCoach ? 'Perfil del coach' : 'Perfil del cliente') : ' '}</Text>
        </View>
      </View>

      {isLoading ? <View style={styles.loading}><ActivityIndicator color={palette.green} size="large" /></View> : null}
      {error ? (
        <View style={styles.gap}>
          <Notice error>{error}</Notice>
          <ActionButton secondary onPress={() => { setError(''); setIsLoading(true); setRetryNumber((value) => value + 1); }}>Reintentar</ActionButton>
        </View>
      ) : null}

      {!isLoading && !error && person ? (
        <>
          {isEditing ? (
            <EditProfileForm
              person={person}
              onCancel={() => setIsEditing(false)}
              onSaved={(updated) => { setPerson(updated); setIsEditing(false); }}
            />
          ) : (
            <>
              <SectionTitle>Información</SectionTitle>
              <FloatingCard style={[styles.details, isAdmin && styles.adminSlateCard]}>
                <DetailRow label="Correo" value={person.email} />
                <DetailRow label="Nombre" value={[person.name, person.lastName].filter(Boolean).join(' ')} />
                <DetailRow label="Teléfono" value={person.phone || 'No registrado'} />
                {isCoach ? (
                  <DetailRow label="Dirección" value={person.address || 'No registrada'} last />
                ) : (
                  <>
                    <DetailRow label="Objetivo" value={person.goal || 'No definido'} />
                    <DetailRow label="Experiencia" value={person.experienceLevel ? experienceLabels[person.experienceLevel] : 'No definida'} last />
                  </>
                )}
              </FloatingCard>

              {!isCoach ? (
                <>
                  <SectionTitle>Membresía</SectionTitle>
                  <FloatingCard style={[styles.details, isAdmin && styles.adminSlateCard]}>
                    <DetailRow label="Estado" value={membershipLabel(person.membership)} accent={membershipDisplayStatus(person.membership) === 'active'} />
                    <DetailRow label="Inicio" value={formatDate(person.membership?.startsAt)} />
                    <DetailRow label="Vencimiento" value={formatDate(person.membership?.expiresAt)} last />
                  </FloatingCard>

                  <SectionTitle>Coach asignado</SectionTitle>
                  <FloatingCard style={[styles.coachCard, isAdmin && styles.adminSlateCard]}>
                    {person.assignedCoach ? (
                      <>
                        <View style={styles.flex}>
                          <Text style={styles.coachName}>{person.assignedCoach.name}</Text>
                          <Text style={styles.coachEmail}>{person.assignedCoach.email}</Text>
                        </View>
                      </>
                    ) : (
                      <Text style={styles.coachEmail}>No tiene Coach asignado.</Text>
                    )}
                  </FloatingCard>
                </>
              ) : null}

              {isCoachViewer && !isCoach ? (
                <>
                  <SectionTitle>Observaciones médicas y técnicas</SectionTitle>
                  <FloatingCard style={styles.details}>
                    <Text style={[styles.observations, !person.observations && styles.observationsEmpty]}>
                      {person.observations || 'Sin observaciones registradas. Puedes agregarlas al crear o editar su rutina.'}
                    </Text>
                  </FloatingCard>

                  <SectionTitle>Rutinas</SectionTitle>
                  {routinesError ? <Notice error>{routinesError}</Notice> : null}
                  {routines === null && !routinesError ? <ActivityIndicator color={palette.green} /> : null}
                  {routines?.length ? (
                    <CoachRoutineList routines={routines} onChanged={() => setRoutinesReload((value) => value + 1)} />
                  ) : routines ? (
                    <Text style={styles.coachEmail}>Este cliente aún no tiene rutinas.</Text>
                  ) : null}
                  <ActionButton onPress={() => router.push(routineEditorHref({ clientId: person.id }))}>
                    {routines?.length ? 'Crear nueva rutina' : 'Crear rutina'}
                  </ActionButton>
                </>
              ) : null}

              {isCoachViewer && !isCoach ? <ClientProgress clientId={person.id} /> : null}

              {isAdmin ? <ActionButton onPress={() => setIsEditing(true)}>Editar perfil</ActionButton> : null}
            </>
          )}
        </>
      ) : null}
    </Page>
  );
}

function EditProfileForm({ person, onCancel, onSaved }: {
  person: DirectoryClient;
  onCancel: () => void;
  onSaved: (person: DirectoryClient) => void;
}) {
  const isCoach = person.role === 'Coach';
  const [email, setEmail] = useState(person.email);
  const [lastName, setLastName] = useState(person.lastName ?? '');
  const [phone, setPhone] = useState(person.phone ?? '');
  const [address, setAddress] = useState(person.address ?? '');
  const [coachId, setCoachId] = useState(person.assignedCoach?.id ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    const digits = phone.replace(/\D/g, '');
    if (!email.trim()) return setError('El correo es obligatorio.');
    if (digits && digits.length !== 10) return setError('El teléfono debe tener 10 dígitos.');

    setError('');
    setIsSaving(true);
    try {
      const response = await api.put<{ user: DirectoryClient }>(`/auth/users/${person.id}`, {
        email: email.trim().toLowerCase(),
        lastName: lastName.trim(),
        phone: digits,
        ...(isCoach ? { address: address.trim() } : { assignedCoach: coachId || null }),
      });
      onSaved(response.data.user);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No se pudo guardar el perfil.'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <FloatingCard style={styles.form}>
      <SectionTitle>Editar perfil</SectionTitle>
      <Field label="Apellido" autoCapitalize="words" value={lastName} onChangeText={setLastName} />
      <Field label="Correo electrónico" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <Field label="Teléfono (10 dígitos)" keyboardType="phone-pad" maxLength={14} value={phone} onChangeText={setPhone} />
      {isCoach ? (
        <Field label="Dirección" value={address} onChangeText={setAddress} />
      ) : (
        <CoachSelect value={coachId} onChange={setCoachId} />
      )}
      {error ? <Notice error>{error}</Notice> : null}
      <ActionButton onPress={() => void save()} disabled={isSaving}>
        {isSaving ? <ActivityIndicator color={palette.white} /> : 'Guardar cambios'}
      </ActionButton>
      <ActionButton secondary onPress={onCancel}>Cancelar</ActionButton>
    </FloatingCard>
  );
}

function DetailRow({ label, value, last = false, accent = false }: {
  label: string;
  value: string;
  last?: boolean;
  accent?: boolean;
}) {
  return (
    <View style={[styles.detailRow, !last && styles.detailDivider]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, accent && styles.detailValueAccent]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  title: { color: '#F4F8F5', fontSize: 24, fontWeight: '800' },
  subtitle: { color: '#91A098', fontSize: 13 },
  adminTitle: { color: '#18181B' },
  adminSubtitle: { color: '#52525B' },
  loading: { minHeight: 180, justifyContent: 'center', alignItems: 'center' },
  details: { paddingVertical: 6, backgroundColor: '#1E1E1E', borderColor: '#27272A' },
  detailRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingVertical: 12 },
  detailDivider: { borderBottomWidth: 1, borderBottomColor: '#27272A' },
  detailLabel: { color: '#A1A1AA', fontSize: 13 },
  detailValue: { flex: 1, color: '#FFFFFF', fontSize: 13, fontWeight: '500', textAlign: 'right' },
  detailValueAccent: { color: '#10FF85' },
  coachCard: { backgroundColor: '#1E1E1E', borderColor: '#27272A' },
  adminSlateCard: { backgroundColor: '#3F3F46', borderColor: '#52525B', borderRadius: 16 },
  coachName: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  coachEmail: { color: '#A1A1AA', fontSize: 13 },
  observations: { color: '#FFFFFF', fontSize: 14, lineHeight: 21, paddingVertical: 10 },
  observationsEmpty: { color: '#A1A1AA' },
  form: { gap: 16, padding: 20, backgroundColor: '#1E1E1E', borderColor: '#27272A' },
});
