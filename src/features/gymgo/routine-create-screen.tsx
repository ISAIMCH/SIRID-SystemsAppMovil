import { MaterialIcons } from '@expo/vector-icons';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { api, getApiErrorMessage } from './api';
import { useAuth } from './auth-context';
import type { DirectoryClient } from './directory-types';
import { FloatingCard, IconBadge } from './fit-ui';
import { SelectField } from './select-field';
import { palette } from './theme';
import type { Exercise, Routine, RoutineTemplate } from './types';
import { ActionButton, Field, Notice, Page, SectionTitle } from './ui';

type Equipment = { _id: string; name: string; zone: string; status: 'available' | 'busy' | 'out_of_service' };
type RoutineLevel = 'principiante' | 'intermedio' | 'avanzado';
type DraftExercise = {
  _id?: string;
  name: string;
  muscleGroup: string;
  equipmentId?: string;
  bodyweight: boolean;
  day: number;
  sets: number;
  reps: string;
  suggestedWeight?: number;
  restSeconds: number;
  order: number;
};

const BODYWEIGHT = 'bodyweight';

const weekDays = [
  { value: 1, label: 'Lun' }, { value: 2, label: 'Mar' }, { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' }, { value: 5, label: 'Vie' }, { value: 6, label: 'Sáb' }, { value: 0, label: 'Dom' },
];
const weekDayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const levels: RoutineLevel[] = ['principiante', 'intermedio', 'avanzado'];

function toDraft(exercise: Exercise, order: number): DraftExercise {
  const equipmentId = typeof exercise.equipmentId === 'object' ? exercise.equipmentId._id : exercise.equipmentId;
  return {
    _id: exercise._id,
    name: exercise.name,
    muscleGroup: exercise.muscleGroup,
    equipmentId: exercise.bodyweight ? undefined : equipmentId,
    bodyweight: Boolean(exercise.bodyweight),
    day: exercise.day ?? 0,
    sets: exercise.sets,
    reps: exercise.reps,
    suggestedWeight: exercise.suggestedWeight,
    restSeconds: exercise.restSeconds,
    order,
  };
}

export default function RoutineCreateScreen() {
  const { n } = useLocalSearchParams<{ n?: string }>();
  return <RoutineForm key={n ?? 'default'} />;
}

function RoutineForm() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ mode?: string; templateId?: string; routineId?: string; clientId?: string }>();
  const isTemplate = params.mode === 'template';
  const editingId = isTemplate ? params.templateId : params.routineId;
  const isEditing = Boolean(editingId);

  const [clients, setClients] = useState<DirectoryClient[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [muscleGroups, setMuscleGroups] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const [title, setTitle] = useState('');
  const [goal, setGoal] = useState('');
  const [level, setLevel] = useState<RoutineLevel>('principiante');
  const [durationWeeks, setDurationWeeks] = useState('4');
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [assignedTo, setAssignedTo] = useState(params.clientId ?? '');

  const [exerciseName, setExerciseName] = useState('');
  const [muscleGroup, setMuscleGroup] = useState('');
  const [isAddingGroup, setIsAddingGroup] = useState(false);
  const [newGroup, setNewGroup] = useState('');
  const [equipmentChoice, setEquipmentChoice] = useState('');
  const [exerciseDay, setExerciseDay] = useState<number | null>(null);
  const [sets, setSets] = useState('3');
  const [reps, setReps] = useState('10');
  const [suggestedWeight, setSuggestedWeight] = useState('');
  const [restSeconds, setRestSeconds] = useState('60');
  const [exercises, setExercises] = useState<DraftExercise[]>([]);

  useEffect(() => {
    let isCurrent = true;

    async function load() {
      try {
        const [clientsResponse, equipmentResponse, groupsResponse] = await Promise.all([
          api.get<{ users: DirectoryClient[] }>('/auth/users', { params: { role: 'Cliente' } }),
          api.get<{ equipment: Equipment[] }>('/inventory'),
          api.get<{ groups: { name: string }[] }>('/muscle-groups'),
        ]);
        if (!isCurrent) return;
        setClients(clientsResponse.data.users);
        setEquipment(equipmentResponse.data.equipment);
        setMuscleGroups(groupsResponse.data.groups.map((group) => group.name));

        if (editingId) {
          const source = isTemplate
            ? (await api.get<{ template: RoutineTemplate }>(`/routine-templates/${editingId}`)).data.template
            : (await api.get<{ routine: Routine }>(`/routines/${editingId}`)).data.routine;
          if (!isCurrent) return;
          setTitle(source.title);
          setGoal(source.goal ?? '');
          setLevel(source.level);
          setDurationWeeks(String(source.durationWeeks));
          setSelectedDays(source.scheduleDays ?? []);
          setExercises(source.exercises.map(toDraft));
          if (!isTemplate) {
            const routine = source as Routine;
            setAssignedTo(typeof routine.assignedTo === 'object' ? routine.assignedTo._id : routine.assignedTo);
          }
        }
      } catch (requestError) {
        if (isCurrent) setLoadError(getApiErrorMessage(requestError, 'No se pudo cargar la información.'));
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    }

    void load();
    return () => { isCurrent = false; };
  }, [editingId, isTemplate]);

  if (user?.role !== 'Coach') return <Redirect href="/(main)/routines" />;

  const availableEquipment = equipment.filter((item) => item.status !== 'out_of_service');
  const equipmentName = (id?: string) => equipment.find((item) => item._id === id)?.name ?? 'Equipo';

  function toggleDay(day: number) {
    setSelectedDays((current) => (current.includes(day) ? current.filter((value) => value !== day) : [...current, day]));
    setExerciseDay((current) => (current === day ? null : current));
  }

  async function saveGroup() {
    const name = newGroup.trim();
    if (name.length < 2) return setError('Escribe el nombre del grupo muscular.');
    setError('');
    try {
      const response = await api.post<{ group: { name: string } }>('/muscle-groups', { name });
      const saved = response.data.group.name;
      setMuscleGroups((current) => (current.includes(saved) ? current : [...current, saved].sort((a, b) => a.localeCompare(b))));
      setMuscleGroup(saved);
      setNewGroup('');
      setIsAddingGroup(false);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No se pudo guardar el grupo muscular.'));
    }
  }

  function addExercise() {
    setError('');
    if (!exerciseName.trim() || !muscleGroup || !equipmentChoice || exerciseDay === null) {
      setError('Completa ejercicio, grupo muscular, equipo y día.');
      return;
    }
    const parsedSets = Number(sets);
    const parsedRest = Number(restSeconds);
    const parsedWeight = suggestedWeight.trim() ? Number(suggestedWeight.replace(',', '.')) : undefined;
    if (!Number.isInteger(parsedSets) || parsedSets < 1 || !reps.trim() || !Number.isInteger(parsedRest) || parsedRest < 0) {
      setError('Verifica series, repeticiones y descanso.');
      return;
    }
    if (parsedWeight !== undefined && (!Number.isFinite(parsedWeight) || parsedWeight < 0)) {
      setError('El peso sugerido debe ser un número igual o mayor que cero.');
      return;
    }

    const isBodyweight = equipmentChoice === BODYWEIGHT;
    setExercises((current) => [...current, {
      name: exerciseName.trim(),
      muscleGroup,
      bodyweight: isBodyweight,
      ...(isBodyweight ? {} : { equipmentId: equipmentChoice }),
      day: exerciseDay,
      sets: parsedSets,
      reps: reps.trim(),
      ...(parsedWeight !== undefined ? { suggestedWeight: parsedWeight } : {}),
      restSeconds: parsedRest,
      order: current.length,
    }]);
    setExerciseName('');
    setMuscleGroup('');
    setEquipmentChoice('');
    setSuggestedWeight('');
  }

  function adjustWeight(index: number, delta: number) {
    setExercises((current) => current.map((exercise, itemIndex) => (
      itemIndex === index ? { ...exercise, suggestedWeight: Math.max(0, (exercise.suggestedWeight ?? 0) + delta) } : exercise
    )));
  }

  async function save() {
    setError('');
    if (!title.trim()) return setError('Escribe el nombre de la rutina.');
    if (!isTemplate && !assignedTo) return setError('Selecciona el cliente de la rutina.');
    if (!selectedDays.length) return setError('Selecciona al menos un día de entrenamiento.');
    if (!exercises.length) return setError('Agrega al menos un ejercicio.');
    const weeks = Number(durationWeeks);
    if (!Number.isInteger(weeks) || weeks < 1 || weeks > 52) return setError('La duración debe ser de 1 a 52 semanas.');
    if (exercises.some((exercise) => !selectedDays.includes(exercise.day))) {
      return setError('Hay ejercicios en días que ya no están programados.');
    }

    const body = {
      title: title.trim(),
      ...(goal.trim() ? { goal: goal.trim() } : {}),
      level,
      durationWeeks: weeks,
      daysPerWeek: selectedDays.length,
      scheduleDays: selectedDays,
      exercises: exercises.map((exercise, order) => ({ ...exercise, order })),
    };

    setIsSaving(true);
    try {
      if (isTemplate) {
        if (editingId) await api.patch(`/routine-templates/${editingId}`, body);
        else await api.post('/routine-templates', body);
      } else if (editingId) {
        await api.patch(`/routines/${editingId}`, body);
      } else {
        await api.post('/routines', { ...body, assignedTo, status: 'active' });
      }
      router.back();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No se pudo guardar.'));
    } finally {
      setIsSaving(false);
    }
  }

  const heading = isTemplate
    ? (isEditing ? 'Editar plantilla' : 'Nueva plantilla')
    : (isEditing ? 'Editar rutina del cliente' : 'Nueva rutina');

  return (
    <Page>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.back()}>
          <IconBadge name="arrow-back" color={palette.ink} />
        </Pressable>
        <View style={styles.flex}>
          <Text style={styles.title}>{heading}</Text>
          <Text style={styles.subtitle}>
            {isTemplate ? 'Una base reutilizable; no está ligada a ningún cliente.' : 'Los cambios solo afectan la rutina de este cliente.'}
          </Text>
        </View>
      </View>

      {loadError ? <Notice error>{loadError}</Notice> : null}
      {isLoading ? <View style={styles.loading}><ActivityIndicator color={palette.green} size="large" /></View> : null}

      <FloatingCard style={styles.section}>
        <SectionTitle>Datos de la rutina</SectionTitle>
        <Field label="Nombre" placeholder="Hipertrofia principiantes" value={title} onChangeText={setTitle} />
        <Field label="Objetivo" placeholder="Fuerza, hipertrofia…" value={goal} onChangeText={setGoal} />
        <Field label="Duración (semanas)" keyboardType="number-pad" value={durationWeeks} onChangeText={(value) => setDurationWeeks(value.replace(/\D/g, ''))} />
        <View style={styles.group}>
          <Text style={styles.label}>Nivel</Text>
          <View style={styles.chips}>
            {levels.map((item) => (
              <Choice key={item} label={item.charAt(0).toUpperCase() + item.slice(1)} selected={level === item} onPress={() => setLevel(item)} />
            ))}
          </View>
        </View>
        <View style={styles.group}>
          <Text style={styles.label}>Días programados ({selectedDays.length})</Text>
          <View style={styles.chips}>
            {weekDays.map((day) => (
              <Choice key={day.value} label={day.label} selected={selectedDays.includes(day.value)} onPress={() => toggleDay(day.value)} />
            ))}
          </View>
        </View>
        {!isTemplate && !isEditing ? (
          <SelectField
            label="Asignar a cliente"
            placeholder="Selecciona un cliente"
            emptyText="No tienes clientes asignados."
            options={clients.map((client) => ({ value: client.id, label: `${client.name} - ${client.email}` }))}
            value={assignedTo}
            onChange={setAssignedTo}
          />
        ) : null}
      </FloatingCard>

      <FloatingCard style={styles.section}>
        <SectionTitle>Agregar ejercicio</SectionTitle>
        <Field label="Ejercicio" value={exerciseName} onChangeText={setExerciseName} placeholder="Prensa de pierna" />
        <SelectField
          label="Grupo muscular"
          placeholder="Selecciona un grupo"
          options={muscleGroups.map((name) => ({ value: name, label: name }))}
          value={muscleGroup}
          onChange={setMuscleGroup}
          addOption={{ label: '+ Agregar nuevo grupo', onSelect: () => setIsAddingGroup(true) }}
        />
        {isAddingGroup ? (
          <View style={styles.group}>
            <Field label="Nuevo grupo muscular" placeholder="Antebrazo" value={newGroup} onChangeText={setNewGroup} />
            <View style={styles.row}>
              <View style={styles.flex}><ActionButton onPress={() => void saveGroup()}>Guardar grupo</ActionButton></View>
              <View style={styles.flex}><ActionButton secondary onPress={() => { setIsAddingGroup(false); setNewGroup(''); }}>Cancelar</ActionButton></View>
            </View>
          </View>
        ) : null}
        <SelectField
          label="Equipo"
          placeholder="Selecciona el equipo"
          options={[
            { value: BODYWEIGHT, label: 'Peso Corporal / Libre', hint: 'Sin máquina' },
            ...availableEquipment.map((item) => ({ value: item._id, label: item.name, hint: item.zone })),
          ]}
          value={equipmentChoice}
          onChange={setEquipmentChoice}
        />
        <View style={styles.group}>
          <Text style={styles.label}>Día del ejercicio</Text>
          <View style={styles.chips}>
            {weekDays.filter((day) => selectedDays.includes(day.value)).map((day) => (
              <Choice key={day.value} label={day.label} selected={exerciseDay === day.value} onPress={() => setExerciseDay(day.value)} />
            ))}
          </View>
          {!selectedDays.length ? <Text style={styles.helper}>Primero elige los días programados.</Text> : null}
        </View>
        <View style={styles.row}>
          <View style={styles.flex}><Field label="Series" keyboardType="number-pad" value={sets} onChangeText={(value) => setSets(value.replace(/\D/g, ''))} /></View>
          <View style={styles.flex}><Field label="Repeticiones" value={reps} onChangeText={setReps} placeholder="8-10" /></View>
        </View>
        <View style={styles.row}>
          <View style={styles.flex}><Field label="Peso sugerido (kg)" keyboardType="decimal-pad" value={suggestedWeight} onChangeText={setSuggestedWeight} placeholder="Opcional" /></View>
          <View style={styles.flex}><Field label="Descanso (s)" keyboardType="number-pad" value={restSeconds} onChangeText={(value) => setRestSeconds(value.replace(/\D/g, ''))} /></View>
        </View>
        <ActionButton onPress={addExercise} disabled={isLoading || !selectedDays.length}>Añadir ejercicio</ActionButton>
      </FloatingCard>

      {exercises.length ? (
        <View style={styles.group}>
          <SectionTitle>{`${exercises.length} ejercicios en la rutina`}</SectionTitle>
          {exercises.map((exercise, index) => (
            <FloatingCard key={exercise._id ?? `${exercise.name}-${index}`} style={styles.exerciseCard}>
              <View style={styles.exerciseTop}>
                <IconBadge name={exercise.bodyweight ? 'accessibility-new' : 'fitness-center'} color={exercise.bodyweight ? palette.orange : palette.violet} size={40} />
                <View style={styles.flex}>
                  <Text style={styles.exerciseName}>{exercise.name}</Text>
                  <Text style={styles.exerciseMeta}>
                    {weekDayNames[exercise.day]} · {exercise.muscleGroup} · {exercise.bodyweight ? 'Peso corporal / Libre' : equipmentName(exercise.equipmentId)}
                  </Text>
                  <Text style={styles.exerciseMeta}>{exercise.sets} × {exercise.reps} · {exercise.restSeconds}s descanso</Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel={`Quitar ${exercise.name}`} onPress={() => setExercises((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                  <MaterialIcons name="delete" size={22} color={palette.danger} />
                </Pressable>
              </View>
              <View style={styles.weightRow}>
                <Text style={styles.weightLabel}>Peso sugerido</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Bajar peso" onPress={() => adjustWeight(index, -2.5)} style={styles.stepButton}>
                  <MaterialIcons name="remove" size={18} color={palette.ink} />
                </Pressable>
                <Text style={styles.weightValue}>{exercise.suggestedWeight ?? 0} kg</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Subir peso" onPress={() => adjustWeight(index, 2.5)} style={styles.stepButton}>
                  <MaterialIcons name="add" size={18} color={palette.ink} />
                </Pressable>
              </View>
            </FloatingCard>
          ))}
        </View>
      ) : null}

      {error ? <Notice error>{error}</Notice> : null}
      <ActionButton onPress={() => void save()} disabled={isSaving || isLoading}>
        {isSaving ? <ActivityIndicator color={palette.white} /> : isTemplate ? 'Guardar plantilla' : isEditing ? 'Guardar cambios' : 'Guardar y asignar rutina'}
      </ActionButton>
    </Page>
  );
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.choice, selected && styles.choiceSelected]}>
      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  title: { color: palette.ink, fontSize: 24, fontWeight: '800' },
  subtitle: { color: palette.muted, fontSize: 13 },
  loading: { minHeight: 60, alignItems: 'center', justifyContent: 'center' },
  section: { gap: 15, padding: 20 },
  group: { gap: 8 },
  row: { flexDirection: 'row', gap: 12 },
  label: { color: palette.ink, fontSize: 13, fontWeight: '700' },
  helper: { color: palette.muted, fontSize: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { borderRadius: 20, backgroundColor: '#F2F4EE', paddingHorizontal: 14, paddingVertical: 9 },
  choiceSelected: { backgroundColor: palette.deepGreen },
  choiceText: { color: palette.ink, fontSize: 12, fontWeight: '700' },
  choiceTextSelected: { color: palette.white },
  exerciseCard: { gap: 12 },
  exerciseTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  exerciseName: { color: palette.ink, fontSize: 15, fontWeight: '800' },
  exerciseMeta: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  weightRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: palette.line, paddingTop: 10 },
  weightLabel: { flex: 1, color: palette.ink, fontSize: 13, fontWeight: '700' },
  weightValue: { minWidth: 64, textAlign: 'center', color: palette.green, fontSize: 15, fontWeight: '800' },
  stepButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#F2F4EE', alignItems: 'center', justifyContent: 'center' },
});
