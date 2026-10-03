import { MaterialIcons } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { api, getApiErrorMessage } from './api';
import { useAuth } from './auth-context';
import { FloatingCard, IconBadge } from './fit-ui';
import { palette } from './theme';
import type { MembershipPlan } from './types';
import { ActionButton, Field, Notice, Page, SectionTitle } from './ui';

const currency = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });

export default function PlansScreen() {
  const { user } = useAuth();
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState<MembershipPlan | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [duration, setDuration] = useState('30');
  const [specs, setSpecs] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let isCurrent = true;
    api.get<{ plans: MembershipPlan[] }>('/plans', { params: { all: true } })
      .then((response) => {
        if (isCurrent) setPlans(response.data.plans);
      })
      .catch((requestError: unknown) => {
        if (isCurrent) setLoadError(getApiErrorMessage(requestError, 'No se pudieron cargar los planes.'));
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });
    return () => { isCurrent = false; };
  }, []);

  if (user?.role !== 'Admin') return <Redirect href="/(main)" />;

  function reset() {
    setEditing(null);
    setName('');
    setPrice('');
    setDuration('30');
    setSpecs('');
    setIsActive(true);
    setError('');
  }

  function startEdit(plan: MembershipPlan) {
    setEditing(plan);
    setName(plan.name);
    setPrice(String(plan.price));
    setDuration(String(plan.durationInDays));
    setSpecs(plan.specifications.join('\n'));
    setIsActive(plan.isActive);
    setError('');
  }

  async function save() {
    const priceValue = Number(price.replace(',', '.'));
    const durationValue = Number(duration);
    if (!name.trim()) return setError('El nombre del plan es obligatorio.');
    if (!price.trim() || !Number.isFinite(priceValue) || priceValue < 0) return setError('Ingresa un precio válido.');
    if (!Number.isInteger(durationValue) || durationValue < 1 || durationValue > 730) return setError('La duración debe ser de 1 a 730 días.');

    setError('');
    setIsSaving(true);
    const payload = {
      name: name.trim(),
      price: priceValue,
      durationInDays: durationValue,
      specifications: specs.split('\n').map((line) => line.trim()).filter(Boolean),
      isActive,
    };
    try {
      if (editing) {
        const response = await api.patch<{ plan: MembershipPlan }>(`/plans/${editing._id}`, payload);
        setPlans((current) => current.map((plan) => (plan._id === editing._id ? response.data.plan : plan)));
      } else {
        const response = await api.post<{ plan: MembershipPlan }>('/plans', payload);
        setPlans((current) => [...current, response.data.plan]);
      }
      reset();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No se pudo guardar el plan.'));
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleActive(plan: MembershipPlan) {
    setError('');
    try {
      const response = await api.patch<{ plan: MembershipPlan }>(`/plans/${plan._id}`, { isActive: !plan.isActive });
      setPlans((current) => current.map((entry) => (entry._id === plan._id ? response.data.plan : entry)));
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No se pudo actualizar el plan.'));
    }
  }

  async function remove(plan: MembershipPlan) {
    setError('');
    try {
      await api.delete(`/plans/${plan._id}`);
      setPlans((current) => current.filter((entry) => entry._id !== plan._id));
      if (editing?._id === plan._id) reset();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No se pudo eliminar el plan.'));
    }
  }

  return (
    <Page>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.back()}>
          <IconBadge name="arrow-back" color={palette.ink} />
        </Pressable>
        <View style={styles.flex}>
          <Text style={styles.title}>Planes de membresía</Text>
          <Text style={styles.subtitle}>Los planes activos se ofrecen al registrar clientes.</Text>
        </View>
      </View>

      <FloatingCard style={styles.form}>
        <SectionTitle>{editing ? 'Editar plan' : 'Nuevo plan'}</SectionTitle>
        <Field label="Nombre" placeholder="Mensual" value={name} onChangeText={setName} />
        <View style={styles.row}>
          <View style={styles.flex}><Field label="Precio (MXN)" keyboardType="decimal-pad" value={price} onChangeText={setPrice} /></View>
          <View style={styles.flex}><Field label="Duración (días)" keyboardType="number-pad" value={duration} onChangeText={(value) => setDuration(value.replace(/\D/g, ''))} /></View>
        </View>
        <View style={styles.group}>
          <Text style={styles.label}>Especificaciones (una por línea)</Text>
          <TextInput
            multiline
            value={specs}
            onChangeText={setSpecs}
            placeholder={'Acceso ilimitado\nClase grupal incluida'}
            placeholderTextColor={palette.muted}
            style={styles.specsInput}
          />
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.label}>Plan activo</Text>
          <Switch value={isActive} onValueChange={setIsActive} trackColor={{ true: palette.neon }} />
        </View>
        {error ? <Notice error>{error}</Notice> : null}
        <ActionButton onPress={() => void save()} disabled={isSaving}>
          {isSaving ? <ActivityIndicator color={palette.white} /> : editing ? 'Guardar cambios' : 'Crear plan'}
        </ActionButton>
        {editing ? <ActionButton secondary onPress={reset}>Cancelar edición</ActionButton> : null}
      </FloatingCard>

      <SectionTitle>{isLoading ? 'Cargando planes' : `${plans.length} planes`}</SectionTitle>
      {isLoading ? <ActivityIndicator color={palette.green} size="large" /> : null}
      {loadError ? <Notice error>{loadError}</Notice> : null}
      {!isLoading && !loadError && plans.length === 0 ? <Notice>Aún no hay planes. Crea el primero arriba.</Notice> : null}

      {plans.map((plan) => (
        <FloatingCard key={plan._id} style={[styles.card, !plan.isActive && styles.inactive]}>
          <View style={styles.cardTop}>
            <IconBadge name="workspace-premium" color={plan.isActive ? palette.neon : palette.muted} />
            <View style={styles.flex}>
              <Text style={styles.planName}>{plan.name}</Text>
              <Text style={styles.planMeta}>{currency.format(plan.price)} · {plan.durationInDays} días</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={plan.isActive ? 'Desactivar plan' : 'Activar plan'} onPress={() => void toggleActive(plan)}>
              <IconBadge name={plan.isActive ? 'visibility' : 'visibility-off'} color={plan.isActive ? palette.neon : palette.muted} size={38} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Editar plan" onPress={() => startEdit(plan)}>
              <IconBadge name="edit" color={palette.cyan} size={38} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Eliminar plan" onPress={() => void remove(plan)}>
              <IconBadge name="delete" color={palette.danger} size={38} />
            </Pressable>
          </View>
          {plan.specifications.map((line) => (
            <View key={line} style={styles.bullet}>
              <MaterialIcons name="check-circle" size={16} color={palette.neon} />
              <Text style={styles.bulletText}>{line}</Text>
            </View>
          ))}
          {!plan.isActive ? <Text style={styles.inactiveText}>Plan inactivo</Text> : null}
        </FloatingCard>
      ))}
    </Page>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  title: { color: palette.ink, fontSize: 24, fontWeight: '800' },
  subtitle: { color: palette.muted, fontSize: 13 },
  form: { gap: 14, padding: 20 },
  row: { flexDirection: 'row', gap: 12 },
  group: { gap: 8 },
  label: { color: palette.ink, fontSize: 13, fontWeight: '700' },
  specsInput: { minHeight: 90, borderRadius: 16, backgroundColor: '#F2F4EE', color: palette.ink, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, textAlignVertical: 'top' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  card: { gap: 10 },
  inactive: { opacity: 0.7 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  planName: { color: palette.ink, fontSize: 16, fontWeight: '800' },
  planMeta: { color: palette.muted, fontSize: 13 },
  bullet: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bulletText: { flex: 1, color: palette.ink, fontSize: 13 },
  inactiveText: { color: palette.muted, fontSize: 12, fontWeight: '700' },
});
