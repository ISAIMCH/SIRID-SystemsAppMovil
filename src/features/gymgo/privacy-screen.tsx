import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from '@/hooks/haptics';
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Switch, Text, View } from 'react-native';

import { connectSocket } from '@/services/socket';

import { api, getApiErrorMessage } from './api';
import { useAuth } from './auth-context';
import { IconBadge } from './fit-ui';
import { Notice, Page, Surface } from './ui';
import { makeStyles } from '@/theme/make-styles';
import { useTheme } from '@/theme/theme-provider';

type ShareStatus = 'pending' | 'approved' | 'rejected' | 'revoked';
type HistoryShare = {
  id: string;
  status: ShareStatus;
  includeSensitive: boolean;
  requestedAt: string;
  respondedAt: string | null;
  revokedAt: string | null;
  gym: { id: string; name: string | null };
  organization: { id: string; name: string | null };
  requestedBy: { id: string; name: string | null } | null;
};
type AccessLog = {
  id: string;
  viewerName: string | null;
  gym: { name: string | null };
  organization: { name: string | null };
  sections: ('workouts' | 'routines' | 'sensitive')[];
  createdAt: string;
};

const SECTION_LABELS = { workouts: 'entrenamientos', routines: 'rutinas', sensitive: 'datos sensibles' } as const;

const CLOSED_STATUS: Record<'rejected' | 'revoked', string> = {
  rejected: 'Rechazaste la solicitud',
  revoked: 'Retiraste el acceso',
};

function formatDate(value?: string | null, withTime = false) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return withTime
    ? `${date.toLocaleDateString('es-MX')} ${date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`
    : date.toLocaleDateString('es-MX');
}

const gymLabel = (share: { gym: { name: string | null }; organization: { name: string | null } }) =>
  [share.gym.name, share.organization.name].filter(Boolean).join(' · ') || 'Gimnasio';

export default function PrivacyScreen() {
  const { user } = useAuth();
  if (user?.role !== 'Cliente') return <Redirect href="/(main)" />;
  return <HistoryPrivacy />;
}

