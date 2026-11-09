import { MaterialIcons } from '@expo/vector-icons';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Text as RNText, View } from 'react-native';

import { connectSocket } from '@/services/socket';

import { api, getApiErrorMessage } from './api';
import { useAuth } from './auth-context';
import type { AccessResult } from './client-live-updates';
import GymSwitcher from './gym-switcher';
import { usePendingStaffInvitations } from './staff-invitation-notifier';
import { useMaintenanceAlerts } from './use-maintenance-alerts';
import {
  Badge,
  Card,
  EmptyState,
  ErrorBanner,
  FadeIn,
  IconTile,
  ListGroup,
  ListRow,
  ProgressRing,
  Screen,
  SectionHeader,
  Skeleton,
  StatTile,
  Text,
} from '@/components/sirid';
import { makeStyles } from '@/theme/make-styles';
import { useTheme } from '@/theme/theme-provider';
import { radius, space } from '@/theme/tokens';

type Occupancy = {
  gyms: { id: string; name: string; capacity: number | null; count: number; people: { id: string; name: string; since: string }[] }[];
};

type Counters = { payments: number; orders: number };

const RECENT_SCANS = 5;
const eventLabel: Record<AccessResult['event'], string> = { 'check-in': 'Entrada', 'check-out': 'Salida', denied: 'Rechazado' };

const formatTime = (value: string) => new Date(value).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

