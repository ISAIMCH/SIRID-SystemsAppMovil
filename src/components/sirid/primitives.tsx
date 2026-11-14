import { MaterialIcons } from '@expo/vector-icons';
import { forwardRef, useEffect, useState, type ComponentRef, type PropsWithChildren, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Text as RNText,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, {
  ReduceMotion,
  SlideInDown,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import * as Haptics from '@/hooks/haptics';
import { makeStyles } from '@/theme/make-styles';
import { useTheme } from '@/theme/theme-provider';
import { elevation, hitTarget, motion, radius, space, type, type ThemeColors } from '@/theme/tokens';

import { PressableScale } from './motion';

export type IconName = keyof typeof MaterialIcons.glyphMap;
export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

export function toneColors(colors: ThemeColors, tone: Tone) {
  switch (tone) {
    case 'accent': return { fg: colors.accent, bg: colors.accentSoft };
    case 'success': return { fg: colors.success, bg: colors.successSoft };
    case 'warning': return { fg: colors.warning, bg: colors.warningSoft };
    case 'danger': return { fg: colors.danger, bg: colors.dangerSoft };
    case 'info': return { fg: colors.info, bg: colors.infoSoft };
    default: return { fg: colors.textSecondary, bg: colors.surfaceSunken };
  }
}

/* ───────────────────────── Text ───────────────────────── */

type Variant = keyof typeof type;
type TextTone = 'primary' | 'secondary' | 'tertiary' | 'accent' | 'danger' | 'warning' | 'inverse' | 'hero' | 'heroSecondary';

const useTextStyles = makeStyles(({ colors }) => ({
  hero: type.hero,
  display: type.display,
  title: type.title,
  headline: type.headline,
  body: type.body,
  bodyStrong: type.bodyStrong,
  callout: type.callout,
  caption: type.caption,
  label: type.label,
  metric: type.metric,
  primary: { color: colors.text },
  secondary: { color: colors.textSecondary },
  tertiary: { color: colors.textTertiary },
  accent: { color: colors.accent },
  danger: { color: colors.danger },
  warning: { color: colors.warning },
  inverse: { color: colors.textInverse },
  heroTone: { color: colors.heroText },
  heroSecondary: { color: colors.heroTextSecondary },
}));

export function Text({ variant = 'body', tone = 'primary', style, ...props }: TextProps & { variant?: Variant; tone?: TextTone }) {
  const styles = useTextStyles();
  const toneStyle = tone === 'hero' ? styles.heroTone : styles[tone];
  return <RNText maxFontSizeMultiplier={1.6} {...props} style={[styles[variant], toneStyle, style]} />;
}

/* ───────────────────────── Surfaces ───────────────────────── */

type CardVariant = 'surface' | 'raised' | 'outline' | 'hero' | 'sunken';

const useCardStyles = makeStyles(({ colors, scheme }) => ({
  base: { borderRadius: radius.lg, padding: space.lg, gap: space.md },
  surface: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, ...elevation(colors, scheme, 1) },
  raised: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, ...elevation(colors, scheme, 2) },
  outline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.borderStrong },
  hero: { backgroundColor: colors.hero, borderWidth: 1, borderColor: scheme === 'dark' ? '#1F3A2C' : colors.hero, ...elevation(colors, scheme, 2) },
  sunken: { backgroundColor: colors.surfaceSunken },
}));

export function Card({ children, variant = 'surface', style, onPress, accessibilityLabel, accessibilityHint }: PropsWithChildren<{
  variant?: CardVariant;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}>) {
  const styles = useCardStyles();
  const composed = [styles.base, styles[variant], style];
  if (onPress) {
    return (
      <PressableScale onPress={onPress} accessibilityLabel={accessibilityLabel} accessibilityHint={accessibilityHint} style={composed}>
        {children}
      </PressableScale>
    );
  }
  return <View style={composed}>{children}</View>;
}

/* ───────────────────────── Buttons ───────────────────────── */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';

const useButtonStyles = makeStyles(({ colors }) => ({
  base: { minHeight: hitTarget + 4, borderRadius: radius.md, paddingHorizontal: space.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  small: { minHeight: 40, borderRadius: radius.sm, paddingHorizontal: space.md },
  large: { minHeight: 60, borderRadius: radius.lg },
  primary: { backgroundColor: colors.primary },
  accent: { backgroundColor: colors.accentFill },
  secondary: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.borderStrong },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: colors.danger },
  disabled: { opacity: 0.45 },
  label: { fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
  smallLabel: { fontSize: 14 },
  primaryLabel: { color: colors.onPrimary },
  accentLabel: { color: colors.onAccentFill },
  secondaryLabel: { color: colors.text },
  ghostLabel: { color: colors.accent },
  dangerLabel: { color: colors.danger },
}));

