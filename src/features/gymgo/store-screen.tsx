import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { api, getApiErrorMessage } from './api';
import { FloatingCard } from './fit-ui';
import { palette } from './theme';
import { Notice, Page } from './ui';

type Category = 'Todos' | 'Suplementos' | 'Ropa' | 'Accesorios';
type Product = { _id: string; name: string; category: Exclude<Category, 'Todos'>; price: number; image: string; stock: number };
type Promotion = { _id: string; title: string; image: string };

const categories: Category[] = ['Todos', 'Suplementos', 'Ropa', 'Accesorios'];

const categoryStyle: Record<Product['category'], { icon: keyof typeof MaterialIcons.glyphMap; color: string }> = {
  Suplementos: { icon: 'local-drink', color: palette.neon },
  Ropa: { icon: 'checkroom', color: palette.violet },
  Accesorios: { icon: 'sports-bar', color: palette.orange },
};

const currency = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });

export default function StoreScreen() {
  const { width } = useWindowDimensions();
  const [products, setProducts] = useState<Product[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [category, setCategory] = useState<Category>('Todos');
  const [interested, setInterested] = useState<string[]>([]);

  useEffect(() => {
    let isCurrent = true;
    Promise.all([
      api.get<{ products: Product[] }>('/store/products'),
      api.get<{ promotions: Promotion[] }>('/store/promotions'),
    ])
      .then(([productsResponse, promotionsResponse]) => {
        if (!isCurrent) return;
        setProducts(productsResponse.data.products);
        setPromotions(promotionsResponse.data.promotions);
      })
      .catch((requestError: unknown) => {
        if (isCurrent) setError(getApiErrorMessage(requestError, 'No se pudo cargar la tienda.'));
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });
    return () => { isCurrent = false; };
  }, []);

  const visible = category === 'Todos' ? products : products.filter((product) => product.category === category);
  const bannerWidth = Math.min(width, 760) - 44;

  function toggleInterest(id: string) {
    setInterested((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  }

  return (
    <Page>
      <View style={styles.header}>
        <Text style={styles.title}>Tienda</Text>
        <Text style={styles.subtitle}>Marca lo que te interesa y solicítalo en recepción.</Text>
      </View>

      {isLoading ? <ActivityIndicator color={palette.green} size="large" /> : null}
      {error ? <Notice error>{error}</Notice> : null}

      {promotions.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={bannerWidth + 12} decelerationRate="fast" contentContainerStyle={styles.banners}>
          {promotions.map((promotion) => (
            <View key={promotion._id} style={[styles.banner, { width: bannerWidth }]}>
              <Image source={{ uri: promotion.image }} style={styles.bannerImage} resizeMode="cover" />
              <View style={styles.bannerLabel}><Text style={styles.bannerText}>{promotion.title}</Text></View>
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

      {interested.length ? (
        <Notice>{interested.length === 1 ? '1 producto' : `${interested.length} productos`} en tu lista. Menciónalos en recepción para completar tu compra.</Notice>
      ) : null}
      {!isLoading && !error && visible.length === 0 ? <Notice>No hay productos en esta categoría por ahora.</Notice> : null}

      <View style={styles.grid}>
        {visible.map((product) => {
          const isInterested = interested.includes(product._id);
          const soldOut = product.stock === 0;
          const look = categoryStyle[product.category];
          return (
            <View key={product._id} style={styles.cell}>
              <FloatingCard style={styles.card}>
                {product.image ? (
                  <Image source={{ uri: product.image }} style={styles.image} resizeMode="cover" />
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
                  onPress={() => toggleInterest(product._id)}
                  style={[styles.button, isInterested && styles.buttonActive, soldOut && styles.buttonDisabled]}>
                  <MaterialIcons name={isInterested ? 'check' : 'favorite-border'} size={16} color={isInterested ? palette.deepGreen : palette.white} />
                  <Text style={[styles.buttonText, isInterested && styles.buttonTextActive]}>
                    {soldOut ? 'Agotado' : isInterested ? 'En tu lista' : 'Me interesa'}
                  </Text>
                </Pressable>
              </FloatingCard>
            </View>
          );
        })}
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  header: { gap: 4 },
  title: { color: palette.ink, fontSize: 28, fontWeight: '800' },
  subtitle: { color: palette.muted, fontSize: 14 },
  banners: { gap: 12 },
  banner: { aspectRatio: 16 / 9, borderRadius: 24, overflow: 'hidden', backgroundColor: '#E9ECE3' },
  bannerImage: { width: '100%', height: '100%' },
  bannerLabel: { position: 'absolute', left: 12, bottom: 12, backgroundColor: '#0F2A24CC', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  bannerText: { color: palette.white, fontSize: 13, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: palette.white },
  chipSelected: { backgroundColor: palette.deepGreen },
  chipText: { color: palette.ink, fontSize: 13, fontWeight: '700' },
  chipTextSelected: { color: palette.white },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  cell: { width: '47.5%', flexGrow: 1 },
  card: { gap: 6, padding: 12 },
  image: { height: 110, width: '100%', borderRadius: 18, marginBottom: 6 },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  category: { color: palette.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  name: { color: palette.ink, fontSize: 14, fontWeight: '700', minHeight: 36 },
  price: { color: palette.green, fontSize: 18, fontWeight: '800' },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 40, borderRadius: 14, backgroundColor: palette.deepGreen, marginTop: 4 },
  buttonActive: { backgroundColor: palette.neon },
  buttonDisabled: { backgroundColor: palette.muted, opacity: 0.6 },
  buttonText: { color: palette.white, fontSize: 13, fontWeight: '800' },
  buttonTextActive: { color: palette.deepGreen },
});
