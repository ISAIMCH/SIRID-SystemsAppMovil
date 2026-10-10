import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { api, getApiErrorMessage } from './api';
import { palette } from './theme';
import { useCartStore } from '../../store/cartStore';

const currency = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });

export default function CartModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const items = useCartStore((state) => state.items);
  const addItem = useCartStore((state) => state.addItem);
  const removeItem = useCartStore((state) => state.removeItem);
  const clearCart = useCartStore((state) => state.clearCart);
  const totalPrice = useCartStore((state) => state.getTotalPrice());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function createOrder() {
    if (!items.length || isSubmitting) return;
    setError('');
    setIsSubmitting(true);
    try {
      await api.post('/store/orders', {
        items: items.map(({ id, quantity }) => ({ productId: id, quantity })),
      });
      clearCart();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
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
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.total}>{currency.format(totalPrice)}</Text>
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
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#000000B8' },
  sheet: { maxHeight: '82%', gap: 16, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: '#0F1512', borderWidth: 1, borderColor: '#27342E', padding: 22, paddingBottom: 28 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: palette.neon, fontSize: 11, fontWeight: '800', letterSpacing: 0 },
  title: { color: '#F4F8F5', fontSize: 24, fontWeight: '800', marginTop: 4 },
  closeButton: { alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 22, backgroundColor: '#1E2924' },
  items: { gap: 10, paddingVertical: 2 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 16, backgroundColor: '#151E1A', borderWidth: 1, borderColor: '#27342E' },
  itemImage: { width: 52, height: 52, borderRadius: 12 },
  itemImagePlaceholder: { alignItems: 'center', justifyContent: 'center', width: 52, height: 52, borderRadius: 12, backgroundColor: '#23352A' },
  itemDetails: { flex: 1, gap: 4 },
  itemName: { color: '#F4F8F5', fontSize: 14, fontWeight: '700' },
  itemPrice: { color: palette.neon, fontSize: 13, fontWeight: '800' },
  quantityControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  quantityButton: { alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 16, backgroundColor: '#27342E' },
  quantity: { minWidth: 18, color: '#F4F8F5', fontSize: 14, fontWeight: '800', textAlign: 'center' },
  error: { color: '#FF9A88', fontSize: 13, lineHeight: 18 },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#27342E', paddingTop: 14 },
  totalLabel: { color: '#91A098', fontSize: 14, fontWeight: '700' },
  total: { color: '#F4F8F5', fontSize: 22, fontWeight: '800' },
  checkoutButton: { alignItems: 'center', justifyContent: 'center', minHeight: 52, borderRadius: 16, backgroundColor: palette.neon },
  checkoutText: { color: '#081009', fontSize: 15, fontWeight: '900' },
  disabledButton: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
});
