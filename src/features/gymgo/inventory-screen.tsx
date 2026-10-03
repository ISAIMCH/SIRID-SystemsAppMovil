import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { api, getApiErrorMessage } from './api';
import { useAuth } from './auth-context';
import { FloatingCard, IconBadge } from './fit-ui';
import { palette } from './theme';
import { ActionButton, AppHeader, Field, Notice, Page, SectionTitle } from './ui';

type EquipmentType = 'strength' | 'cardio';
type Equipment = {
  _id: string;
  name: string;
  zone: string;
  brand?: string;
  type: EquipmentType;
  totalQuantity: number;
  maintenanceQuantity: number;
};
type EquipmentInput = Omit<Equipment, '_id'>;

const NEW_ZONE = '__new__';

const typeOptions: { value: EquipmentType; label: string; icon: keyof typeof MaterialIcons.glyphMap }[] = [
  { value: 'strength', label: 'Fuerza', icon: 'fitness-center' },
  { value: 'cardio', label: 'Cardio', icon: 'directions-run' },
];

function isOperational(item: Pick<Equipment, 'totalQuantity' | 'maintenanceQuantity'>) {
  return item.totalQuantity - item.maintenanceQuantity > 0;
}

export default function InventoryScreen() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [success, setSuccess] = useState('');
  const [retryNumber, setRetryNumber] = useState(0);

  useEffect(() => {
    let isCurrent = true;
    api.get<{ equipment: Equipment[] }>('/inventory')
      .then((response) => {
        if (isCurrent) setEquipment(response.data.equipment);
      })
      .catch((requestError: unknown) => {
        if (isCurrent) setLoadError(getApiErrorMessage(requestError, 'No se pudo cargar el inventario.'));
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });
    return () => { isCurrent = false; };
  }, [retryNumber]);

  const zones = useMemo(() => [...new Set(equipment.map((item) => item.zone))].sort((a, b) => a.localeCompare(b)), [equipment]);

  function sortEquipment(items: Equipment[]) {
    return [...items].sort((a, b) => a.zone.localeCompare(b.zone) || a.name.localeCompare(b.name));
  }

  async function createEquipment(input: EquipmentInput) {
    setError('');
    setSuccess('');
    const response = await api.post<{ equipment: Equipment }>('/inventory', input);
    setEquipment((current) => sortEquipment([...current, response.data.equipment]));
    setSuccess('Equipo agregado al inventario.');
  }

  async function updateEquipment(item: Equipment, changes: Partial<EquipmentInput>) {
    setError('');
    setSuccess('');
    setUpdatingId(item._id);
    try {
      const response = await api.patch<{ equipment: Equipment }>(`/inventory/${item._id}`, changes);
      setEquipment((current) => sortEquipment(current.map((entry) => (entry._id === item._id ? response.data.equipment : entry))));
      return true;
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No se pudo actualizar el equipo.'));
      return false;
    } finally {
      setUpdatingId(null);
    }
  }

  function retryLoad() {
    setLoadError('');
    setIsLoading(true);
    setRetryNumber((current) => current + 1);
  }

  return (
    <Page>
      <AppHeader
        title="Inventario / Equipos"
        detail={isAdmin ? 'Administra el catálogo y las unidades disponibles.' : 'Consulta equipos y su disponibilidad.'}
      />

      {loadError ? (
        <View style={styles.feedback}>
          <Notice error>{loadError}</Notice>
          <ActionButton secondary onPress={retryLoad}>Reintentar</ActionButton>
        </View>
      ) : null}

      {isAdmin ? (
        <FloatingCard style={styles.panel}>
          <SectionTitle>Agregar equipo</SectionTitle>
          <EquipmentForm
            zones={zones}
            submitLabel="Agregar equipo"
            resetOnSubmit
            onSubmit={createEquipment}
          />
        </FloatingCard>
      ) : null}

      {error ? <Notice error>{error}</Notice> : null}
      {success ? <Notice>{success}</Notice> : null}

      <SectionTitle>{isLoading ? 'Cargando equipos' : `${equipment.length} equipos registrados`}</SectionTitle>
      {isLoading ? <View style={styles.loading}><ActivityIndicator color={palette.green} size="large" /></View> : null}
      {!isLoading && !loadError && equipment.length === 0 ? <Notice>Aún no hay equipos en el inventario.</Notice> : null}

      {equipment.map((item) => {
        const operational = isOperational(item);
        const available = item.totalQuantity - item.maintenanceQuantity;
        const typeInfo = typeOptions.find((option) => option.value === item.type) ?? typeOptions[0];
        const color = operational ? palette.neon : palette.danger;
        return (
          <FloatingCard key={item._id} style={styles.card}>
            <View style={styles.cardHeader}>
              <IconBadge name={typeInfo.icon} color={item.type === 'cardio' ? palette.cyan : palette.violet} />
              <View style={styles.cardTitle}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.sub}>{item.zone}{item.brand ? ` · ${item.brand}` : ''} · {typeInfo.label}</Text>
              </View>
              <View style={[styles.statusChip, { backgroundColor: `${color}26` }]}>
                <Text style={[styles.statusText, { color: operational ? palette.green : palette.danger }]}>
                  {operational ? 'Operativo' : 'Sin unidades'}
                </Text>
              </View>
            </View>
            <Text style={styles.availability}>{available} de {item.totalQuantity} unidades disponibles</Text>

            {isAdmin ? (
              <>
                <View style={styles.stepperRow}>
                  <Stepper
                    label="Total"
                    value={item.totalQuantity}
                    min={Math.max(1, item.maintenanceQuantity)}
                    disabled={updatingId === item._id}
                    onChange={(value) => void updateEquipment(item, { totalQuantity: value })}
                  />
                  <Stepper
                    label="En mantenimiento"
                    value={item.maintenanceQuantity}
                    min={0}
                    max={item.totalQuantity}
                    disabled={updatingId === item._id}
                    onChange={(value) => void updateEquipment(item, { maintenanceQuantity: value })}
                  />
                </View>
                {updatingId === item._id ? <ActivityIndicator color={palette.green} /> : null}
                {editingId === item._id ? (
                  <EquipmentForm
                    zones={zones}
                    initial={item}
                    submitLabel="Guardar cambios"
                    onCancel={() => setEditingId(null)}
                    onSubmit={async (input) => {
                      const saved = await updateEquipment(item, input);
                      if (saved) setEditingId(null);
                    }}
                  />
                ) : (
                  <Pressable accessibilityRole="button" onPress={() => setEditingId(item._id)} style={styles.editButton}>
                    <MaterialIcons name="edit" size={16} color={palette.green} />
                    <Text style={styles.editText}>Editar datos</Text>
                  </Pressable>
                )}
              </>
            ) : null}
          </FloatingCard>
        );
      })}
    </Page>
  );
}

