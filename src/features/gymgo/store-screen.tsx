import { MaterialIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FloatingCard } from './fit-ui';
import { palette } from './theme';
import { Notice, Page } from './ui';

type Category = 'Todos' | 'Suplementos' | 'Ropa' | 'Accesorios';

type Product = {
  id: string;
  name: string;
  category: Exclude<Category, 'Todos'>;
  price: number;
  icon: keyof typeof MaterialIcons.glyphMap;
  color: string;
};

// Datos de ejemplo hasta contar con un catálogo en el backend.
const products: Product[] = [
  { id: 'whey', name: 'Proteína Whey 2 lb', category: 'Suplementos', price: 749, icon: 'local-drink', color: palette.neon },
  { id: 'creatine', name: 'Creatina 300 g', category: 'Suplementos', price: 429, icon: 'science', color: palette.cyan },
  { id: 'preworkout', name: 'Pre-entreno 30 dosis', category: 'Suplementos', price: 559, icon: 'bolt', color: palette.orange },
  { id: 'tee', name: 'Playera GymGo Dry-Fit', category: 'Ropa', price: 299, icon: 'checkroom', color: palette.violet },
  { id: 'tank', name: 'Tank top deportivo', category: 'Ropa', price: 259, icon: 'dry-cleaning', color: palette.cyan },
  { id: 'belt', name: 'Faja lumbar', category: 'Accesorios', price: 389, icon: 'self-improvement', color: palette.orange },
  { id: 'shaker', name: 'Shaker 700 ml', category: 'Accesorios', price: 149, icon: 'sports-bar', color: palette.neon },
  { id: 'gloves', name: 'Guantes de entrenamiento', category: 'Accesorios', price: 219, icon: 'sports-mma', color: palette.violet },
];

const categories: Category[] = ['Todos', 'Suplementos', 'Ropa', 'Accesorios'];

const currency = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });

export default function StoreScreen() {
  const [category, setCategory] = useState<Category>('Todos');
  const [interested, setInterested] = useState<string[]>([]);

  const visible = category === 'Todos' ? products : products.filter((product) => product.category === category);

  function toggleInterest(id: string) {
    setInterested((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  }

  return (
    <Page>
      <View style={styles.header}>
        <Text style={styles.title}>Tienda</Text>
        <Text style={styles.subtitle}>Marca lo que te interesa y solicítalo en recepción.</Text>
      </View>

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

      <View style={styles.grid}>
        {visible.map((product) => {
          const isInterested = interested.includes(product.id);
          return (
            <View key={product.id} style={styles.cell}>
              <FloatingCard style={styles.card}>
                <View style={[styles.image, { backgroundColor: `${product.color}26` }]}>
                  <MaterialIcons name={product.icon} size={44} color={product.color} />
                </View>
                <Text style={styles.category}>{product.category}</Text>
                <Text numberOfLines={2} style={styles.name}>{product.name}</Text>
                <Text style={styles.price}>{currency.format(product.price)}</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => toggleInterest(product.id)}
                  style={[styles.button, isInterested && styles.buttonActive]}>
                  <MaterialIcons name={isInterested ? 'check' : 'favorite-border'} size={16} color={isInterested ? palette.deepGreen : palette.white} />
                  <Text style={[styles.buttonText, isInterested && styles.buttonTextActive]}>
                    {isInterested ? 'En tu lista' : 'Me interesa'}
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: palette.white },
  chipSelected: { backgroundColor: palette.deepGreen },
  chipText: { color: palette.ink, fontSize: 13, fontWeight: '700' },
  chipTextSelected: { color: palette.white },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  cell: { width: '47.5%', flexGrow: 1 },
  card: { gap: 6, padding: 12 },
  image: { height: 110, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  category: { color: palette.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  name: { color: palette.ink, fontSize: 14, fontWeight: '700', minHeight: 36 },
  price: { color: palette.green, fontSize: 18, fontWeight: '800' },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 40, borderRadius: 14, backgroundColor: palette.deepGreen, marginTop: 4 },
  buttonActive: { backgroundColor: palette.neon },
  buttonText: { color: palette.white, fontSize: 13, fontWeight: '800' },
  buttonTextActive: { color: palette.deepGreen },
});