// The client decides which gyms see their training history, and sees who looked at it.
function HistoryPrivacy() {
  const styles = useStyles();
  const { colors } = useTheme();
  const [shares, setShares] = useState<HistoryShare[]>([]);
  const [logs, setLogs] = useState<AccessLog[]>([]);
  // Sensitive data stays out unless the client ticks the box for that request.
  const [sensitiveChoice, setSensitiveChoice] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [reloadNumber, setReloadNumber] = useState(0);

  useEffect(() => {
    let isCurrent = true;
    Promise.all([
      api.get<{ shares: HistoryShare[] }>('/history-shares/me'),
      api.get<{ logs: AccessLog[] }>('/history-shares/me/logs'),
    ])
      .then(([sharesResponse, logsResponse]) => {
        if (!isCurrent) return;
        setShares(sharesResponse.data.shares);
        setLogs(logsResponse.data.logs);
      })
      .catch((requestError: unknown) => {
        if (isCurrent) setError(getApiErrorMessage(requestError, 'No se pudo cargar tu privacidad.'));
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });
    return () => { isCurrent = false; };
  }, [reloadNumber]);

  // New requests, and answers given from another device, show up without reloading.
  useEffect(() => {
    const socket = connectSocket();
    const refresh = () => setReloadNumber((value) => value + 1);
    socket.on('history-share:updated', refresh);
    return () => { socket.off('history-share:updated', refresh); };
  }, []);

  async function send(share: HistoryShare, action: 'approve' | 'reject' | 'revoke' | 'sensitive', message: string, includeSensitive?: boolean) {
    setError('');
    setSuccess('');
    setBusyId(share.id);
    try {
      const response = action === 'sensitive'
        ? await api.patch<{ share: HistoryShare }>(`/history-shares/me/${share.id}`, { includeSensitive })
        : await api.post<{ share: HistoryShare }>(`/history-shares/me/${share.id}/${action}`, action === 'approve' ? { includeSensitive } : {});
      setShares((current) => current.map((item) => (item.id === share.id ? response.data.share : item)));
      setSuccess(message);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No se pudo guardar tu decisión.'));
      setReloadNumber((value) => value + 1);
    } finally {
      setBusyId(null);
    }
  }

  function confirmApprove(share: HistoryShare) {
    const includeSensitive = sensitiveChoice[share.id] ?? false;
    Alert.alert(
      'Compartir tu historial',
      `El personal de ${gymLabel(share)} verá tus entrenamientos y rutinas de todos tus gimnasios${includeSensitive ? ', además de tu peso, estatura y lesiones o restricciones' : ''}. Puedes retirar el acceso cuando quieras.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Compartir', onPress: () => void send(share, 'approve', 'Compartiste tu historial.', includeSensitive) },
      ],
    );
  }

  function confirmRevoke(share: HistoryShare) {
    Alert.alert(
      'Retirar acceso',
      `${gymLabel(share)} dejará de ver tu historial de inmediato. Podrán volver a pedírtelo en 30 días.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Retirar', style: 'destructive', onPress: () => void send(share, 'revoke', 'Retiraste el acceso a tu historial.') },
      ],
    );
  }

  const pending = shares.filter((share) => share.status === 'pending');
  const approved = shares.filter((share) => share.status === 'approved');
  const closed = shares.filter((share) => share.status === 'rejected' || share.status === 'revoked');

  return (
    <Page dark>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver al perfil"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => { if (router.canGoBack()) { router.back(); } else { router.push('/(main)/billing'); } }}>
          <IconBadge name="arrow-back" color={colors.text} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Privacidad</Text>
          <Text style={styles.headerDetail}>Tú decides qué gimnasios ven tu historial de entrenamiento.</Text>
        </View>
      </View>

      {error ? <Notice error>{error}</Notice> : null}
      {success ? <Notice>{success}</Notice> : null}
      {isLoading ? <ActivityIndicator color={colors.accent} size="large" /> : null}

      {pending.length > 0 ? <Text style={styles.sectionLabel}>SOLICITUDES PENDIENTES</Text> : null}
      {pending.map((share) => {
        const includeSensitive = sensitiveChoice[share.id] ?? false;
        const isBusy = busyId === share.id;
        return (
          <Surface key={share.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialIcons name="history" size={24} color={colors.accent} />
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>{gymLabel(share)}</Text>
                <Text style={styles.cardMeta}>
                  {share.requestedBy?.name ? `${share.requestedBy.name} pide` : 'Piden'} ver tu historial · {formatDate(share.requestedAt)}
                </Text>
              </View>
            </View>
            <Text style={styles.body}>Si aceptas, su personal verá tus entrenamientos y rutinas de todos tus gimnasios para continuar tu progreso.</Text>
            <View style={styles.switchRow}>
              <View style={styles.switchText}>
                <Text style={styles.switchTitle}>Compartir también datos sensibles</Text>
                <Text style={styles.cardMeta}>Peso, estatura y lesiones o restricciones.</Text>
              </View>
              <Switch
                accessibilityLabel="Compartir también datos sensibles"
                value={includeSensitive}
                onValueChange={(value) => setSensitiveChoice((current) => ({ ...current, [share.id]: value }))}
                trackColor={{ true: colors.accentFill, false: colors.borderStrong }}
                thumbColor={colors.surface}
                ios_backgroundColor={colors.borderStrong}
                disabled={isBusy}
              />
            </View>
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                disabled={isBusy}
                onPress={() => void send(share, 'reject', 'Rechazaste la solicitud.')}
                style={({ pressed }) => [styles.secondaryButton, (pressed || isBusy) && styles.pressed]}>
                <Text style={styles.secondaryText}>Rechazar</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={isBusy}
                onPress={() => confirmApprove(share)}
                style={({ pressed }) => [styles.primaryButton, (pressed || isBusy) && styles.pressed]}>
                <Text style={styles.primaryText}>Compartir</Text>
              </Pressable>
            </View>
          </Surface>
        );
      })}

      <Text style={styles.sectionLabel}>GIMNASIOS CON ACCESO</Text>
      {!isLoading && approved.length === 0 ? <Text style={styles.empty}>Ningún gimnasio ve tu historial.</Text> : null}
      {approved.map((share) => {
        const isBusy = busyId === share.id;
        return (
          <Surface key={share.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialIcons name="verified-user" size={24} color={colors.accent} />
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>{gymLabel(share)}</Text>
                <Text style={styles.cardMeta}>Desde el {formatDate(share.respondedAt)}</Text>
              </View>
            </View>
            <View style={styles.switchRow}>
              <View style={styles.switchText}>
                <Text style={styles.switchTitle}>Datos sensibles</Text>
                <Text style={styles.cardMeta}>Peso, estatura y lesiones o restricciones.</Text>
              </View>
              <Switch
                accessibilityLabel="Compartir datos sensibles"
                value={share.includeSensitive}
                onValueChange={(value) => void send(share, 'sensitive', value ? 'Ahora compartes tus datos sensibles.' : 'Dejaste de compartir tus datos sensibles.', value)}
                trackColor={{ true: colors.accentFill, false: colors.borderStrong }}
                thumbColor={colors.surface}
                ios_backgroundColor={colors.borderStrong}
                disabled={isBusy}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              disabled={isBusy}
              onPress={() => confirmRevoke(share)}
              style={({ pressed }) => [styles.revoke, (pressed || isBusy) && styles.pressed]}>
              <Text style={styles.revokeText}>Retirar acceso</Text>
            </Pressable>
          </Surface>
        );
      })}

      <Text style={styles.sectionLabel}>QUIÉN CONSULTÓ TU HISTORIAL</Text>
      {!isLoading && logs.length === 0 ? <Text style={styles.empty}>Nadie ha consultado tu historial.</Text> : null}
      {logs.length > 0 ? (
        <Surface style={styles.logList}>
          {logs.map((log) => (
            <View key={log.id} style={styles.logRow}>
              <Text style={styles.logTitle}>{log.viewerName ?? 'Personal del gimnasio'}</Text>
              <Text style={styles.cardMeta}>
                {gymLabel(log)} · {log.sections.map((section) => SECTION_LABELS[section]).join(', ')}
              </Text>
              <Text style={styles.cardMeta}>{formatDate(log.createdAt, true)}</Text>
            </View>
          ))}
        </Surface>
      ) : null}

      {closed.length > 0 ? <Text style={styles.sectionLabel}>HISTORIAL DE SOLICITUDES</Text> : null}
      {closed.map((share) => (
        <View key={share.id} style={styles.closedRow}>
          <Text style={styles.logTitle}>{gymLabel(share)}</Text>
          <Text style={styles.cardMeta}>
            {CLOSED_STATUS[share.status as 'rejected' | 'revoked']} · {formatDate(share.status === 'revoked' ? share.revokedAt : share.respondedAt)}
          </Text>
        </View>
      ))}
    </Page>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerText: { flex: 1, gap: 4 },
  headerTitle: { color: colors.text, fontSize: 22, fontWeight: '800' },
  headerDetail: { color: colors.textSecondary, fontSize: 13 },
  sectionLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  empty: { color: colors.textSecondary, fontSize: 14, textAlign: 'center', paddingVertical: 12 },
  card: { gap: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardText: { flex: 1, gap: 3 },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  cardMeta: { color: colors.textSecondary, fontSize: 12 },
  body: { color: colors.text, fontSize: 14, lineHeight: 20 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, backgroundColor: colors.surfaceRaised, padding: 12 },
  switchText: { flex: 1, gap: 2 },
  switchTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 10 },
  primaryButton: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.accentFill },
  primaryText: { color: colors.onAccentFill, fontSize: 15, fontWeight: '800' },
  secondaryButton: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: colors.borderStrong },
  secondaryText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  revoke: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  revokeText: { color: colors.danger, fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.7 },
  logList: { gap: 12 },
  logRow: { gap: 2, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 10 },
  logTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  closedRow: { gap: 2, paddingVertical: 6 },
}));
