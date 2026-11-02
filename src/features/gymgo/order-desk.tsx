import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';

import { connectSocket } from '@/services/socket';

import { api, getApiErrorMessage } from './api';
import { FloatingCard, IconBadge } from './fit-ui';
import { palette } from './theme';
import { ActionButton, Notice, SectionTitle } from './ui';

type Order = {
  _id: string;
  userId: { _id: string; name: string; email?: string } | null;
  items: { productId: { _id: string; name: string } | null; quantity: number; price: number }[];
  totalAmount: number;
  status: 'pending' | 'paid' | 'cancelled';
  pickupPin?: string;
  createdAt: string;
};

const formatAmount = (amount: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
const itemsSummary = (order: Order) => order.items.map((item) => `${item.quantity} × ${item.productId?.name ?? 'Producto'}`).join(', ');

// Store orders at the front desk: the client shows a 4-character pickup PIN, reception charges and hands it over.
export default function OrderDesk() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [isDelivering, setIsDelivering] = useState(false);
  const [delivered, setDelivered] = useState('');

  useEffect(() => {
    let isCurrent = true;
    api.get<{ orders: Order[] }>('/sales')
      .then((response) => {
        if (!isCurrent) return;
        setOrders(response.data.orders.filter((order) => order.status === 'pending'));
        setListError('');
      })
      .catch((requestError: unknown) => {
        if (isCurrent) setListError(getApiErrorMessage(requestError, 'No se pudieron cargar los pedidos.'));
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });
    return () => { isCurrent = false; };
  }, [reloadKey]);

  useEffect(() => {
    const socket = connectSocket();
    const reload = () => setReloadKey((value) => value + 1);
    socket.on('sale-updated', reload);
    return () => { socket.off('sale-updated', reload); };
  }, []);

  // The PIN is looked up among the pending orders already loaded, so reception sees the order before handing it over.
  const found = pin.length === 4 ? orders.find((order) => order.pickupPin === pin) ?? null : null;

  async function deliver() {
    if (!found) return;
    setIsDelivering(true);
    setPinError('');
    try {
      await api.patch('/sales/redeem', { pin });
      setDelivered(`Pedido de ${found.userId?.name ?? 'cliente'} entregado.`);
      setPin('');
      setReloadKey((value) => value + 1);
    } catch (requestError) {
      setPinError(getApiErrorMessage(requestError, 'No se pudo entregar el pedido.'));
    } finally {
      setIsDelivering(false);
    }
  }

  return (
    <>
      <FloatingCard style={styles.pinCard}>
        <View style={styles.pinHeader}>
          <IconBadge name="shopping-bag" color={palette.orange} />
          <Text style={styles.pinTitle}>Entregar por PIN</Text>
        </View>
        <TextInput
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={4}
          value={pin}
          onChangeText={(value) => { setPin(value.replace(/[^a-z0-9]/gi, '').toUpperCase()); setPinError(''); setDelivered(''); }}
          placeholder="A1B2"
          placeholderTextColor={palette.muted}
          style={styles.pinInput}
        />
        {pin.length === 4 && !found && !isLoading ? <Notice error>No hay un pedido pendiente con ese PIN.</Notice> : null}
        {pinError ? <Notice error>{pinError}</Notice> : null}
        {delivered ? <Notice>{delivered}</Notice> : null}

        {found ? (
          <View style={styles.result}>
            <Text style={styles.resultLabel}>Cliente</Text>
            <Text style={styles.resultName}>{found.userId?.name ?? 'Cliente'}</Text>
            <Text style={styles.resultItems}>{itemsSummary(found)}</Text>
            <Text style={styles.resultLabel}>Total a cobrar</Text>
            <Text style={styles.resultAmount}>{formatAmount(found.totalAmount)}</Text>
            <ActionButton onPress={() => void deliver()} disabled={isDelivering}>
              {isDelivering ? <ActivityIndicator color={palette.white} /> : 'Cobrar y entregar'}
            </ActionButton>
          </View>
        ) : null}
      </FloatingCard>

      <SectionTitle>{isLoading ? 'Cargando pedidos' : `${orders.length} pedidos por entregar`}</SectionTitle>
      {listError ? <Notice error>{listError}</Notice> : null}
      {!isLoading && !listError && orders.length === 0 ? <Notice>No hay pedidos pendientes.</Notice> : null}
      {/* The PIN is not shown: the client proves the order is theirs by saying it. */}
      {orders.map((order) => (
        <FloatingCard key={order._id} style={styles.orderCard}>
          <View style={styles.orderInfo}>
            <Text style={styles.orderName}>{order.userId?.name ?? 'Cliente'}</Text>
            <Text style={styles.orderMeta}>{itemsSummary(order)}</Text>
          </View>
          <Text style={styles.orderAmount}>{formatAmount(order.totalAmount)}</Text>
        </FloatingCard>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  pinCard: { gap: 14, padding: 22 },
  pinHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pinTitle: { color: palette.ink, fontSize: 18, fontWeight: '800' },
  pinInput: { height: 58, borderRadius: 12, backgroundColor: '#F4F4F5', borderWidth: 1, borderColor: '#E4E4E7', color: '#18181B', fontSize: 28, fontWeight: '800', letterSpacing: 8, textAlign: 'center' },
  result: { gap: 6, borderTopWidth: 1, borderTopColor: palette.line, paddingTop: 14 },
  resultLabel: { color: palette.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  resultName: { color: palette.ink, fontSize: 22, fontWeight: '800' },
  resultItems: { color: palette.ink, fontSize: 14, marginBottom: 6 },
  resultAmount: { color: palette.green, fontSize: 34, fontWeight: '900', marginBottom: 10 },
  orderCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  orderInfo: { flex: 1, gap: 3 },
  orderName: { color: palette.ink, fontSize: 15, fontWeight: '800' },
  orderMeta: { color: palette.muted, fontSize: 12 },
  orderAmount: { color: palette.ink, fontSize: 15, fontWeight: '800' },
});
