import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';

import { EQUIPMENT_FAMILY_OPTIONS } from './equipment-families';
import { EQUIPMENT_CATALOG, type EquipmentCatalogItem, type PhysicalEquipmentCategory } from './equipment-catalog';
import { palette } from './theme';
import { ActionButton, Field, Notice } from './ui';

type EquipmentType = 'strength' | 'cardio';
export type EquipmentPickerInventoryItem = {
  _id: string;
  name: string;
  totalQuantity: number;
  equipmentCategory?: string;
};
export type EquipmentPickerPayload = {
  name: string;
  zone: string;
  brand?: string;
  imageUrl?: string;
  type: EquipmentType;
  totalQuantity: number;
  maintenanceQuantity: number;
  equipmentCategory: PhysicalEquipmentCategory;
};

const ZONES = ['Cardio', 'Peso libre', 'Máquinas', 'Zona de piernas', 'Zona de pecho', 'Funcional'];

export function EquipmentPickerModal({ visible, inventory, onClose, onCreateCustom, onAdd }: {
  visible: boolean;
  inventory: EquipmentPickerInventoryItem[];
  onClose: () => void;
  onCreateCustom: () => void;
  onAdd: (payload: EquipmentPickerPayload) => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [type, setType] = useState('');
  const [filter, setFilter] = useState<'category' | 'type' | null>(null);
  const [selected, setSelected] = useState<EquipmentCatalogItem | null>(null);
  const normalizedInventory = useMemo(() => new Map(inventory.map((item) => [normalizeName(item.name), item])), [inventory]);
  const results = useMemo(() => EQUIPMENT_CATALOG.filter((item) => (
    (!query.trim() || item.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    && (!category || item.equipmentCategory === category)
    && (!type || item.type === type)
  )), [category, query, type]);

  function close() {
    setSelected(null);
    setFilter(null);
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={close} hitSlop={10}>
            <MaterialCommunityIcons name="arrow-left" size={25} color="#F4F8F5" />
          </Pressable>
          <Text style={styles.title}>Añadir Equipo</Text>
          <Pressable accessibilityRole="button" onPress={onCreateCustom} style={styles.createButton}>
            <MaterialCommunityIcons name="plus" size={18} color={palette.green} />
            <Text style={styles.createText}>Crear</Text>
          </Pressable>
        </View>
        <View style={styles.search}>
          <MaterialCommunityIcons name="magnify" size={21} color={palette.muted} />
          <TextInput value={query} onChangeText={setQuery} placeholder="Buscar equipo (ej. Prensa, Mancuernas, Caminadora)" placeholderTextColor={palette.muted} style={styles.searchInput} />
        </View>
        <View style={styles.filters}>
          <Pressable onPress={() => setFilter('category')} style={styles.filterButton}><Text style={styles.filterText}>{category || 'Categoría'}</Text><MaterialCommunityIcons name="chevron-down" size={18} color={palette.muted} /></Pressable>
          <Pressable onPress={() => setFilter('type')} style={styles.filterButton}><Text style={styles.filterText}>{type === 'strength' ? 'Fuerza' : type === 'cardio' ? 'Cardio' : 'Tipo'}</Text><MaterialCommunityIcons name="chevron-down" size={18} color={palette.muted} /></Pressable>
        </View>
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const registered = normalizedInventory.get(normalizeName(item.name));
            return (
              <Pressable onPress={() => setSelected(item)} style={styles.row}>
                <View style={styles.iconCircle}><MaterialCommunityIcons name={item.icon} size={25} color={palette.green} /></View>
                <View style={styles.rowContent}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemMeta}>{item.equipmentCategory} · {item.type === 'cardio' ? 'Cardio' : 'Fuerza'}</Text>
                </View>
                {registered ? <View style={styles.registered}><Text style={styles.registeredText}>Ya registrado ({registered.totalQuantity} uds)</Text></View> : null}
              </Pressable>
            );
          }}
        />
        {filter ? (
          <Modal visible transparent animationType="fade" onRequestClose={() => setFilter(null)}>
            <Pressable style={styles.filterBackdrop} onPress={() => setFilter(null)}>
              <View style={styles.filterSheet}>
                <View style={styles.filterSheetContent}>
                  <FlatList
                    data={filter === 'category' ? ['Todas las Categorías', ...EQUIPMENT_FAMILY_OPTIONS.filter((item) => item.value !== 'Sin equipo').map((item) => item.value)] : ['Todos', 'strength', 'cardio']}
                    keyExtractor={(item) => item}
                    style={{ height: 400, flexGrow: 0 }}
                    contentContainerStyle={styles.filterList}
                    nestedScrollEnabled
                    showsVerticalScrollIndicator
                    renderItem={({ item }) => {
                      const label = item === 'strength' ? 'Fuerza' : item === 'cardio' ? 'Cardio' : item;
                      const active = filter === 'category' ? (category === item || (!category && item === 'Todas las Categorías')) : (type === item || (!type && item === 'Todos'));
                      return <Pressable style={[styles.filterOption, active && styles.filterOptionActive]} onPress={() => {
                        if (filter === 'category') setCategory(item === 'Todas las Categorías' ? '' : item);
                        else setType(item === 'Todos' ? '' : item);
                        setFilter(null);
                      }}>
                        <Text style={[styles.filterOptionText, active && styles.filterOptionTextActive]}>{label}</Text>
                        {active ? <MaterialCommunityIcons name="check" size={19} color={palette.neon} /> : null}
                      </Pressable>;
                    }}
                  />
                </View>
              </View>
            </Pressable>
          </Modal>
        ) : null}
        {selected ? <QuickAddModal item={selected} onClose={() => setSelected(null)} onAdd={onAdd} /> : null}
      </View>
    </Modal>
  );
}

