import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { connectSocket } from '../../services/socket';
import { useCartStore } from '../../store/cartStore';
import { api, getApiErrorMessage, getPromotions } from './api';
import CartModal from './cart-modal';
import { FloatingCard } from './fit-ui';
import OrdersModal from './orders-modal';
import { palette } from './theme';
import type { Promotion } from './types';
import { Notice, Page } from './ui';

type Product = { _id: string; name: string; category: string; price: number; image: string; imageUrl?: string; stock: number };

const categoryStyle: Record<string, { icon: keyof typeof MaterialIcons.glyphMap; color: string }> = {
  Suplementos: { icon: 'local-drink', color: palette.neon },
  Ropa: { icon: 'checkroom', color: '#10FF85' },
  Accesorios: { icon: 'sports-bar', color: '#10FF85' },
};

const currency = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });

export default function StoreScreen() {
  const { width } = useWindowDimensions();
  const [products, setProducts] = useState<Product[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [category, setCategory] = useState('Todos');
  const [isCartVisible, setIsCartVisible] = useState(false);
  const [isOrdersVisible, setIsOrdersVisible] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const addItem = useCartStore((state) => state.addItem);
  const setPromotionId = useCartStore((state) => state.setPromotionId);
  const cartItems = useCartStore((state) => state.items);
  const totalItems = useCartStore((state) => state.getTotalItems());
  const [cartAnimation] = useState(() => new Animated.Value(0));

  useEffect(() => {
    let isCurrent = true;
    Promise.all([
      api.get<{ products: Product[] }>('/store/products'),
      getPromotions(),
    ])
      .then(([productsResponse, promotionsResponse]) => {
        if (!isCurrent) return;
        setError('');
        setProducts(productsResponse.data.products);
        setPromotions(promotionsResponse);
      })
      .catch((requestError: unknown) => {
        if (isCurrent) setError(getApiErrorMessage(requestError, 'No se pudo cargar la tienda.'));
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });
    return () => { isCurrent = false; };
  }, [reloadKey]);

  useEffect(() => {
    const realtime = connectSocket();
    // Realtime refreshes are silent: the current list stays visible while reloading.
    const refreshStore = () => setReloadKey((value) => value + 1);
    realtime.on('sale-updated', refreshStore);
    return () => { realtime.off('sale-updated', refreshStore); };
  }, []);

  useEffect(() => {
    if (totalItems > 0) {
      Animated.spring(cartAnimation, { toValue: 1, friction: 6, tension: 70, useNativeDriver: true }).start();
    } else {
      Animated.timing(cartAnimation, { toValue: 0, duration: 160, useNativeDriver: true }).start();
    }
  }, [cartAnimation, totalItems]);

  const categories = ['Todos', ...new Set(products.map((product) => product.category.trim()).filter(Boolean))];
  const visible = category === 'Todos' ? products : products.filter((product) => product.category === category);
  const bannerWidth = Math.min(width, 760) - 44;

  function addProductToCart(product: Product) {
    addItem({ id: product._id, name: product.name, price: product.price, imageUrl: product.imageUrl ?? product.image });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function handlePromotion(promotion: Promotion) {
    const applicableProducts = promotion.applicableProducts ?? [];
    if (applicableProducts.length === 0) {
      router.push('/(main)/billing');
      return;
    }

    const productsToAdd = products.filter((product) => applicableProducts.includes(product._id) && product.stock > 0);
    if (productsToAdd.length === 0) {
      setError('Los productos de esta promoción no están disponibles.');
      return;
    }

    setPromotionId(promotion._id);
    productsToAdd.forEach(addProductToCart);
    setIsCartVisible(true);
  }

  return (
    <Page dark>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Tienda</Text>
            <Text style={styles.subtitle}>Marca lo que te interesa y solicítalo en recepción.</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Abrir mis pedidos" onPress={() => setIsOrdersVisible(true)} style={styles.ordersButton}>
            <MaterialIcons name="receipt-long" size={20} color={palette.neon} />
            <Text style={styles.ordersButtonText}>Mis pedidos</Text>
          </Pressable>
        </View>
      </View>

      {isLoading ? <ActivityIndicator color={palette.green} size="large" /> : null}
      {error ? <Notice error>{error}</Notice> : null}

      {promotions.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={bannerWidth + 12} decelerationRate="fast" contentContainerStyle={styles.banners}>
          {promotions.map((promotion) => (
            <View key={promotion._id} style={[styles.banner, { width: bannerWidth }]}>
              {promotion.imageUrl ? <Image source={{ uri: promotion.imageUrl }} style={styles.bannerImage} resizeMode="cover" /> : null}
              <View style={styles.bannerOverlay} />
              <View style={styles.bannerContent}>
                <Text style={styles.bannerText}>{promotion.title}</Text>
                {promotion.description ? <Text numberOfLines={2} style={styles.bannerDescription}>{promotion.description}</Text> : null}
                {typeof promotion.discountPercentage === 'number' ? <Text style={styles.bannerDiscount}>{promotion.discountPercentage}% de descuento</Text> : null}
                <Pressable accessibilityRole="button" onPress={() => handlePromotion(promotion)} style={styles.bannerButton}>
                  <Text style={styles.bannerButtonText}>{promotion.applicableProducts?.length ? 'Aprovechar' : 'Ver Membresías'}</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.chips}>
        {categories.map((entry) => (
          <Pressable
            key={entry}
            accessibilityRole="button"
            accessibilityState={{ selected: category === entry }}
            onPress={() => setCategory(entry)}
            style={[styles.chip, category === entry && styles.chipSelected]}>
            <Text style={[styles.chipText, category === entry && styles.chipTextSelected]}>{entry}</Text>
          </Pressable>
        ))}
      </View>

      {cartItems.length ? (
        <Notice>{cartItems.length === 1 ? '1 producto' : `${cartItems.length} productos`} en tu lista. Menciónalos en recepción para completar tu compra.</Notice>
      ) : null}
      {!isLoading && !error && visible.length === 0 ? <Notice>No hay productos en esta categoría por ahora.</Notice> : null}

      <View style={styles.grid}>
        {visible.map((product) => {
          const isInterested = cartItems.some((item) => item.id === product._id);
          const soldOut = product.stock === 0;
          const imageUrl = typeof product.imageUrl === 'string' ? product.imageUrl.trim() : '';
          const look = categoryStyle[product.category] ?? { icon: 'category', color: palette.cyan };
          return (
            <View key={product._id} style={styles.cell}>
              <FloatingCard style={styles.card}>
                {imageUrl ? (
                  <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="cover" />
                ) : (
                  <View style={[styles.image, styles.placeholder, { backgroundColor: `${look.color}26` }]}>
                    <MaterialIcons name={look.icon} size={44} color={look.color} />
                  </View>
                )}
                <Text style={styles.category}>{product.category}</Text>
                <Text numberOfLines={2} style={styles.name}>{product.name}</Text>
                <Text style={styles.price}>{currency.format(product.price)}</Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={soldOut}
                  onPress={() => addProductToCart(product)}
                  style={[styles.button, isInterested && styles.buttonActive, soldOut && styles.buttonDisabled]}>
                  <MaterialIcons name={isInterested ? 'check' : 'favorite-border'} size={16} color={isInterested ? palette.deepGreen : palette.white} />
                  <Text style={[styles.buttonText, isInterested && styles.buttonTextActive]}>
                    {soldOut ? 'Agotado' : isInterested ? 'En tu carrito' : 'Agregar al carrito'}
                  </Text>
                </Pressable>
              </FloatingCard>
            </View>
          );
        })}
      </View>

      {totalItems > 0 ? (
        <Animated.View style={[styles.fabWrap, { opacity: cartAnimation, transform: [{ translateY: cartAnimation.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }, { scale: cartAnimation }] }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Abrir carrito, ${totalItems} artículos`} onPress={() => setIsCartVisible(true)} style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}>
            <MaterialIcons name="shopping-bag" size={22} color="#081009" />
            <Text style={styles.fabText}>Carrito</Text>
            <View style={styles.fabBadge}><Text style={styles.fabBadgeText}>{totalItems}</Text></View>
          </Pressable>
        </Animated.View>
      ) : null}

      <CartModal visible={isCartVisible} onClose={() => setIsCartVisible(false)} />
      <OrdersModal visible={isOrdersVisible} onClose={() => setIsOrdersVisible(false)} />
    </Page>
  );
}

const styles = StyleSheet.create({
  header: { gap: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  headerCopy: { flex: 1, gap: 4 },
  title: { color: '#FFFFFF', fontSize: 28, fontWeight: '800' },
  subtitle: { color: '#A1A1AA', fontSize: 14 },
  ordersButton: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, borderRadius: 10, borderWidth: 1, borderColor: '#27272A', backgroundColor: '#1E1E1E', paddingHorizontal: 10 },
  ordersButtonText: { color: palette.neon, fontSize: 12, fontWeight: '800' },
  banners: { gap: 12 },
  banner: { aspectRatio: 16 / 9, minHeight: 220, borderRadius: 16, overflow: 'hidden', backgroundColor: '#18181B', borderWidth: 1, borderColor: '#27272A' },
  bannerImage: { width: '100%', height: '100%' },
  bannerOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#07100ACC' },
  bannerContent: { flex: 1, justifyContent: 'flex-end', gap: 6, padding: 18, paddingBottom: 24 },
  bannerText: { color: palette.white, fontSize: 13, fontWeight: '800' },
  bannerDescription: { color: '#DCE8E0', fontSize: 12, lineHeight: 16 },
  bannerDiscount: { color: palette.neon, fontSize: 18, fontWeight: '900' },
  bannerButton: { alignSelf: 'flex-start', minHeight: 38, justifyContent: 'center', borderRadius: 999, backgroundColor: '#10FF85', paddingHorizontal: 14 },
  bannerButtonText: { color: '#081009', fontSize: 12, fontWeight: '900' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: '#1E1E1E', borderWidth: 1, borderColor: '#27272A' },
  chipSelected: { backgroundColor: '#10FF85', borderColor: '#10FF85' },
  chipText: { color: '#A1A1AA', fontSize: 13, fontWeight: '700' },
  chipTextSelected: { color: '#081009' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  cell: { width: '47.5%', flexGrow: 1 },
  card: { gap: 8, padding: 12, borderRadius: 14, backgroundColor: '#18181B', borderWidth: 1, borderColor: '#27272A', shadowColor: '#000000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 4 },
  image: { height: 110, width: '100%', borderRadius: 10, marginBottom: 6 },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  category: { color: '#A1A1AA', fontSize: 10, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase' },
  name: { color: '#FFFFFF', fontSize: 16, lineHeight: 20, fontWeight: '800', minHeight: 40 },
  price: { color: '#10FF85', fontSize: 18, fontWeight: '900' },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 38, borderRadius: 999, borderWidth: 1, borderColor: '#10FF85', backgroundColor: 'transparent', marginTop: 4 },
  buttonActive: { backgroundColor: '#10FF85' },
  buttonDisabled: { borderColor: '#3F3F46', backgroundColor: '#27272A', opacity: 0.6 },
  buttonText: { color: '#10FF85', fontSize: 12, fontWeight: '900' },
  buttonTextActive: { color: '#081009' },
  fabWrap: { position: 'absolute', right: 22, bottom: 24, zIndex: 2 },
  fab: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, borderRadius: 999, paddingHorizontal: 18, backgroundColor: '#10FF85', shadowColor: '#10FF85', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.28, shadowRadius: 16, elevation: 8 },
  fabPressed: { opacity: 0.82 },
  fabText: { color: '#081009', fontSize: 14, fontWeight: '900' },
  fabBadge: { alignItems: 'center', justifyContent: 'center', minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 5, backgroundColor: '#081009' },
  fabBadgeText: { color: '#10FF85', fontSize: 12, fontWeight: '900' },
});
