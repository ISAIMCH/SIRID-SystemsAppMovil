import { MaterialIcons } from '@expo/vector-icons';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { api, getApiErrorMessage } from './api';
import { useAuth } from './auth-context';
import type { DirectoryClient } from './directory-types';
import { ExerciseSearch } from './exercise-search';
import type { ExerciseSelection } from './exercise-search';
import { FloatingCard, IconBadge } from './fit-ui';
import { SelectField } from './select-field';
import { palette } from './theme';
import type { Routine, RoutineBlock, RoutineTemplate } from './types';
import { ActionButton, Field, Notice, Page, SectionTitle } from './ui';

type Equipment = { _id: string; name: string; zone: string; type: 'strength' | 'cardio'; status: 'available' | 'busy' | 'out_of_service' };
type RoutineLevel = 'principiante' | 'intermedio' | 'avanzado';
type BlockType = RoutineBlock['blockType'];
type DraftExercise = ExerciseSelection & { _id?: string; equipmentId?: string };
type DraftBlock = Omit<RoutineBlock, '_id' | 'exercises'> & { _id?: string; exercises: DraftExercise[] };

const weekDays = [
  { value: 1, label: 'Lun' }, { value: 2, label: 'Mar' }, { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' }, { value: 5, label: 'Vie' }, { value: 6, label: 'Sáb' }, { value: 0, label: 'Dom' },
];
const weekDayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const levels: RoutineLevel[] = ['principiante', 'intermedio', 'avanzado'];
const blockTypes: { value: BlockType; label: string; icon: keyof typeof MaterialIcons.glyphMap }[] = [
  { value: 'single', label: 'Individual', icon: 'looks-one' },
  { value: 'superset', label: 'Superset', icon: 'sync-alt' },
];

function draftBlocks(source: Routine | RoutineTemplate): DraftBlock[] {
  if (source.blocks?.length) return source.blocks.map((block, order) => ({ ...block, blockType: block.blockType === 'circuit' ? 'superset' : block.blockType, order, exercises: block.exercises.map((exercise) => ({
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
  const prefilledClientId = useRef<string | null>(null);
  const [isClientFileOpen, setIsClientFileOpen] = useState(false);
  const [clientObservations, setClientObservations] = useState('');
  const [isSavingObservations, setIsSavingObservations] = useState(false);
  const [observationsError, setObservationsError] = useState('');
  const [blocks, setBlocks] = useState<DraftBlock[]>([]);

  const [blockType, setBlockType] = useState<BlockType>('single');
  const [blockDay, setBlockDay] = useState<number | null>(null);
  const [blockSets, setBlockSets] = useState('3');
  const [blockRest, setBlockRest] = useState('60');
  const [draftExercises, setDraftExercises] = useState<DraftExercise[]>([]);
  const [isExercisePickerVisible, setIsExercisePickerVisible] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    async function load() {
      try {
        const [clientsResponse, equipmentResponse] = await Promise.all([
          api.get<{ users: DirectoryClient[] }>('/auth/users', { params: { role: 'Cliente' } }),
          api.get<{ equipment: Equipment[] }>('/inventory'),
        ]);
        if (!isCurrent) return;
        setClients(clientsResponse.data.users);
        setEquipment(equipmentResponse.data.equipment);

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

  useEffect(() => {
    if (!assignedTo) {
      prefilledClientId.current = null;
      return;
    }
    if (isTemplate || isEditing || prefilledClientId.current === assignedTo) return;
    const client = clients.find((entry) => entry.id === assignedTo);
    if (!client) return;
    const availableDays = client.availableTrainingDays?.filter((day) => day >= 0 && day <= 6) ?? [];
    prefilledClientId.current = assignedTo;
    // This effect hydrates the routine from the selected client once.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGoal(client.goal ?? '');
    setLevel(client.experienceLevel ?? 'principiante');
    setSelectedDays(availableDays.length ? availableDays : [1, 2, 3]);
  }, [assignedTo, clients, isEditing, isTemplate]);

  if (user?.role !== 'Coach') return <Redirect href="/(main)/routines" />;

  const availableEquipment = equipment.filter((item) => item.status !== 'out_of_service');
  const selectedClient = clients.find((client) => client.id === assignedTo);

  function openClientFile() {
    if (!selectedClient) return;
    setClientObservations(selectedClient.observations ?? '');
    setObservationsError('');
    setIsClientFileOpen(true);
  }

  async function saveClientObservations() {
    if (!selectedClient) return;
    setObservationsError('');
    setIsSavingObservations(true);
    try {
      const response = await api.patch<{ user: DirectoryClient }>(`/users/${selectedClient.id}/observations`, { observations: clientObservations.trim() });
      setClients((current) => current.map((client) => client.id === response.data.user.id ? { ...client, observations: response.data.user.observations } : client));
      setIsClientFileOpen(false);
    } catch (requestError) {
      setObservationsError(getApiErrorMessage(requestError, 'No se pudieron guardar las observaciones.'));
    } finally {
      setIsSavingObservations(false);
    }
  }

  function toggleDay(day: number) {
    setSelectedDays((current) => current.includes(day) ? current.filter((value) => value !== day) : [...current, day]);
    setBlockDay((current) => current === day ? null : current);
  }

  function addExercisesToBlock(exercises: ExerciseSelection[]) {
    setDraftExercises((current) => [...current, ...exercises.map((exercise, index) => ({ ...exercise, order: current.length + index }))]);
  }

  function addBlock() {
    setError('');
    if (blockDay === null) return setError('Selecciona el día del bloque.');
    const count = Number(blockSets);
    const rest = Number(blockRest);
    if (!Number.isInteger(count) || count < 1 || count > 50 || !Number.isInteger(rest) || rest < 0 || rest > 3600) {
      return setError('Revisa las series y el descanso del bloque.');
    }
    if ((blockType === 'single' && draftExercises.length !== 1) || (blockType === 'superset' && draftExercises.length < 2)) {
      return setError(blockType === 'single' ? 'Agrega un ejercicio al bloque.' : 'Un superset requiere al menos dos ejercicios.');
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
    <Page dark>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => { if (router.canGoBack()) { router.back(); } else { router.push('/(main)/billing'); } }}>
          <IconBadge name="arrow-back" color="#10FF85" />
        </Pressable>
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
          <View style={styles.clientAssignment}>
            <View style={styles.clientSelect}>
              <SelectField filterable label="Asignar a cliente" placeholder="Selecciona un cliente" emptyText="No tienes clientes asignados." options={clients.map((client) => ({ value: client.id, label: `${client.name} - ${client.email}` }))} value={assignedTo} onChange={(value) => { setAssignedTo(value); setClientObservations(clients.find((client) => client.id === value)?.observations ?? ''); }} />
            </View>
            {selectedClient ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Ver ficha del cliente" onPress={openClientFile} style={styles.clientFileButton}>
                <MaterialIcons name="assignment" size={19} color={palette.deepGreen} />
                <Text style={styles.clientFileButtonText}>Ver ficha</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </FloatingCard>

      <Modal visible={isClientFileOpen} transparent animationType="slide" onRequestClose={() => setIsClientFileOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.flex}>
                <Text style={styles.modalTitle}>Ficha del cliente</Text>
                <Text style={styles.modalSubtitle}>{selectedClient?.name}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Cerrar ficha del cliente" onPress={() => setIsClientFileOpen(false)} hitSlop={10}>
                <MaterialIcons name="close" size={24} color={palette.ink} />
              </Pressable>
            </View>
            <View style={styles.modalStats}>
              <View style={styles.modalStat}>
                <Text style={styles.modalLabel}>Nivel de experiencia</Text>
                <Text style={styles.modalValue}>{selectedClient?.experienceLevel ? `${selectedClient.experienceLevel[0].toUpperCase()}${selectedClient.experienceLevel.slice(1)}` : 'No definido'}</Text>
              </View>
              <View style={styles.modalStat}>
                <Text style={styles.modalLabel}>Objetivo deportivo</Text>
                <Text style={styles.modalValue}>{selectedClient?.goal || 'No definido'}</Text>
              </View>
              <View style={styles.modalStat}>
                <Text style={styles.modalLabel}>Días disponibles</Text>
                <Text style={styles.modalValue}>{selectedClient?.availableTrainingDays?.map((day) => weekDayNames[day]).filter(Boolean).join(', ') || 'No definidos'}</Text>
              </View>
            </View>
            <Text style={styles.modalLabel}>Observaciones médicas y técnicas</Text>
            <TextInput
              multiline
              value={clientObservations}
              onChangeText={setClientObservations}
              placeholder="Lesiones, limitaciones, precauciones o notas relevantes..."
              placeholderTextColor={palette.muted}
              style={styles.observationsInput}
              textAlignVertical="top"
            />
            {observationsError ? <Notice error>{observationsError}</Notice> : null}
            <ActionButton onPress={() => void saveClientObservations()} disabled={isSavingObservations}>
              {isSavingObservations ? <ActivityIndicator color={palette.white} /> : 'Guardar observaciones'}
            </ActionButton>
          </View>
        </View>
      </Modal>

      <FloatingCard style={styles.section}>
        <SectionTitle>Nuevo bloque</SectionTitle>
        <View style={styles.group}>
          <Text style={styles.label}>Estructura</Text>
          <View style={styles.segmentedControl}>{blockTypes.map((item) => (
            <Pressable key={item.value} accessibilityRole="button" accessibilityState={{ selected: blockType === item.value }} onPress={() => { setBlockType(item.value); if (item.value === 'single') setDraftExercises((current) => current.slice(0, 1)); }} style={[styles.segment, blockType === item.value && styles.segmentActive]}>
              <Text style={[styles.segmentText, blockType === item.value && styles.segmentTextActive]}>{item.label}</Text>
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
        <SectionTitle>Ejercicios del bloque</SectionTitle>
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
        <Pressable
          accessibilityRole="button"
          disabled={blockType === 'single' && draftExercises.length === 1}
          onPress={() => setIsExercisePickerVisible(true)}
          style={({ pressed }) => [styles.addExerciseButton, (blockType === 'single' && draftExercises.length === 1) && styles.disabledButton, pressed && styles.buttonPressed]}>
          <Text style={styles.addExerciseButtonText}>{blockType === 'single' ? '+ Añadir ejercicio' : '+ Añadir ejercicios al superset'}</Text>
        </Pressable>
        <ExerciseSearch
          visible={isExercisePickerVisible}
          mode={blockType === 'single' ? 'single' : 'superset'}
          equipment={availableEquipment}
          onClose={() => setIsExercisePickerVisible(false)}
          onConfirm={addExercisesToBlock}
        />
        {error ? <Notice error>{error}</Notice> : null}
        <Pressable
          accessibilityRole="button"
          disabled={!draftExercises.length}
          onPress={addBlock}
          style={({ pressed }) => [styles.saveBlockButton, !draftExercises.length && styles.disabledButton, pressed && styles.buttonPressed]}>
          <Text style={styles.saveBlockButtonText}>Guardar bloque</Text>
        </Pressable>
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
                      <Pressable accessibilityRole="button" accessibilityLabel="Bajar peso" onPress={() => adjustWeight(blockIndex, exerciseIndex, -2.5)} style={styles.step}><MaterialIcons name="remove" size={17} color="#E4E4E7" /></Pressable>
                      <Pressable accessibilityRole="button" accessibilityLabel="Subir peso" onPress={() => adjustWeight(blockIndex, exerciseIndex, 2.5)} style={styles.step}><MaterialIcons name="add" size={17} color="#E4E4E7" /></Pressable>
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
  title: { color: '#F2F4EE', fontSize: 24, fontWeight: '800' },
  subtitle: { color: '#91A098', fontSize: 13 },
  loading: { minHeight: 60, alignItems: 'center', justifyContent: 'center' },
  section: { gap: 15, padding: 20 },
  group: { gap: 8 },
  row: { flexDirection: 'row', gap: 12 },
  clientAssignment: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  clientSelect: { flex: 1 },
  clientFileButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 16, backgroundColor: palette.neon, paddingHorizontal: 12 },
  clientFileButtonText: { color: palette.deepGreen, fontSize: 12, fontWeight: '800' },
  label: { color: '#F2F4EE', fontSize: 13, fontWeight: '700' },
  helper: { color: '#91A098', fontSize: 12, lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  segmentedControl: { flexDirection: 'row', borderRadius: 10, borderWidth: 1, borderColor: '#333333', backgroundColor: '#18181B', padding: 3 },
  segment: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 7, paddingHorizontal: 8 },
  segmentActive: { borderWidth: 1, borderColor: '#10FF85', backgroundColor: '#10FF8512' },
  segmentText: { color: '#71717A', fontSize: 12, fontWeight: '700' },
  segmentTextActive: { color: '#10FF85' },
  choice: { borderRadius: 20, backgroundColor: '#18211D', borderWidth: 1, borderColor: '#27342E', paddingHorizontal: 14, paddingVertical: 9 },
  choiceSelected: { backgroundColor: '#18211D', borderColor: '#9BFF63' },
  choiceText: { color: '#DCE8E0', fontSize: 12, fontWeight: '700' },
  choiceTextSelected: { color: palette.white },
  rule: { height: 1, backgroundColor: '#27342E' },
  draftRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, backgroundColor: '#141A17', borderWidth: 1, borderColor: '#27342E', padding: 10 },
  blockCard: { gap: 12 },
  blockHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  blockTitle: { color: '#F4F8F5', fontSize: 15, fontWeight: '800' },
  blockExercise: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: '#27342E', paddingTop: 10 },
  exerciseName: { color: '#F4F8F5', fontSize: 14, fontWeight: '800' },
  exerciseMeta: { color: '#91A098', fontSize: 12, lineHeight: 17 },
  addExerciseButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#10FF85', backgroundColor: 'transparent', paddingHorizontal: 16, marginBottom: 8 },
  addExerciseButtonText: { color: '#10FF85', fontSize: 14, fontWeight: '800' },
  saveBlockButton: { minHeight: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#10FF85', paddingHorizontal: 18, marginTop: 8, marginBottom: 16 },
  saveBlockButtonText: { color: '#081009', fontSize: 15, fontWeight: '800' },
  disabledButton: { opacity: 0.45 },
  buttonPressed: { opacity: 0.78 },
  weightControls: { flexDirection: 'row', gap: 6 },
  step: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#1E1E1E', borderWidth: 1, borderColor: '#333333', alignItems: 'center', justifyContent: 'center' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.58)' },
  modalCard: { gap: 14, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#F2F4EE', padding: 20, paddingBottom: 28 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  modalTitle: { color: palette.ink, fontSize: 22, fontWeight: '800' },
  modalSubtitle: { color: palette.muted, fontSize: 13, marginTop: 3 },
  modalStats: { gap: 10 },
  modalStat: { borderRadius: 14, backgroundColor: palette.white, padding: 12, gap: 4 },
  modalLabel: { color: palette.muted, fontSize: 12, fontWeight: '700' },
  modalValue: { color: palette.ink, fontSize: 15, fontWeight: '800' },
  observationsInput: { minHeight: 140, borderRadius: 16, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.white, color: palette.ink, padding: 14, fontSize: 15, lineHeight: 21 },
});