// "Modo piso" home for Admin and Recepcion: who is inside, what is waiting at the desk, and one tap to the
// scanner, the register or a quick signup. Catalogs and settings live in the web dashboard.
export default function FloorHomeScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const pendingInvitations = usePendingStaffInvitations();
  const maintenanceAlerts = useMaintenanceAlerts(isAdmin);
  const [occupancy, setOccupancy] = useState<Occupancy | null>(null);
  const [counters, setCounters] = useState<Counters | null>(null);
  const [recentScans, setRecentScans] = useState<AccessResult[]>([]);
  const [error, setError] = useState('');
  const [occupancyKey, setOccupancyKey] = useState(0);
  const [countersKey, setCountersKey] = useState(0);

  useFocusEffect(useCallback(() => {
    let isCurrent = true;
    api.get<Occupancy>('/access/occupancy')
      .then((response) => {
        if (!isCurrent) return;
        setOccupancy(response.data);
        setError('');
      })
      .catch((requestError: unknown) => {
        if (isCurrent) setError(getApiErrorMessage(requestError, 'No se pudo cargar el aforo.'));
      });
    return () => { isCurrent = false; };
  // occupancyKey is a reload trigger bumped by live events.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [occupancyKey]));

  useFocusEffect(useCallback(() => {
    let isCurrent = true;
    Promise.all([
      api.get<{ payments: unknown[] }>('/billing/payments', { params: { status: 'pending' } }),
      api.get<{ orders: { status: string }[] }>('/sales'),
    ])
      .then(([payments, orders]) => {
        if (isCurrent) {
          setCounters({
            payments: payments.data.payments.length,
            orders: orders.data.orders.filter((order) => order.status === 'pending').length,
          });
        }
      })
      .catch(() => {
        if (isCurrent) setCounters(null);
      });
    return () => { isCurrent = false; };
  // countersKey is a reload trigger bumped by live events.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countersKey]));

  // Scans from the turnstile, the dashboard or this phone update the capacity and the recent list at once.
  useEffect(() => {
    const socket = connectSocket();
    const onAccess = (scan: AccessResult) => {
      setRecentScans((current) => [scan, ...current.filter((item) => item.id !== scan.id)].slice(0, RECENT_SCANS));
      if (scan.event !== 'denied') setOccupancyKey((value) => value + 1);
    };
    const onDesk = () => setCountersKey((value) => value + 1);
    socket.on('access:recorded', onAccess);
    socket.on('payment-updated', onDesk);
    socket.on('sale-updated', onDesk);
    return () => {
      socket.off('access:recorded', onAccess);
      socket.off('payment-updated', onDesk);
      socket.off('sale-updated', onDesk);
    };
  }, []);

  const gym = occupancy?.gyms[0];
  const isFull = gym?.capacity ? gym.count >= gym.capacity : false;
  const ratio = gym?.capacity ? gym.count / gym.capacity : 0;
  const firstName = user?.name?.split(' ')[0] ?? 'equipo';

  return (
    <Screen onRefresh={() => { setOccupancyKey((value) => value + 1); setCountersKey((value) => value + 1); }} refreshing={false}>
      <FadeIn style={styles.header}>
        <Text variant="label" tone="accent">{isAdmin ? 'Administración' : 'Recepción'} · Operación de piso</Text>
        <Text variant="display" accessibilityRole="header">Hola, {firstName}</Text>
        <GymSwitcher />
      </FadeIn>

      {pendingInvitations > 0 ? (
        <Card onPress={() => router.push('/staff-invitations' as Href)} style={styles.inlineCard}>
          <IconTile name="badge" tone="info" />
          <Text variant="bodyStrong" style={styles.flex}>
            {pendingInvitations === 1 ? 'Tienes 1 invitación al staff' : `Tienes ${pendingInvitations} invitaciones al staff`}
          </Text>
          <MaterialIcons name="chevron-right" size={22} color={colors.textTertiary} />
        </Card>
      ) : null}

      <FadeIn index={1}>
        <View style={styles.hero}>
          <View style={styles.heroHead}>
            <View style={styles.liveDot} />
            <Text style={styles.heroLabel}>Aforo en vivo</Text>
            {gym ? <Text style={[styles.heroStatus, isFull && styles.heroStatusFull]}>{isFull ? 'Lleno' : 'Disponible'}</Text> : null}
          </View>
          {gym ? (
            <View style={styles.heroBody}>
              <View style={styles.flex}>
                <View style={styles.countRow}>
                  <RNText style={styles.heroCount}>{gym.count}</RNText>
                  {gym.capacity ? <RNText style={styles.heroCapacity}>/ {gym.capacity}</RNText> : null}
                </View>
                <Text variant="callout" tone="heroSecondary">{gym.count === 1 ? 'persona dentro' : 'personas dentro'}</Text>
              </View>
              {gym.capacity ? (
                <ProgressRing value={ratio} size={92} stroke={9} color={isFull ? colors.danger : '#10FF85'} track="rgba(255,255,255,0.1)">
                  <RNText style={styles.ringText}>{Math.round(ratio * 100)}%</RNText>
                </ProgressRing>
              ) : null}
            </View>
          ) : error ? null : (
            <Skeleton height={72} radius={12} style={styles.heroSkeleton} />
          )}
        </View>
      </FadeIn>
      {error ? <ErrorBanner message={error} onRetry={() => setOccupancyKey((value) => value + 1)} /> : null}

      <FadeIn index={2} style={styles.section}>
        <SectionHeader title="Pendientes en mostrador" subtitle="Toca para atender en Caja" />
        <View style={styles.row}>
          <StatTile
            icon="payments"
            tone="warning"
            label="Pagos por cobrar"
            value={counters?.payments ?? '—'}
            loading={counters === null}
            onPress={() => router.push('/(main)/billing')}
          />
          <StatTile
            icon="shopping-bag"
            tone="info"
            label="Pedidos por entregar"
            value={counters?.orders ?? '—'}
            loading={counters === null}
            onPress={() => router.push('/(main)/billing')}
          />
        </View>
        {isAdmin && maintenanceAlerts?.length ? (
          <Card onPress={() => router.push('/(main)/maintenance')} style={[styles.inlineCard, styles.alertCard]}>
            <IconTile name="build" tone="danger" />
            <View style={styles.flex}>
              <Text variant="bodyStrong">{maintenanceAlerts.length} {maintenanceAlerts.length === 1 ? 'alerta de mantenimiento' : 'alertas de mantenimiento'}</Text>
              <Text variant="caption" tone="secondary">Equipos reportados sin resolver</Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={colors.textTertiary} />
          </Card>
        ) : null}
      </FadeIn>

      <FadeIn index={3} style={styles.section}>
        <SectionHeader title="Dentro ahora" subtitle={gym ? `${gym.count} ${gym.count === 1 ? 'persona' : 'personas'}` : undefined} />
        {gym && gym.people.length ? (
          <ListGroup>
            {gym.people.slice(0, 8).map((person, index, list) => (
              <ListRow
                key={person.id}
                leading={<Avatar name={person.name} />}
                title={person.name}
                subtitle={`Entró a las ${formatTime(person.since)}`}
                divider={index < list.length - 1 || gym.people.length > 8}
              />
            ))}
            {gym.people.length > 8 ? <ListRow title={`y ${gym.people.length - 8} más`} divider={false} /> : null}
          </ListGroup>
        ) : gym ? (
          <Card variant="sunken"><EmptyState icon="sensor-door" title="Gimnasio vacío" message="Nadie ha registrado entrada todavía." /></Card>
        ) : null}
      </FadeIn>

      {recentScans.length ? (
        <FadeIn index={4} style={styles.section}>
          <SectionHeader title="Últimos accesos" subtitle="En tiempo real" />
          <ListGroup>
            {recentScans.map((scan, index) => (
              <ListRow
                key={scan.id}
                icon={scan.event === 'denied' ? 'block' : scan.event === 'check-in' ? 'login' : 'logout'}
                iconTone={scan.event === 'denied' ? 'danger' : scan.event === 'check-in' ? 'success' : 'neutral'}
                title={scan.userName ?? 'Cliente'}
                subtitle={scan.reason?.message ?? formatTime(scan.occurredAt)}
                trailing={<Badge tone={scan.event === 'denied' ? 'danger' : scan.event === 'check-in' ? 'success' : 'neutral'}>{eventLabel[scan.event]}</Badge>}
                divider={index < recentScans.length - 1}
              />
            ))}
          </ListGroup>
        </FadeIn>
      ) : null}
    </Screen>
  );
}

function Avatar({ name }: { name: string }) {
  const styles = useStyles();
  const initials = name.split(' ').filter(Boolean).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
  return <View style={styles.avatar}><RNText style={styles.avatarText}>{initials || '·'}</RNText></View>;
}

const useStyles = makeStyles(({ colors }) => ({
  flex: { flex: 1 },
  header: { gap: space.xs },
  section: { gap: space.md },
  row: { flexDirection: 'row', gap: space.md },
  inlineCard: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  alertCard: { borderColor: colors.danger },
  hero: { borderRadius: radius.xl, backgroundColor: colors.hero, padding: space.xl, gap: space.lg },
  heroHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10FF85' },
  heroLabel: { flex: 1, color: colors.heroTextSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  heroStatus: { color: '#10FF85', fontSize: 13, fontWeight: '700' },
  heroStatusFull: { color: '#FF6B5E' },
  heroBody: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  countRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  heroCount: { color: colors.heroText, fontSize: 72, lineHeight: 76, fontWeight: '800', fontFamily: 'display' },
  heroCapacity: { color: colors.heroTextSecondary, fontSize: 28, fontWeight: '600', fontFamily: 'display' },
  ringText: { color: colors.heroText, fontSize: 20, fontWeight: '700', fontFamily: 'display' },
  heroSkeleton: { opacity: 0.25 },
  avatar: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSunken },
  avatarText: { color: colors.text, fontSize: 14, fontWeight: '700' },
}));