function QuickAddModal({ item, onClose, onAdd }: {
  item: EquipmentCatalogItem;
  onClose: () => void;
  onAdd: (payload: EquipmentPickerPayload) => Promise<void>;
}) {
  const [zone, setZone] = useState(item.defaultZone);
  const [customZone, setCustomZone] = useState('');
  const [type, setType] = useState<EquipmentType>(item.type);
  const [brand, setBrand] = useState('');
  const [total, setTotal] = useState('1');
  const [maintenance, setMaintenance] = useState('0');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    const totalQuantity = Number(total);
    const maintenanceQuantity = Number(maintenance);
    const finalZone = zone === 'custom' ? customZone.trim() : zone;
    if (!finalZone) return setError('Selecciona o escribe una zona.');
    if (!Number.isInteger(totalQuantity) || totalQuantity < 1 || !Number.isInteger(maintenanceQuantity) || maintenanceQuantity < 0 || maintenanceQuantity > totalQuantity) {
      return setError('Verifica las cantidades: mantenimiento debe estar entre 0 y el total.');
    }
    setSaving(true);
    setError('');
    try {
      await onAdd({ name: item.name, zone: finalZone, brand: brand.trim() || undefined, type, totalQuantity, maintenanceQuantity, equipmentCategory: item.equipmentCategory });
      onClose();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo agregar el equipo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.configBackdrop}>
        <View style={styles.configCard}>
          <View style={styles.configHeader}><View><Text style={styles.configTitle}>{item.name}</Text><Text style={styles.configSubtitle}>{item.equipmentCategory}</Text></View><Pressable onPress={onClose}><MaterialCommunityIcons name="close" size={23} color="#F4F8F5" /></Pressable></View>
          <Text style={styles.sectionLabel}>Zona</Text>
          <View style={styles.chips}>{ZONES.map((entry) => <Pressable key={entry} onPress={() => setZone(entry)} style={[styles.chip, zone === entry && styles.chipActive]}><Text style={[styles.chipText, zone === entry && styles.chipTextActive]}>{entry}</Text></Pressable>)}<Pressable onPress={() => setZone('custom')} style={[styles.chip, zone === 'custom' && styles.chipActive]}><Text style={[styles.chipText, zone === 'custom' && styles.chipTextActive]}>Otra</Text></Pressable></View>
          {zone === 'custom' ? <TextInput value={customZone} onChangeText={setCustomZone} placeholder="Nombre de la zona" placeholderTextColor={palette.muted} style={styles.input} /> : null}
          <Text style={styles.sectionLabel}>Tipo</Text>
          <View style={styles.chips}>{(['strength', 'cardio'] as EquipmentType[]).map((entry) => <Pressable key={entry} onPress={() => setType(entry)} style={[styles.chip, type === entry && styles.chipActive]}><Text style={[styles.chipText, type === entry && styles.chipTextActive]}>{entry === 'cardio' ? 'Cardio' : 'Fuerza'}</Text></Pressable>)}</View>
          <Field label="Marca (opcional)" value={brand} onChangeText={setBrand} />
          <View style={styles.quantityRow}><View style={styles.quantityField}><Field label="Cantidad total" keyboardType="number-pad" value={total} onChangeText={(value) => setTotal(value.replace(/\D/g, ''))} /></View><View style={styles.quantityField}><Field label="En mantenimiento" keyboardType="number-pad" value={maintenance} onChangeText={(value) => setMaintenance(value.replace(/\D/g, ''))} /></View></View>
          {error ? <Notice error>{error}</Notice> : null}
          <ActionButton onPress={() => void submit()} disabled={saving}>{saving ? <ActivityIndicator color={palette.white} /> : 'Confirmar y agregar al inventario'}</ActionButton>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function normalizeName(value: string) {
  return value.trim().toLocaleLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#101412', padding: 20, paddingTop: 56 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  title: { color: '#F4F8F5', fontSize: 21, fontWeight: '800' },
  createButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4 },
  createText: { color: palette.green, fontSize: 15, fontWeight: '800' },
  search: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 16, backgroundColor: '#1E1E1E', paddingHorizontal: 14, marginBottom: 12 },
  searchInput: { flex: 1, color: '#F4F8F5', fontSize: 15 },
  filters: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  filterButton: { flex: 1, minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 14, backgroundColor: '#1E1E1E', paddingHorizontal: 14 },
  filterText: { color: '#F4F8F5', fontSize: 13, fontWeight: '700' },
  list: { gap: 8, paddingBottom: 32 },
  row: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, backgroundColor: '#1E1E1E', padding: 10 },
  iconCircle: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: '#26372E' },
  rowContent: { flex: 1, gap: 4 },
  itemName: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  itemMeta: { color: '#A1A1AA', fontSize: 12 },
  registered: { maxWidth: 94, borderRadius: 10, backgroundColor: '#10FF8512', paddingHorizontal: 7, paddingVertical: 5 },
  registeredText: { color: palette.green, fontSize: 10, fontWeight: '800', textAlign: 'center' },
  filterBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000066' },
  filterSheet: { minHeight: 400, backgroundColor: '#18181B', padding: 18, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  filterSheetContent: { flex: 1, minHeight: 400 },
  filterList: { paddingBottom: 32 },
  filterOption: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#333338' },
  filterOptionActive: { backgroundColor: '#10FF8512' },
  filterOptionText: { color: '#F4F8F5', fontSize: 15 },
  filterOptionTextActive: { color: palette.neon, fontWeight: '800' },
  configBackdrop: { flex: 1, justifyContent: 'center', backgroundColor: '#00000099', padding: 16 },
  configCard: { maxHeight: '92%', gap: 12, borderRadius: 24, backgroundColor: '#18181B', padding: 20 },
  configHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  configTitle: { color: '#F4F8F5', fontSize: 20, fontWeight: '800' },
  configSubtitle: { color: palette.green, fontSize: 13, marginTop: 4 },
  sectionLabel: { color: '#F4F8F5', fontSize: 13, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 38, justifyContent: 'center', borderRadius: 12, backgroundColor: '#27272A', paddingHorizontal: 11 },
  chipActive: { backgroundColor: palette.green },
  chipText: { color: '#D4D4D8', fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: '#081009' },
  input: { minHeight: 46, borderWidth: 1, borderColor: '#3F3F46', borderRadius: 12, color: '#F4F8F5', paddingHorizontal: 12 },
  quantityRow: { flexDirection: 'row', gap: 8 },
  quantityField: { flex: 1 },
});
