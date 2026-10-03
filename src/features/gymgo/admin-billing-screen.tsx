import { MaterialIcons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { api, getApiErrorMessage } from './api';
import { FloatingCard, IconBadge } from './fit-ui';
import { palette } from './theme';
import { ActionButton, AppHeader, Notice, Page, SectionTitle } from './ui';

type PaymentStatus = 'pending' | 'paid' | 'cancelled';
type Payment = {
  id: string;
  user: { id: string; name: string; email: string } | string;
  planName: string;
  amount: number;
  currency: string;
  durationDays: number;
  status: PaymentStatus;
  reference: string;
  createdAt: string;
};

const statusLabels: Record<PaymentStatus, string> = { pending: 'Pendiente', paid: 'Pagado', cancelled: 'Cancelado' };
const statusColors: Record<PaymentStatus, string> = { pending: palette.orange, paid: palette.neon, cancelled: palette.danger };

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(amount);
}

function customerOf(payment: Payment) {
  return typeof payment.user === 'string' ? { name: 'Cliente', email: '' } : payment.user;
}

export default function AdminBillingScreen() {
  const [pin, setPin] = useState('');
  const [found, setFound] = useState<Payment | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [pinError, setPinError] = useState('');
  const [confirmed, setConfirmed] = useState('');

  const [payments, setPayments] = useState<Payment[]>([]);
  const [filter, setFilter] = useState<'pending' | 'paid' | 'all'>('pending');
  const [isLoading, setIsLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isCurrent = true;
    api.get<{ payments: Payment[] }>('/billing/payments', { params: filter === 'all' ? {} : { status: filter } })
      .then((response) => {
        if (isCurrent) {
          setPayments(response.data.payments);
          setListError('');
        }
      })
      .catch((requestError: unknown) => {
        if (isCurrent) setListError(getApiErrorMessage(requestError, 'No se pudieron cargar los pagos.'));
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });
    return () => { isCurrent = false; };
  }, [filter, reloadKey]);

  async function searchPin() {
    setConfirmed('');
    setFound(null);
    if (!/^\d{5}$/.test(pin)) {
      setPinError('Ingresa un PIN de 5 dígitos.');
      return;
    }
    setPinError('');
    setIsSearching(true);
    try {
      const response = await api.get<{ payment: Payment }>(`/billing/payments/pin/${pin}`);
      setFound(response.data.payment);
    } catch (requestError) {
      setPinError(getApiErrorMessage(requestError, 'No se pudo buscar el PIN.'));
    } finally {
      setIsSearching(false);
    }
  }

  async function confirmCash() {
    if (!found) return;
    setIsConfirming(true);
    setPinError('');
    try {
      await api.patch(`/billing/payments/${found.id}/status`, { status: 'paid' });
      setConfirmed(`Pago de ${customerOf(found).name} confirmado.`);
      setFound(null);
      setPin('');
      setIsLoading(true);
      setReloadKey((value) => value + 1);
    } catch (requestError) {
      setPinError(getApiErrorMessage(requestError, 'No se pudo confirmar el pago.'));
    } finally {
      setIsConfirming(false);
    }
  }

  async function cancelPayment(payment: Payment) {
    setListError('');
    try {
      await api.patch(`/billing/payments/${payment.id}/status`, { status: 'cancelled' });
      setIsLoading(true);
      setReloadKey((value) => value + 1);
    } catch (requestError) {
      setListError(getApiErrorMessage(requestError, 'No se pudo cancelar la solicitud.'));
    }
  }

  return (
    <Page>
      <AppHeader title="Cobros en recepción" detail="Valida el PIN que te muestra el cliente." />

      <Pressable accessibilityRole="button" onPress={() => router.push('/(main)/plans' as Href)} style={styles.plansLink}>
        <FloatingCard style={styles.plansCard}>
          <IconBadge name="workspace-premium" color={palette.violet} />
          <Text style={styles.plansText}>Planes de membresía</Text>
          <MaterialIcons name="chevron-right" size={22} color={palette.muted} />
        </FloatingCard>
      </Pressable>

      <FloatingCard style={styles.pinCard}>
        <View style={styles.pinHeader}>
          <IconBadge name="pin" color={palette.cyan} />
          <Text style={styles.pinTitle}>Buscar por PIN</Text>
        </View>
        <View style={styles.searchRow}>
          <TextInput
            keyboardType="number-pad"
            maxLength={5}
            value={pin}
            onChangeText={(value) => { setPin(value.replace(/\D/g, '')); setPinError(''); }}
            onSubmitEditing={() => void searchPin()}
            placeholder="00000"
            placeholderTextColor={palette.muted}
            style={styles.pinInput}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Buscar PIN"
            disabled={isSearching || pin.length !== 5}
            onPress={() => void searchPin()}
            style={[styles.searchButton, (isSearching || pin.length !== 5) && styles.disabled]}>
            {isSearching ? <ActivityIndicator color={palette.deepGreen} /> : <MaterialIcons name="search" size={26} color={palette.deepGreen} />}
          </Pressable>
        </View>
        {pinError ? <Notice error>{pinError}</Notice> : null}
        {confirmed ? <Notice>{confirmed}</Notice> : null}

        {found ? (
          <View style={styles.result}>
            <Text style={styles.resultLabel}>Cliente</Text>
            <Text style={styles.resultName}>{customerOf(found).name}</Text>
            <Text style={styles.resultLabel}>Monto a cobrar</Text>
            <Text style={styles.resultAmount}>{formatAmount(found.amount, found.currency)}</Text>
            <Text style={styles.resultPlan}>{found.planName} · {found.durationDays} días</Text>
            <ActionButton onPress={() => void confirmCash()} disabled={isConfirming}>
              {isConfirming ? <ActivityIndicator color={palette.white} /> : 'Confirmar recepción de efectivo'}
            </ActionButton>
          </View>
        ) : null}
      </FloatingCard>

      <SectionTitle>Solicitudes de pago</SectionTitle>
      <View style={styles.filters}>
        {([['pending', 'Pendientes'], ['paid', 'Pagados'], ['all', 'Todos']] as const).map(([value, label]) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === value }}
            onPress={() => { setIsLoading(true); setFilter(value); }}
            style={[styles.filterChip, filter === value && styles.filterSelected]}>
            <Text style={[styles.filterText, filter === value && styles.filterTextSelected]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? <ActivityIndicator color={palette.green} size="large" /> : null}
      {listError ? <Notice error>{listError}</Notice> : null}
      {!isLoading && !listError && payments.length === 0 ? <Notice>No hay pagos para este filtro.</Notice> : null}

      {payments.map((payment) => {
        const customer = customerOf(payment);
        return (
          <FloatingCard key={payment.id} style={styles.paymentCard}>
            <View style={styles.paymentTop}>
              <View style={styles.paymentInfo}>
                <Text style={styles.paymentName}>{customer.name}</Text>
                {customer.email ? <Text style={styles.paymentMeta}>{customer.email}</Text> : null}
                <Text style={styles.paymentMeta}>{payment.planName} · {payment.reference}</Text>
              </View>
              <View style={styles.paymentRight}>
                <Text style={styles.paymentAmount}>{formatAmount(payment.amount, payment.currency)}</Text>
                <View style={[styles.statusChip, { backgroundColor: `${statusColors[payment.status]}26` }]}>
                  <Text style={styles.statusText}>{statusLabels[payment.status]}</Text>
                </View>
              </View>
            </View>
            {payment.status === 'pending' ? (
              <Pressable accessibilityRole="button" onPress={() => void cancelPayment(payment)} style={styles.cancelButton}>
                <Text style={styles.cancelText}>Cancelar solicitud</Text>
              </Pressable>
            ) : null}
          </FloatingCard>
        );
      })}
    </Page>
  );
}

