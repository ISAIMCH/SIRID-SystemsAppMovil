import { MaterialIcons } from '@expo/vector-icons';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { api, getApiErrorMessage } from './api';
import { useAuth } from './auth-context';
import type { DirectoryClient } from './directory-types';
import { ExerciseSearch } from './exercise-search';
import { FloatingCard, IconBadge } from './fit-ui';
import { SelectField } from './select-field';
import { palette } from './theme';
import type { Exercise, ExerciseDictionaryEntry, Routine, RoutineBlock, RoutineTemplate } from './types';
import { ActionButton, Field, Notice, Page, SectionTitle } from './ui';

type Equipment = { _id: string; name: string; zone: string; type: 'strength' | 'cardio'; status: 'available' | 'busy' | 'out_of_service' };
type RoutineLevel = 'principiante' | 'intermedio' | 'avanzado';
type BlockType = RoutineBlock['blockType'];
type DraftExercise = Omit<Exercise, '_id' | 'equipmentId'> & { _id?: string; equipmentId?: string };
type DraftBlock = Omit<RoutineBlock, '_id' | 'exercises'> & { _id?: string; exercises: DraftExercise[] };

const BODYWEIGHT = 'bodyweight';
const weekDays = [
  { value: 1, label: 'Lun' }, { value: 2, label: 'Mar' }, { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' }, { value: 5, label: 'Vie' }, { value: 6, label: 'Sáb' }, { value: 0, label: 'Dom' },
];
const weekDayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const levels: RoutineLevel[] = ['principiante', 'intermedio', 'avanzado'];
const blockTypes: { value: BlockType; label: string; icon: keyof typeof MaterialIcons.glyphMap }[] = [
  { value: 'single', label: 'Individual', icon: 'looks-one' },
  { value: 'superset', label: 'Superset', icon: 'sync-alt' },
  { value: 'circuit', label: 'Circuito', icon: 'autorenew' },
];

function draftBlocks(source: Routine | RoutineTemplate): DraftBlock[] {
  if (source.blocks?.length) return source.blocks.map((block, order) => ({ ...block, order, exercises: block.exercises.map((exercise) => ({
    ...exercise,
    equipmentId: typeof exercise.equipmentId === 'object' ? exercise.equipmentId._id : exercise.equipmentId,
  })) }));

  return (source.exercises ?? []).map((exercise, order) => ({
    day: exercise.day ?? 0,
    blockType: 'single',
    sets: exercise.sets ?? 3,
    restSeconds: exercise.restSeconds ?? 60,
    order,
    exercises: [{
      ...exercise,
      equipmentId: typeof exercise.equipmentId === 'object' ? exercise.equipmentId._id : exercise.equipmentId,
    }],
  }));
}

function findInventoryEquipment(label: string, equipment: Equipment[]) {
  const normalized = label.toLowerCase();
  if (normalized.includes('body weight') || normalized.includes('bodyweight')) return BODYWEIGHT;
  const aliases: Record<string, string[]> = {
    dumbbell: ['mancuerna', 'peso libre'],
    barbell: ['barra', 'rack', 'peso libre'],
    cable: ['polea', 'cable'],
    'leverage machine': ['máquina', 'maquina'],
    treadmill: ['caminadora', 'treadmill'],
    elliptical: ['elíptica', 'eliptica'],
    'stationary bike': ['bicicleta'],
  };
  const terms = aliases[normalized] ?? [normalized];
  return equipment.find((item) => terms.some((term) => `${item.name} ${item.zone}`.toLowerCase().includes(term)))?._id
    ?? `catalog:${label}`;
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
  const [blocks, setBlocks] = useState<DraftBlock[]>([]);

  const [blockType, setBlockType] = useState<BlockType>('single');
  const [blockDay, setBlockDay] = useState<number | null>(null);
  const [blockSets, setBlockSets] = useState('3');
  const [blockRest, setBlockRest] = useState('60');
  const [draftExercises, setDraftExercises] = useState<DraftExercise[]>([]);

  const [exerciseName, setExerciseName] = useState('');
  const [selectedDictionaryExercise, setSelectedDictionaryExercise] = useState<ExerciseDictionaryEntry | null>(null);
  const [muscleGroup, setMuscleGroup] = useState('');
  const [isAddingGroup, setIsAddingGroup] = useState(false);
  const [newGroup, setNewGroup] = useState('');
  const [equipmentChoice, setEquipmentChoice] = useState('');
  const [reps, setReps] = useState('10');
  const [suggestedWeight, setSuggestedWeight] = useState('');
  const [targetDuration, setTargetDuration] = useState('');
  const [targetDistance, setTargetDistance] = useState('');
  const [targetLevel, setTargetLevel] = useState('');

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
          setBlocks(draftBlocks(source));
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
  const selectedEquipment = equipmentChoice === BODYWEIGHT ? undefined : availableEquipment.find((item) => item._id === equipmentChoice);
  const metricType: 'strength' | 'cardio' = equipmentChoice === BODYWEIGHT
    ? 'strength'
    : selectedEquipment?.type ?? (equipmentChoice.startsWith('catalog:') ? selectedDictionaryExercise?.metricType : undefined) ?? 'strength';
  const maxBlockExercises = blockType === 'single' ? 1 : 20;

  async function selectDictionaryExercise(exercise: ExerciseDictionaryEntry) {
    setSelectedDictionaryExercise(exercise);
    setExerciseName(exercise.name);
    const targetMuscle = exercise.targetMuscle || 'General';
    setMuscleGroups((current) => current.includes(targetMuscle) ? current : [...current, targetMuscle].sort((a, b) => a.localeCompare(b)));
    setMuscleGroup(targetMuscle);
    setEquipmentChoice(findInventoryEquipment(exercise.equipment, availableEquipment));
    try {
      const response = await api.post<{ group: { name: string } }>('/muscle-groups', { name: targetMuscle });
      setMuscleGroups((current) => current.includes(response.data.group.name) ? current : [...current, response.data.group.name].sort((a, b) => a.localeCompare(b)));
      setMuscleGroup(response.data.group.name);
    } catch {
      setError('El grupo muscular se usará en este ejercicio, pero no se pudo guardar para próximos usos.');
    }
    setSuggestedWeight('');
    setTargetDuration('');
    setTargetDistance('');
    setTargetLevel('');
  }

  function toggleDay(day: number) {
    setSelectedDays((current) => current.includes(day) ? current.filter((value) => value !== day) : [...current, day]);
    setBlockDay((current) => current === day ? null : current);
  }

  async function saveGroup() {
    const name = newGroup.trim();
    if (name.length < 2) return setError('Escribe el nombre del grupo muscular.');
    setError('');
    try {
      const response = await api.post<{ group: { name: string } }>('/muscle-groups', { name });
      const saved = response.data.group.name;
      setMuscleGroups((current) => current.includes(saved) ? current : [...current, saved].sort((a, b) => a.localeCompare(b)));
      setMuscleGroup(saved);
      setNewGroup('');
      setIsAddingGroup(false);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No se pudo guardar el grupo muscular.'));
    }
  }

  function addExerciseToBlock() {
    setError('');
    if (draftExercises.length >= maxBlockExercises) return setError('Este bloque individual ya tiene su ejercicio.');
    if (!exerciseName.trim() || !muscleGroup || !equipmentChoice) return setError('Selecciona un ejercicio del catálogo, grupo muscular y equipo.');

    let exercise: DraftExercise;
    if (metricType === 'cardio') {
      const duration = targetDuration ? Number(targetDuration) : undefined;
      const distance = targetDistance ? Number(targetDistance.replace(',', '.')) : undefined;
      const target = targetLevel ? Number(targetLevel) : undefined;
      if (!duration && !distance && !target) return setError('Agrega duración, distancia o nivel/inclinación para cardio.');
      if ((duration !== undefined && (!Number.isInteger(duration) || duration < 1 || duration > 600))
        || (distance !== undefined && (!Number.isFinite(distance) || distance <= 0))
        || (target !== undefined && (!Number.isInteger(target) || target < 1 || target > 100))) {
        return setError('Revisa las métricas objetivo de cardio.');
      }
      exercise = {
        name: exerciseName.trim(), muscleGroup, equipment: selectedEquipment?.name ?? selectedDictionaryExercise?.equipment,
        metricType: 'cardio', gifUrl: selectedDictionaryExercise?.gifUrl, order: draftExercises.length,
        ...(selectedEquipment ? { equipmentId: selectedEquipment._id } : {}),
        ...(duration ? { targetDurationMinutes: duration } : {}),
        ...(distance ? { targetDistanceKm: distance } : {}),
        ...(target ? { targetLevel: target } : {}),
      };
    } else {
      if (!reps.trim()) return setError('Indica las repeticiones objetivo.');
      const weight = suggestedWeight.trim() ? Number(suggestedWeight.replace(',', '.')) : undefined;
      if (weight !== undefined && (!Number.isFinite(weight) || weight < 0 || weight > 1000)) return setError('El peso sugerido debe ser de 0 a 1000 kg.');
      exercise = {
        name: exerciseName.trim(), muscleGroup,
        equipment: selectedEquipment?.name ?? (equipmentChoice === BODYWEIGHT ? 'Peso corporal / libre' : selectedDictionaryExercise?.equipment),
        metricType: 'strength', gifUrl: selectedDictionaryExercise?.gifUrl, reps: reps.trim(), order: draftExercises.length,
        bodyweight: equipmentChoice === BODYWEIGHT || selectedDictionaryExercise?.equipment.toLowerCase().includes('body weight') === true,
        ...(selectedEquipment ? { equipmentId: selectedEquipment._id } : {}),
        ...(weight !== undefined ? { suggestedWeight: weight } : {}),
      };
    }

    setDraftExercises((current) => [...current, exercise]);
    setExerciseName('');
    setSelectedDictionaryExercise(null);
    setMuscleGroup('');
    setEquipmentChoice('');
    setSuggestedWeight('');
    setTargetDuration('');
    setTargetDistance('');
    setTargetLevel('');
  }

  function addBlock() {
    setError('');
    if (blockDay === null) return setError('Selecciona el día del bloque.');
    const count = Number(blockSets);
    const rest = Number(blockRest);
    if (!Number.isInteger(count) || count < 1 || count > 50 || !Number.isInteger(rest) || rest < 0 || rest > 3600) {
      return setError('Revisa las series y el descanso del bloque.');
    }
    if ((blockType === 'single' && draftExercises.length !== 1) || (blockType !== 'single' && draftExercises.length < 2)) {
      return setError(blockType === 'single' ? 'Agrega un ejercicio al bloque.' : 'Un superset o circuito requiere al menos dos ejercicios.');
    }
    setBlocks((current) => [...current, {
      day: blockDay,
      blockType,
      sets: count,
      restSeconds: rest,
      order: current.length,
      exercises: draftExercises.map((exercise, order) => ({ ...exercise, order })),
    }]);
    setDraftExercises([]);
    setBlockType('single');
    setBlockDay(null);
    setBlockSets('3');
    setBlockRest('60');
  }

  function adjustWeight(blockIndex: number, exerciseIndex: number, delta: number) {
    setBlocks((current) => current.map((block, index) => index !== blockIndex ? block : ({
      ...block,
      exercises: block.exercises.map((exercise, itemIndex) => itemIndex !== exerciseIndex ? exercise : ({
        ...exercise,
        suggestedWeight: Math.max(0, (exercise.suggestedWeight ?? 0) + delta),
      })),
    })));
  }

  async function save() {
    setError('');
    if (!title.trim()) return setError('Escribe el nombre de la rutina.');
    if (!isTemplate && !assignedTo) return setError('Selecciona el cliente de la rutina.');
    if (!selectedDays.length) return setError('Selecciona al menos un día de entrenamiento.');
    if (draftExercises.length) return setError('Guarda o descarta el bloque que estás construyendo.');
    if (!blocks.length) return setError('Agrega al menos un bloque.');
    if (blocks.some((block) => !selectedDays.includes(block.day))) return setError('Hay bloques en días que ya no están programados.');
    const weeks = Number(durationWeeks);
    if (!Number.isInteger(weeks) || weeks < 1 || weeks > 52) return setError('La duración debe ser de 1 a 52 semanas.');

    const body = {
      title: title.trim(),
      ...(goal.trim() ? { goal: goal.trim() } : {}),
      level,
      durationWeeks: weeks,
      daysPerWeek: selectedDays.length,
      scheduleDays: selectedDays,
      blocks: blocks.map((block, order) => ({ ...block, order })),
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

  const heading = isTemplate ? (isEditing ? 'Editar plantilla' : 'Nueva plantilla') : (isEditing ? 'Editar rutina del cliente' : 'Nueva rutina');
  const blockIcon = (type: BlockType) => blockTypes.find((item) => item.value === type)?.icon ?? 'fitness-center';

  return (
    <Page>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.back()}><IconBadge name="arrow-back" color={palette.ink} /></Pressable>
        <View style={styles.flex}>
          <Text style={styles.title}>{heading}</Text>
          <Text style={styles.subtitle}>{isTemplate ? 'Una base reutilizable, independiente del cliente.' : 'Organiza ejercicios en bloques de trabajo.'}</Text>
        </View>
      </View>

      {loadError ? <Notice error>{loadError}</Notice> : null}
      {isLoading ? <View style={styles.loading}><ActivityIndicator color={palette.green} size="large" /></View> : null}

      <FloatingCard style={styles.section}>
        <SectionTitle>Datos de rutina</SectionTitle>
        <Field label="Nombre" placeholder="Hipertrofia principiantes" value={title} onChangeText={setTitle} />
        <Field label="Objetivo" placeholder="Fuerza, hipertrofia…" value={goal} onChangeText={setGoal} />
        <Field label="Duración (semanas)" keyboardType="number-pad" value={durationWeeks} onChangeText={(value) => setDurationWeeks(value.replace(/\D/g, ''))} />
        <View style={styles.group}>
          <Text style={styles.label}>Nivel</Text>
          <View style={styles.chips}>{levels.map((item) => <Choice key={item} label={item[0].toUpperCase() + item.slice(1)} selected={level === item} onPress={() => setLevel(item)} />)}</View>
        </View>
        <View style={styles.group}>
          <Text style={styles.label}>Días programados ({selectedDays.length})</Text>
          <View style={styles.chips}>{weekDays.map((day) => <Choice key={day.value} label={day.label} selected={selectedDays.includes(day.value)} onPress={() => toggleDay(day.value)} />)}</View>
        </View>
        {!isTemplate && !isEditing ? (
          <SelectField label="Asignar a cliente" placeholder="Selecciona un cliente" emptyText="No tienes clientes asignados." options={clients.map((client) => ({ value: client.id, label: `${client.name} - ${client.email}` }))} value={assignedTo} onChange={setAssignedTo} />
        ) : null}
      </FloatingCard>

      <FloatingCard style={styles.section}>
        <SectionTitle>Nuevo bloque</SectionTitle>
        <View style={styles.group}>
          <Text style={styles.label}>Estructura</Text>
          <View style={styles.chips}>{blockTypes.map((item) => (
            <Pressable key={item.value} accessibilityRole="button" accessibilityState={{ selected: blockType === item.value }} onPress={() => { setBlockType(item.value); if (item.value === 'single') setDraftExercises((current) => current.slice(0, 1)); }} style={[styles.typeChip, blockType === item.value && styles.typeChipActive]}>
              <MaterialIcons name={item.icon} size={16} color={blockType === item.value ? palette.white : palette.ink} />
              <Text style={[styles.typeText, blockType === item.value && styles.typeTextActive]}>{item.label}</Text>
            </Pressable>
          ))}</View>
        </View>
        <View style={styles.group}>
          <Text style={styles.label}>Día del bloque</Text>
          <View style={styles.chips}>{weekDays.filter((day) => selectedDays.includes(day.value)).map((day) => <Choice key={day.value} label={day.label} selected={blockDay === day.value} onPress={() => setBlockDay(day.value)} />)}</View>
        </View>
        <View style={styles.row}>
          <View style={styles.flex}><Field label="Series del bloque" keyboardType="number-pad" value={blockSets} onChangeText={(value) => setBlockSets(value.replace(/\D/g, ''))} /></View>
          <View style={styles.flex}><Field label="Descanso entre series (s)" keyboardType="number-pad" value={blockRest} onChangeText={(value) => setBlockRest(value.replace(/\D/g, ''))} /></View>
        </View>

        <View style={styles.rule} />
        <SectionTitle>Ejercicio {draftExercises.length + 1}{blockType === 'single' ? '' : ` de ${maxBlockExercises}`}</SectionTitle>
        <ExerciseSearch
          value={exerciseName}
          onChangeText={(value) => {
            setExerciseName(value);
            setSelectedDictionaryExercise(null);
          }}
          onSelect={selectDictionaryExercise}
        />
        <SelectField label="Grupo muscular" placeholder="Selecciona un grupo" options={muscleGroups.map((name) => ({ value: name, label: name }))} value={muscleGroup} onChange={setMuscleGroup} addOption={{ label: '+ Agregar nuevo grupo', onSelect: () => setIsAddingGroup(true) }} />
        {isAddingGroup ? (
          <View style={styles.group}>
            <Field label="Nuevo grupo muscular" placeholder="Antebrazo" value={newGroup} onChangeText={setNewGroup} />
            <View style={styles.row}><View style={styles.flex}><ActionButton onPress={() => void saveGroup()}>Guardar grupo</ActionButton></View><View style={styles.flex}><ActionButton secondary onPress={() => { setIsAddingGroup(false); setNewGroup(''); }}>Cancelar</ActionButton></View></View>
          </View>
        ) : null}
        <SelectField label="Equipo" placeholder="Selecciona el equipo" options={[
          { value: BODYWEIGHT, label: 'Peso Corporal / Libre', hint: 'Fuerza sin máquina' },
          ...(equipmentChoice.startsWith('catalog:') && selectedDictionaryExercise ? [{ value: equipmentChoice, label: selectedDictionaryExercise.equipment, hint: 'Equipo del catálogo' }] : []),
          ...availableEquipment.map((item) => ({ value: item._id, label: item.name, hint: `${item.zone} · ${item.type === 'cardio' ? 'Cardio' : 'Fuerza'}` })),
        ]} value={equipmentChoice} onChange={setEquipmentChoice} />
        {metricType === 'cardio' ? (
          <>
            <Text style={styles.helper}>Cardio: define al menos un objetivo de duración, distancia o nivel/inclinación.</Text>
            <View style={styles.row}>
              <View style={styles.flex}><Field label="Duración objetivo (min)" keyboardType="number-pad" value={targetDuration} onChangeText={(value) => setTargetDuration(value.replace(/\D/g, ''))} placeholder="Opcional" /></View>
              <View style={styles.flex}><Field label="Distancia objetivo (km)" keyboardType="decimal-pad" value={targetDistance} onChangeText={setTargetDistance} placeholder="Opcional" /></View>
            </View>
            <Field label="Nivel / inclinación" keyboardType="number-pad" value={targetLevel} onChangeText={(value) => setTargetLevel(value.replace(/\D/g, ''))} placeholder="Opcional" />
          </>
        ) : (
          <View style={styles.row}>
            <View style={styles.flex}><Field label="Repeticiones objetivo" value={reps} onChangeText={setReps} placeholder="8-10" /></View>
            <View style={styles.flex}><Field label="Peso sugerido (kg)" keyboardType="decimal-pad" value={suggestedWeight} onChangeText={setSuggestedWeight} placeholder="Opcional" /></View>
          </View>
        )}
        <ActionButton onPress={addExerciseToBlock} disabled={isLoading || draftExercises.length >= maxBlockExercises}>Añadir ejercicio al bloque</ActionButton>

        {draftExercises.map((exercise, index) => (
          <View key={exercise._id ?? `${exercise.name}-${index}`} style={styles.draftRow}>
            <IconBadge name={exercise.metricType === 'cardio' ? 'directions-run' : 'fitness-center'} color={exercise.metricType === 'cardio' ? palette.cyan : palette.violet} size={36} />
            <View style={styles.flex}>
              <Text style={styles.exerciseName}>{exercise.name}</Text>
              <Text style={styles.exerciseMeta}>{exercise.muscleGroup} · {exercise.metricType === 'cardio' ? 'Cardio' : 'Fuerza'}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Quitar ${exercise.name}`} onPress={() => setDraftExercises((current) => current.filter((_, i) => i !== index))}><MaterialIcons name="delete" size={21} color={palette.danger} /></Pressable>
          </View>
        ))}
        {error ? <Notice error>{error}</Notice> : null}
        <ActionButton secondary onPress={addBlock} disabled={!draftExercises.length}>Guardar bloque</ActionButton>
      </FloatingCard>

      {blocks.length ? (
        <View style={styles.group}>
          <SectionTitle>{blocks.length} bloques en la rutina</SectionTitle>
          {blocks.map((block, blockIndex) => (
            <FloatingCard key={block._id ?? `block-${blockIndex}`} style={styles.blockCard}>
              <View style={styles.blockHeader}>
                <IconBadge name={blockIcon(block.blockType)} color={block.blockType === 'single' ? palette.neon : palette.violet} />
                <View style={styles.flex}>
                  <Text style={styles.blockTitle}>{blockTypes.find((item) => item.value === block.blockType)?.label} · {weekDayNames[block.day]}</Text>
                  <Text style={styles.exerciseMeta}>{block.sets} series · {block.restSeconds}s descanso tras completar el bloque</Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Eliminar bloque" onPress={() => setBlocks((current) => current.filter((_, i) => i !== blockIndex).map((item, order) => ({ ...item, order })))}><MaterialIcons name="delete" size={21} color={palette.danger} /></Pressable>
              </View>
              {block.exercises.map((exercise, exerciseIndex) => (
                <View key={exercise._id ?? `${exercise.name}-${exerciseIndex}`} style={styles.blockExercise}>
                  <View style={styles.flex}>
                    <Text style={styles.exerciseName}>{exerciseIndex + 1}. {exercise.name}</Text>
                    <Text style={styles.exerciseMeta}>{exercise.muscleGroup} · {exercise.equipment ?? (exercise.metricType === 'cardio' ? 'Cardio' : exercise.bodyweight ? 'Peso corporal / libre' : equipment.find((item) => item._id === exercise.equipmentId)?.name ?? 'Fuerza')}</Text>
                    {exercise.metricType === 'cardio' ? <Text style={styles.exerciseMeta}>{[exercise.targetDurationMinutes ? `${exercise.targetDurationMinutes} min` : '', exercise.targetDistanceKm ? `${exercise.targetDistanceKm} km` : '', exercise.targetLevel ? `Nivel ${exercise.targetLevel}` : ''].filter(Boolean).join(' · ')}</Text> : <Text style={styles.exerciseMeta}>{exercise.reps}{exercise.suggestedWeight !== undefined ? ` · ${exercise.suggestedWeight} kg` : ''}</Text>}
                  </View>
                  {exercise.metricType !== 'cardio' ? (
                    <View style={styles.weightControls}>
                      <Pressable accessibilityRole="button" accessibilityLabel="Bajar peso" onPress={() => adjustWeight(blockIndex, exerciseIndex, -2.5)} style={styles.step}><MaterialIcons name="remove" size={17} color={palette.ink} /></Pressable>
                      <Pressable accessibilityRole="button" accessibilityLabel="Subir peso" onPress={() => adjustWeight(blockIndex, exerciseIndex, 2.5)} style={styles.step}><MaterialIcons name="add" size={17} color={palette.ink} /></Pressable>
                    </View>
                  ) : null}
                </View>
              ))}
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
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.choice, selected && styles.choiceSelected]}><Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text></Pressable>;
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
  helper: { color: palette.muted, fontSize: 12, lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, backgroundColor: '#F2F4EE', paddingHorizontal: 13, paddingVertical: 9 },
  typeChipActive: { backgroundColor: palette.deepGreen },
  typeText: { color: palette.ink, fontSize: 12, fontWeight: '700' },
  typeTextActive: { color: palette.white },
  choice: { borderRadius: 20, backgroundColor: '#F2F4EE', paddingHorizontal: 14, paddingVertical: 9 },
  choiceSelected: { backgroundColor: palette.deepGreen },
  choiceText: { color: palette.ink, fontSize: 12, fontWeight: '700' },
  choiceTextSelected: { color: palette.white },
  rule: { height: 1, backgroundColor: palette.line },
  draftRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, backgroundColor: '#F2F4EE', padding: 10 },
  blockCard: { gap: 12 },
  blockHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  blockTitle: { color: palette.ink, fontSize: 15, fontWeight: '800' },
  blockExercise: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: palette.line, paddingTop: 10 },
  exerciseName: { color: palette.ink, fontSize: 14, fontWeight: '800' },
  exerciseMeta: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  weightControls: { flexDirection: 'row', gap: 6 },
  step: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F2F4EE', alignItems: 'center', justifyContent: 'center' },
});
