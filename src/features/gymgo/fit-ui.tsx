import { MaterialIcons } from '@expo/vector-icons';
import type { PropsWithChildren } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useDarkUi } from './ui';

type IconName = keyof typeof MaterialIcons.glyphMap;

export function FloatingCard({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const dark = useDarkUi();
  return <View style={[styles.card, dark && styles.darkCard, style]}>{children}</View>;
}

export function IconBadge({ name, color, size = 44 }: { name: IconName; color: string; size?: number }) {
  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: size / 2, backgroundColor: `${color}26` }]}>
      <MaterialIcons name={name} size={size * 0.5} color={color} />
    </View>
  );
}

export function MetricCard({ icon, color, label, value, hint }: {
  icon: IconName;
  color: string;
  label: string;
  value: string | number;
  hint?: string;
}) {
  const dark = useDarkUi();
  return (
    <FloatingCard style={styles.metric}>
      <IconBadge name={icon} color={color} />
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
      <Text style={[styles.metricLabel, dark && styles.darkMetricLabel]}>{label}</Text>
      {hint ? <Text style={[styles.metricHint, dark && styles.darkMetricHint]}>{hint}</Text> : null}
    </FloatingCard>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    shadowColor: '#1C2A25',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 4,
  },
  darkCard: { backgroundColor: '#111815', borderWidth: 1, borderColor: '#27342E' },
  badge: { alignItems: 'center', justifyContent: 'center' },
  metric: { flex: 1, gap: 6, minWidth: 140 },
  metricValue: { fontSize: 28, lineHeight: 32, fontWeight: '800', marginTop: 6 },
  metricLabel: { color: '#1C2A25', fontSize: 13, fontWeight: '700' },
  metricHint: { color: '#747D75', fontSize: 11 },
  darkMetricLabel: { color: '#F4F8F5' },
  darkMetricHint: { color: '#91A098' },
});
