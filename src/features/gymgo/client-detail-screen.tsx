import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { api, getApiErrorMessage } from './api';
import { useAuth } from './auth-context';
import { CoachSelect } from './coach-select';
import ClientProgress from './client-progress';
import type { DirectoryClient } from './directory-types';
import { FloatingCard, IconBadge } from './fit-ui';
import { palette } from './theme';
import { ActionButton, Field, Notice, Page, SectionTitle } from './ui';

const membershipLabels: Record<NonNullable<DirectoryClient['membership']>['status'], string> = {
  active: 'Activa',
  pending: 'Pendiente',
  suspended: 'Suspendida',
  expired: 'Vencida',
};

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

  useEffect(() => {
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
  }, [clientId, retryNumber]);

  const isCoach = person?.role === 'Coach';

  return (
    <Page>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver al directorio" onPress={() => router.back()}>
          <IconBadge name="arrow-back" color={palette.ink} />
        </Pressable>
        <View style={styles.flex}>
          <Text style={styles.title}>{person?.name ?? 'Perfil'}</Text>
          <Text style={styles.subtitle}>{person ? (isCoach ? 'Perfil del coach' : 'Perfil del cliente') : ' '}</Text>
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
              <FloatingCard style={styles.details}>
                <DetailRow icon="mail" color={palette.cyan} label="Correo" value={person.email} />
                <DetailRow icon="phone" color={palette.neon} label="Teléfono" value={person.phone || 'No registrado'} />
                {isCoach ? (
                  <DetailRow icon="place" color={palette.orange} label="Dirección" value={person.address || 'No registrada'} last />
                ) : (
                  <>
                    <DetailRow icon="flag" color={palette.orange} label="Objetivo" value={person.goal || 'No definido'} />
                    <DetailRow icon="trending-up" color={palette.violet} label="Experiencia" value={person.experienceLevel ? experienceLabels[person.experienceLevel] : 'No definida'} last />
                  </>
                )}
              </FloatingCard>

              {!isCoach ? (
                <>
                  <SectionTitle>Membresía</SectionTitle>
                  <FloatingCard style={styles.details}>
                    <DetailRow icon="verified" color={palette.neon} label="Estado" value={person.membership ? membershipLabels[person.membership.status] : 'Pendiente'} />
                    <DetailRow icon="event" color={palette.cyan} label="Inicio" value={formatDate(person.membership?.startsAt)} />
                    <DetailRow icon="event-busy" color={palette.orange} label="Vencimiento" value={formatDate(person.membership?.expiresAt)} last />
                  </FloatingCard>

                  <SectionTitle>Coach asignado</SectionTitle>
                  <FloatingCard style={styles.coachCard}>
                    {person.assignedCoach ? (
                      <>
                        <IconBadge name="sports" color={palette.cyan} />
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

              {user?.role === 'Coach' && !isCoach ? <ClientProgress clientId={person.id} /> : null}

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

function DetailRow({ icon, color, label, value, last = false }: {
  icon: keyof typeof MaterialIcons.glyphMap;
  color: string;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.detailRow, !last && styles.detailDivider]}>
      <IconBadge name={icon} color={color} size={36} />
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  title: { color: palette.ink, fontSize: 24, fontWeight: '800' },
  subtitle: { color: palette.muted, fontSize: 13 },
  loading: { minHeight: 180, justifyContent: 'center', alignItems: 'center' },
  details: { paddingVertical: 6 },
  detailRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12 },
  detailDivider: { borderBottomWidth: 1, borderBottomColor: palette.line },
  detailLabel: { color: palette.muted, fontSize: 13 },
  detailValue: { flex: 1, color: palette.ink, fontSize: 13, fontWeight: '700', textAlign: 'right' },
  coachCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  coachName: { color: palette.ink, fontSize: 15, fontWeight: '800' },
  coachEmail: { color: palette.muted, fontSize: 13 },
  form: { gap: 16, padding: 20 },
});