export function Button({ children, onPress, variant = 'primary', size = 'medium', icon, loading = false, disabled = false, style, accessibilityLabel }: {
  children: ReactNode;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: 'small' | 'medium' | 'large';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const styles = useButtonStyles();
  const labelStyle = styles[`${variant}Label`];
  const fg = (labelStyle as TextStyle).color as string;
  const inactive = disabled || loading;
  return (
    <PressableScale
      onPress={onPress}
      disabled={inactive}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={[styles.base, size === 'small' && styles.small, size === 'large' && styles.large, styles[variant], inactive && styles.disabled, style]}>
      {loading ? <ActivityIndicator color={fg} /> : icon ? <MaterialIcons name={icon} size={size === 'small' ? 18 : 20} color={fg} /> : null}
      {typeof children === 'string' ? (
        <RNText maxFontSizeMultiplier={1.4} style={[styles.label, size === 'small' && styles.smallLabel, labelStyle]}>{children}</RNText>
      ) : children}
    </PressableScale>
  );
}

const useIconButtonStyles = makeStyles(({ colors }) => ({
  base: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  plain: { backgroundColor: 'transparent', borderColor: 'transparent' },
  badge: { position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
}));

export function IconButton({ icon, onPress, label, plain = false, color, badge, style }: {
  icon: IconName;
  onPress: () => void;
  /** Required: icon-only controls need an accessible name. */
  label: string;
  plain?: boolean;
  color?: string;
  badge?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useIconButtonStyles();
  const { colors } = useTheme();
  return (
    <PressableScale onPress={onPress} accessibilityLabel={label} pressedScale={0.92} hitSlop={4} style={[styles.base, plain && styles.plain, style]}>
      <MaterialIcons name={icon} size={22} color={color ?? colors.text} />
      {badge ? (
        <View style={styles.badge}><RNText style={styles.badgeText}>{badge > 9 ? '9+' : badge}</RNText></View>
      ) : null}
    </PressableScale>
  );
}

/* ───────────────────────── Badges & icons ───────────────────────── */

const useBadgeStyles = makeStyles(() => ({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  text: { fontSize: 12, fontWeight: '700' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  iconTile: { alignItems: 'center', justifyContent: 'center' },
}));

export function Badge({ children, tone = 'neutral', icon, dot = false }: { children: ReactNode; tone?: Tone; icon?: IconName; dot?: boolean }) {
  const styles = useBadgeStyles();
  const { colors } = useTheme();
  const { fg, bg } = toneColors(colors, tone);
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      {dot ? <View style={[styles.dot, { backgroundColor: fg }]} /> : null}
      {icon ? <MaterialIcons name={icon} size={13} color={fg} /> : null}
      <RNText maxFontSizeMultiplier={1.4} style={[styles.text, { color: fg }]}>{children}</RNText>
    </View>
  );
}

export function IconTile({ name, tone = 'accent', size = 40, color }: { name: IconName; tone?: Tone; size?: number; color?: string }) {
  const styles = useBadgeStyles();
  const { colors } = useTheme();
  const { fg, bg } = toneColors(colors, tone);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.iconTile, { width: size, height: size, borderRadius: size * 0.32, backgroundColor: color ? `${color}22` : bg }]}>
      <MaterialIcons name={name} size={Math.round(size * 0.5)} color={color ?? fg} />
    </View>
  );
}

/* ───────────────────────── Section header ───────────────────────── */

const useSectionStyles = makeStyles(({ colors }) => ({
  row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.md },
  text: { flex: 1, gap: 2 },
  action: { minHeight: 36, justifyContent: 'center', paddingHorizontal: space.xs },
  actionText: { color: colors.accent, fontSize: 14, fontWeight: '700' },
}));

export function SectionHeader({ title, subtitle, action, onAction, accessory }: {
  title: string;
  subtitle?: string;
  action?: string;
  onAction?: () => void;
  accessory?: ReactNode;
}) {
  const styles = useSectionStyles();
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text variant="headline" accessibilityRole="header">{title}</Text>
        {subtitle ? <Text variant="caption" tone="secondary">{subtitle}</Text> : null}
      </View>
      {accessory}
      {action && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={8} style={styles.action}>
          <RNText style={styles.actionText}>{action}</RNText>
        </Pressable>
      ) : null}
    </View>
  );
}

/* ───────────────────────── List rows ───────────────────────── */

