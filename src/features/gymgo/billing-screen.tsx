import { MaterialIcons } from '@expo/vector-icons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';

import { connectSocket } from '@/services/socket';

import { api, getApiErrorMessage } from './api';
import { useAuth } from './auth-context';
import CashierScreen from './cashier-screen';
import { IconBadge } from './fit-ui';
import { membershipDisplayStatus, membershipStatusLabels } from './membership-status';
import { ActionButton, Notice, Page, SectionTitle, Surface } from './ui';
import { ProgressBar } from '@/components/sirid';
import { makeStyles } from '@/theme/make-styles';
import { useTheme } from '@/theme/theme-provider';

type PaymentStatus = 'pending' | 'paid' | 'cancelled';
type PaymentUser = { id: string; name: string; email: string } | string;
type Payment = {
  id: string;
  user: PaymentUser;
  planName: string;
  amount: number;
  currency: string;
  durationDays: number;
  method: 'reception';
  status: PaymentStatus;
  reference: string;
  validationPin?: string;
  createdAt: string;
  processedAt?: string;
};
type Membership = {
  status: 'pending' | 'active' | 'suspended' | 'expired';
  startsAt?: string;
  expiresAt?: string;
  planName?: string;
  price?: number;
  currency?: string;
  durationDays?: number;
  planType?: 'standard' | 'promotional';
  autoRenew?: boolean;
};

const paymentStatusLabels: Record<PaymentStatus, string> = {
  pending: 'Pendiente',
  paid: 'Pagado',
  cancelled: 'Cancelado',
};

function formatDate(value?: string) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Sin fecha' : date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(amount);
}

export default function BillingScreen() {
  const { user } = useAuth();
  if (user?.role === 'Admin' || user?.role === 'Recepcion') return <CashierScreen />;
  if (user?.role !== 'Cliente') return <Redirect href="/(main)" />;
  return <ClientMembership />;
}