const styles = StyleSheet.create({
  plansLink: { alignSelf: 'stretch' },
  plansCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  plansText: { flex: 1, color: palette.ink, fontSize: 15, fontWeight: '800' },
  pinCard: { gap: 14, padding: 22 },
  pinHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pinTitle: { color: palette.ink, fontSize: 18, fontWeight: '800' },
  searchRow: { flexDirection: 'row', gap: 10 },
  pinInput: { flex: 1, height: 58, borderRadius: 18, backgroundColor: '#F2F4EE', color: palette.ink, fontSize: 28, fontWeight: '800', letterSpacing: 8, textAlign: 'center' },
  searchButton: { width: 58, height: 58, borderRadius: 18, backgroundColor: palette.neon, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.5 },
  result: { gap: 6, borderTopWidth: 1, borderTopColor: palette.line, paddingTop: 14 },
  resultLabel: { color: palette.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  resultName: { color: palette.ink, fontSize: 22, fontWeight: '800', marginBottom: 6 },
  resultAmount: { color: palette.green, fontSize: 34, fontWeight: '900' },
  resultPlan: { color: palette.muted, fontSize: 13, marginBottom: 10 },
  filters: { flexDirection: 'row', gap: 8 },
  filterChip: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: palette.white },
  filterSelected: { backgroundColor: palette.deepGreen },
  filterText: { color: palette.ink, fontSize: 13, fontWeight: '700' },
  filterTextSelected: { color: palette.white },
  paymentCard: { gap: 10 },
  paymentTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  paymentInfo: { flex: 1, gap: 3 },
  paymentName: { color: palette.ink, fontSize: 15, fontWeight: '800' },
  paymentMeta: { color: palette.muted, fontSize: 12 },
  paymentRight: { alignItems: 'flex-end', gap: 6 },
  paymentAmount: { color: palette.ink, fontSize: 16, fontWeight: '800' },
  statusChip: { borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4 },
  statusText: { color: palette.ink, fontSize: 11, fontWeight: '800' },
  cancelButton: { alignSelf: 'flex-start' },
  cancelText: { color: palette.danger, fontSize: 13, fontWeight: '800' },
});