const useRowStyles = makeStyles(({ colors }) => ({
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.lg },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  text: { flex: 1, gap: 2 },
  title: { color: colors.text, fontSize: 15, fontWeight: '600' },
  subtitle: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  value: { color: colors.text, fontSize: 15, fontWeight: '700' },
  group: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
}));

export function ListGroup({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const styles = useRowStyles();
  return <View style={[styles.group, style]}>{children}</View>;
}

export function ListRow({ icon, iconTone = 'accent', title, subtitle, value, trailing, onPress, divider = true, chevron, leading, accessibilityLabel }: {
  icon?: IconName;
  iconTone?: Tone;
  title: string;
  subtitle?: string;
  value?: string;
  trailing?: ReactNode;
  leading?: ReactNode;
  onPress?: () => void;
  divider?: boolean;
  chevron?: boolean;
  accessibilityLabel?: string;
}) {
  const styles = useRowStyles();
  const { colors } = useTheme();
  const content = (
    <>
      {leading ?? (icon ? <IconTile name={icon} tone={iconTone} size={38} /> : null)}
      <View style={styles.text}>
        <RNText numberOfLines={1} maxFontSizeMultiplier={1.5} style={styles.title}>{title}</RNText>
        {subtitle ? <RNText numberOfLines={2} maxFontSizeMultiplier={1.5} style={styles.subtitle}>{subtitle}</RNText> : null}
      </View>
      {value ? <RNText style={styles.value}>{value}</RNText> : null}
      {trailing}
      {(chevron ?? Boolean(onPress)) ? <MaterialIcons name="chevron-right" size={22} color={colors.textTertiary} /> : null}
    </>
  );
  if (!onPress) return <View style={[styles.row, divider && styles.divider]}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={() => { void Haptics.selectionAsync(); onPress(); }}
      android_ripple={{ color: colors.surfaceSunken }}
      style={({ pressed }) => [styles.row, divider && styles.divider, pressed && { backgroundColor: colors.surfaceRaised }]}>
      {content}
    </Pressable>
  );
}

/* ───────────────────────── Segmented control ───────────────────────── */

const useSegmentStyles = makeStyles(({ colors, scheme }) => ({
  track: { flexDirection: 'row', borderRadius: radius.md, backgroundColor: colors.surfaceSunken, padding: 4, borderWidth: scheme === 'dark' ? 1 : 0, borderColor: colors.border },
  indicator: { position: 'absolute', top: 4, bottom: 4, left: 4, borderRadius: radius.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong, ...elevation(colors, scheme, 1) },
  option: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.sm, zIndex: 1 },
  label: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  labelActive: { color: colors.text, fontWeight: '700' },
}));

export function Segmented<T extends string>({ value, options, onChange, style, fitLabels = false }: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
  /** Shrink a label that would be cut off (small screens, large text) instead of truncating it. */
  fitLabels?: boolean;
}) {
  const styles = useSegmentStyles();
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((option) => option.value === value));
  const optionWidth = width > 0 ? (width - 8) / options.length : 0;
  const offset = useSharedValue(0);

  useEffect(() => {
    const target = index * optionWidth;
    offset.set(reduceMotion ? target : withSpring(target, { damping: 22, stiffness: 260 }));
  }, [index, optionWidth, offset, reduceMotion]);

  const indicatorStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));

  return (
    <View accessibilityRole="tablist" onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={[styles.track, style]}>
      {optionWidth > 0 ? <Animated.View style={[styles.indicator, { width: optionWidth }, indicatorStyle]} /> : null}
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => { if (!active) { void Haptics.selectionAsync(); onChange(option.value); } }}
            style={styles.option}>
            <RNText numberOfLines={1} maxFontSizeMultiplier={1.3} adjustsFontSizeToFit={fitLabels} minimumFontScale={fitLabels ? 0.7 : undefined} style={[styles.label, active && styles.labelActive]}>{option.label}</RNText>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ───────────────────────── Chips ───────────────────────── */

const useChipStyles = makeStyles(({ colors }) => ({
  chip: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, paddingHorizontal: 14, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  active: { backgroundColor: colors.primary, borderColor: colors.primary },
  text: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  activeText: { color: colors.onPrimary, fontWeight: '700' },
}));

