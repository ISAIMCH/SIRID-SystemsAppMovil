import type { PropsWithChildren } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { Card, IconTile, StatTile, type IconName } from '@/components/sirid';

export function FloatingCard({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <Card variant="raised" style={style}>{children}</Card>;
}

/** `color` is ignored in favour of the theme's accent so icons adapt to light/dark. */
export function IconBadge({ name, size = 44 }: { name: IconName; color?: string; size?: number }) {
  return <IconTile name={name} size={size} />;
}

export function MetricCard({ icon, label, value, hint }: {
  icon: IconName;
  color?: string;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return <StatTile icon={icon} label={label} value={value} hint={hint} />;
}