function ClientMembership() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { user } = useAuth();
  const [membership, setMembership] = useState<Membership | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRequesting, setIsRequesting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [retryNumber, setRetryNumber] = useState(0);

  useFocusEffect(useCallback(() => {
    let isCurrent = true;
    api.get<{ membership: Membership; payments: Payment[] }>('/billing/me')
      .then((response) => {
        if (!isCurrent) return;
        setMembership(response.data.membership);
        setPayments(response.data.payments);
      })
      .catch((requestError: unknown) => {
        if (isCurrent) setError(getApiErrorMessage(requestError, 'No se pudo cargar tu membresía.'));
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });
    return () => { isCurrent = false; };
  // retryNumber is a manual "reintentar" trigger.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryNumber]));

  // Reception confirms or cancels the payment from the dashboard: reload so the PIN and status update here.
  useEffect(() => {
    const socket = connectSocket();
    const reload = () => setRetryNumber((current) => current + 1);
    socket.on('payment-updated', reload);
    socket.on('directory-updated', reload);
    return () => {
      socket.off('payment-updated', reload);
      socket.off('directory-updated', reload);
    };
  }, []);

  const pendingPayment = payments.find((payment) => payment.status === 'pending');
  const membershipStatus = membershipDisplayStatus(membership);

  async function createPaymentRequest() {
    setError('');
    setSuccess('');
    setIsRequesting(true);
    try {
      const response = await api.post<{ payment: Payment }>('/billing/payments', { method: 'reception' });
      setPayments((current) => [response.data.payment, ...current]);
      setSuccess('Solicitud creada. Presenta la referencia en recepción para realizar el pago.');
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No se pudo crear la solicitud de pago.'));
    } finally {
      setIsRequesting(false);
    }
  }

  function requestPayment() {
    const userMembershipExpiresAt = user?.membership?.expiresAt ? new Date(user.membership.expiresAt).getTime() : 0;
    const membershipExpiresAt = membership?.expiresAt ? new Date(membership.expiresAt).getTime() : 0;
    const hasActiveMembership = membershipDisplayStatus(user?.membership) === 'active'
      || membershipDisplayStatus(membership) === 'active'
      || userMembershipExpiresAt > Date.now()
      || membershipExpiresAt > Date.now();

    if (!hasActiveMembership) {
      void createPaymentRequest();
      return;
    }

    Alert.alert(
      'Membresía Activa',
      'Ya tienes una membresía activa. ¿Estás seguro de que deseas adelantar el pago del siguiente mes?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Sí, adelantar pago', onPress: () => { void createPaymentRequest(); } },
      ],
    );
  }

  return (
    <Page dark>
      <View style={styles.clientHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver al perfil"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => { if (router.canGoBack()) { router.back(); } else { router.push('/(main)/billing'); } }}
          style={styles.clientBackButton}>
          <IconBadge name="arrow-back" color={colors.text} />
        </Pressable>
        <View style={styles.clientHeaderText}>
          <Text style={styles.clientHeaderTitle}>Pago y membresía</Text>
          <Text style={styles.clientHeaderDetail}>Consulta tu plan y el estado de tus pagos.</Text>
        </View>
      </View>

      {isLoading ? <View style={styles.loading}><ActivityIndicator color={colors.accent} size="large" /></View> : null}
      {error ? (
        <View style={styles.feedback}>
          <Notice error>{error}</Notice>
          <Pressable accessibilityRole="button" onPress={() => { setIsLoading(true); setRetryNumber((value) => value + 1); }}>
            <Text style={styles.retry}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}

      {!isLoading && !error && membership ? (
        <>
          <Surface style={styles.planCard}>
            <Text style={styles.planEyebrow}>PLAN ACTUAL</Text>
            <IconBadge name="workspace-premium" color={colors.accent} size={48} />
            <View style={styles.planTitleRow}>
              <Text style={styles.planName}>{membership.planName ?? 'Plan por asignar'}</Text>
              <Text style={[styles.membershipStatus, membershipStatus === 'active' ? styles.membershipActive : membershipStatus === 'pending' ? styles.membershipPending : styles.membershipInactive]}>
                {membershipStatusLabels[membershipStatus]}
              </Text>
            </View>
            <Text style={styles.planPrice}>
              {typeof membership.price === 'number' ? `${formatAmount(membership.price, membership.currency ?? 'MXN')} / ${membership.durationDays ?? 30} días` : 'Consulta el precio con tu gimnasio'}
            </Text>
            <MembershipTimeline startsAt={membership.startsAt} expiresAt={membership.expiresAt} />
            <View style={styles.dateRow}>
              <View style={styles.dateItem}>
                <Text style={styles.dateLabel}>Inicio</Text>
                <Text style={styles.dateValue}>{formatDate(membership.startsAt)}</Text>
              </View>
              <View style={styles.dateItem}>
                <Text style={styles.dateLabel}>Vencimiento</Text>
                <Text style={styles.dateValue}>{formatDate(membership.expiresAt)}</Text>
              </View>
            </View>
          </Surface>

          <SectionTitle>Realizar un pago</SectionTitle>
          {pendingPayment ? (
            <Surface style={styles.pendingCard}>
              <Text style={styles.clientPendingTitle}>Solicitud pendiente</Text>
              <Text style={styles.clientPendingBody}>Paga en recepción y dicta este PIN al encargado:</Text>
              <Text selectable style={styles.pin}>{pendingPayment.validationPin ?? '-----'}</Text>
              <Text style={styles.clientPendingBody}>Referencia: {pendingPayment.reference}</Text>
              <Text style={styles.clientPaymentAmount}>{formatAmount(pendingPayment.amount, pendingPayment.currency)}</Text>
            </Surface>
          ) : (
            <View style={styles.paymentAction}>
              {success ? <Notice>{success}</Notice> : null}
              <View style={styles.paymentNotice}>
                <View style={styles.paymentNoticeIcon}>
                  <MaterialIcons name="info-outline" size={20} color={colors.accent} />
                </View>
                <Text style={styles.paymentNoticeText}>El pago en línea aún no está conectado. Solicita una referencia y paga en recepción.</Text>
              </View>
              <ActionButton onPress={() => void requestPayment()} disabled={isRequesting || !membership.planName || typeof membership.price !== 'number'}>
                {isRequesting ? <ActivityIndicator color={colors.text} /> : 'Solicitar pago en recepción'}
              </ActionButton>
              {!membership.planName || typeof membership.price !== 'number' ? (
                <Text style={styles.helper}>El administrador debe asignar un plan y precio antes de solicitar el pago.</Text>
              ) : null}
            </View>
          )}

          <SectionTitle>Historial de pagos</SectionTitle>
          {payments.length === 0 ? <Notice>Aún no hay pagos registrados.</Notice> : null}
          {payments.map((payment) => (
            <Surface key={payment.id} style={styles.historyRow}>
              <View style={styles.historyInfo}>
                <Text style={styles.clientHistoryName}>{payment.planName}</Text>
                <Text style={styles.clientHistoryMeta}>{formatDate(payment.createdAt)} · {payment.reference}</Text>
              </View>
              <View style={styles.historyAmount}>
                <Text style={styles.clientPaymentAmount}>{formatAmount(payment.amount, payment.currency)}</Text>
                <Text style={[styles.historyStatus, payment.status === 'paid' ? styles.historyPaid : payment.status === 'pending' ? styles.historyPending : styles.historyCancelled]}>
                  {paymentStatusLabels[payment.status]}
                </Text>
              </View>
            </Surface>
          ))}
        </>
      ) : null}
    </Page>
  );
}

// Days left on the current plan, from the real start/expiry dates.
function MembershipTimeline({ startsAt, expiresAt }: { startsAt?: string; expiresAt?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [now] = useState(() => Date.now());
  const start = startsAt ? new Date(startsAt).getTime() : NaN;
  const end = expiresAt ? new Date(expiresAt).getTime() : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const daysLeft = Math.max(0, Math.ceil((end - now) / 86400000));
  const elapsed = Math.min(1, Math.max(0, (now - start) / (end - start)));
  const tone = daysLeft === 0 ? colors.danger : daysLeft <= 7 ? colors.warning : colors.accentFill;
  return (
    <View style={styles.timeline}>
      <View style={styles.timelineHead}>
        <Text style={styles.timelineValue}>{daysLeft}</Text>
        <Text style={styles.timelineLabel}>{daysLeft === 1 ? 'día restante' : 'días restantes'}</Text>
      </View>
      <ProgressBar value={1 - elapsed} color={tone} height={8} />
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  timeline: { gap: 8, marginTop: 4 },
  timelineHead: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  timelineValue: { color: colors.text, fontSize: 34, lineHeight: 38, fontWeight: '800', fontFamily: 'display' },
  timelineLabel: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  clientHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  clientBackButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  clientHeaderText: { flex: 1, gap: 4 },
  clientHeaderTitle: { color: colors.text, fontSize: 22, fontWeight: '800' },
  clientHeaderDetail: { color: colors.textSecondary, fontSize: 13 },
  loading: { minHeight: 120, alignItems: 'center', justifyContent: 'center' },
  feedback: { gap: 10 },
  retry: { color: colors.accent, fontSize: 14, fontWeight: '800', paddingVertical: 6 },
  planCard: { gap: 14, backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 16, padding: 22, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.24, shadowRadius: 18, elevation: 5 },
  planEyebrow: { color: colors.accent, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  planTitleRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  planName: { flex: 1, minWidth: 160, color: colors.text, fontSize: 22, lineHeight: 27, fontWeight: '900' },
  membershipStatus: { fontSize: 12, fontWeight: '900', borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5, overflow: 'hidden' },
  membershipActive: { color: colors.onAccentFill, backgroundColor: colors.accentFill, borderColor: colors.accent },
  membershipPending: { color: colors.warning, backgroundColor: colors.warningSoft, borderColor: colors.warning },
  membershipInactive: { color: colors.textSecondary, backgroundColor: colors.surfaceRaised, borderColor: colors.borderStrong },
  planPrice: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: '800' },
  dateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 24, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  dateItem: { gap: 4 },
  dateLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  dateValue: { color: colors.text, fontSize: 13, fontWeight: '800' },
  pendingCard: { gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.surface, padding: 20 },
  pendingTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  pendingBody: { color: colors.textSecondary, fontSize: 13 },
  reference: { color: colors.accent, fontSize: 22, fontWeight: '900' },
  pin: { color: colors.warning, fontSize: 44, fontWeight: '900', letterSpacing: 10 },
  referenceSmall: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  paymentAmount: { color: colors.text, fontSize: 14, fontWeight: '800' },
  clientPendingTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  clientPendingBody: { color: colors.textSecondary, fontSize: 13 },
  clientPaymentAmount: { color: colors.text, fontSize: 14, fontWeight: '800' },
  clientHistoryName: { color: colors.text, fontSize: 14, fontWeight: '800' },
  clientHistoryMeta: { color: colors.textSecondary, fontSize: 12 },
  paymentAction: { gap: 10 },
  paymentNotice: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface, padding: 14 },
  paymentNoticeIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: colors.accentSoft },
  paymentNoticeText: { flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  helper: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  historyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  historyInfo: { flex: 1, gap: 4 },
  historyName: { color: colors.text, fontSize: 14, fontWeight: '800' },
  historyMeta: { color: colors.textSecondary, fontSize: 12 },
  historyAmount: { alignItems: 'flex-end', gap: 4 },
  historyStatus: { fontSize: 12, fontWeight: '900', borderRadius: 999, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4, overflow: 'hidden' },
  historyPaid: { color: colors.onAccentFill, backgroundColor: colors.accentFill, borderColor: colors.accent },
  historyPending: { color: colors.warning, backgroundColor: colors.warningSoft, borderColor: colors.warning },
  historyCancelled: { color: colors.danger, backgroundColor: colors.dangerSoft, borderColor: colors.danger },
  adminPayment: { gap: 10 },
  adminPaymentDetails: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  filterChip: { minHeight: 36, justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 7, backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 6 },
  filterSelected: { backgroundColor: colors.hero, borderColor: colors.accent },
  filterText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  filterTextSelected: { color: colors.text },
  paymentState: { color: colors.danger, fontSize: 12, fontWeight: '800' },
}));
