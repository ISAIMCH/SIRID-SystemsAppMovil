import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { api, getApiErrorMessage } from './api';
import { connectSocket } from '../../services/socket';
import { palette } from './theme';

type OrderItem = {
  productId: { _id: string; name: string; imageUrl?: string } | string;
  quantity: number;
  price: number;
};

type Order = {
  _id: string;
  items: OrderItem[];
  totalAmount: number;
  status: 'pending' | 'paid' | 'cancelled';
  pickupPin?: string;
  createdAt: string;
};

const currency = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
const statusLabels: Record<Order['status'], string> = {
  pending: 'Pendiente en recepción',
  paid: 'Pagado',
  cancelled: 'Cancelado',
};

function productName(item: OrderItem) {
  return typeof item.productId === 'object' ? item.productId.name : 'Producto';
}

function productImage(item: OrderItem) {
  return typeof item.productId === 'object' ? item.productId.imageUrl : undefined;
}

export default function OrdersModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!visible) return undefined;
    let isCurrent = true;
    api.get<{ orders: Order[] }>('/store/orders')
      .then((response) => {
        if (isCurrent) {
          setOrders(response.data.orders);
          setError('');
          setIsLoading(false);
        }
      })
      .catch((requestError: unknown) => {
        if (isCurrent) {
          setError(getApiErrorMessage(requestError, 'No se pudieron cargar tus pedidos.'));
          setIsLoading(false);
        }
      });
    return () => { isCurrent = false; };
  }, [visible, reloadKey]);

  useEffect(() => {
    if (!visible) return undefined;
    const realtime = connectSocket();
    const refreshOrders = () => setReloadKey((value) => value + 1);
    realtime.on('sale-updated', refreshOrders);
    return () => { realtime.off('sale-updated', refreshOrders); };
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>HISTORIAL</Text>
              <Text style={styles.title}>Mis pedidos</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Cerrar mis pedidos" hitSlop={10} onPress={onClose} style={styles.closeButton}>
              <MaterialIcons name="close" size={22} color={palette.white} />
            </Pressable>
          </View>

          {isLoading ? <ActivityIndicator color={palette.neon} size="large" /> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {!isLoading && !error && orders.length === 0 ? <Text style={styles.empty}>Aún no tienes pedidos.</Text> : null}

          <ScrollView contentContainerStyle={styles.orders} showsVerticalScrollIndicator={false}>
            {orders.map((order) => (
              <View key={order._id} style={styles.order}>
                <View style={styles.orderHeader}>
                  <Text style={styles.orderDate}>{new Date(order.createdAt).toLocaleDateString('es-MX')}</Text>
                  <Text style={[styles.status, order.status === 'paid' && styles.paidStatus, order.status === 'cancelled' && styles.cancelledStatus]}>{statusLabels[order.status]}</Text>
                </View>
                {order.status === 'pending' && order.pickupPin ? <View style={styles.pin}><Text style={styles.pinLabel}>PIN de entrega</Text><Text style={styles.pinValue}>{order.pickupPin}</Text></View> : null}
                {order.items.map((item, index) => (
                  <View key={`${order._id}-${index}`} style={styles.item}>
                    {productImage(item) ? <Image source={{ uri: productImage(item) }} style={styles.itemImage} /> : <View style={styles.itemPlaceholder}><MaterialIcons name="shopping-bag" size={18} color={palette.neon} /></View>}
                    <Text numberOfLines={2} style={styles.itemName}>{productName(item)} x{item.quantity}</Text>
                    <Text style={styles.itemPrice}>{currency.format(item.price * item.quantity)}</Text>
                  </View>
                ))}
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Total</Text>
                  <Text style={styles.total}>{currency.format(order.totalAmount)}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#000000B8' },
  sheet: { maxHeight: '86%', gap: 16, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: '#0F1512', borderWidth: 1, borderColor: '#27342E', padding: 22, paddingBottom: 28 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: palette.neon, fontSize: 11, fontWeight: '800', letterSpacing: 0 },
  title: { color: palette.white, fontSize: 24, fontWeight: '800', marginTop: 4 },
  closeButton: { alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 22, backgroundColor: '#1E2924' },
  orders: { gap: 12, paddingBottom: 4 },
  order: { gap: 10, padding: 14, borderRadius: 16, backgroundColor: '#151E1A', borderWidth: 1, borderColor: '#27342E' },
  orderHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  orderDate: { color: '#91A098', fontSize: 12, fontWeight: '700' },
  status: { color: '#F4C66D', fontSize: 12, fontWeight: '800', textAlign: 'right' },
  paidStatus: { color: palette.neon },
  cancelledStatus: { color: '#FF9A88' },
  pin: { alignItems: 'center', gap: 2, borderRadius: 12, backgroundColor: '#263A2D', paddingVertical: 10 },
  pinLabel: { color: '#B9D8BC', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  pinValue: { color: palette.neon, fontSize: 28, fontWeight: '900', letterSpacing: 5 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemImage: { width: 38, height: 38, borderRadius: 10 },
  itemPlaceholder: { alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: 10, backgroundColor: '#23352A' },
  itemName: { flex: 1, color: palette.white, fontSize: 13, fontWeight: '700' },
  itemPrice: { color: '#91A098', fontSize: 12, fontWeight: '700' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#27342E', paddingTop: 10 },
  totalLabel: { color: '#91A098', fontSize: 13, fontWeight: '700' },
  total: { color: palette.neon, fontSize: 17, fontWeight: '900' },
  empty: { color: '#91A098', fontSize: 14, textAlign: 'center', paddingVertical: 20 },
  error: { color: '#FF9A88', fontSize: 13, lineHeight: 18 },
});