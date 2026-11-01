import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { connectSocket, disconnectSocket } from '@/services/socket';

import { api, getApiErrorMessage } from './api';
import { useAuth } from './auth-context';
import { IconBadge } from './fit-ui';
import { fetchMyStaffInvitations, type StaffInvitation } from './staff-invitation-notifier';
import { palette } from './theme';
import { Notice, Page, Surface } from './ui';

const ROLE_LABELS = { Gerente: 'Gerente', Coach: 'Coach', Recepcion: 'Recepción' } as const;

const roleList = (invitation: StaffInvitation) => invitation.roles.map((role) => ROLE_LABELS[role]).join(', ');
const gymLabel = (invitation: StaffInvitation) =>
  [invitation.gym.name, invitation.organization.name].filter(Boolean).join(' · ') || 'Gimnasio';

// Invitations from gyms to join their staff. Outside the main tabs, so an account without a gym can answer too.
export default function StaffInvitationsScreen() {
  const { user, activeGym, selectGym, refreshSession } = useAuth();
  const [invitations, setInvitations] = useState<StaffInvitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(() => {
    fetchMyStaffInvitations()
      .then(setInvitations)
      .catch((requestError: unknown) => setError(getApiErrorMessage(requestError, 'No se pudieron cargar tus invitaciones.')))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    load();
    const socket = connectSocket();
    socket.on('staff-invitation:updated', load);
    return () => { socket.off('staff-invitation:updated', load); };
  }, [load]);

  if (!user) return <Redirect href="/(auth)/login" />;

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/(main)');
  }

  async function switchTo(invitation: StaffInvitation) {
    try {
      await selectGym(invitation.gym.id);
      router.replace('/(main)');
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No se pudo cambiar de gimnasio.'));
    }
  }

  async function respond(invitation: StaffInvitation, answer: 'accept' | 'reject') {
    setError('');
    setSuccess('');
    setBusyId(invitation.id);
    try {
      await api.post(`/staff-invitations/me/${invitation.id}/${answer}`);
      setInvitations((current) => current.filter((item) => item.id !== invitation.id));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (answer === 'reject') {
        setSuccess('Rechazaste la invitación.');
        return;
      }
      // The new gym joins the switcher, and the socket reconnects to get that organization's events.
      await refreshSession();
      disconnectSocket();
      connectSocket();
      if (!activeGym) {
        await switchTo(invitation);
        return;
      }
      setSuccess(`Ya eres parte del staff de ${gymLabel(invitation)}.`);
      Alert.alert(
        'Te uniste al staff',
        `Cambia a ${invitation.gym.name ?? 'ese gimnasio'} desde el selector cuando quieras trabajar ahí.`,
        [
          { text: 'Después', style: 'cancel' },
          { text: 'Cambiar ahora', onPress: () => void switchTo(invitation) },
        ],
      );
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No se pudo guardar tu respuesta.'));
      load();
    } finally {
      setBusyId(null);
    }
  }

  function confirmAccept(invitation: StaffInvitation) {
    Alert.alert(
      'Unirte al staff',
      `Trabajarás en ${gymLabel(invitation)} como ${roleList(invitation)}. Su personal verá tu nombre, correo y teléfono. Tu cuenta, tu contraseña y tus otros gimnasios no cambian.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Aceptar', onPress: () => void respond(invitation, 'accept') },
      ],
    );
  }

  return (
    <Page dark>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={goBack}>
          <IconBadge name="arrow-back" color="#FFFFFF" />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Invitaciones al staff</Text>
          <Text style={styles.headerDetail}>Gimnasios que quieren sumarte a su equipo.</Text>
        </View>
      </View>

      {error ? <Notice error>{error}</Notice> : null}
      {success ? <Notice>{success}</Notice> : null}
      {isLoading ? <ActivityIndicator color={palette.neon} size="large" /> : null}
      {!isLoading && invitations.length === 0 ? <Text style={styles.empty}>No tienes invitaciones pendientes.</Text> : null}

      {invitations.map((invitation) => {
        const isBusy = busyId === invitation.id;
        return (
          <Surface key={invitation.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialIcons name="badge" size={24} color={palette.neon} />
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>{gymLabel(invitation)}</Text>
                <Text style={styles.cardMeta}>
                  {invitation.invitedBy?.name ? `${invitation.invitedBy.name} te invita` : 'Te invitan'} · vence el {new Date(invitation.expiresAt).toLocaleDateString('es-MX')}
                </Text>
              </View>
            </View>
            <Text style={styles.body}>Rol: {roleList(invitation)}</Text>
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                disabled={isBusy}
                onPress={() => void respond(invitation, 'reject')}
                style={({ pressed }) => [styles.secondaryButton, (pressed || isBusy) && styles.pressed]}>
                <Text style={styles.secondaryText}>Rechazar</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={isBusy}
                onPress={() => confirmAccept(invitation)}
                style={({ pressed }) => [styles.primaryButton, (pressed || isBusy) && styles.pressed]}>
                {isBusy ? <ActivityIndicator color="#070B09" /> : <Text style={styles.primaryText}>Aceptar</Text>}
              </Pressable>
            </View>
          </Surface>
        );
      })}
    </Page>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#27272A' },
  headerText: { flex: 1, gap: 4 },
  headerTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  headerDetail: { color: '#A1A1AA', fontSize: 13 },
  empty: { color: '#A1A1AA', fontSize: 14, textAlign: 'center', paddingVertical: 12 },
  card: { gap: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardText: { flex: 1, gap: 3 },
  cardTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  cardMeta: { color: '#A1A1AA', fontSize: 12 },
  body: { color: '#D4D4D8', fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 10 },
  primaryButton: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: palette.neon },
  primaryText: { color: '#070B09', fontSize: 15, fontWeight: '800' },
  secondaryButton: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: '#3F3F46' },
  secondaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  pressed: { opacity: 0.7 },
});
