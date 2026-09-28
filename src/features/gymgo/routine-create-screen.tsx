import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';

import { api, getApiErrorMessage } from './api';
import { useAuth } from './auth-context';
import { ActionButton, AppHeader, Field, Notice, Page, SectionTitle, Surface } from './ui';
import { palette } from './theme';
import type { DirectoryClient } from './directory-types';

type EquipmentStatus = 'available' | 'busy' | 'out_of_service';
type Equipment = { _id: string; name: string; zone: string; status: EquipmentStatus };
type RoutineLevel = 'principiante' | 'intermedio' | 'avanzado';
type DraftExercise = {
  name: string;
  muscleGroup: string;
  equipmentId: string;
  day: number;
  sets: number;
  reps: string;
  suggestedWeight?: number;
  restSeconds: number;
  order: number;
};

const weekDays = [
  { value: 1, label: 'Lun' }, { value: 2, label: 'Mar' }, { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' }, { value: 5, label: 'Vie' }, { value: 6, label: 'Sáb' }, { value: 0, label: 'Dom' },
];

const weekDayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const levels: RoutineLevel[] = ['principiante', 'intermedio', 'avanzado'];

export default function RoutineCreateScreen() {
  const { user } = useAuth();
  const [clients, setClients] = useState<DirectoryClient[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [isLoadingReferences, setIsLoadingReferences] = useState(true);
  const [referenceError, setReferenceError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const [title, setTitle] = useState('');
  const [goal, setGoal] = useState('');
  const [level, setLevel] = useState<RoutineLevel>('principiante');
  const [durationWeeks, setDurationWeeks] = useState('4');
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [assignedTo, setAssignedTo] = useState('');

  const [exerciseName, setExerciseName] = useState('');
  const [muscleGroup, setMuscleGroup] = useState('');
  const [equipmentId, setEquipmentId] = useState('');
  const [exerciseDay, setExerciseDay] = useState<number | null>(null);
  const [sets, setSets] = useState('3');
  const [reps, setReps] = useState('10');
  const [suggestedWeight, setSuggestedWeight] = useState('');
  const [restSeconds, setRestSeconds] = useState('60');
  const [exercises, setExercises] = useState<DraftExercise[]>([]);

  useEffect(() => {
    let isCurrent = true;

    async function loadReferences() {
      try {
        const [clientsResponse, equipmentResponse] = await Promise.all([
          api.get<{ users: DirectoryClient[] }>('/auth/users', { params: { role: 'Cliente' } }),
          api.get<{ equipment: Equipment[] }>('/inventory'),
        ]);
        if (!isCurrent) return;
        setClients(clientsResponse.data.users);
        setEquipment(equipmentResponse.data.equipment.filter((item) => item.status !== 'out_of_service'));
      } catch (requestError) {
        if (isCurrent) setReferenceError(getApiErrorMessage(requestError, 'No se pudieron cargar clientes o equipos.'));
      } finally {
        if (isCurrent) setIsLoadingReferences(false);
      }
    }

    void loadReferences();
    return () => { isCurrent = false; };
  }, []);

  if (user?.role !== 'Coach') return <Redirect href="/(main)/routines" />;

  function toggleDay(day: number) {
    setSelectedDays((current) => (
      current.includes(day) ? current.filter((value) => value !== day) : [...current, day]
    ));
    setExerciseDay((current) => current === day ? null : current);
  }

  function addExercise() {
    setError('');
    if (!exerciseName.trim() || !muscleGroup.trim() || !equipmentId || exerciseDay === null) {
      setError('Completa ejercicio, grupo muscular, equipo del inventario y día.');
      return;
    }
    const parsedSets = Number(sets);
    const parsedReps = reps.trim();
    const parsedRest = Number(restSeconds);
    const parsedWeight = suggestedWeight.trim() ? Number(suggestedWeight) : undefined;
    if (!Number.isInteger(parsedSets) || parsedSets < 1 || !parsedReps || !Number.isInteger(parsedRest) || parsedRest < 0) {
      setError('Verifica series, repeticiones y descanso.');
      return;
    }
    if (parsedWeight !== undefined && (!Number.isFinite(parsedWeight) || parsedWeight < 0)) {
      setError('El peso sugerido debe ser un número igual o mayor que cero.');
      return;
    }

    setExercises((current) => [...current, {
      name: exerciseName.trim(),
      muscleGroup: muscleGroup.trim(),
      equipmentId,
      day: exerciseDay,
      sets: parsedSets,
      reps: parsedReps,
      ...(parsedWeight !== undefined ? { suggestedWeight: parsedWeight } : {}),
      restSeconds: parsedRest,
      order: current.length,
    }]);
    setExerciseName('');
    setMuscleGroup('');
    setEquipmentId('');
    setSuggestedWeight('');
  }

  async function saveRoutine() {
    setError('');
    if (!title.trim() || !goal.trim() || !assignedTo) {
      setError('Completa el nombre, objetivo y cliente de la rutina.');
      return;
    }
    if (!selectedDays.length) {
      setError('Selecciona al menos un día de entrenamiento.');
      return;
    }
    if (!exercises.length) {
      setError('Agrega al menos un ejercicio desde el inventario.');
      return;
    }
    const weeks = Number(durationWeeks);
    if (!Number.isInteger(weeks) || weeks < 1 || weeks > 52) {
      setError('La duración debe ser de 1 a 52 semanas.');
      return;
    }

    setIsSaving(true);
    try {
      await api.post('/routines', {
        title: title.trim(),
        goal: goal.trim(),
        level,
        durationWeeks: weeks,
        daysPerWeek: selectedDays.length,
        scheduleDays: selectedDays,
        assignedTo,
        status: 'active',
        exercises,
      });
      router.replace('/(main)/routines');
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No se pudo guardar la rutina.'));
    } finally {
      setIsSaving(false);
    }
  }

  const eligibleEquipment = equipment.filter((item) => item.status !== 'out_of_service');

  return (
    <Page>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
        <Text style={styles.backText}>‹  Rutinas</Text>
      </Pressable>
      <AppHeader title="Coach Creator" detail="Diseña el plan y asígnalo a uno de tus clientes." />

      {referenceError ? <Notice error>{referenceError}</Notice> : null}
      {isLoadingReferences ? <View style={styles.loading}><ActivityIndicator color={palette.green} size="large" /></View> : null}
      {!isLoadingReferences && clients.length === 0 ? <Notice>No tienes clientes asignados para recibir una rutina.</Notice> : null}
      {!isLoadingReferences && eligibleEquipment.length === 0 ? <Notice>No hay equipos disponibles en el inventario para diseñar ejercicios.</Notice> : null}

      <Surface style={styles.section}>
        <SectionTitle>Datos de la rutina</SectionTitle>
        <Field label="Nombre del plan" placeholder="Fuerza base" value={title} onChangeText={setTitle} />
        <Field label="Objetivo" placeholder="Fuerza, hipertrofia…" value={goal} onChangeText={setGoal} />
        <Field label="Duración (semanas)" keyboardType="number-pad" value={durationWeeks} onChangeText={setDurationWeeks} />
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Nivel</Text>
          <View style={styles.chips}>
            {levels.map((item) => (
              <Choice key={item} label={capitalize(item)} selected={level === item} onPress={() => setLevel(item)} />
            ))}
          </View>
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Días programados ({selectedDays.length})</Text>
          <View style={styles.chips}>
            {weekDays.map((day) => (
              <Choice key={day.value} label={day.label} selected={selectedDays.includes(day.value)} onPress={() => toggleDay(day.value)} />
            ))}
          </View>
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Asignar a cliente</Text>
          {clients.map((client) => (
            <Pressable
              key={client.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: assignedTo === client.id }}
              onPress={() => setAssignedTo(client.id)}
              style={[styles.clientOption, assignedTo === client.id && styles.selectedOption]}>
              <View style={styles.clientText}>
                <Text style={[styles.clientName, assignedTo === client.id && styles.selectedText]}>{client.name}</Text>
                <Text style={[styles.clientEmail, assignedTo === client.id && styles.selectedText]}>{client.email}</Text>
              </View>
              <Text style={[styles.radio, assignedTo === client.id && styles.radioSelected]}>{assignedTo === client.id ? '●' : '○'}</Text>
            </Pressable>
          ))}
        </View>
      </Surface>

      <Surface style={styles.section}>
        <SectionTitle>Agregar ejercicio</SectionTitle>
        <Field label="Ejercicio" value={exerciseName} onChangeText={setExerciseName} placeholder="Prensa de pierna" />
        <Field label="Grupo muscular" value={muscleGroup} onChangeText={setMuscleGroup} placeholder="Pierna" />
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Equipo del inventario</Text>
          <Text style={styles.helper}>Se carga desde el catálogo; no se puede escribir equipo manualmente.</Text>
          <View style={styles.equipmentList}>
            {eligibleEquipment.map((item) => (
              <Choice
                key={item._id}
                label={`${item.name} · ${item.zone}`}
                selected={equipmentId === item._id}
                onPress={() => setEquipmentId(item._id)}
              />
            ))}
          </View>
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Día del ejercicio</Text>
          <View style={styles.chips}>
            {weekDays.filter((day) => selectedDays.includes(day.value)).map((day) => (
              <Choice key={day.value} label={day.label} selected={exerciseDay === day.value} onPress={() => setExerciseDay(day.value)} />
            ))}
          </View>
        </View>
        <View style={styles.numberRow}>
          <View style={styles.numberField}><Field label="Series" keyboardType="number-pad" value={sets} onChangeText={setSets} /></View>
          <View style={styles.numberField}><Field label="Repeticiones" value={reps} onChangeText={setReps} placeholder="8-10" /></View>
        </View>
        <View style={styles.numberRow}>
          <View style={styles.numberField}><Field label="Peso sugerido (kg)" keyboardType="decimal-pad" value={suggestedWeight} onChangeText={setSuggestedWeight} placeholder="Opcional" /></View>
          <View style={styles.numberField}><Field label="Descanso (segundos)" keyboardType="number-pad" value={restSeconds} onChangeText={setRestSeconds} /></View>
        </View>
        <ActionButton onPress={addExercise} disabled={isLoadingReferences || !eligibleEquipment.length || !selectedDays.length}>
          Añadir ejercicio
        </ActionButton>
      </Surface>

      {exercises.length ? (
        <View style={styles.fieldGroup}>
          <SectionTitle>{`${exercises.length} ejercicios en la rutina`}</SectionTitle>
          {exercises.map((exercise, index) => {
            const selectedEquipment = equipment.find((item) => item._id === exercise.equipmentId);
            return (
              <Surface key={`${exercise.name}-${index}`} style={styles.exerciseRow}>
                <View style={styles.exerciseInfo}>
                  <Text style={styles.exerciseName}>{exercise.name}</Text>
                  <Text style={styles.exerciseMeta}>
                    {weekDayNames[exercise.day]} · {selectedEquipment?.name ?? 'Equipo'} · {exercise.sets} × {exercise.reps} · {exercise.restSeconds}s descanso
                  </Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel={`Quitar ${exercise.name}`} onPress={() => setExercises((current) => current.filter((_, itemIndex) => itemIndex !== index).map((item, order) => ({ ...item, order })))}>
                  <Text style={styles.remove}>Quitar</Text>
                </Pressable>
              </Surface>
            );
          })}
        </View>
      ) : null}

      {error ? <Notice error>{error}</Notice> : null}
      <ActionButton onPress={() => void saveRoutine()} disabled={isSaving || isLoadingReferences || !clients.length || !eligibleEquipment.length}>
        {isSaving ? <ActivityIndicator color={palette.white} /> : 'Guardar y asignar rutina'}
      </ActionButton>
    </Page>
  );
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.choice, selected && styles.selectedOption]}>
      <Text style={[styles.choiceText, selected && styles.selectedText]}>{label}</Text>
    </Pressable>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const styles = StyleSheet.create({
  backButton: { alignSelf: 'flex-start', paddingVertical: 4, paddingRight: 12 },
  backText: { color: palette.green, fontSize: 14, fontWeight: '800' },
  loading: { minHeight: 80, alignItems: 'center', justifyContent: 'center' },
  section: { gap: 15 },
  fieldGroup: { gap: 8 },
  label: { color: palette.ink, fontSize: 13, fontWeight: '700' },
  helper: { color: palette.muted, fontSize: 11, lineHeight: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  equipmentList: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, maxHeight: 190, overflow: 'scroll' },
  choice: { minHeight: 36, justifyContent: 'center', borderWidth: 1, borderColor: palette.line, borderRadius: 7, backgroundColor: palette.surface, paddingHorizontal: 10, paddingVertical: 7 },
  selectedOption: { backgroundColor: palette.deepGreen, borderColor: palette.deepGreen },
  choiceText: { color: palette.ink, fontSize: 11, fontWeight: '700' },
  selectedText: { color: palette.white },
  clientOption: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderWidth: 1, borderColor: palette.line, borderRadius: 8, padding: 10 },
  clientText: { flex: 1, gap: 3 },
  clientName: { color: palette.ink, fontSize: 13, fontWeight: '800' },
  clientEmail: { color: palette.muted, fontSize: 11 },
  radio: { color: palette.muted, fontSize: 18 },
  radioSelected: { color: palette.lime },
  numberRow: { flexDirection: 'row', gap: 10 },
  numberField: { flex: 1 },
  exerciseRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13 },
  exerciseInfo: { flex: 1, gap: 4 },
  exerciseName: { color: palette.ink, fontSize: 14, fontWeight: '800' },
  exerciseMeta: { color: palette.muted, fontSize: 11, lineHeight: 16 },
  remove: { color: palette.danger, fontSize: 11, fontWeight: '800', padding: 6 },
});