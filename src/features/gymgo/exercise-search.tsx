import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, FlatList, Image, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';

import { api, createExercise, getApiErrorMessage, updateExercise } from './api';
import { EQUIPMENT_FAMILY_OPTIONS, normalizeEquipmentCategory } from './equipment-families';
import type { EquipmentCategory } from './equipment-families';
import { palette } from './theme';
import { isMuscleGroup, MUSCLE_GROUPS, normalizeMuscleGroup } from './types';
import type { CustomExercisePayload, CuratedExercise, Exercise, MuscleGroup } from './types';
import { SelectField } from './select-field';
import { useDarkUi } from './ui';

const MUSCLE_GROUP_ICONS: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  Abdominales: 'human',
  Abductores: 'human',
  Aductores: 'human',
  Antebrazos: 'arm-flex',
  Bíceps: 'arm-flex',
  Cardio: 'run',
  Cuello: 'human',
  Cuádriceps: 'human',
  Dorsales: 'human',
  Espalda: 'human',
  Femoral: 'human',
  Gemelos: 'human',
  Glúteos: 'human',
  Hombros: 'arm-flex',
  Lumbar: 'human',
  Pecho: 'human',
  Trapecio: 'human',
  Tríceps: 'arm-flex',
};

export type ExercisePickerEquipment = {
  _id: string;
  name: string;
  zone: string;
  type: 'strength' | 'cardio';
  status: 'available' | 'busy' | 'out_of_service';
};

export type ExerciseSelection = Omit<Exercise, '_id' | 'order' | 'equipmentId'> & { _id?: string; order?: number; equipmentId?: string };

type ExerciseSearchProps = {
  visible: boolean;
  mode: 'single' | 'superset';
  equipment: ExercisePickerEquipment[];
  onClose: () => void;
  onConfirm: (exercises: ExerciseSelection[]) => void;
  canManage?: boolean;
};

type ExerciseFormProps = {
  visible: boolean;
  exercise: CuratedExercise | null;
  onClose: () => void;
  onSaved: () => void;
};

