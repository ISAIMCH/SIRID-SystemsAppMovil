import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { useAuth } from './auth-context';
import { getApiErrorMessage } from './api';
import { ActionButton, Eyebrow, Field, Notice } from './ui';
import { palette } from './theme';

const goals = [
  { value: 'ganar masa muscular', label: 'Ganar masa' },
  { value: 'perder grasa', label: 'Perder grasa' },
  { value: 'definición', label: 'Definición' },
  { value: 'fuerza', label: 'Fuerza' },
  { value: 'acondicionamiento', label: 'Acondicionamiento' },
];

const experienceLevels = [
  { value: 'principiante', label: 'Principiante' },
  { value: 'intermedio', label: 'Intermedio' },
  { value: 'avanzado', label: 'Avanzado' },
] as const;

const trainingDays = [
  { value: 1, label: 'L' },
  { value: 2, label: 'M' },
  { value: 3, label: 'X' },
  { value: 4, label: 'J' },
  { value: 5, label: 'V' },
  { value: 6, label: 'S' },
  { value: 0, label: 'D' },
];

const trainingTimes = ['Mañana', 'Tarde', 'Noche', 'Variable'];

export default function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [isRegistering, setIsRegistering] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [goal, setGoal] = useState('');
  const [experienceLevel, setExperienceLevel] = useState<'principiante' | 'intermedio' | 'avanzado' | ''>('');
  const [availableTrainingDays, setAvailableTrainingDays] = useState<number[]>([]);
  const [preferredTrainingTime, setPreferredTrainingTime] = useState('');
  const [restrictions, setRestrictions] = useState('');
  const [preferredZonesText, setPreferredZonesText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setError('');
    if (!email.trim() || !password) {
      setError('Escribe tu correo y contraseña para continuar.');
      return;
    }
    if (isRegistering && name.trim().length < 2) {
      setError('El nombre debe tener al menos 2 caracteres.');
      return;
    }
    if (isRegistering && !goal) {
      setError('Selecciona tu objetivo deportivo.');
      return;
    }
    if (isRegistering && !experienceLevel) {
      setError('Selecciona tu nivel de experiencia.');
      return;
    }
    if (isRegistering && availableTrainingDays.length === 0) {
      setError('Selecciona al menos un día disponible para entrenar.');
      return;
    }
    if (password.length < 10) {
      setError('La contraseña debe tener al menos 10 caracteres.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isRegistering) {
        await signUp({
          name,
          email,
          password,
          goal,
          experienceLevel: experienceLevel as 'principiante' | 'intermedio' | 'avanzado',
          availableTrainingDays,
          ...(preferredTrainingTime ? { preferredTrainingTime } : {}),
          ...(restrictions.trim() ? { restrictions: restrictions.trim() } : {}),
          ...(preferredZonesText.trim()
            ? { preferredZones: preferredZonesText.split(',').map((zone) => zone.trim()).filter(Boolean) }
            : {}),
        });
      }
      else await signIn(email, password);
      router.replace('/(main)');
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No se pudo conectar con GymGo. Intenta de nuevo.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.colorBand} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      <View style={styles.content}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark}><Text style={styles.markText}>G</Text></View>
          <Text style={styles.brand}>GYMGO</Text>
        </View>
        <Eyebrow>ENTRENA CON INTENCIÓN</Eyebrow>
        <Text style={styles.title}>{isRegistering ? 'Tu ritmo empieza aquí.' : 'Vuelve a tu mejor versión.'}</Text>
        <Text style={styles.subtitle}>
          {isRegistering ? 'Crea tu cuenta de cliente y conecta con tu gimnasio.' : 'Accede a tus rutinas y a tu espacio en el gimnasio.'}
        </Text>

        <View style={styles.form}>
          {isRegistering ? <Field label="Nombre completo" autoCapitalize="words" value={name} onChangeText={setName} /> : null}
          {isRegistering ? (
            <>
              <View style={styles.selectionGroup}>
                <Text style={styles.selectionLabel}>Objetivo deportivo</Text>
                <View style={styles.options}>
                  {goals.map((option) => (
                    <OptionChip
                      key={option.value}
                      label={option.label}
                      selected={goal === option.value}
                      onPress={() => setGoal(option.value)}
                    />
                  ))}
                </View>
              </View>
              <View style={styles.selectionGroup}>
                <Text style={styles.selectionLabel}>Nivel de experiencia</Text>
                <View style={styles.options}>
                  {experienceLevels.map((option) => (
                    <OptionChip
                      key={option.value}
                      label={option.label}
                      selected={experienceLevel === option.value}
                      onPress={() => setExperienceLevel(option.value)}
                    />
                  ))}
                </View>
              </View>
              <View style={styles.selectionGroup}>
                <Text style={styles.selectionLabel}>Días disponibles</Text>
                <View style={styles.dayOptions}>
                  {trainingDays.map((day) => {
                    const selected = availableTrainingDays.includes(day.value);
                    return (
                      <Pressable
                        key={day.value}
                        accessibilityRole="checkbox"
                        accessibilityLabel={['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][day.value]}
                        accessibilityState={{ checked: selected }}
                        onPress={() => setAvailableTrainingDays((current) => (
                          selected ? current.filter((value) => value !== day.value) : [...current, day.value]
                        ))}
                        style={[styles.dayChip, selected && styles.optionSelected]}>
                        <Text style={[styles.dayText, selected && styles.optionTextSelected]}>{day.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              <View style={styles.selectionGroup}>
                <Text style={styles.selectionLabel}>Horario habitual (opcional)</Text>
                <View style={styles.options}>
                  {trainingTimes.map((time) => (
                    <OptionChip
                      key={time}
                      label={time}
                      selected={preferredTrainingTime === time}
                      onPress={() => setPreferredTrainingTime(preferredTrainingTime === time ? '' : time)}
                    />
                  ))}
                </View>
              </View>
              <Field
                label="Restricciones o lesiones (opcional)"
                value={restrictions}
                onChangeText={setRestrictions}
                multiline
                numberOfLines={3}
                style={styles.multiline}
              />
              <Field
                label="Zonas preferidas, separadas por coma (opcional)"
                placeholder="Cardio, peso libre"
                value={preferredZonesText}
                onChangeText={setPreferredZonesText}
              />
            </>
          ) : null}
          <Field
            label="Correo electrónico"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <Field
            label="Contraseña"
            autoCapitalize="none"
            autoComplete={isRegistering ? 'new-password' : 'password'}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={() => void submit()}
            returnKeyType="done"
          />
          {error ? <Notice error>{error}</Notice> : null}
          <ActionButton onPress={() => void submit()} disabled={isSubmitting}>
            {isSubmitting ? <ActivityIndicator color={palette.white} /> : isRegistering ? 'Crear cuenta' : 'Iniciar sesión'}
          </ActionButton>
        </View>

        <View style={styles.switchRow}>
          <Text style={styles.switchText}>{isRegistering ? '¿Ya tienes cuenta?' : '¿Primera vez en GymGo?'}</Text>
          <Text
            accessibilityRole="button"
            onPress={() => { setIsRegistering(!isRegistering); setError(''); }}
            style={styles.switchAction}>
            {isRegistering ? 'Inicia sesión' : 'Crear cuenta'}
          </Text>
        </View>
        {isRegistering ? <Text style={styles.footnote}>Tu cuenta se activa cuando el gimnasio confirma tu membresía.</Text> : null}
      </View>
      </ScrollView>
    </View>
  );
}

function OptionChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[styles.optionChip, selected && styles.optionSelected]}>
      <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.paper },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center' },
  colorBand: { position: 'absolute', top: 0, left: 0, right: 0, height: '34%', backgroundColor: palette.deepGreen },
  content: { width: '100%', maxWidth: 520, alignSelf: 'center', padding: 24, gap: 16 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  brandMark: { width: 38, height: 38, borderRadius: 10, backgroundColor: palette.lime, alignItems: 'center', justifyContent: 'center' },
  markText: { color: palette.deepGreen, fontSize: 22, fontWeight: '900' },
  brand: { color: palette.white, fontWeight: '900', fontSize: 16 },
  title: { color: palette.ink, fontSize: 34, lineHeight: 39, fontWeight: '800', maxWidth: 390 },
  subtitle: { color: palette.muted, fontSize: 15, lineHeight: 22, marginBottom: 8 },
  form: { gap: 16, marginTop: 10 },
  selectionGroup: { gap: 8 },
  selectionLabel: { color: palette.ink, fontSize: 13, fontWeight: '700' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  optionChip: { minHeight: 38, justifyContent: 'center', borderWidth: 1, borderColor: palette.line, borderRadius: 7, backgroundColor: palette.surface, paddingHorizontal: 11, paddingVertical: 7 },
  optionSelected: { backgroundColor: palette.deepGreen, borderColor: palette.deepGreen },
  optionText: { color: palette.ink, fontSize: 12, fontWeight: '700' },
  optionTextSelected: { color: palette.white },
  dayOptions: { flexDirection: 'row', justifyContent: 'space-between', gap: 7 },
  dayChip: { width: 38, height: 38, borderWidth: 1, borderColor: palette.line, borderRadius: 19, backgroundColor: palette.surface, justifyContent: 'center', alignItems: 'center' },
  dayText: { color: palette.ink, fontSize: 12, fontWeight: '800' },
  multiline: { minHeight: 84, textAlignVertical: 'top', paddingTop: 12 },
  switchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 4 },
  switchText: { color: palette.muted, fontSize: 14 },
  switchAction: { color: palette.green, fontWeight: '800', fontSize: 14, paddingVertical: 6 },
  footnote: { color: palette.muted, fontSize: 12, lineHeight: 18 },
});