import { MaterialIcons } from '@expo/vector-icons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import AdminBillingScreen from './admin-billing-screen';
import { api, getApiErrorMessage } from './api';
import { useAuth } from './auth-context';
import { IconBadge } from './fit-ui';
import { palette } from './theme';
import { ActionButton, Notice, Page, SectionTitle, Surface } from './ui';

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

const membershipStatusLabels: Record<Membership['status'], string> = {
  pending: 'Pendiente',
  active: 'Activa',
  suspended: 'Suspendida',
  expired: 'Vencida',
};

function formatDate(value?: string) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Sin fecha' : date.toLocaleDateString();
}

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(amount);
}

export default function BillingScreen() {
  const { user } = useAuth();
  if (user?.role !== 'Cliente' && user?.role !== 'Admin') return <Redirect href="/(main)" />;
  return user.role === 'Admin' ? <AdminBillingScreen /> : <ClientMembership />;
}

function ClientMembership() {
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

  const pendingPayment = payments.find((payment) => payment.status === 'pending');

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
    const hasActiveMembership = user?.membership?.status === 'active'
      || membership?.status === 'active'
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
          <IconBadge name="arrow-back" color="#FFFFFF" />
        </Pressable>
        <View style={styles.clientHeaderText}>
          <Text style={styles.clientHeaderTitle}>Pago y membresía</Text>
          <Text style={styles.clientHeaderDetail}>Consulta tu plan y el estado de tus pagos.</Text>
        </View>
      </View>

      {isLoading ? <View style={styles.loading}><ActivityIndicator color={palette.green} size="large" /></View> : null}
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
            <IconBadge name="workspace-premium" color={palette.neon} size={48} />
            <View style={styles.planTitleRow}>
              <Text style={styles.planName}>{membership.planName ?? 'Plan por asignar'}</Text>
              <Text style={[styles.membershipStatus, membership.status === 'active' ? styles.membershipActive : membership.status === 'pending' ? styles.membershipPending : styles.membershipInactive]}>
                {membershipStatusLabels[membership.status]}
              </Text>
            </View>
            <Text style={styles.planPrice}>
              {typeof membership.price === 'number' ? `${formatAmount(membership.price, membership.currency ?? 'MXN')} / ${membership.durationDays ?? 30} días` : 'Consulta el precio con tu gimnasio'}
            </Text>
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
                  <MaterialIcons name="info-outline" size={20} color="#10FF85" />
                </View>
                <Text style={styles.paymentNoticeText}>El pago en línea aún no está conectado. Solicita una referencia y paga en recepción.</Text>
              </View>
              <ActionButton onPress={() => void requestPayment()} disabled={isRequesting || !membership.planName || typeof membership.price !== 'number'}>
                {isRequesting ? <ActivityIndicator color={palette.white} /> : 'Solicitar pago en recepción'}
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

const styles = StyleSheet.create({
  clientHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#27272A' },
  clientBackButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  clientHeaderText: { flex: 1, gap: 4 },
  clientHeaderTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  clientHeaderDetail: { color: '#A1A1AA', fontSize: 13 },
  loading: { minHeight: 120, alignItems: 'center', justifyContent: 'center' },
  feedback: { gap: 10 },
  retry: { color: '#10FF85', fontSize: 14, fontWeight: '800', paddingVertical: 6 },
  planCard: { gap: 14, backgroundColor: '#18181B', borderColor: '#27272A', borderRadius: 16, padding: 22, shadowColor: '#000000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.24, shadowRadius: 18, elevation: 5 },
  planEyebrow: { color: '#10FF85', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  planTitleRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  planName: { flex: 1, minWidth: 160, color: '#FFFFFF', fontSize: 22, lineHeight: 27, fontWeight: '900' },
  membershipStatus: { fontSize: 11, fontWeight: '900', borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5, overflow: 'hidden' },
  membershipActive: { color: '#081009', backgroundColor: '#10FF85', borderColor: '#10FF85' },
  membershipPending: { color: '#F7C948', backgroundColor: '#F7C94818', borderColor: '#F7C948' },
  membershipInactive: { color: '#A1A1AA', backgroundColor: '#27272A', borderColor: '#3F3F46' },
  planPrice: { color: '#FFFFFF', fontSize: 16, lineHeight: 22, fontWeight: '800' },
  dateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 24, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#27272A' },
  dateItem: { gap: 4 },
  dateLabel: { color: '#A1A1AA', fontSize: 11, fontWeight: '700' },
  dateValue: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  pendingCard: { gap: 8, borderWidth: 1, borderColor: '#27272A', borderRadius: 16, backgroundColor: '#1E1E1E', padding: 20 },
  pendingTitle: { color: palette.ink, fontSize: 15, fontWeight: '800' },
  pendingBody: { color: palette.muted, fontSize: 13 },
  reference: { color: palette.green, fontSize: 22, fontWeight: '900' },
  pin: { color: palette.orange, fontSize: 44, fontWeight: '900', letterSpacing: 10 },
  referenceSmall: { color: palette.green, fontSize: 12, fontWeight: '800' },
  paymentAmount: { color: palette.ink, fontSize: 14, fontWeight: '800' },
  clientPendingTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  clientPendingBody: { color: '#A1A1AA', fontSize: 13 },
  clientPaymentAmount: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  clientHistoryName: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  clientHistoryMeta: { color: '#A1A1AA', fontSize: 11 },
  paymentAction: { gap: 10 },
  paymentNotice: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#27272A', borderRadius: 12, backgroundColor: '#1E1E1E', padding: 14 },
  paymentNoticeIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: '#10FF8512' },
  paymentNoticeText: { flex: 1, color: '#A1A1AA', fontSize: 13, lineHeight: 19 },
  helper: { color: '#A1A1AA', fontSize: 12, lineHeight: 17 },
  historyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: '#27272A', backgroundColor: '#1E1E1E' },
  historyInfo: { flex: 1, gap: 4 },
  historyName: { color: palette.ink, fontSize: 14, fontWeight: '800' },
  historyMeta: { color: palette.muted, fontSize: 11 },
  historyAmount: { alignItems: 'flex-end', gap: 4 },
  historyStatus: { fontSize: 10, fontWeight: '900', borderRadius: 999, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4, overflow: 'hidden' },
  historyPaid: { color: '#081009', backgroundColor: '#10FF85', borderColor: '#10FF85' },
  historyPending: { color: '#F7C948', backgroundColor: '#F7C94818', borderColor: '#F7C948' },
  historyCancelled: { color: '#FF8A80', backgroundColor: '#FF8A8018', borderColor: '#FF8A80' },
  adminPayment: { gap: 10 },
  adminPaymentDetails: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  filterChip: { minHeight: 36, justifyContent: 'center', borderWidth: 1, borderColor: palette.line, borderRadius: 7, backgroundColor: palette.surface, paddingHorizontal: 10, paddingVertical: 6 },
  filterSelected: { backgroundColor: palette.deepGreen, borderColor: palette.deepGreen },
  filterText: { color: palette.ink, fontSize: 11, fontWeight: '700' },
  filterTextSelected: { color: palette.white },
  paymentState: { color: palette.coral, fontSize: 12, fontWeight: '800' },
});
