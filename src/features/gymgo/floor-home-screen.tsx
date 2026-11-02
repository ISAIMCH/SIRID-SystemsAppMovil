import { MaterialIcons } from '@expo/vector-icons';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { connectSocket } from '@/services/socket';

import { api, getApiErrorMessage } from './api';
import { useAuth } from './auth-context';
import type { AccessResult } from './client-live-updates';
import { FloatingCard } from './fit-ui';
import GymSwitcher from './gym-switcher';
import { usePendingStaffInvitations } from './staff-invitation-notifier';
import { palette } from './theme';
import { ActionButton, AppHeader, Notice, Page, SectionTitle } from './ui';
import { useMaintenanceAlerts } from './use-maintenance-alerts';

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

  return (
    <Page admin>
      <AppHeader title={`Hola, ${user?.name?.split(' ')[0] ?? 'equipo'}`} detail="Operación de piso" />
      <GymSwitcher />
      {pendingInvitations > 0 ? (
        <ActionButton secondary onPress={() => router.push('/staff-invitations' as Href)}>
          {pendingInvitations === 1 ? 'Tienes 1 invitación al staff' : `Tienes ${pendingInvitations} invitaciones al staff`}
        </ActionButton>
      ) : null}

      <View style={styles.actions}>
        <QuickAction icon="qr-code-scanner" label="Escanear QR" primary onPress={() => router.push('/(main)/scanner')} />
        <QuickAction icon="point-of-sale" label="Caja" onPress={() => router.push('/(main)/billing')} />
        <QuickAction icon="person-add" label="Alta rápida" onPress={() => router.push('/(main)/enroll' as Href)} />
      </View>

      <SectionTitle>Aforo en vivo</SectionTitle>
      {error ? <Notice error>{error}</Notice> : null}
      <FloatingCard style={styles.occupancy}>
        {gym ? (
          <>
            <View style={styles.occupancyTop}>
              <Text style={[styles.occupancyCount, isFull && styles.full]}>{gym.count}</Text>
              <Text style={styles.occupancyCapacity}>{gym.capacity ? `de ${gym.capacity} personas` : 'personas dentro'}</Text>
            </View>
            {gym.capacity ? (
              <View style={styles.bar}>
                <View style={[styles.barFill, isFull && styles.barFull, { width: `${Math.min(100, Math.round((gym.count / gym.capacity) * 100))}%` }]} />
              </View>
            ) : null}
            {gym.people.slice(0, 8).map((person) => (
              <View key={person.id} style={styles.personRow}>
                <Text style={styles.personName}>{person.name}</Text>
                <Text style={styles.meta}>desde {formatTime(person.since)}</Text>
              </View>
            ))}
            {gym.people.length > 8 ? <Text style={styles.meta}>y {gym.people.length - 8} más</Text> : null}
          </>
        ) : !error ? <ActivityIndicator color={palette.green} /> : null}
      </FloatingCard>

      {recentScans.length ? (
        <>
          <SectionTitle>Últimos accesos</SectionTitle>
          <FloatingCard style={styles.list}>
            {recentScans.map((scan) => (
              <View key={scan.id} style={styles.personRow}>
                <View style={styles.flex}>
                  <Text style={styles.personName}>{scan.userName ?? 'Cliente'}</Text>
                  {scan.reason ? <Text style={styles.meta}>{scan.reason.message}</Text> : null}
                </View>
                <Text style={[styles.eventLabel, scan.event === 'denied' && styles.denied]}>{eventLabel[scan.event]} · {formatTime(scan.occurredAt)}</Text>
              </View>
            ))}
          </FloatingCard>
        </>
      ) : null}

      <SectionTitle>Pendientes en mostrador</SectionTitle>
      <View style={styles.counters}>
        <Counter label="Pagos por cobrar" value={counters?.payments} onPress={() => router.push('/(main)/billing')} />
        <Counter label="Pedidos por entregar" value={counters?.orders} onPress={() => router.push('/(main)/billing')} />
      </View>
      {isAdmin && maintenanceAlerts?.length ? (
        <Pressable accessibilityRole="button" onPress={() => router.push('/(main)/maintenance')}>
          <Notice error>{`${maintenanceAlerts.length} ${maintenanceAlerts.length === 1 ? 'alerta' : 'alertas'} de mantenimiento abiertas. Toca para atenderlas.`}</Notice>
        </Pressable>
      ) : null}
    </Page>
  );
}

function QuickAction({ icon, label, primary = false, onPress }: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  primary?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.action, primary && styles.actionPrimary, pressed && styles.pressed]}>
      <MaterialIcons name={icon} size={28} color={primary ? palette.white : palette.deepGreen} />
      <Text style={[styles.actionLabel, primary && styles.actionLabelPrimary]}>{label}</Text>
    </Pressable>
  );
}

function Counter({ label, value, onPress }: { label: string; value?: number; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.counterWrap, pressed && styles.pressed]}>
      <FloatingCard style={styles.counter}>
        <Text style={styles.counterValue}>{value ?? '—'}</Text>
        <Text style={styles.meta}>{label}</Text>
      </FloatingCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1, minHeight: 96, alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, backgroundColor: palette.white, borderWidth: 1, borderColor: '#E4E4E7', padding: 10 },
  actionPrimary: { backgroundColor: palette.deepGreen, borderColor: palette.deepGreen },
  actionLabel: { color: palette.ink, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  actionLabelPrimary: { color: palette.white },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  occupancy: { gap: 10, padding: 18 },
  occupancyTop: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  occupancyCount: { color: palette.green, fontSize: 44, fontWeight: '900' },
  full: { color: palette.danger },
  occupancyCapacity: { color: palette.muted, fontSize: 15, fontWeight: '700' },
  bar: { height: 8, borderRadius: 4, backgroundColor: '#E4E4E7', overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: palette.green },
  barFull: { backgroundColor: palette.danger },
  list: { gap: 2, paddingVertical: 6 },
  personRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: palette.line },
  personName: { color: palette.ink, fontSize: 14, fontWeight: '700' },
  meta: { color: palette.muted, fontSize: 12 },
  eventLabel: { color: palette.green, fontSize: 12, fontWeight: '800' },
  denied: { color: palette.danger },
  counters: { flexDirection: 'row', gap: 10 },
  counterWrap: { flex: 1 },
  counter: { gap: 4, padding: 16 },
  counterValue: { color: palette.ink, fontSize: 30, fontWeight: '900' },
});
