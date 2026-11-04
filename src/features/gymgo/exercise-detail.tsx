import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getApiErrorMessage, getCatalogExercise } from './api';
import { palette } from './theme';
import type { CatalogExerciseDetail } from './types';

export type ExerciseDetailTarget = { name: string; gifUrl?: string | null; catalogExerciseId?: string };

// Animation plus, for catalog exercises, the muscles and step-by-step instructions (fetched on open:
// the catalog list does not carry steps).
export function ExerciseDetailModal({ exercise, onClose }: { exercise: ExerciseDetailTarget | null; onClose: () => void }) {
  const [detail, setDetail] = useState<CatalogExerciseDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const catalogId = exercise?.catalogExerciseId;

  useEffect(() => {
    if (!catalogId) return;
    let active = true;
    // Fetching the detail is an external synchronization keyed by the opened exercise.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError('');
    setDetail(null);
    getCatalogExercise(catalogId)
      .then((value) => { if (active) setDetail(value); })
      .catch((requestError) => { if (active) setError(getApiErrorMessage(requestError, 'No se pudieron cargar las instrucciones.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [catalogId]);

  const gifUrl = detail?.gifUrl || exercise?.gifUrl;
  const current = catalogId && detail?._id === catalogId ? detail : null;

  return (
    <Modal visible={Boolean(exercise)} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text numberOfLines={2} style={styles.title}>{exercise?.name}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Cerrar detalle" onPress={onClose} hitSlop={10}>
              <MaterialIcons name="close" size={24} color={palette.ink} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body}>
            {gifUrl ? <Image source={{ uri: gifUrl }} resizeMode="contain" style={styles.gif} /> : null}
            {current ? (
              <>
                <View style={styles.chips}>
                  <Text style={[styles.chip, styles.primaryChip]}>{current.muscleGroup}</Text>
                  {current.secondaryMuscles.map((muscle) => <Text key={muscle} style={styles.chip}>{muscle}</Text>)}
                  {current.equipment ? <Text style={styles.chip}>{current.equipment}</Text> : null}
                </View>
                {current.steps.length ? (
                  <View style={styles.steps}>
                    <Text style={styles.sectionTitle}>Cómo hacerlo</Text>
                    {current.steps.map((step, index) => (
                      <View key={index} style={styles.step}>
                        <Text style={styles.stepNumber}>{index + 1}</Text>
                        <Text style={styles.stepText}>{step}</Text>
                      </View>
                    ))}
                  </View>
                ) : <Text style={styles.muted}>Este ejercicio no tiene instrucciones paso a paso.</Text>}
                {current.attribution ? <Text style={styles.attribution}>{current.attribution}</Text> : null}
              </>
            ) : null}
            {loading ? <ActivityIndicator color={palette.green} /> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#07130FC7', alignItems: 'center', justifyContent: 'center', padding: 22 },
  card: { width: '100%', maxWidth: 420, maxHeight: '88%', borderRadius: 24, backgroundColor: palette.white, padding: 16, gap: 14, elevation: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { flex: 1, color: palette.ink, fontSize: 16, fontWeight: '800' },
  body: { gap: 14, paddingBottom: 4 },
  gif: { width: '100%', aspectRatio: 1, borderRadius: 18, backgroundColor: '#F2F4EE' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { overflow: 'hidden', borderRadius: 999, backgroundColor: '#EEF1EA', color: palette.ink, fontSize: 12, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 5 },
  primaryChip: { backgroundColor: palette.green, color: palette.white },
  steps: { gap: 10 },
  sectionTitle: { color: palette.ink, fontSize: 14, fontWeight: '800' },
  step: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  stepNumber: { width: 24, height: 24, borderRadius: 12, overflow: 'hidden', backgroundColor: palette.neon, color: '#081009', fontSize: 12, fontWeight: '800', textAlign: 'center', lineHeight: 24 },
  stepText: { flex: 1, color: palette.ink, fontSize: 14, lineHeight: 20 },
  muted: { color: palette.muted, fontSize: 13 },
  attribution: { color: palette.muted, fontSize: 11 },
  error: { color: palette.danger, fontSize: 12 },
});
