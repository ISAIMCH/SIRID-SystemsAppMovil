import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { api, getApiErrorMessage } from './api';
import { FloatingCard, IconBadge } from './fit-ui';
import { pickImageAsDataUri } from './pick-image';
import { palette } from './theme';
import { ActionButton, AppHeader, Field, Notice, Page, SectionTitle } from './ui';

type Category = 'Suplementos' | 'Ropa' | 'Accesorios';
type Product = { _id: string; name: string; category: Category; price: number; image: string; stock: number };
type Promotion = { _id: string; title: string; image: string; active: boolean };

const categories: Category[] = ['Suplementos', 'Ropa', 'Accesorios'];
const currency = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });

export default function AdminStoreScreen() {
  const [tab, setTab] = useState<'products' | 'promotions'>('products');
  const [products, setProducts] = useState<Product[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryNumber, setRetryNumber] = useState(0);

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
        setError('');
      })
      .catch((requestError: unknown) => {
        if (isCurrent) setError(getApiErrorMessage(requestError, 'No se pudo cargar la tienda.'));
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });
    return () => { isCurrent = false; };
  }, [retryNumber]);

  return (
    <Page>
      <AppHeader title="Tienda y promociones" detail="Lo que publiques aquí lo ve el cliente en su app." />

      <View style={styles.tabs}>
        {([['products', 'Productos'], ['promotions', 'Promociones']] as const).map(([value, label]) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityState={{ selected: tab === value }}
            onPress={() => setTab(value)}
            style={[styles.tab, tab === value && styles.tabSelected]}>
            <Text style={[styles.tabText, tab === value && styles.tabTextSelected]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {error ? (
        <View style={styles.gap}>
          <Notice error>{error}</Notice>
          <ActionButton secondary onPress={() => { setError(''); setIsLoading(true); setRetryNumber((value) => value + 1); }}>Reintentar</ActionButton>
        </View>
      ) : null}
      {isLoading ? <ActivityIndicator color={palette.green} size="large" /> : null}

      {!isLoading && tab === 'products' ? <ProductsSection products={products} setProducts={setProducts} /> : null}
      {!isLoading && tab === 'promotions' ? <PromotionsSection promotions={promotions} setPromotions={setPromotions} /> : null}
    </Page>
  );
}

function ImagePickerField({ value, aspect, onChange, onError }: {
  value: string;
  aspect: [number, number];
  onChange: (value: string) => void;
  onError: (message: string) => void;
}) {
  async function choose() {
    try {
      const image = await pickImageAsDataUri(aspect);
      if (image) onChange(image);
    } catch (pickError) {
      onError(pickError instanceof Error ? pickError.message : 'No se pudo abrir la galería.');
    }
  }

  return (
    <View style={styles.gap}>
      <Text style={styles.label}>Imagen</Text>
      <Pressable accessibilityRole="button" onPress={() => void choose()} style={[styles.imageBox, { aspectRatio: aspect[0] / aspect[1] }]}>
        {value ? <Image source={{ uri: value }} style={styles.imageFill} resizeMode="cover" /> : (
          <View style={styles.imageEmpty}>
            <MaterialIcons name="add-photo-alternate" size={34} color={palette.muted} />
            <Text style={styles.imageHint}>Elegir de la galería</Text>
          </View>
        )}
      </Pressable>
      {value ? (
        <Pressable accessibilityRole="button" onPress={() => onChange('')}>
          <Text style={styles.removeText}>Quitar imagen</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ProductsSection({ products, setProducts }: { products: Product[]; setProducts: (updater: (current: Product[]) => Product[]) => void }) {
  const [editing, setEditing] = useState<Product | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<Category>('Suplementos');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [image, setImage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  function reset() {
    setEditing(null);
    setName('');
    setCategory('Suplementos');
    setPrice('');
    setStock('');
    setImage('');
    setError('');
  }

  function startEdit(product: Product) {
    setEditing(product);
    setName(product.name);
    setCategory(product.category);
    setPrice(String(product.price));
    setStock(String(product.stock));
    setImage(product.image);
    setError('');
  }

  async function save() {
    const priceValue = Number(price.replace(',', '.'));
    const stockValue = Number(stock);
    if (!name.trim()) return setError('El nombre es obligatorio.');
    if (!Number.isFinite(priceValue) || priceValue < 0 || price.trim() === '') return setError('Ingresa un precio válido.');
    if (!Number.isInteger(stockValue) || stockValue < 0 || stock.trim() === '') return setError('Ingresa un stock válido.');

    setError('');
    setIsSaving(true);
    const payload = { name: name.trim(), category, price: priceValue, stock: stockValue, image };
    try {
      if (editing) {
        const response = await api.patch<{ product: Product }>(`/store/products/${editing._id}`, payload);
        setProducts((current) => current.map((item) => (item._id === editing._id ? response.data.product : item)));
      } else {
        const response = await api.post<{ product: Product }>('/store/products', payload);
        setProducts((current) => [...current, response.data.product]);
      }
      reset();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No se pudo guardar el producto.'));
    } finally {
      setIsSaving(false);
    }
  }

  async function remove(product: Product) {
    setError('');
    try {
      await api.delete(`/store/products/${product._id}`);
      setProducts((current) => current.filter((item) => item._id !== product._id));
      if (editing?._id === product._id) reset();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No se pudo eliminar el producto.'));
    }
  }

  return (
    <>
      <FloatingCard style={styles.form}>
        <SectionTitle>{editing ? 'Editar producto' : 'Agregar producto'}</SectionTitle>
        <Field label="Nombre" value={name} onChangeText={setName} />
        <View style={styles.gap}>
          <Text style={styles.label}>Categoría</Text>
          <View style={styles.chips}>
            {categories.map((entry) => (
              <Pressable key={entry} accessibilityRole="button" accessibilityState={{ selected: category === entry }} onPress={() => setCategory(entry)} style={[styles.chip, category === entry && styles.chipSelected]}>
                <Text style={[styles.chipText, category === entry && styles.chipTextSelected]}>{entry}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={styles.row}>
          <View style={styles.flex}><Field label="Precio (MXN)" keyboardType="decimal-pad" value={price} onChangeText={setPrice} /></View>
          <View style={styles.flex}><Field label="Stock" keyboardType="number-pad" value={stock} onChangeText={(value) => setStock(value.replace(/\D/g, ''))} /></View>
        </View>
        <ImagePickerField value={image} aspect={[4, 3]} onChange={setImage} onError={setError} />
        {error ? <Notice error>{error}</Notice> : null}
        <ActionButton onPress={() => void save()} disabled={isSaving}>
          {isSaving ? <ActivityIndicator color={palette.white} /> : editing ? 'Guardar cambios' : 'Agregar producto'}
        </ActionButton>
        {editing ? <ActionButton secondary onPress={reset}>Cancelar edición</ActionButton> : null}
      </FloatingCard>

      <SectionTitle>{products.length} productos</SectionTitle>
      {products.length === 0 ? <Notice>Aún no hay productos publicados.</Notice> : null}
      {products.map((product) => (
        <FloatingCard key={product._id} style={styles.item}>
          {product.image ? <Image source={{ uri: product.image }} style={styles.thumb} /> : <IconBadge name="inventory-2" color={palette.violet} size={56} />}
          <View style={styles.itemInfo}>
            <Text style={styles.itemName}>{product.name}</Text>
            <Text style={styles.itemMeta}>{product.category} · {currency.format(product.price)}</Text>
            <Text style={[styles.itemMeta, product.stock === 0 && styles.outOfStock]}>{product.stock === 0 ? 'Agotado' : `${product.stock} en stock`}</Text>
          </View>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Editar producto" onPress={() => startEdit(product)}>
              <IconBadge name="edit" color={palette.cyan} size={38} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Eliminar producto" onPress={() => void remove(product)}>
              <IconBadge name="delete" color={palette.danger} size={38} />
            </Pressable>
          </View>
        </FloatingCard>
      ))}
    </>
  );
}

function PromotionsSection({ promotions, setPromotions }: { promotions: Promotion[]; setPromotions: (updater: (current: Promotion[]) => Promotion[]) => void }) {
  const [title, setTitle] = useState('');
  const [image, setImage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  async function create() {
    if (!title.trim()) return setError('El título es obligatorio.');
    if (!image) return setError('Elige una imagen para el banner.');
    setError('');
    setIsSaving(true);
    try {
      const response = await api.post<{ promotion: Promotion }>('/store/promotions', { title: title.trim(), image, active: true });
      setPromotions((current) => [response.data.promotion, ...current]);
      setTitle('');
      setImage('');
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No se pudo publicar el banner.'));
    } finally {
      setIsSaving(false);
    }
  }

  async function toggle(promotion: Promotion) {
    setError('');
    try {
      const response = await api.patch<{ promotion: Promotion }>(`/store/promotions/${promotion._id}`, { active: !promotion.active });
      setPromotions((current) => current.map((item) => (item._id === promotion._id ? response.data.promotion : item)));
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No se pudo actualizar el banner.'));
    }
  }

  async function remove(promotion: Promotion) {
    setError('');
    try {
      await api.delete(`/store/promotions/${promotion._id}`);
      setPromotions((current) => current.filter((item) => item._id !== promotion._id));
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No se pudo eliminar el banner.'));
    }
  }

  return (
    <>
      <FloatingCard style={styles.form}>
        <SectionTitle>Nuevo banner promocional</SectionTitle>
        <Field label="Título" value={title} onChangeText={setTitle} />
        <ImagePickerField value={image} aspect={[16, 9]} onChange={setImage} onError={setError} />
        {error ? <Notice error>{error}</Notice> : null}
        <ActionButton onPress={() => void create()} disabled={isSaving}>
          {isSaving ? <ActivityIndicator color={palette.white} /> : 'Publicar banner'}
        </ActionButton>
      </FloatingCard>

      <SectionTitle>{promotions.length} banners</SectionTitle>
      {promotions.length === 0 ? <Notice>Aún no hay banners.</Notice> : null}
      {promotions.map((promotion) => (
        <FloatingCard key={promotion._id} style={styles.promo}>
          <Image source={{ uri: promotion.image }} style={styles.banner} resizeMode="cover" />
          <View style={styles.promoRow}>
            <View style={styles.itemInfo}>
              <Text style={styles.itemName}>{promotion.title}</Text>
              <Text style={[styles.itemMeta, promotion.active && styles.activeText]}>{promotion.active ? 'Visible para clientes' : 'Oculto'}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={promotion.active ? 'Ocultar banner' : 'Mostrar banner'} onPress={() => void toggle(promotion)}>
              <IconBadge name={promotion.active ? 'visibility' : 'visibility-off'} color={promotion.active ? palette.neon : palette.muted} size={38} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Eliminar banner" onPress={() => void remove(promotion)}>
              <IconBadge name="delete" color={palette.danger} size={38} />
            </Pressable>
          </View>
        </FloatingCard>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  gap: { gap: 8 },
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: 12 },
  tabs: { flexDirection: 'row', backgroundColor: '#E9ECE3', borderRadius: 20, padding: 4 },
  tab: { flex: 1, borderRadius: 16, paddingVertical: 11, alignItems: 'center' },
  tabSelected: { backgroundColor: palette.deepGreen },
  tabText: { color: palette.ink, fontSize: 14, fontWeight: '700' },
  tabTextSelected: { color: palette.white },
  form: { gap: 14, padding: 20 },
  label: { color: palette.ink, fontSize: 13, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: '#F2F4EE' },
  chipSelected: { backgroundColor: palette.deepGreen },
  chipText: { color: palette.ink, fontSize: 13, fontWeight: '700' },
  chipTextSelected: { color: palette.white },
  imageBox: { width: '100%', borderRadius: 18, overflow: 'hidden', backgroundColor: '#F2F4EE' },
  imageFill: { width: '100%', height: '100%' },
  imageEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  imageHint: { color: palette.muted, fontSize: 13 },
  removeText: { color: palette.danger, fontSize: 13, fontWeight: '700' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 56, height: 56, borderRadius: 14, backgroundColor: '#F2F4EE' },
  itemInfo: { flex: 1, gap: 3 },
  itemName: { color: palette.ink, fontSize: 15, fontWeight: '800' },
  itemMeta: { color: palette.muted, fontSize: 12 },
  outOfStock: { color: palette.danger, fontWeight: '700' },
  activeText: { color: palette.green, fontWeight: '700' },
  actions: { gap: 8 },
  promo: { gap: 12, padding: 12 },
  banner: { width: '100%', aspectRatio: 16 / 9, borderRadius: 16, backgroundColor: '#F2F4EE' },
  promoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
