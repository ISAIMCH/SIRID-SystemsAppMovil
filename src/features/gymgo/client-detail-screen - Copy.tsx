import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { api, getApiErrorMessage } from './api';
import { AppHeader, Notice, Page, SectionTitle, Surface } from './ui';
import { palette } from './theme';
import type { DirectoryClient } from './directory-types';

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
  const [client, setClient] = useState<DirectoryClient | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryNumber, setRetryNumber] = useState(0);

  useEffect(() => {
    let isCurrent = true;

    async function loadClient() {
      setIsLoading(true);
      setError('');
      try {
        const response = await api.get<{ user: DirectoryClient }>(`/auth/users/${clientId}`);
        if (isCurrent) setClient(response.data.user);
      } catch (requestError) {
        if (isCurrent) setError(getApiErrorMessage(requestError, 'No se pudo cargar el perfil del cliente.'));
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    }

    void loadClient();
    return () => { isCurrent = false; };
  }, [clientId, retryNumber]);

  return (
    <Page>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
        <Text style={styles.backText}>‹  Directorio</Text>
      </Pressable>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={palette.green} size="large" />
        </View>
      ) : null}
      {error ? (
        <View style={styles.feedback}>
          <Notice error>{error}</Notice>
          <Pressable accessibilityRole="button" onPress={() => setRetryNumber((current) => current + 1)}>
            <Text style={styles.retry}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}

      {!isLoading && !error && client ? (
        <>
          <AppHeader title={client.name} detail="Perfil del cliente" />

          <SectionTitle>Información básica</SectionTitle>
          <Surface style={styles.details}>
            <DetailRow label="Correo" value={client.email} />
            <DetailRow label="Teléfono" value={client.phone || 'No registrado'} />
            <DetailRow label="Objetivo" value={client.goal || 'No definido'} />
            <DetailRow
              label="Experiencia"
              value={client.experienceLevel ? experienceLabels[client.experienceLevel] : 'No definida'}
              last
            />
          </Surface>

          <SectionTitle>Membresía</SectionTitle>
          <Surface style={styles.membershipPanel}>
            <View style={styles.membershipHeader}>
              <Text style={styles.membershipLabel}>Estado actual</Text>
              <Text style={[
                styles.membershipValue,
                client.membership?.status === 'active' && styles.active,
                client.membership?.status === 'suspended' && styles.suspended,
              ]}>
                {client.membership ? membershipLabels[client.membership.status] : 'Pendiente'}
              </Text>
            </View>
            <DetailRow label="Inicio" value={formatDate(client.membership?.startsAt)} />
            <DetailRow label="Vencimiento" value={formatDate(client.membership?.expiresAt)} last />
          </Surface>

          <SectionTitle>Coach asignado</SectionTitle>
          <Surface style={styles.coachPanel}>
            {client.assignedCoach ? (
              <>
                <View style={styles.coachAvatar}>
                  <Text style={styles.coachAvatarText}>{client.assignedCoach.name.trim().slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={styles.coachInfo}>
                  <Text style={styles.coachName}>{client.assignedCoach.name}</Text>
                  <Text style={styles.coachEmail}>{client.assignedCoach.email}</Text>
                </View>
              </>
            ) : (
              <Text style={styles.noCoach}>No tiene Coach asignado.</Text>
            )}
          </Surface>
        </>
      ) : null}
    </Page>
  );
}

function DetailRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.detailRow, !last && styles.detailDivider]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backButton: { alignSelf: 'flex-start', paddingVertical: 4, paddingRight: 12 },
  backText: { color: palette.green, fontSize: 14, fontWeight: '800' },
  loading: { minHeight: 180, justifyContent: 'center', alignItems: 'center' },
  feedback: { gap: 12 },
  retry: { color: palette.green, fontSize: 14, fontWeight: '800', paddingVertical: 8 },
  details: { paddingVertical: 4 },
  detailRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  detailDivider: { borderBottomWidth: 1, borderBottomColor: palette.line },
  detailLabel: { color: palette.muted, fontSize: 13 },
  detailValue: { flexShrink: 1, color: palette.ink, fontSize: 13, fontWeight: '700', textAlign: 'right' },
  membershipPanel: { gap: 2 },
  membershipHeader: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  membershipLabel: { color: palette.muted, fontSize: 13 },
  membershipValue: { color: palette.coral, fontSize: 14, fontWeight: '800' },
  active: { color: palette.green },
  suspended: { color: palette.danger },
  coachPanel: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12 },
  coachAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: palette.lime, alignItems: 'center', justifyContent: 'center' },
  coachAvatarText: { color: palette.deepGreen, fontSize: 16, fontWeight: '800' },
  coachInfo: { flex: 1, gap: 4 },
  coachName: { color: palette.ink, fontSize: 14, fontWeight: '800' },
  coachEmail: { color: palette.muted, fontSize: 12 },
  noCoach: { color: palette.muted, fontSize: 13 },
});