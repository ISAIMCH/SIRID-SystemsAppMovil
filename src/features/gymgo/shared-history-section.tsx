import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { connectSocket } from '@/services/socket';

import { api, getApiErrorMessage } from './api';
import { FloatingCard } from './fit-ui';
import { ActionButton, Notice, SectionTitle } from './ui';
import { makeStyles } from '@/theme/make-styles';
import { useTheme } from '@/theme/theme-provider';

type ShareStatus = 'pending' | 'approved' | 'rejected' | 'revoked';

type HistoryShare = {
  id: string;
  status: ShareStatus;
  includeSensitive: boolean;
  respondedAt: string | null;
  gym: { id: string; name: string | null };
};

type Origin = { organization: { name: string | null }; gym: { name: string | null } | null };

type SharedHistory = {
  share: HistoryShare;
  workouts: (Origin & { _id: string; routineTitle: string; completedAt: string; durationMinutes: number; totalVolumeKg: number })[];
  routines: (Origin & { id?: string; _id?: string; title: string; goal?: string })[];
  sensitive: { weightKg: number | null; heightCm: number | null; restrictions: string } | null;
};

const STATUS_COPY: Record<ShareStatus, string> = {
  pending: 'Esperando respuesta del cliente.',
  approved: 'El cliente comparte su historial con tu sucursal.',
  rejected: 'El cliente rechazó compartir su historial.',
  revoked: 'El cliente dejó de compartir su historial.',
};

const PREVIEW_COUNT = 10;

const origin = (item: Origin) => [item.organization.name, item.gym?.name].filter(Boolean).join(' · ') || 'Gimnasio desconocido';
const formatDate = (value: string) => new Date(value).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });

