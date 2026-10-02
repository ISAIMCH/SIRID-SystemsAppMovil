import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { api, getApiErrorMessage } from './api';
import { useAuth } from './auth-context';
import { ActionButton, AppHeader, Field, Notice, Page, SectionTitle, Surface } from './ui';
import { palette } from './theme';

type EquipmentStatus = 'available' | 'busy' | 'out_of_service';
type UsageFrequency = 'low' | 'medium' | 'high';
type Equipment = {
  _id: string;
  name: string;
  zone: string;
  brand?: string;
  status: EquipmentStatus;
  usageFrequency: UsageFrequency;
};

const statuses: { value: EquipmentStatus; label: string }[] = [
  { value: 'available', label: 'Disponible' },
  { value: 'busy', label: 'Ocupado' },
  { value: 'out_of_service', label: 'Fuera de servicio' },
];

const statusLabels: Record<EquipmentStatus, string> = {
  available: 'Disponible',
  busy: 'Ocupado',
  out_of_service: 'Fuera de servicio',
};

const frequencyOptions: { value: UsageFrequency; label: string }[] = [
  { value: 'low', label: 'Baja' },
  { value: 'medium', label: 'Media' },
  { value: 'high', label: 'Alta' },
];

export default function InventoryScreen() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [name, setName] = useState('');
  const [zone, setZone] = useState('');
  const [brand, setBrand] = useState('');
  const [usageFrequency, setUsageFrequency] = useState<UsageFrequency>('medium');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
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

  async function createEquipment() {
    setError('');
    setSuccess('');
    if (!name.trim() || !zone.trim()) {
      setError('El nombre del equipo y la zona son obligatorios.');
      return;
    }

    setIsSaving(true);
    try {
      const response = await api.post<{ equipment: Equipment }>('/inventory', {
        name: name.trim(),
        zone: zone.trim(),
        ...(brand.trim() ? { brand: brand.trim() } : {}),
        status: 'available',
        usageFrequency,
      });
      setEquipment((current) => [...current, response.data.equipment].sort((a, b) => (
        a.zone.localeCompare(b.zone) || a.name.localeCompare(b.name)
      )));
      setName('');
      setZone('');
      setBrand('');
      setUsageFrequency('medium');
      setSuccess('Equipo agregado al inventario.');
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No se pudo agregar el equipo.'));
    } finally {
      setIsSaving(false);
    }
  }

  function retryLoad() {
    setLoadError('');
    setIsLoading(true);
    setRetryNumber((current) => current + 1);
  }

  async function setEquipmentStatus(item: Equipment, status: EquipmentStatus) {
    if (item.status === status) return;
    setError('');
    setSuccess('');
    setUpdatingId(item._id);
    try {
      const response = await api.patch<{ equipment: Equipment }>(`/inventory/${item._id}`, { status });
      setEquipment((current) => current.map((entry) => (
        entry._id === item._id ? response.data.equipment : entry
      )));
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No se pudo actualizar el estado del equipo.'));
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <Page>
      <AppHeader
        title="Inventario / Equipos"
        detail={isAdmin ? 'Administra el catálogo y la disponibilidad.' : 'Consulta equipos y su estado actual.'}
      />

      {loadError ? (
        <View style={styles.feedback}>
          <Notice error>{loadError}</Notice>
          <ActionButton secondary onPress={retryLoad}>Reintentar</ActionButton>
        </View>
      ) : null}

      {isAdmin ? (
        <Surface style={styles.createPanel}>
          <SectionTitle>Agregar equipo</SectionTitle>
          <Field label="Nombre del equipo" value={name} onChangeText={setName} />
          <Field label="Zona" placeholder="Cardio, peso libre…" value={zone} onChangeText={setZone} />
          <Field label="Marca (opcional)" value={brand} onChangeText={setBrand} />
          <View style={styles.frequencyGroup}>
            <Text style={styles.label}>Frecuencia de uso</Text>
            <View style={styles.frequencyOptions}>
              {frequencyOptions.map((option) => (
                <Choice
                  key={option.value}
                  selected={usageFrequency === option.value}
                  label={option.label}
                  onPress={() => setUsageFrequency(option.value)}
                />
              ))}
            </View>
          </View>
          {error ? <Notice error>{error}</Notice> : null}
          {success ? <Notice>{success}</Notice> : null}
          <ActionButton onPress={() => void createEquipment()} disabled={isSaving}>
            {isSaving ? <ActivityIndicator color={palette.white} /> : 'Agregar equipo'}
          </ActionButton>
        </Surface>
      ) : null}

      <SectionTitle>{isLoading ? 'Cargando equipos' : `${equipment.length} equipos registrados`}</SectionTitle>
      {isLoading ? <View style={styles.loading}><ActivityIndicator color={palette.green} size="large" /></View> : null}
      {!isLoading && !loadError && equipment.length === 0 ? <Notice>Aún no hay equipos en el inventario.</Notice> : null}

      {equipment.map((item) => (
        <Surface key={item._id} style={styles.equipmentCard}>
          <View style={styles.equipmentHeader}>
            <View style={styles.equipmentTitleGroup}>
              <Text style={styles.equipmentName}>{item.name}</Text>
              <Text style={styles.equipmentSub}>{item.zone}{item.brand ? ` · ${item.brand}` : ''}</Text>
            </View>
            <Text style={[styles.status, item.status === 'available' && styles.statusAvailable, item.status === 'out_of_service' && styles.statusOut]}>
              {statusLabels[item.status]}
            </Text>
          </View>
          <Text style={styles.frequency}>Frecuencia de uso · {frequencyOptions.find((option) => option.value === item.usageFrequency)?.label ?? 'Media'}</Text>
          {isAdmin ? (
            <View style={styles.statusEditor}>
              <Text style={styles.label}>Estado del equipo</Text>
              {updatingId === item._id ? <ActivityIndicator color={palette.green} /> : null}
              <View style={styles.frequencyOptions}>
                {statuses.map((option) => (
                  <Choice
                    key={option.value}
                    selected={item.status === option.value}
                    label={option.label}
                    onPress={() => void setEquipmentStatus(item, option.value)}
                  />
                ))}
              </View>
            </View>
          ) : null}
        </Surface>
      ))}
    </Page>
  );
}