export function Chip({ label, selected = false, onPress, icon }: { label: string; selected?: boolean; onPress: () => void; icon?: IconName }) {
  const styles = useChipStyles();
  const { colors } = useTheme();
  return (
    <PressableScale onPress={onPress} pressedScale={0.95} accessibilityRole="button" accessibilityState={{ selected }} style={[styles.chip, selected && styles.active]}>
      {icon ? <MaterialIcons name={icon} size={16} color={selected ? colors.onPrimary : colors.textSecondary} /> : null}
      <RNText maxFontSizeMultiplier={1.4} style={[styles.text, selected && styles.activeText]}>{label}</RNText>
    </PressableScale>
  );
}

/* ───────────────────────── Text field ───────────────────────── */

const useFieldStyles = makeStyles(({ colors }) => ({
  group: { gap: 6 },
  label: { color: colors.text, fontSize: 14, fontWeight: '600' },
  // Focus changes only borderColor: toggling shadow/elevation on a TextInput
  // wrapper re-parents the native view on Android and loops focus.
  box: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: space.sm, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surfaceRaised, paddingHorizontal: 14 },
  focused: { borderColor: colors.accent },
  invalid: { borderColor: colors.danger },
  input: { flex: 1, minHeight: 48, color: colors.text, fontSize: 16, paddingVertical: 10 },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  hint: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 18, fontWeight: '600' },
}));

export const TextField = forwardRef<ComponentRef<typeof TextInput>, TextInputProps & { label: string; hint?: string; error?: string; icon?: IconName; trailing?: ReactNode }>(
  function TextField({ label, hint, error, icon, trailing, style, onFocus, onBlur, multiline, ...props }, ref) {
    const styles = useFieldStyles();
    const { colors } = useTheme();
    const [focused, setFocused] = useState(false);
    return (
      <View style={styles.group}>
        <RNText maxFontSizeMultiplier={1.4} style={styles.label}>{label}</RNText>
        <View style={[styles.box, focused && styles.focused, Boolean(error) && styles.invalid]}>
          {icon ? <MaterialIcons name={icon} size={20} color={focused ? colors.accent : colors.textTertiary} /> : null}
          <TextInput
            ref={ref}
            accessibilityLabel={label}
            accessibilityHint={error ?? hint}
            placeholderTextColor={colors.textTertiary}
            selectionColor={colors.accent}
            cursorColor={colors.accent}
            multiline={multiline}
            onFocus={(event) => { setFocused(true); onFocus?.(event); }}
            onBlur={(event) => { setFocused(false); onBlur?.(event); }}
            style={[styles.input, multiline && styles.multiline, style]}
            {...props}
          />
          {trailing}
        </View>
        {error ? <RNText accessibilityLiveRegion="polite" style={styles.error}>{error}</RNText> : hint ? <RNText style={styles.hint}>{hint}</RNText> : null}
      </View>
    );
  },
);

/* ───────────────────────── Progress ───────────────────────── */

const useProgressStyles = makeStyles(({ colors }) => ({
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceSunken, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  ringCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
}));

export function ProgressBar({ value, color, height = 8, style }: { value: number; color?: string; height?: number; style?: StyleProp<ViewStyle> }) {
  const styles = useProgressStyles();
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const progress = useSharedValue(reduceMotion ? clamped : 0);
  useEffect(() => {
    progress.set(reduceMotion ? clamped : withTiming(clamped, { duration: motion.slow * 2 }));
  }, [clamped, progress, reduceMotion]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={[styles.track, { height, borderRadius: height / 2 }, style]}>
      <Animated.View style={[styles.fill, { backgroundColor: color ?? colors.accentFill, borderRadius: height / 2 }, fillStyle]} />
    </View>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function ProgressRing({ value, size = 120, stroke = 10, color, track, children }: PropsWithChildren<{
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
}>) {
  const styles = useProgressStyles();
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const progress = useSharedValue(reduceMotion ? clamped : 0);
  useEffect(() => {
    progress.set(reduceMotion ? clamped : withTiming(clamped, { duration: 900 }));
  }, [clamped, progress, reduceMotion]);
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: circumference * (1 - progress.value) }));
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }} style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track ?? colors.surfaceSunken} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color ?? colors.accentFill}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={animatedProps}
        />
      </Svg>
      <View style={styles.ringCenter}>{children}</View>
    </View>
  );
}

/* ───────────────────────── Loading / empty / error ───────────────────────── */

const useStateStyles = makeStyles(({ colors }) => ({
  skeleton: { backgroundColor: colors.surfaceSunken, borderRadius: radius.sm },
  empty: { alignItems: 'center', gap: space.md, paddingVertical: space.xxxl, paddingHorizontal: space.xl },
  emptyIcon: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSunken },
  emptyText: { alignItems: 'center', gap: 4 },
  center: { textAlign: 'center' },
  error: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderRadius: radius.md, padding: space.md, paddingLeft: space.lg, backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: colors.danger },
  errorText: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 20 },
  retry: { minHeight: 40, minWidth: 44, justifyContent: 'center', paddingHorizontal: space.md, borderRadius: radius.sm, backgroundColor: colors.surface },
  retryText: { color: colors.text, fontSize: 14, fontWeight: '700' },
}));

