import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';

import { api, getApiErrorMessage } from './api';
import { useAuth } from './auth-context';
import { ActionButton, AppHeader, Notice, Page, SectionTitle, Surface } from './ui';
import { palette } from './theme';

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
  return user.role === 'Admin' ? <AdminPayments /> : <ClientMembership />;
}

function ClientMembership() {
  const [membership, setMembership] = useState<Membership | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRequesting, setIsRequesting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [retryNumber, setRetryNumber] = useState(0);

  useEffect(() => {
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
  }, [retryNumber]);

  const pendingPayment = payments.find((payment) => payment.status === 'pending');

  async function requestPayment() {
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

  return (
    <Page>
      <AppHeader title="Pago y membresía" detail="Consulta tu plan y el estado de tus pagos." />

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
            <View style={styles.planTitleRow}>
              <Text style={styles.planName}>{membership.planName ?? 'Plan por asignar'}</Text>
              <Text style={[styles.membershipStatus, membership.status === 'active' && styles.paidStatus]}>
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
              <Text style={styles.pendingTitle}>Solicitud pendiente</Text>
              <Text style={styles.pendingBody}>Paga en recepción y muestra esta referencia:</Text>
              <Text selectable style={styles.reference}>{pendingPayment.reference}</Text>
              <Text style={styles.paymentAmount}>{formatAmount(pendingPayment.amount, pendingPayment.currency)}</Text>
            </Surface>
          ) : (
            <View style={styles.paymentAction}>
              {success ? <Notice>{success}</Notice> : null}
              <Notice>El pago en línea aún no está conectado. Puedes solicitar una referencia y pagar en recepción.</Notice>
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
                <Text style={styles.historyName}>{payment.planName}</Text>
                <Text style={styles.historyMeta}>{formatDate(payment.createdAt)} · {payment.reference}</Text>
              </View>
              <View style={styles.historyAmount}>
                <Text style={styles.paymentAmount}>{formatAmount(payment.amount, payment.currency)}</Text>
                <Text style={[styles.historyStatus, payment.status === 'paid' && styles.paidStatus]}>
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

function AdminPayments() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | PaymentStatus>('pending');
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [retryNumber, setRetryNumber] = useState(0);

  useEffect(() => {
    let isCurrent = true;
    api.get<{ payments: Payment[] }>('/billing/payments', {
      params: statusFilter === 'all' ? {} : { status: statusFilter },
    })
      .then((response) => {
        if (isCurrent) setPayments(response.data.payments);
      })
      .catch((requestError: unknown) => {
        if (isCurrent) setError(getApiErrorMessage(requestError, 'No se pudieron cargar los pagos pendientes.'));
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });
    return () => { isCurrent = false; };
  }, [retryNumber, statusFilter]);

  async function processPayment(payment: Payment, status: 'paid' | 'cancelled') {
    setError('');
    setUpdatingId(payment.id);
    try {
      await api.patch(`/billing/payments/${payment.id}/status`, { status });
      setPayments((current) => current.map((entry) => (
        entry.id === payment.id ? { ...entry, status } : entry
      )));
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No se pudo actualizar el pago.'));
    } finally {
      setUpdatingId(null);
    }
  }

  const visiblePayments = statusFilter === 'all'
    ? payments
    : payments.filter((payment) => payment.status === statusFilter);

  return (
    <Page>
      <AppHeader title="Pagos y membresías" detail="Confirma los pagos recibidos en el gimnasio." />
      <View style={styles.filterRow}>
        {([
          { value: 'pending', label: 'Pendientes' },
          { value: 'paid', label: 'Pagados' },
          { value: 'cancelled', label: 'Cancelados' },
          { value: 'all', label: 'Todos' },
        ] as const).map((filter) => (
          <Pressable
            key={filter.value}
            accessibilityRole="button"
            accessibilityState={{ selected: statusFilter === filter.value }}
            onPress={() => {
              setError('');
              setIsLoading(true);
              setStatusFilter(filter.value);
            }}
            style={[styles.filterChip, statusFilter === filter.value && styles.filterSelected]}>
            <Text style={[styles.filterText, statusFilter === filter.value && styles.filterTextSelected]}>{filter.label}</Text>
          </Pressable>
        ))}
      </View>
      <SectionTitle>{isLoading ? 'Cargando solicitudes' : `${visiblePayments.length} pagos`}</SectionTitle>
      {isLoading ? <View style={styles.loading}><ActivityIndicator color={palette.green} size="large" /></View> : null}
      {error ? (
        <View style={styles.feedback}>
          <Notice error>{error}</Notice>
          <Pressable accessibilityRole="button" onPress={() => { setIsLoading(true); setRetryNumber((value) => value + 1); }}>
            <Text style={styles.retry}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}
      {!isLoading && !error && visiblePayments.length === 0 ? (
        <Notice>{statusFilter === 'pending' ? 'No hay pagos pendientes de revisión.' : 'No hay pagos para este filtro.'}</Notice>
      ) : null}
      {visiblePayments.map((payment) => {
        const customerName = typeof payment.user === 'string' ? 'Cliente' : payment.user.name;
        const customerEmail = typeof payment.user === 'string' ? '' : payment.user.email;
        return (
          <Surface key={payment.id} style={styles.adminPayment}>
            <Text style={styles.historyName}>{customerName}</Text>
            {customerEmail ? <Text style={styles.historyMeta}>{customerEmail}</Text> : null}
            <View style={styles.adminPaymentDetails}>
              <View style={styles.historyInfo}>
                <Text style={styles.historyMeta}>{payment.planName} · {payment.durationDays} días</Text>
                <Text selectable style={styles.referenceSmall}>{payment.reference}</Text>
              </View>
              <Text style={styles.paymentAmount}>{formatAmount(payment.amount, payment.currency)}</Text>
            </View>
            <Text style={[styles.paymentState, payment.status === 'paid' && styles.historyStatus]}>
              {paymentStatusLabels[payment.status]}
            </Text>
            {payment.status === 'pending' ? (
              <View style={styles.actions}>
                <ActionButton onPress={() => void processPayment(payment, 'paid')} disabled={updatingId === payment.id}>
                  {updatingId === payment.id ? <ActivityIndicator color={palette.white} /> : 'Confirmar pago'}
                </ActionButton>
                <ActionButton secondary onPress={() => void processPayment(payment, 'cancelled')} disabled={updatingId === payment.id}>
                  Cancelar solicitud
                </ActionButton>
              </View>
            ) : null}
          </Surface>
        );
      })}
    </Page>
  );
}

const styles = StyleSheet.create({
  loading: { minHeight: 120, alignItems: 'center', justifyContent: 'center' },
  feedback: { gap: 10 },
  retry: { color: palette.green, fontSize: 14, fontWeight: '800', paddingVertical: 6 },
  planCard: { gap: 12, backgroundColor: palette.deepGreen, borderColor: palette.deepGreen },
  planEyebrow: { color: palette.lime, fontSize: 10, fontWeight: '800' },
  planTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  planName: { flex: 1, color: palette.white, fontSize: 21, fontWeight: '800' },
  membershipStatus: { color: palette.lime, fontSize: 12, fontWeight: '800' },
  paidStatus: { color: palette.green },
  planPrice: { color: palette.white, fontSize: 15, fontWeight: '700' },
  dateRow: { flexDirection: 'row', gap: 24, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#49665D' },
  dateItem: { gap: 4 },
  dateLabel: { color: '#C4D2C6', fontSize: 11 },
  dateValue: { color: palette.white, fontSize: 13, fontWeight: '700' },
  pendingCard: { gap: 8, borderColor: '#D6DDAA', backgroundColor: '#F6F7E9' },
  pendingTitle: { color: palette.ink, fontSize: 15, fontWeight: '800' },
  pendingBody: { color: palette.muted, fontSize: 13 },
  reference: { color: palette.green, fontSize: 22, fontWeight: '900' },
  referenceSmall: { color: palette.green, fontSize: 12, fontWeight: '800' },
  paymentAmount: { color: palette.ink, fontSize: 14, fontWeight: '800' },
  paymentAction: { gap: 10 },
  helper: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  historyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: 14 },
  historyInfo: { flex: 1, gap: 4 },
  historyName: { color: palette.ink, fontSize: 14, fontWeight: '800' },
  historyMeta: { color: palette.muted, fontSize: 11 },
  historyAmount: { alignItems: 'flex-end', gap: 4 },
  historyStatus: { color: palette.coral, fontSize: 11, fontWeight: '700' },
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