// The history a client shares with the coach's gym, from every gym they trained in. Read-only: requests are made
// from the dashboard. Each opening is logged by the API, so it loads only when the coach asks for it, and it hides
// at once if the client revokes it.
export default function SharedHistorySection({ clientId }: { clientId: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [shares, setShares] = useState<HistoryShare[] | null>(null);
  const [history, setHistory] = useState<SharedHistory | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isCurrent = true;
    api.get<{ shares: HistoryShare[] }>('/history-shares', { params: { clientId } })
      .then((response) => {
        if (isCurrent) setShares(response.data.shares);
      })
      .catch((requestError: unknown) => {
        if (isCurrent) setError(getApiErrorMessage(requestError, 'No se pudo consultar el historial compartido.'));
      });
    return () => { isCurrent = false; };
  }, [clientId, reloadKey]);

  useEffect(() => {
    const socket = connectSocket();
    const onUpdate = (update: { id: string; clientId: string; status: ShareStatus; includeSensitive: boolean }) => {
      if (update.clientId !== clientId) return;
      setHistory((current) => {
        if (!current || current.share.id !== update.id) return current;
        if (update.status !== 'approved') return null;
        return update.includeSensitive ? current : { ...current, sensitive: null };
      });
      setReloadKey((key) => key + 1);
    };
    socket.on('history-share:updated', onUpdate);
    return () => { socket.off('history-share:updated', onUpdate); };
  }, [clientId]);

  async function open(share: HistoryShare) {
    setError('');
    setIsOpening(true);
    try {
      setHistory((await api.get<SharedHistory>(`/history-shares/${share.id}/history`)).data);
      setShowAll(false);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No se pudo abrir el historial.'));
      setReloadKey((key) => key + 1);
    } finally {
      setIsOpening(false);
    }
  }

  const approved = shares?.find((share) => share.status === 'approved');
  const workouts = history ? (showAll ? history.workouts : history.workouts.slice(0, PREVIEW_COUNT)) : [];

  return (
    <>
      <SectionTitle>Historial compartido</SectionTitle>
      <FloatingCard style={styles.card}>
        {shares === null && !error ? <ActivityIndicator color={colors.accent} /> : null}
        {error ? <Notice error>{error}</Notice> : null}
        {shares?.length === 0 ? (
          <Text style={styles.muted}>Este cliente no comparte su historial de otros gimnasios. Puedes solicitarlo desde el panel web.</Text>
        ) : null}
        {shares?.map((share) => (
          <Text key={share.id} style={[styles.status, share.status === 'approved' && styles.statusApproved]}>
            {share.gym.name ? `${share.gym.name}: ` : ''}{STATUS_COPY[share.status]}
          </Text>
        ))}

        {approved && !history ? (
          <ActionButton onPress={() => void open(approved)} disabled={isOpening}>
            {isOpening ? <ActivityIndicator color={colors.text} /> : 'Ver historial'}
          </ActionButton>
        ) : null}

        {history ? (
          <View style={styles.history}>
            {history.sensitive ? (
              <View style={styles.sensitive}>
                <Text style={styles.sensitiveLabel}>DATOS SENSIBLES</Text>
                <Text style={styles.text}>
                  {[
                    history.sensitive.weightKg ? `${history.sensitive.weightKg} kg` : null,
                    history.sensitive.heightCm ? `${history.sensitive.heightCm} cm` : null,
                  ].filter(Boolean).join(' · ') || 'Peso y estatura sin registrar'}
                </Text>
                <Text style={styles.text}>Lesiones o restricciones: {history.sensitive.restrictions || 'Sin registrar'}</Text>
              </View>
            ) : null}

            <Text style={styles.heading}>Entrenamientos ({history.workouts.length})</Text>
            {history.workouts.length === 0 ? <Text style={styles.muted}>Sin entrenamientos registrados.</Text> : null}
            {workouts.map((workout) => (
              <View key={workout._id} style={styles.row}>
                <View style={styles.flex}>
                  <Text style={styles.text}>{workout.routineTitle}</Text>
                  <Text style={styles.meta}>{formatDate(workout.completedAt)} · {origin(workout)}</Text>
                </View>
                <Text style={styles.meta}>{workout.durationMinutes} min · {Math.round(workout.totalVolumeKg)} kg</Text>
              </View>
            ))}
            {history.workouts.length > PREVIEW_COUNT && !showAll ? (
              <Pressable accessibilityRole="button" onPress={() => setShowAll(true)}>
                <Text style={styles.link}>Ver los {history.workouts.length} entrenamientos</Text>
              </Pressable>
            ) : null}

            <Text style={styles.heading}>Rutinas ({history.routines.length})</Text>
            {history.routines.length === 0 ? <Text style={styles.muted}>Sin rutinas asignadas.</Text> : null}
            {history.routines.map((routine, index) => (
              <View key={routine.id ?? routine._id ?? index} style={styles.row}>
                <View style={styles.flex}>
                  <Text style={styles.text}>{routine.title}{routine.goal ? ` · ${routine.goal}` : ''}</Text>
                  <Text style={styles.meta}>{origin(routine)}</Text>
                </View>
              </View>
            ))}

            <Pressable accessibilityRole="button" onPress={() => setHistory(null)}>
              <Text style={styles.link}>Ocultar historial</Text>
            </Pressable>
          </View>
        ) : null}
      </FloatingCard>
    </>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  card: { gap: 12, backgroundColor: colors.surface, borderColor: colors.border },
  flex: { flex: 1, gap: 2 },
  muted: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  status: { color: colors.textSecondary, fontSize: 13 },
  statusApproved: { color: colors.accent, fontWeight: '700' },
  history: { gap: 10 },
  sensitive: { gap: 4, borderRadius: 10, borderWidth: 1, borderColor: colors.warning, backgroundColor: colors.warningSoft, padding: 12 },
  sensitiveLabel: { color: colors.warning, fontSize: 12, fontWeight: '900' },
  heading: { color: colors.text, fontSize: 14, fontWeight: '800', marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  text: { color: colors.text, fontSize: 13 },
  meta: { color: colors.textSecondary, fontSize: 12 },
  link: { color: colors.accent, fontSize: 13, fontWeight: '800', paddingVertical: 6 },
}));