export function Skeleton({ width = '100%', height = 16, radius: r, style }: { width?: ViewStyle['width']; height?: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const styles = useStateStyles();
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion) return;
    opacity.set(withRepeat(withSequence(withTiming(0.45, { duration: 700 }), withTiming(1, { duration: 700 })), -1));
  }, [opacity, reduceMotion]);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View accessibilityElementsHidden style={[styles.skeleton, { width, height }, r !== undefined && { borderRadius: r }, animatedStyle, style]} />;
}

export function EmptyState({ icon, title, message, action, onAction }: { icon: IconName; title: string; message?: string; action?: string; onAction?: () => void }) {
  const styles = useStateStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}><MaterialIcons name={icon} size={30} color={colors.textSecondary} /></View>
      <View style={styles.emptyText}>
        <Text variant="headline" style={styles.center}>{title}</Text>
        {message ? <Text variant="callout" tone="secondary" style={styles.center}>{message}</Text> : null}
      </View>
      {action && onAction ? <Button variant="secondary" size="small" onPress={onAction}>{action}</Button> : null}
    </View>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const styles = useStateStyles();
  const { colors } = useTheme();
  return (
    <View accessibilityRole="alert" style={styles.error}>
      <MaterialIcons name="error-outline" size={20} color={colors.danger} />
      <RNText style={styles.errorText}>{message}</RNText>
      {onRetry ? (
        <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retry}>
          <RNText style={styles.retryText}>Reintentar</RNText>
        </Pressable>
      ) : null}
    </View>
  );
}

/* ───────────────────────── Stats ───────────────────────── */

const useStatStyles = makeStyles(({ colors }) => ({
  tile: { flex: 1, minWidth: 140, gap: space.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  label: { flex: 1, color: colors.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  unit: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
}));

export function StatTile({ icon, tone = 'accent', label, value, unit, hint, onPress, style, loading = false }: {
  icon?: IconName;
  tone?: Tone;
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  loading?: boolean;
}) {
  const styles = useStatStyles();
  return (
    <Card onPress={onPress} accessibilityLabel={`${label}: ${value}${unit ? ` ${unit}` : ''}`} style={[styles.tile, style]}>
      <View style={styles.head}>
        {icon ? <IconTile name={icon} tone={tone} size={30} /> : null}
        <RNText numberOfLines={1} maxFontSizeMultiplier={1.3} style={styles.label}>{label}</RNText>
      </View>
      {loading ? <Skeleton width={80} height={30} /> : (
        <View style={styles.valueRow}>
          <Text variant="metric">{value}</Text>
          {unit ? <RNText style={styles.unit}>{unit}</RNText> : null}
        </View>
      )}
      {hint ? <Text variant="caption" tone="secondary">{hint}</Text> : null}
    </Card>
  );
}

/* ───────────────────────── Bottom sheet ───────────────────────── */

const useSheetStyles = makeStyles(({ colors, scheme }) => ({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.scrim },
  sheet: { backgroundColor: colors.overlay, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: space.xl, paddingTop: space.sm, gap: space.lg, maxHeight: '92%', borderWidth: scheme === 'dark' ? 1 : 0, borderColor: colors.border, ...elevation(colors, scheme, 3) },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.borderStrong, marginBottom: space.xs },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  headText: { flex: 1, gap: 2 },
}));

export function Sheet({ visible, onClose, title, subtitle, children }: PropsWithChildren<{ visible: boolean; onClose: () => void; title?: string; subtitle?: string }>) {
  const styles = useSheetStyles();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={onClose} style={styles.scrim} />
        <Animated.View
          accessibilityViewIsModal
          entering={SlideInDown.springify().damping(22).stiffness(220).reduceMotion(ReduceMotion.System)}
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space.lg) + space.sm }]}>
          <View style={styles.grabber} />
          {title ? (
            <View style={styles.head}>
              <View style={styles.headText}>
                <Text variant="title" accessibilityRole="header">{title}</Text>
                {subtitle ? <Text variant="callout" tone="secondary">{subtitle}</Text> : null}
              </View>
              <IconButton icon="close" label="Cerrar" onPress={onClose} />
            </View>
          ) : null}
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

