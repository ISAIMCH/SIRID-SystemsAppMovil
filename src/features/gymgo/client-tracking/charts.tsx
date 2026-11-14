import { MaterialIcons } from '@expo/vector-icons';
import { Text as RNText, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { toneColors, type Tone } from '@/components/sirid';
import { makeStyles } from '@/theme/make-styles';
import { useTheme } from '@/theme/theme-provider';
import { radius, space } from '@/theme/tokens';

/** A tiny line of the latest values; the last point is marked. Decorative: the row text carries the data. */
export function Sparkline({ values, width = 72, height = 28, tone = 'accent' }: { values: number[]; width?: number; height?: number; tone?: Tone }) {
  const { colors } = useTheme();
  const color = tone === 'neutral' ? colors.textTertiary : toneColors(colors, tone).fg;
  if (values.length < 2) return <View style={{ width, height }} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 3;
  const points = values.map((value, index) => {
    const x = pad + (index / (values.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (value - min) / span) * (height - pad * 2);
    return [x, max === min ? height / 2 : y] as const;
  });
  const [lastX, lastY] = points[points.length - 1];
  return (
    <Svg width={width} height={height} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Polyline points={points.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={lastX} cy={lastY} r={3} fill={color} />
    </Svg>
  );
}

const useBarStyles = makeStyles(({ colors }) => ({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  column: { flex: 1, alignItems: 'center', gap: space.xs },
  track: { width: '100%', maxWidth: 28, justifyContent: 'flex-end', borderRadius: radius.xs, backgroundColor: colors.surfaceSunken, overflow: 'hidden' },
  bar: { width: '100%', borderRadius: radius.xs },
  value: { color: colors.text, fontSize: 11, fontWeight: '700' },
  label: { color: colors.textSecondary, fontSize: 10, fontWeight: '600' },
}));

/** Labelled bars with their values written on top, so nothing depends on colour or hovering. */
export function MiniBars({ data, height = 84, format = String }: {
  data: { key: string; label: string; value: number | null; highlight?: boolean; muted?: boolean }[];
  height?: number;
  format?: (value: number) => string;
}) {
  const styles = useBarStyles();
  const { colors } = useTheme();
  const max = Math.max(1, ...data.map((item) => item.value ?? 0));
  return (
    <View style={styles.row}>
      {data.map((item) => (
        <View key={item.key} style={styles.column} accessible accessibilityLabel={`${item.label}: ${item.value === null ? 'sin datos' : format(item.value)}`}>
          <RNText maxFontSizeMultiplier={1.2} style={styles.value}>{item.value === null ? '—' : format(item.value)}</RNText>
          <View style={[styles.track, { height }]}>
            <View style={[styles.bar, {
              height: `${Math.max(item.value ? 6 : 0, ((item.value ?? 0) / max) * 100)}%`,
              backgroundColor: item.muted ? colors.borderStrong : item.highlight ? colors.accentFill : colors.info,
            }]} />
          </View>
          <RNText maxFontSizeMultiplier={1.2} style={styles.label}>{item.label}</RNText>
        </View>
      ))}
    </View>
  );
}

const useDeltaStyles = makeStyles(() => ({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2 },
  text: { fontSize: 12, fontWeight: '700' },
}));

/**
 * A change with its arrow. `tone` is decided by the caller from what the change means for that measure
 * (more sessions is good, more perceived effort is a warning, more volume is just more).
 */
export function DeltaPill({ direction, label, tone }: { direction: 'up' | 'down' | 'flat'; label: string; tone: Tone }) {
  const styles = useDeltaStyles();
  const { colors } = useTheme();
  const { fg, bg } = toneColors(colors, tone);
  const icon = direction === 'up' ? 'arrow-upward' : direction === 'down' ? 'arrow-downward' : 'remove';
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <MaterialIcons name={icon} size={12} color={fg} />
      <RNText maxFontSizeMultiplier={1.3} style={[styles.text, { color: fg }]}>{label}</RNText>
    </View>
  );
}

export type Polarity = 'higherIsBetter' | 'lowerIsBetter' | 'neutral' | 'higherNeedsCare';

/** Direction, label and tone of the change from `previous` to `current` for a measure of the given polarity. */
export function describeChange(current: number | null, previous: number | null, polarity: Polarity, { relative = true, digits = 0, threshold = 0 } = {}) {
  if (current === null || previous === null) return null;
  const diff = current - previous;
  const direction: 'up' | 'down' | 'flat' = Math.abs(diff) <= threshold ? 'flat' : diff > 0 ? 'up' : 'down';
  let label: string;
  if (direction === 'flat') label = 'Igual';
  else if (relative && previous !== 0) label = `${diff > 0 ? '+' : ''}${Math.round((diff / previous) * 100)}%`;
  else label = `${diff > 0 ? '+' : ''}${diff.toFixed(digits).replace(/\.0$/, '')}`;
  let tone: Tone = 'neutral';
  if (direction !== 'flat') {
    if (polarity === 'higherIsBetter') tone = direction === 'up' ? 'success' : 'warning';
    else if (polarity === 'lowerIsBetter') tone = direction === 'down' ? 'success' : 'warning';
    else if (polarity === 'higherNeedsCare') tone = direction === 'up' ? 'warning' : 'neutral';
    else tone = 'info';
  }
  return { direction, label, tone };
}
