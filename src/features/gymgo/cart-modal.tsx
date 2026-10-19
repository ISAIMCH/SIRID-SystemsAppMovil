import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useCartStore } from '../../store/cartStore';
import { api, getApiErrorMessage, getPromotions } from './api';
import { palette } from './theme';
import type { Promotion } from './types';

const currency = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });

export default function CartModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const items = useCartStore((state) => state.items);
  const promotionId = useCartStore((state) => state.promotionId);
  const addItem = useCartStore((state) => state.addItem);
  const removeItem = useCartStore((state) => state.removeItem);
  const clearCart = useCartStore((state) => state.clearCart);
  const [promotion, setPromotion] = useState<Promotion | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible || !promotionId) return;

    let isCurrent = true;
    getPromotions()
      .then((promotions) => {
        if (!isCurrent) return;
        const activePromotion = promotions.find((entry) => (
          entry._id === promotionId && (!entry.validUntil || new Date(entry.validUntil) > new Date())
        ));
        setPromotion(activePromotion ?? null);
      })
      .catch(() => {
        if (isCurrent) setPromotion(null);
      });
    return () => { isCurrent = false; };
  }, [promotionId, visible]);

  const activePromotion = visible && promotion?._id === promotionId ? promotion : null;
  const baseTotal = items.reduce((total, item) => total + item.price * item.quantity, 0);
  const applicableProducts = new Set(activePromotion?.applicableProducts ?? []);
  const discountableSubtotal = activePromotion && applicableProducts.size > 0
    ? items.reduce((total, item) => (
      applicableProducts.has(item.id) ? total + item.price * item.quantity : total
    ), 0)
    : activePromotion
      ? baseTotal
      : 0;
  const discount = activePromotion
    ? Math.round((discountableSubtotal * (activePromotion.discountPercentage ?? 0) / 100) * 100) / 100
    : 0;
  const finalTotal = Math.round((baseTotal - discount) * 100) / 100;

  async function createOrder() {
    if (!items.length || isSubmitting) return;
    setError('');
    setIsSubmitting(true);
    try {
      await api.post('/store/orders', {
        items: items.map(({ id, quantity, price }) => ({ productId: id, quantity, price })),
        ...(promotionId ? { promotionId } : {}),
      });
      clearCart();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
      Alert.alert('Pedido generado', 'Pasa a recepción a pagar y recoger tus productos.');
    } catch (requestError: unknown) {
      setError(getApiErrorMessage(requestError, 'No se pudo generar el pedido.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>PEDIDO</Text>
              <Text style={styles.title}>Tu carrito</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Cerrar carrito" hitSlop={10} onPress={onClose} style={styles.closeButton}>
              <MaterialIcons name="close" size={22} color={palette.white} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.items} showsVerticalScrollIndicator={false}>
            {items.map((item) => (
              <View key={item.id} style={styles.item}>
                {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.itemImage} /> : <View style={styles.itemImagePlaceholder}><MaterialIcons name="shopping-bag" size={22} color={palette.neon} /></View>}
                <View style={styles.itemDetails}>
                  <Text numberOfLines={2} style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemPrice}>{currency.format(item.price)}</Text>
                </View>
                <View style={styles.quantityControls}>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Quitar ${item.name}`} hitSlop={8} onPress={() => { removeItem(item.id); void Haptics.selectionAsync(); }} style={styles.quantityButton}>
                    <MaterialIcons name="remove" size={16} color={palette.white} />
                  </Pressable>
                  <Text style={styles.quantity}>{item.quantity}</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Agregar ${item.name}`} hitSlop={8} onPress={() => { addItem(item); void Haptics.selectionAsync(); }} style={styles.quantityButton}>
                    <MaterialIcons name="add" size={16} color={palette.neon} />
                  </Pressable>
                </View>
              </View>
            ))}
          </ScrollView>

          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.totalRow}>
            <View style={styles.totalLabels}>
              <Text style={styles.totalLabel}>Total</Text>
              {discount > 0 ? <Text style={styles.discount}>Descuento: -{currency.format(discount)}</Text> : null}
            </View>
            <View style={styles.totalValues}>
              {discount > 0 ? <Text style={styles.baseTotal}>{currency.format(baseTotal)}</Text> : null}
              <Text style={styles.total}>{currency.format(finalTotal)}</Text>
            </View>
          </View>
          <Pressable accessibilityRole="button" disabled={isSubmitting || !items.length} onPress={() => void createOrder()} style={({ pressed }) => [styles.checkoutButton, (isSubmitting || !items.length) && styles.disabledButton, pressed && styles.pressed]}>
            {isSubmitting ? <ActivityIndicator color="#081009" /> : <Text style={styles.checkoutText}>Generar Pedido</Text>}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#000000C7' },
  sheet: { maxHeight: '82%', gap: 16, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#18181B', borderWidth: 1, borderColor: '#27272A', padding: 22, paddingBottom: 30, shadowColor: '#000000', shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.35, shadowRadius: 20, elevation: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: '#10FF85', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  title: { color: '#FFFFFF', fontSize: 24, fontWeight: '900', marginTop: 4 },
  closeButton: { alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 20, backgroundColor: '#27272A' },
  items: { gap: 10, paddingVertical: 2 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, backgroundColor: '#1E1E1E', borderWidth: 1, borderColor: '#27272A' },
  itemImage: { width: 52, height: 52, borderRadius: 10 },
  itemImagePlaceholder: { alignItems: 'center', justifyContent: 'center', width: 52, height: 52, borderRadius: 10, backgroundColor: '#27272A' },
  itemDetails: { flex: 1, gap: 4 },
  itemName: { color: '#FFFFFF', fontSize: 14, lineHeight: 18, fontWeight: '800' },
  itemPrice: { color: '#10FF85', fontSize: 13, fontWeight: '900' },
  quantityControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  quantityButton: { alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, backgroundColor: '#27272A', borderWidth: 1, borderColor: '#3F3F46' },
  quantity: { minWidth: 18, color: '#FFFFFF', fontSize: 14, fontWeight: '900', textAlign: 'center' },
  error: { color: '#FF9A88', fontSize: 13, lineHeight: 18 },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#27272A', borderRadius: 12, backgroundColor: '#1E1E1E', padding: 14 },
  totalLabels: { gap: 4 },
  totalLabel: { color: '#A1A1AA', fontSize: 14, fontWeight: '700' },
  discount: { color: '#10FF85', fontSize: 12, fontWeight: '800' },
  totalValues: { alignItems: 'flex-end', gap: 2 },
  baseTotal: { color: '#91A098', fontSize: 13, textDecorationLine: 'line-through' },
  total: { color: '#FFFFFF', fontSize: 22, fontWeight: '900' },
  checkoutButton: { alignItems: 'center', justifyContent: 'center', minHeight: 56, borderRadius: 10, backgroundColor: '#10FF85' },
  checkoutText: { color: '#081009', fontSize: 15, fontWeight: '900' },
  disabledButton: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
});
