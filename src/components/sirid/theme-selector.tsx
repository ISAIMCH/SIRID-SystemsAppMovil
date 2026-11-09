import { MaterialIcons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { makeStyles } from '@/theme/make-styles';
import { useTheme, type ThemePreference } from '@/theme/theme-provider';
import { darkColors, lightColors, radius, space } from '@/theme/tokens';

import { PressableScale } from './motion';

const OPTIONS: { value: ThemePreference; label: string; icon: keyof typeof MaterialIcons.glyphMap }[] = [
  { value: 'system', label: 'Automático', icon: 'brightness-auto' },
  { value: 'light', label: 'Claro', icon: 'light-mode' },
  { value: 'dark', label: 'Oscuro', icon: 'dark-mode' },
];

const useStyles = makeStyles(({ colors }) => ({
  row: { flexDirection: 'row', gap: space.sm },
  option: { flex: 1, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surfaceRaised, padding: space.sm, gap: space.sm, alignItems: 'center' },
  optionActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  preview: { width: '100%', height: 64, borderRadius: radius.sm, overflow: 'hidden', flexDirection: 'row' },
  half: { flex: 1, padding: 7, gap: 5 },
  bar: { height: 6, borderRadius: 3 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 24 },
  label: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  labelActive: { color: colors.text, fontWeight: '700' },
}));

function MiniPreview({ tone }: { tone: 'light' | 'dark' }) {
  const styles = useStyles();
  const c = tone === 'light' ? lightColors : darkColors;
  return (
    <View style={[styles.half, { backgroundColor: c.background }]}>
      <View style={[styles.bar, { width: '70%', backgroundColor: c.text }]} />
      <View style={[styles.bar, { width: '45%', backgroundColor: c.textTertiary }]} />
      <View style={[styles.bar, { width: '55%', height: 14, borderRadius: 4, backgroundColor: c.primary }]} />
    </View>
  );
}

/** Appearance picker: Automático / Claro / Oscuro. Persists across launches. */
export function ThemeSelector() {
  const styles = useStyles();
  const { preference, setPreference, colors } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Apariencia" style={styles.row}>
      {OPTIONS.map((option) => {
        const active = preference === option.value;
        return (
          <PressableScale
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: active }}
            onPress={() => setPreference(option.value)}
            style={[styles.option, active && styles.optionActive]}>
            <View style={styles.preview}>
              {option.value === 'system' ? (<><MiniPreview tone="light" /><MiniPreview tone="dark" /></>) : <MiniPreview tone={option.value} />}
            </View>
            <View style={styles.labelRow}>
              <MaterialIcons name={active ? 'radio-button-checked' : option.icon} size={16} color={active ? colors.accent : colors.textSecondary} />
              <Text maxFontSizeMultiplier={1.3} style={[styles.label, active && styles.labelActive]}>{option.label}</Text>
            </View>
          </PressableScale>
        );
      })}
    </View>
  );
}