function ExerciseFormModal({ visible, exercise, onClose, onSaved }: ExerciseFormProps) {
  const dark = useDarkUi();
  const [name, setName] = useState(exercise?.name ?? '');
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup | ''>(exercise ? normalizeMuscleGroup(exercise.muscleGroup) : '');
  const [equipment, setEquipment] = useState<EquipmentCategory>(normalizeEquipmentCategory(exercise?.equipment));
  const [videoUrl, setVideoUrl] = useState(exercise?.videoUrl ?? '');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  async function save() {
    if (!name.trim() || !isMuscleGroup(muscleGroup)) {
      setError('Escribe un nombre y selecciona un grupo muscular.');
      return;
    }
    setIsSaving(true);
    setError('');
    const payload: CustomExercisePayload = { name: name.trim(), muscleGroup, equipment, videoUrl: videoUrl.trim() || null };
    try {
      if (exercise) await updateExercise(exercise._id, payload);
      else await createExercise(payload);
      onSaved();
      onClose();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No se pudo guardar el ejercicio.'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <View style={[styles.formCard, dark && styles.darkCard]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, dark && styles.darkText]}>{exercise ? 'Editar ejercicio' : 'Crear ejercicio personalizado'}</Text>
            <Pressable onPress={onClose} hitSlop={10}><MaterialCommunityIcons name="close" size={24} color={dark ? '#F4F8F5' : palette.ink} /></Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            <Text style={[styles.label, dark && styles.darkText]}>Nombre</Text>
            <TextInput value={name} onChangeText={setName} placeholder="Ej. Press inclinado" placeholderTextColor={palette.muted} style={[styles.input, dark && styles.darkInput]} />
            <SelectField label="Grupo muscular" placeholder="Selecciona un grupo" options={MUSCLE_GROUPS.map((item) => ({ value: item, label: item }))} value={muscleGroup} onChange={(value) => { if (isMuscleGroup(value)) setMuscleGroup(value); }} />
            <SelectField label="Categoría de equipo" placeholder="Selecciona el equipo" options={EQUIPMENT_FAMILY_OPTIONS.map((item) => ({ value: item.value, label: item.label }))} value={equipment} onChange={(value) => setEquipment(normalizeEquipmentCategory(value))} />
            <Text style={[styles.label, dark && styles.darkText]}>Video o GIF (opcional)</Text>
            <TextInput value={videoUrl} onChangeText={setVideoUrl} placeholder="https://..." placeholderTextColor={palette.muted} autoCapitalize="none" style={[styles.input, dark && styles.darkInput]} />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable onPress={() => void save()} disabled={isSaving} style={styles.primaryButton}>
              {isSaving ? <ActivityIndicator color="#121212" /> : <Text style={styles.primaryText}>{exercise ? 'Guardar cambios' : 'Crear ejercicio'}</Text>}
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function initialMetricValues(exercises: CuratedExercise[]) {
  return Object.fromEntries(exercises.map((exercise, order) => [exercise._id, {
    name: exercise.name,
    muscleGroup: normalizeMuscleGroup(exercise.muscleGroup),
    equipment: normalizeEquipmentCategory(exercise.equipment),
    bodyweight: normalizeEquipmentCategory(exercise.equipment) === 'Sin equipo',
    metricType: normalizeMuscleGroup(exercise.muscleGroup) === 'Cardio' ? 'cardio' : 'strength',
    videoUrl: exercise.videoUrl,
    gifUrl: exercise.videoUrl,
    reps: '10',
    order,
  }])) as Record<string, ExerciseSelection>;
}

function MetricsModal({
  exercises, equipment, onClose, onConfirm,
}: {
  exercises: CuratedExercise[];
  equipment: ExercisePickerEquipment[];
  onClose: () => void;
  onConfirm: (value: ExerciseSelection[]) => void;
}) {
  const [values, setValues] = useState<Record<string, ExerciseSelection>>(() => initialMetricValues(exercises));
  const availableEquipment = equipment.filter((item) => item.status !== 'out_of_service');

  function update(id: string, patch: Partial<ExerciseSelection>) {
    setValues((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  }

  function confirm() {
    const result = exercises.map((exercise) => values[exercise._id]).filter(Boolean);
    onConfirm(result);
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.metricsCard}>
          <View style={styles.modalHeader}>
            <View style={styles.flex}><Text style={styles.modalTitle}>Configurar objetivos</Text><Text style={styles.subtitle}>{exercises.length} ejercicio{exercises.length === 1 ? '' : 's'}</Text></View>
            <Pressable onPress={onClose}><MaterialCommunityIcons name="close" size={24} color={palette.ink} /></Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.metricsList} keyboardShouldPersistTaps="handled">
            {exercises.map((exercise) => {
              const value = values[exercise._id];
              if (!value) return null;
              const cardio = value.metricType === 'cardio';
              return (
                <View key={exercise._id} style={styles.metricRow}>
                  <Text style={styles.metricTitle}>{exercise.name}</Text>
                  <Text style={styles.metricSubtitle}>{value.muscleGroup}</Text>
                  {cardio ? (
                    <View style={styles.row}>
                      <Field label="Duración (min)" value={String(value.targetDurationMinutes ?? '')} onChangeText={(text) => update(exercise._id, { targetDurationMinutes: Number(text) || undefined })} />
                      <Field label="Distancia (km)" value={String(value.targetDistanceKm ?? '')} onChangeText={(text) => update(exercise._id, { targetDistanceKm: Number(text.replace(',', '.')) || undefined })} />
                      <Field label="Nivel" value={String(value.targetLevel ?? '')} onChangeText={(text) => update(exercise._id, { targetLevel: Number(text) || undefined })} />
                    </View>
                  ) : (
                    <View style={styles.row}>
                      <Field label="Repeticiones objetivo" value={value.reps ?? ''} onChangeText={(text) => update(exercise._id, { reps: text })} />
                      <Field label="Peso sugerido (kg)" value={value.suggestedWeight === undefined ? '' : String(value.suggestedWeight)} onChangeText={(text) => update(exercise._id, { suggestedWeight: Number(text.replace(',', '.')) || undefined })} />
                    </View>
                  )}
                  <SelectField label="Equipo" placeholder="Sin equipo" options={[
                    ...EQUIPMENT_FAMILY_OPTIONS.map((item) => ({ value: item.value, label: item.label })),
                    ...availableEquipment.map((item) => ({ value: `inventory:${item._id}`, label: item.name })),
                  ]} value={value.bodyweight ? 'Sin equipo' : (typeof value.equipmentId === 'string' ? `inventory:${value.equipmentId}` : value.equipment ?? 'Otro')} onChange={(selected) => {
                    const inventoryId = selected.startsWith('inventory:') ? selected.slice('inventory:'.length) : undefined;
                    const item = availableEquipment.find((entry) => entry._id === inventoryId);
                    const category = normalizeEquipmentCategory(item?.name ?? selected);
                    update(exercise._id, { equipmentId: inventoryId, equipment: category, bodyweight: category === 'Sin equipo' });
                  }} />
                </View>
              );
            })}
          </ScrollView>
          <Pressable onPress={confirm} style={styles.primaryButton}><Text style={styles.primaryText}>Confirmar y agregar al bloque</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}

function Field({ label, value, onChangeText }: { label: string; value: string; onChangeText: (value: string) => void }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput keyboardType="decimal-pad" value={value} onChangeText={onChangeText} style={styles.smallInput} placeholderTextColor={palette.muted} /></View>;
}

export function ExerciseSearch({ visible, mode, equipment, onClose, onConfirm, canManage = true }: ExerciseSearchProps) {
  const dark = useDarkUi();
  const [catalog, setCatalog] = useState<CuratedExercise[]>([]);
  const [query, setQuery] = useState('');
  const [muscleFilter, setMuscleFilter] = useState('');
  const [equipmentFilter, setEquipmentFilter] = useState('');
  const [filter, setFilter] = useState<'muscle' | 'equipment' | null>(null);
  const [selected, setSelected] = useState<CuratedExercise[]>([]);
  const [metricsVisible, setMetricsVisible] = useState(false);
  const [formExercise, setFormExercise] = useState<CuratedExercise | null>(null);
  const [formVisible, setFormVisible] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function loadCatalog() {
    setLoading(true);
    return api.get<{ exercises: CuratedExercise[] }>('/exercises').then((response) => setCatalog(response.data.exercises))
      .catch((requestError) => setError(getApiErrorMessage(requestError, 'No se pudo cargar el catálogo de ejercicios.')))
      .finally(() => setLoading(false));
  }
  // Loading the picker catalog is an external synchronization triggered by visibility.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (visible) void loadCatalog(); }, [visible]);

  const results = useMemo(() => catalog.filter((exercise) => {
    const matchesQuery = !query.trim() || exercise.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
    const matchesMuscle = !muscleFilter || normalizeMuscleGroup(exercise.muscleGroup) === muscleFilter;
    const matchesEquipment = !equipmentFilter || normalizeEquipmentCategory(exercise.equipment) === equipmentFilter;
    return matchesQuery && matchesMuscle && matchesEquipment;
  }), [catalog, equipmentFilter, muscleFilter, query]);

  function toggle(exercise: CuratedExercise) {
    if (mode === 'single') { setSelected([exercise]); setMetricsVisible(true); return; }
    setSelected((current) => current.some((item) => item._id === exercise._id) ? current.filter((item) => item._id !== exercise._id) : [...current, exercise]);
  }

  function confirm(values: ExerciseSelection[]) {
    onConfirm(values.map((value, order) => ({ ...value, order })));
    setMetricsVisible(false);
    setSelected([]);
    onClose();
  }

  function closePicker() {
    setSelected([]);
    setFilter(null);
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={closePicker}>
      <View style={[styles.screen, dark && styles.darkScreen]}>
        <View style={styles.header}>
          <Pressable onPress={closePicker} hitSlop={10}><MaterialCommunityIcons name="arrow-left" size={25} color={dark ? '#F4F8F5' : palette.ink} /></Pressable>
          <Text style={[styles.headerTitle, dark && styles.darkText]}>Añadir Ejercicio</Text>
          {canManage ? <Pressable onPress={() => { setFormExercise(null); setFormVisible(true); }} style={styles.createAction}><MaterialCommunityIcons name="plus" size={18} color={palette.green} /><Text style={styles.createText}>Crear</Text></Pressable> : <View style={styles.headerSpacer} />}
        </View>
        <View style={[styles.searchBar, dark && styles.darkInputWrap]}><MaterialCommunityIcons name="magnify" size={21} color={palette.muted} /><TextInput value={query} onChangeText={setQuery} placeholder="Buscar ejercicio" placeholderTextColor={palette.muted} style={[styles.searchInput, dark && styles.darkText]} /></View>
        <View style={styles.filters}>
          <Pressable onPress={() => setFilter('muscle')} style={styles.filterButton}><MaterialCommunityIcons name="arm-flex" size={18} color={palette.green} /><Text style={styles.filterText}>{muscleFilter || 'Músculos'}</Text><MaterialCommunityIcons name="chevron-down" size={17} color={palette.muted} /></Pressable>
          <Pressable onPress={() => setFilter('equipment')} style={styles.filterButton}><MaterialCommunityIcons name="dumbbell" size={18} color={palette.green} /><Text style={styles.filterText}>{equipmentFilter || 'Equipamiento'}</Text><MaterialCommunityIcons name="chevron-down" size={17} color={palette.muted} /></Pressable>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading ? <ActivityIndicator color={palette.green} style={styles.loader} /> : (
          <FlatList data={results} keyExtractor={(item) => item._id} contentContainerStyle={styles.list} renderItem={({ item }) => {
            const checked = selected.some((exercise) => exercise._id === item._id);
            return <Pressable onPress={() => toggle(item)} style={styles.exerciseRow}>
              {item.gifUrl || item.videoUrl ? <Image source={{ uri: item.gifUrl || item.videoUrl }} style={styles.thumbnail} /> : <View style={styles.thumbnail}><MaterialCommunityIcons name="dumbbell" size={23} color={palette.green} /></View>}
              <View style={styles.flex}><Text numberOfLines={1} style={styles.exerciseName}>{item.name}</Text><Text style={styles.exerciseMeta}>{normalizeMuscleGroup(item.muscleGroup)} · {normalizeEquipmentCategory(item.equipment)}</Text></View>
              {item.isCustom ? <Pressable onPress={() => { setFormExercise(item); setFormVisible(true); }} hitSlop={8}><MaterialCommunityIcons name="pencil-outline" size={19} color={palette.cyan} /></Pressable> : null}
              {mode === 'superset' ? <View style={[styles.check, checked && styles.checkActive]}>{checked ? <Text style={styles.checkText}>✓</Text> : null}</View> : <MaterialCommunityIcons name="chevron-right" size={21} color={palette.muted} />}
            </Pressable>;
          }} />)}
        {mode === 'superset' && selected.length >= 2 ? <Pressable onPress={() => setMetricsVisible(true)} style={styles.stickyButton}><Text style={styles.primaryText}>Configurar {selected.length} ejercicios</Text></Pressable> : null}
        {filter ? <Modal visible transparent animationType="fade" onRequestClose={() => setFilter(null)}>
          <Pressable style={styles.filterBackdrop} onPress={() => setFilter(null)}>
            <View style={[styles.filterSheet, dark && styles.darkFilterSheet]}>
              <ScrollView contentContainerStyle={styles.filterScrollContent} showsVerticalScrollIndicator>
                {(filter === 'muscle' ? ['Todos los Músculos', ...MUSCLE_GROUPS] : ['Todos los Equipos', ...EQUIPMENT_FAMILY_OPTIONS.map((item) => item.value)]).map((item) => {
                  const isMuscleFilter = filter === 'muscle';
                  const isSelected = isMuscleFilter ? (item === 'Todos los Músculos' ? !muscleFilter : muscleFilter === item) : (item === 'Todos los Equipos' ? !equipmentFilter : equipmentFilter === item);
                  const icon = isMuscleFilter ? MUSCLE_GROUP_ICONS[item] ?? 'arm-flex' : EQUIPMENT_FAMILY_OPTIONS.find((option) => option.value === item)?.icon ?? 'dots-horizontal-circle-outline';
                  return <Pressable key={item} onPress={() => { if (isMuscleFilter) setMuscleFilter(item === 'Todos los Músculos' ? '' : item); else setEquipmentFilter(item === 'Todos los Equipos' ? '' : item); setFilter(null); }} style={[styles.filterOption, isSelected && styles.filterOptionSelected]}>
                    <MaterialCommunityIcons name={icon} size={20} color={isSelected ? palette.neon : palette.green} />
                    <Text style={[styles.filterOptionText, dark && styles.darkText, isSelected && styles.filterOptionTextSelected]}>{item}</Text>
                    {isSelected ? <MaterialCommunityIcons name="check" size={19} color={palette.neon} /> : null}
                  </Pressable>;
                })}
              </ScrollView>
            </View>
          </Pressable>
        </Modal> : null}
        {metricsVisible ? <MetricsModal exercises={selected} equipment={equipment} onClose={() => setMetricsVisible(false)} onConfirm={confirm} /> : null}
        {formVisible ? <ExerciseFormModal visible exercise={formExercise} onClose={() => setFormVisible(false)} onSaved={() => { setFormVisible(false); void loadCatalog(); }} /> : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F4F4EC', padding: 20, paddingTop: 56 },
  darkScreen: { backgroundColor: '#101412' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  headerTitle: { color: palette.ink, fontSize: 21, fontWeight: '800' },
  headerSpacer: { width: 40 }, createAction: { flexDirection: 'row', alignItems: 'center', gap: 3 }, createText: { color: palette.green, fontSize: 15, fontWeight: '800' },
  searchBar: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 16, backgroundColor: palette.white, paddingHorizontal: 14, marginBottom: 12 },
  darkInputWrap: { backgroundColor: '#1E1E1E' }, searchInput: { flex: 1, color: palette.ink, fontSize: 15 },
  filters: { flexDirection: 'row', gap: 10, marginBottom: 12 }, filterButton: { flex: 1, minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 14, backgroundColor: palette.white, paddingHorizontal: 11 }, filterText: { flex: 1, color: palette.ink, fontSize: 12, fontWeight: '700' },
  list: { gap: 8, paddingBottom: 90 }, exerciseRow: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, backgroundColor: '#1E1E1E', padding: 10 }, thumbnail: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#3A3A3A', alignItems: 'center', justifyContent: 'center' }, flex: { flex: 1 }, exerciseName: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' }, exerciseMeta: { color: '#A1A1AA', fontSize: 13, marginTop: 3 },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: palette.line, alignItems: 'center', justifyContent: 'center' }, checkActive: { backgroundColor: palette.green, borderColor: palette.green }, checkText: { color: palette.white, fontSize: 17, fontWeight: '800' },
  stickyButton: { position: 'absolute', left: 20, right: 20, bottom: 22, minHeight: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: palette.neon }, primaryButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: palette.neon, paddingHorizontal: 16 }, primaryText: { color: '#081009', fontSize: 14, fontWeight: '800' },
  loader: { marginTop: 30 }, error: { color: palette.danger, fontSize: 12, marginBottom: 8 }, filterBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000066' }, filterSheet: { minHeight: 400, maxHeight: '80%', borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: palette.white, padding: 18 }, darkFilterSheet: { backgroundColor: '#18181B' }, filterScrollContent: { flexGrow: 1, paddingBottom: 40 }, filterOption: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: palette.line }, filterOptionSelected: { backgroundColor: '#10FF8512' }, filterOptionText: { flex: 1, color: palette.ink, fontSize: 15 }, filterOptionTextSelected: { color: palette.neon, fontWeight: '800' },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000099' }, formCard: { maxHeight: '90%', borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: palette.white, padding: 20 }, darkCard: { backgroundColor: '#18181B' }, modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }, modalTitle: { color: palette.ink, fontSize: 20, fontWeight: '800' }, darkText: { color: '#F4F8F5' }, subtitle: { color: palette.muted, fontSize: 12, marginTop: 3 }, form: { gap: 12, paddingBottom: 18 }, label: { color: palette.ink, fontSize: 13, fontWeight: '700' }, input: { minHeight: 48, borderWidth: 1, borderColor: palette.line, borderRadius: 13, color: palette.ink, paddingHorizontal: 12 }, darkInput: { color: '#F4F8F5', backgroundColor: '#1E1E1E', borderColor: '#333' },
  metricsCard: { maxHeight: '88%', borderRadius: 24, backgroundColor: palette.white, padding: 20, margin: 16 }, metricsList: { gap: 14, paddingBottom: 14 }, metricRow: { gap: 7, borderBottomWidth: 1, borderBottomColor: palette.line, paddingBottom: 14 }, metricTitle: { color: palette.ink, fontSize: 15, fontWeight: '800' }, metricSubtitle: { color: palette.muted, fontSize: 12 }, row: { flexDirection: 'row', gap: 8 }, field: { flex: 1, gap: 4 }, fieldLabel: { color: palette.muted, fontSize: 10, fontWeight: '700' }, smallInput: { minHeight: 42, borderWidth: 1, borderColor: palette.line, borderRadius: 10, color: palette.ink, paddingHorizontal: 9, fontSize: 13 },
});