function Stepper({ label, value, min, max, disabled, onChange }: {
  label: string;
  value: number;
  min: number;
  max?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const canDecrease = !disabled && value > min;
  const canIncrease = !disabled && (max === undefined || value < max);
  return (
    <View style={styles.stepper}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperControls}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Disminuir ${label}`} disabled={!canDecrease} onPress={() => onChange(value - 1)} style={[styles.stepButton, !canDecrease && styles.stepDisabled]}>
          <MaterialIcons name="remove" size={18} color={palette.ink} />
        </Pressable>
        <Text style={styles.stepValue}>{value}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Aumentar ${label}`} disabled={!canIncrease} onPress={() => onChange(value + 1)} style={[styles.stepButton, !canIncrease && styles.stepDisabled]}>
          <MaterialIcons name="add" size={18} color={palette.ink} />
        </Pressable>
      </View>
    </View>
  );
}

function EquipmentForm({ zones, initial, submitLabel, resetOnSubmit = false, onSubmit, onCancel }: {
  zones: string[];
  initial?: Equipment;
  submitLabel: string;
  resetOnSubmit?: boolean;
  onSubmit: (input: EquipmentInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [zoneChoice, setZoneChoice] = useState(initial?.zone ?? '');
  const [newZone, setNewZone] = useState('');
  const [isZoneOpen, setIsZoneOpen] = useState(false);
  const [brand, setBrand] = useState(initial?.brand ?? '');
  const [type, setType] = useState<EquipmentType>(initial?.type ?? 'strength');
  const [total, setTotal] = useState(String(initial?.totalQuantity ?? 1));
  const [maintenance, setMaintenance] = useState(String(initial?.maintenanceQuantity ?? 0));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const zone = zoneChoice === NEW_ZONE ? newZone.trim() : zoneChoice;

  async function submit() {
    const totalQuantity = Number(total);
    const maintenanceQuantity = Number(maintenance);
    if (!name.trim() || !zone) return setError('El nombre del equipo y la zona son obligatorios.');
    if (!Number.isInteger(totalQuantity) || totalQuantity < 1) return setError('La cantidad total debe ser al menos 1.');
    if (!Number.isInteger(maintenanceQuantity) || maintenanceQuantity < 0 || maintenanceQuantity > totalQuantity) {
      return setError('Las unidades en mantenimiento deben estar entre 0 y el total.');
    }

    setError('');
    setIsSaving(true);
    try {
      await onSubmit({ name: name.trim(), zone, brand: brand.trim() || undefined, type, totalQuantity, maintenanceQuantity });
      if (resetOnSubmit) {
        setName('');
        setZoneChoice('');
        setNewZone('');
        setBrand('');
        setType('strength');
        setTotal('1');
        setMaintenance('0');
      }
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No se pudo guardar el equipo.'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <View style={styles.form}>
      <Field label="Nombre del equipo" value={name} onChangeText={setName} />

      <View style={styles.group}>
        <Text style={styles.label}>Zona</Text>
        <Pressable accessibilityRole="button" onPress={() => setIsZoneOpen((open) => !open)} style={styles.select}>
          <Text style={[styles.selectText, !zone && !zoneChoice && styles.placeholder]}>
            {zoneChoice === NEW_ZONE ? '+ Agregar nueva zona' : zoneChoice || 'Selecciona una zona'}
          </Text>
          <MaterialIcons name={isZoneOpen ? 'expand-less' : 'expand-more'} size={22} color={palette.muted} />
        </Pressable>
        {isZoneOpen ? (
          <View style={styles.options}>
            {zones.map((entry) => (
              <Pressable key={entry} accessibilityRole="button" onPress={() => { setZoneChoice(entry); setIsZoneOpen(false); }} style={styles.option}>
                <Text style={[styles.optionText, zoneChoice === entry && styles.optionSelected]}>{entry}</Text>
              </Pressable>
            ))}
            <Pressable accessibilityRole="button" onPress={() => { setZoneChoice(NEW_ZONE); setIsZoneOpen(false); }} style={styles.option}>
              <Text style={[styles.optionText, styles.optionNew]}>+ Agregar nueva zona</Text>
            </Pressable>
          </View>
        ) : null}
        {zoneChoice === NEW_ZONE ? <Field label="Nombre de la nueva zona" value={newZone} onChangeText={setNewZone} /> : null}
      </View>

      <Field label="Marca (opcional)" value={brand} onChangeText={setBrand} />

      <View style={styles.group}>
        <Text style={styles.label}>Tipo de máquina</Text>
        <View style={styles.chips}>
          {typeOptions.map((option) => (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected: type === option.value }}
              onPress={() => setType(option.value)}
              style={[styles.chip, type === option.value && styles.chipSelected]}>
              <MaterialIcons name={option.icon} size={16} color={type === option.value ? palette.white : palette.ink} />
              <Text style={[styles.chipText, type === option.value && styles.chipTextSelected]}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.quantityRow}>
        <View style={styles.quantityField}>
          <Field label="Cantidad total" keyboardType="number-pad" value={total} onChangeText={(value) => setTotal(value.replace(/\D/g, ''))} />
        </View>
        <View style={styles.quantityField}>
          <Field label="En mantenimiento" keyboardType="number-pad" value={maintenance} onChangeText={(value) => setMaintenance(value.replace(/\D/g, ''))} />
        </View>
      </View>

      {error ? <Notice error>{error}</Notice> : null}
      <ActionButton onPress={() => void submit()} disabled={isSaving}>
        {isSaving ? <ActivityIndicator color={palette.white} /> : submitLabel}
      </ActionButton>
      {onCancel ? <ActionButton secondary onPress={onCancel}>Cancelar</ActionButton> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 14 },
  feedback: { gap: 10 },
  loading: { minHeight: 100, justifyContent: 'center', alignItems: 'center' },
  card: { gap: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardTitle: { flex: 1, gap: 3 },
  name: { color: palette.ink, fontSize: 16, fontWeight: '800' },
  sub: { color: palette.muted, fontSize: 12 },
  statusChip: { borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  statusText: { fontSize: 11, fontWeight: '800' },
  availability: { color: palette.muted, fontSize: 13, fontWeight: '600' },
  stepperRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, borderTopWidth: 1, borderTopColor: palette.line, paddingTop: 12 },
  stepper: { gap: 6 },
  stepperLabel: { color: palette.ink, fontSize: 12, fontWeight: '700' },
  stepperControls: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F2F4EE', alignItems: 'center', justifyContent: 'center' },
  stepDisabled: { opacity: 0.4 },
  stepValue: { minWidth: 28, textAlign: 'center', color: palette.ink, fontSize: 17, fontWeight: '800' },
  editButton: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  editText: { color: palette.green, fontSize: 13, fontWeight: '800' },
  form: { gap: 14 },
  group: { gap: 8 },
  label: { color: palette.ink, fontSize: 13, fontWeight: '700' },
  select: { height: 52, borderRadius: 8, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.surface, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectText: { color: palette.ink, fontSize: 16 },
  placeholder: { color: palette.muted },
  options: { borderRadius: 12, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.white, overflow: 'hidden' },
  option: { paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: palette.line },
  optionText: { color: palette.ink, fontSize: 15 },
  optionSelected: { color: palette.green, fontWeight: '800' },
  optionNew: { color: palette.cyan, fontWeight: '800' },
  chips: { flexDirection: 'row', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#F2F4EE' },
  chipSelected: { backgroundColor: palette.deepGreen },
  chipText: { color: palette.ink, fontSize: 13, fontWeight: '700' },
  chipTextSelected: { color: palette.white },
  quantityRow: { flexDirection: 'row', gap: 12 },
  quantityField: { flex: 1 },
});
