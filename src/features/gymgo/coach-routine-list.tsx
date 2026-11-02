import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { api, getApiErrorMessage } from './api';
import { FloatingCard } from './fit-ui';
import { routineEditorHref } from './routine-links';
import { palette } from './theme';
import type { Routine } from './types';
import { Notice, useDarkUi } from './ui';

const dayShort = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const levelNames = { principiante: 'Principiante', intermedio: 'Intermedio', avanzado: 'Avanzado' };

function routineClient(routine: Routine) {
  return typeof routine.assignedTo === 'object' && routine.assignedTo ? routine.assignedTo : null;
}

function blockCount(routine: Routine) {
  return routine.blocks?.length ?? routine.exercises.length;
}

// Active routine first; the API already sorts the rest by last update.
function byStatus(routines: Routine[]) {
  return [...routines].sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active'));
}

// Routines the staff manages, optionally grouped by client. `onChanged` reloads after one is activated.
export function CoachRoutineList({ routines, groupByClient = false, onChanged }: {
  routines: Routine[];
  groupByClient?: boolean;
  onChanged: () => void;
}) {
  const dark = useDarkUi();
  const [activatingId, setActivatingId] = useState('');
  const [error, setError] = useState('');

  async function activate(routine: Routine) {
    setError('');
    setActivatingId(routine._id);
    try {
      await api.patch(`/routines/${routine._id}`, { status: 'active' });
      onChanged();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No se pudo activar la rutina.'));
    } finally {
      setActivatingId('');
    }
  }

  function renderCard(routine: Routine) {
    const isActive = routine.status === 'active';
    const days = (routine.scheduleDays ?? []).map((day) => dayShort[day]).join(' · ');
    const blocks = blockCount(routine);
    return (
      <FloatingCard key={routine._id} style={styles.card}>
        <View style={styles.cardTop}>
          <Text style={[styles.title, dark && styles.darkTitle]} numberOfLines={2}>{routine.title}</Text>
          <View style={[styles.chip, isActive ? styles.chipActive : styles.chipPaused]}>
            <Text style={[styles.chipText, isActive ? styles.chipTextActive : styles.chipTextPaused]}>{isActive ? 'Activa' : 'Pausada'}</Text>
          </View>
        </View>
        <Text style={[styles.meta, dark && styles.darkMeta]}>
          {levelNames[routine.level] ?? routine.level} · {routine.daysPerWeek} días/semana · {routine.durationWeeks} semanas
        </Text>
        <Text style={[styles.meta, dark && styles.darkMeta]}>
          {days ? `${days} · ` : ''}{blocks} {blocks === 1 ? 'bloque' : 'bloques'}
        </Text>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={() => router.push(routineEditorHref({ routineId: routine._id }))}>
            <Text style={styles.link}>Editar rutina</Text>
          </Pressable>
          {!isActive ? (
            <Pressable accessibilityRole="button" disabled={Boolean(activatingId)} onPress={() => void activate(routine)}>
              {activatingId === routine._id ? <ActivityIndicator color={palette.green} /> : <Text style={styles.link}>Activar</Text>}
            </Pressable>
          ) : null}
        </View>
      </FloatingCard>
    );
  }

  if (!groupByClient) {
    return (
      <View style={styles.list}>
        {error ? <Notice error>{error}</Notice> : null}
        {byStatus(routines).map(renderCard)}
      </View>
    );
  }

  const groups = new Map<string, { name: string; clientId: string; routines: Routine[] }>();
  for (const routine of routines) {
    const client = routineClient(routine);
    const key = client?._id ?? (typeof routine.assignedTo === 'string' ? routine.assignedTo : 'none');
    const group = groups.get(key) ?? { name: client?.name ?? 'Cliente', clientId: client?._id ?? '', routines: [] };
    group.routines.push(routine);
    groups.set(key, group);
  }
  const sortedGroups = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));

  return (
    <View style={styles.groups}>
      {error ? <Notice error>{error}</Notice> : null}
      {sortedGroups.map((group) => (
        <View key={group.clientId || group.name} style={styles.list}>
          <View style={styles.groupHeader}>
            <Text style={[styles.groupName, dark && styles.darkTitle]}>{group.name}</Text>
            <Text style={[styles.meta, dark && styles.darkMeta]}>{group.routines.length} {group.routines.length === 1 ? 'rutina' : 'rutinas'}</Text>
          </View>
          {byStatus(group.routines).map(renderCard)}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  groups: { gap: 22 },
  list: { gap: 10 },
  groupHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  groupName: { flex: 1, color: palette.ink, fontSize: 17, fontWeight: '800' },
  card: { gap: 6, padding: 16 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  title: { flex: 1, color: palette.ink, fontSize: 15, fontWeight: '800' },
  darkTitle: { color: '#F4F8F5' },
  meta: { color: palette.muted, fontSize: 12 },
  darkMeta: { color: '#91A098' },
  chip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3 },
  chipActive: { borderColor: '#10FF85', backgroundColor: '#10FF8514' },
  chipPaused: { borderColor: '#52525B' },
  chipText: { fontSize: 11, fontWeight: '800' },
  chipTextActive: { color: '#10FF85' },
  chipTextPaused: { color: '#A1A1AA' },
  actions: { flexDirection: 'row', gap: 22, paddingTop: 4 },
  link: { color: palette.green, fontSize: 13, fontWeight: '800', paddingVertical: 6 },
});
