/**
 * Legacy layout primitives, now rendered with the SIRID design system.
 * The old per-screen "dark" / "admin light" modes are gone: every screen
 * follows the global theme (Ajustes → Apariencia). The providers and flags
 * are kept as no-ops so existing call sites keep compiling.
 */
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { PropsWithChildren, ReactNode } from 'react';
import { Text as RNText, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

import { Button, Card, IconButton, Screen, Text, TextField } from '@/components/sirid';
import { makeStyles } from '@/theme/make-styles';
import { useTheme } from '@/theme/theme-provider';
import { radius, space } from '@/theme/tokens';

import { useAuth } from './auth-context';

export function DarkUiProvider({ children }: PropsWithChildren<{ dark?: boolean }>) {
  return <>{children}</>;
}

export function AdminEmbeddedProvider({ children }: PropsWithChildren) {
  return <>{children}</>;
}

export function AdminLightProvider({ children }: PropsWithChildren<{ enabled?: boolean }>) {
  return <>{children}</>;
}

export function useAdminEmbedded() {
  return false;
}

export function useAdminLight() {
  return false;
}

/** True when the active theme is dark. */
export function useDarkUi() {
  return useTheme().scheme === 'dark';
}

export function Page({ children, overlay }: PropsWithChildren<{ dark?: boolean; admin?: boolean; overlay?: ReactNode }>) {
  return <Screen overlay={overlay}>{children}</Screen>;
}

const ROLE_LABEL: Record<string, string> = {
  Cliente: 'Cliente',
  Coach: 'Coach',
  Admin: 'Administración',
  Recepcion: 'Recepción',
};

const useStyles = makeStyles(({ colors }) => ({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  headerText: { flex: 1, gap: 2 },
  headingGroup: { gap: space.xs },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  notice: { flexDirection: 'row', gap: space.md, borderRadius: radius.md, padding: space.lg, backgroundColor: colors.infoSoft },
  noticeError: { backgroundColor: colors.dangerSoft },
  noticeText: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 20 },
  eyebrow: { color: colors.accent, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
}));

export function Eyebrow({ children }: PropsWithChildren) {
  const styles = useStyles();
  return <RNText style={styles.eyebrow}>{children}</RNText>;
}

/** Screen header with role label and a settings shortcut (sign-out lives in Ajustes). */
export function AppHeader({ title, detail, showSignOut = true }: { title: string; detail?: string; showSignOut?: boolean }) {
  const { user } = useAuth();
  const styles = useStyles();
  return (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <Text variant="label" tone="accent">{ROLE_LABEL[user?.role ?? ''] ?? 'GymGo'}</Text>
        <Text variant="display" accessibilityRole="header">{title}</Text>
        {detail ? <Text variant="callout" tone="secondary">{detail}</Text> : null}
      </View>
      {showSignOut && user?.role === 'Cliente' ? <IconButton icon="settings" label="Ajustes y cuenta" onPress={() => router.push('/(main)/settings')} /> : null}
    </View>
  );
}

export function Heading({ children, detail }: { children: ReactNode; detail?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.headingGroup}>
      <Text variant="title" accessibilityRole="header">{children}</Text>
      {detail ? <Text variant="callout" tone="secondary">{detail}</Text> : null}
    </View>
  );
}

export function SectionTitle({ children, accessory }: { children: ReactNode; accessory?: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.sectionTitle}>
      <Text variant="headline" accessibilityRole="header" style={{ flex: 1 }}>{children}</Text>
      {accessory}
    </View>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return <TextField label={label} {...props} />;
}

export function ActionButton({ children, onPress, disabled = false, secondary = false }: PropsWithChildren<{
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}>) {
  return (
    <Button onPress={onPress} disabled={disabled} variant={secondary ? 'secondary' : 'primary'}>
      {children}
    </Button>
  );
}

export function Notice({ children, error = false }: PropsWithChildren<{ error?: boolean }>) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View accessibilityRole={error ? 'alert' : undefined} style={[styles.notice, error && styles.noticeError]}>
      <MaterialIcons name={error ? 'error-outline' : 'info-outline'} size={20} color={error ? colors.danger : colors.info} />
      <RNText style={styles.noticeText}>{children}</RNText>
    </View>
  );
}

export function Surface({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <Card style={style}>{children}</Card>;
}