function Choice({ selected, label, onPress }: { selected: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.choice, selected && styles.choiceSelected]}>
      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  createPanel: { gap: 14 },
  frequencyGroup: { gap: 8 },
  label: { color: palette.ink, fontSize: 13, fontWeight: '700' },
  frequencyOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  choice: { minHeight: 36, justifyContent: 'center', borderWidth: 1, borderColor: palette.line, borderRadius: 7, backgroundColor: palette.surface, paddingHorizontal: 10, paddingVertical: 6 },
  choiceSelected: { backgroundColor: palette.deepGreen, borderColor: palette.deepGreen },
  choiceText: { color: palette.ink, fontSize: 11, fontWeight: '700' },
  choiceTextSelected: { color: palette.white },
  feedback: { gap: 10 },
  loading: { minHeight: 100, justifyContent: 'center', alignItems: 'center' },
  equipmentCard: { gap: 14 },
  equipmentHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  equipmentTitleGroup: { flex: 1, gap: 4 },
  equipmentName: { color: palette.ink, fontSize: 16, fontWeight: '800' },
  equipmentSub: { color: palette.muted, fontSize: 12 },
  status: { overflow: 'hidden', borderRadius: 5, paddingHorizontal: 8, paddingVertical: 5, color: palette.coral, backgroundColor: '#F7E9E3', fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  statusAvailable: { color: palette.green, backgroundColor: '#E6EED7' },
  statusOut: { color: palette.danger, backgroundColor: '#F7E7E2' },
  frequency: { color: palette.muted, fontSize: 12 },
  statusEditor: { gap: 8, borderTopWidth: 1, borderTopColor: palette.line, paddingTop: 12 },
});