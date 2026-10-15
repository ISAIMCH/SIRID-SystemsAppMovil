import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { api } from './api';
import { palette } from './theme';
import type { CuratedExercise } from './types';

export function ExerciseSearch({ value, muscleGroup, onChangeText, onSelect }: {
  value: string;
  muscleGroup: string;
  onChangeText: (value: string) => void;
  onSelect: (exercise: CuratedExercise) => void;
}) {
  const [catalog, setCatalog] = useState<CuratedExercise[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedName, setSelectedName] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api.get<{ exercises: CuratedExercise[] }>('/exercises', { signal: controller.signal })
      .then((response) => setCatalog(response.data.exercises))
      .catch(() => {
        if (!controller.signal.aborted) setError('No se pudo cargar el catálogo curado.');
      })
      .finally(() => { if (!controller.signal.aborted) setIsLoading(false); });
    return () => controller.abort();
  }, []);

  const query = value.trim().toLocaleLowerCase();
  const group = muscleGroup.trim().toLocaleLowerCase();
  const activeQuery = group.length > 0 && selectedName !== value.trim();
  const results = activeQuery
    ? catalog.filter((exercise) => exercise.muscleGroup.trim().toLocaleLowerCase() === group
      && (!query || exercise.name.toLocaleLowerCase().includes(query))).slice(0, 50)
    : [];

  function changeValue(text: string) {
    setSelectedName('');
    onChangeText(text);
  }

  function select(exercise: CuratedExercise) {
    setSelectedName(exercise.name);
    setError('');
    onSelect(exercise);
  }

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>Buscar ejercicio</Text>
      <View style={styles.inputWrap}>
        <MaterialIcons name="search" size={20} color={palette.muted} />
        <TextInput
          value={value}
          onChangeText={changeValue}
          placeholder="Ej. Bench press"
          placeholderTextColor={palette.muted}
          style={styles.input}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          onFocus={() => setIsFocused(true)}
        />
        {activeQuery && isLoading ? <ActivityIndicator size="small" color={palette.green} /> : null}
      </View>
      {activeQuery && error ? <Text style={styles.error}>{error}</Text> : null}
      {activeQuery && results.length ? (
        <View style={styles.dropdown}>
          <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled style={styles.resultList}>
            {results.map((exercise) => (
              <Pressable key={exercise._id} accessibilityRole="button" onPress={() => select(exercise)} style={styles.result}>
                <View style={styles.resultIcon}><MaterialIcons name="fitness-center" size={18} color={palette.green} /></View>
                <View style={styles.resultText}>
                  <Text numberOfLines={1} style={styles.resultName}>{exercise.name}</Text>
                  <Text numberOfLines={1} style={styles.resultMeta}>{exercise.muscleGroup} · {exercise.equipment ?? 'Sin equipo'}</Text>
                </View>
                <MaterialIcons name="north-west" size={17} color={palette.muted} />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
      {isFocused && !muscleGroup.trim() ? <Text style={styles.hint}>Selecciona un grupo muscular para ver sus ejercicios.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 7, zIndex: 20 },
  label: { color: palette.ink, fontSize: 13, fontWeight: '700' },
  inputWrap: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: palette.line, borderRadius: 16, backgroundColor: '#F2F4EE', paddingHorizontal: 14 },
  input: { flex: 1, minWidth: 0, height: 50, color: palette.ink, fontSize: 15 },
  hint: { color: palette.muted, fontSize: 12 },
  dropdown: { position: 'absolute', top: 78, left: 0, right: 0, zIndex: 50, elevation: 8, borderRadius: 16, backgroundColor: palette.white, borderWidth: 1, borderColor: palette.line, overflow: 'hidden', shadowColor: '#1C2A25', shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.14, shadowRadius: 12 },
  resultList: { maxHeight: 320 },
  result: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: palette.line },
  resultIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#19D98B26', alignItems: 'center', justifyContent: 'center' },
  resultText: { flex: 1, gap: 3 },
  resultName: { color: palette.ink, fontSize: 13, fontWeight: '800' },
  resultMeta: { color: palette.muted, fontSize: 11 },
  error: { color: palette.danger, fontSize: 12 },
});
