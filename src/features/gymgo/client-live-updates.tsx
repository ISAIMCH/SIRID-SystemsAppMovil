import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { connectSocket } from '@/services/socket';

import { useAuth } from './auth-context';
import { makeStyles } from '@/theme/make-styles';
import { useTheme } from '@/theme/theme-provider';

export type AccessResult = {
  id: string;
  event: 'check-in' | 'check-out' | 'denied';
  occurredAt: string;
  gymId: string;
  userId: string;
  userName?: string;
  reason?: { code: string; message: string };
};

type PaymentUpdate = { action: 'created' | 'updated' | 'redeemed' | 'deleted'; payment?: { status?: string; planName?: string } };
type DirectoryUpdate = { action: string; userId: string };
type MaintenanceUpdate = {
  action: 'created' | 'updated';
  report: { status: 'pending' | 'in_progress' | 'resolved'; equipment?: { name?: string }; adminNote?: string };
};

type Banner = { tone: 'success' | 'error' | 'info'; title: string; detail?: string };

const BANNER_MS = 5000;

export function accessResultCopy(result: AccessResult): Banner {
  if (result.event === 'check-in') return { tone: 'success', title: '¡Bienvenido! Entrada registrada', detail: 'Que tengas un gran entrenamiento.' };
  if (result.event === 'check-out') return { tone: 'info', title: 'Salida registrada', detail: 'Buen trabajo hoy. ¡Hasta la próxima!' };
  return { tone: 'error', title: 'Acceso rechazado', detail: result.reason?.message ?? 'Acude a recepción para más información.' };
}

// Calls `onResult` when a reader or reception scans this client's QR (entry, exit or refusal).
export function useAccessResult(onResult: (result: AccessResult) => void) {
  const { user } = useAuth();
  const handler = useRef(onResult);
  useEffect(() => { handler.current = onResult; });

  useEffect(() => {
    if (!user?.id) return undefined;
    const socket = connectSocket();
    const onRecorded = (result: AccessResult) => {
      if (result.userId === user.id) handler.current(result);
    };
    socket.on('access:recorded', onRecorded);
    return () => { socket.off('access:recorded', onRecorded); };
  }, [user?.id]);
}

const maintenanceStatus = { pending: 'Pendiente', in_progress: 'En revisión', resolved: 'Resuelto' } as const;

// Keeps the client's session in step with what reception and the gym do from the dashboard, and tells them:
// payments and membership changes refresh the session; scans and report updates show a short banner.
export default function ClientLiveUpdates() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { user, refreshSession } = useAuth();
  const insets = useSafeAreaInsets();
  const [banner, setBanner] = useState<Banner | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshRef = useRef(refreshSession);
  useEffect(() => { refreshRef.current = refreshSession; });

  function show(next: Banner) {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setBanner(next);
    hideTimer.current = setTimeout(() => setBanner(null), BANNER_MS);
  }

  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  useAccessResult((result) => show(accessResultCopy(result)));

  useEffect(() => {
    if (!user?.id) return undefined;
    const socket = connectSocket();
    const refresh = () => { refreshRef.current().catch(() => undefined); };

    const onPayment = (update: PaymentUpdate) => {
      refresh();
      const status = update.payment?.status;
      if (status === 'paid' && update.action !== 'created') {
        show({ tone: 'success', title: 'Pago confirmado', detail: 'Tu membresía ya está actualizada.' });
      } else if (status === 'paid') {
        show({ tone: 'success', title: 'Pago registrado', detail: update.payment?.planName ? `Plan ${update.payment.planName}.` : undefined });
      } else if (status === 'cancelled') {
        show({ tone: 'error', title: 'Solicitud de pago cancelada', detail: 'Recepción canceló tu solicitud.' });
      }
    };
    const onDirectory = (update: DirectoryUpdate) => {
      if (update.userId === user.id) refresh();
    };
    const onMaintenance = (update: MaintenanceUpdate) => {
      if (update.action !== 'updated') return;
      const equipment = update.report.equipment?.name ?? 'el equipo';
      show({
        tone: update.report.status === 'resolved' ? 'success' : 'info',
        title: `Tu reporte de ${equipment}: ${maintenanceStatus[update.report.status]}`,
        detail: update.report.adminNote || undefined,
      });
    };

    socket.on('payment-updated', onPayment);
    socket.on('directory-updated', onDirectory);
    socket.on('maintenance-updated', onMaintenance);
    return () => {
      socket.off('payment-updated', onPayment);
      socket.off('directory-updated', onDirectory);
      socket.off('maintenance-updated', onMaintenance);
    };
  }, [user?.id]);

  if (!banner) return null;
  const icon = banner.tone === 'success' ? 'check-circle' : banner.tone === 'error' ? 'error-outline' : 'info-outline';
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + 8 }]}>
      <Pressable
        accessibilityRole="alert"
        accessibilityLabel={`${banner.title}. ${banner.detail ?? ''}`}
        onPress={() => setBanner(null)}
        style={[styles.banner, banner.tone === 'error' && styles.errorBanner]}>
        <MaterialIcons name={icon} size={22} color={banner.tone === 'error' ? colors.danger : colors.accent} />
        <View style={styles.text}>
          <Text style={styles.title}>{banner.title}</Text>
          {banner.detail ? <Text style={styles.detail}>{banner.detail}</Text> : null}
        </View>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  wrap: { position: 'absolute', left: 16, right: 16, zIndex: 50, alignItems: 'center' },
  banner: {
    width: '100%',
    maxWidth: 560,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 12,
  },
  errorBanner: { borderColor: colors.danger },
  text: { flex: 1, gap: 2 },
  title: { color: colors.text, fontSize: 14, fontWeight: '800' },
  detail: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
}));
