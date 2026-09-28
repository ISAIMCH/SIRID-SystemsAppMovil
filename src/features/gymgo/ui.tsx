import type { PropsWithChildren, ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from './auth-context';
import { palette } from './theme';

export function Page({ children }: PropsWithChildren) {
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Eyebrow({ children }: PropsWithChildren) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

export function AppHeader({ title, detail }: { title: string; detail?: string }) {
  const { user, signOut } = useAuth();
  return (
    <View style={styles.appHeader}>
      <View style={styles.appHeaderText}>
        <Eyebrow>{user?.role ?? 'GYMGO'}</Eyebrow>
        <Text style={styles.headerTitle}>{title}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </View>
      <Pressable accessibilityRole="button" onPress={() => void signOut()} style={styles.signOut}>
        <Text style={styles.signOutText}>Salir</Text>
      </Pressable>
    </View>
  );
}

export function Heading({ children, detail }: { children: ReactNode; detail?: string }) {
  return (
    <View style={styles.headingGroup}>
      <Text style={styles.heading}>{children}</Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </View>
  );
}

export function SectionTitle({ children, accessory }: { children: ReactNode; accessory?: ReactNode }) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={styles.sectionText}>{children}</Text>
      {accessory}
    </View>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor={palette.muted}
        selectionColor={palette.green}
        style={styles.input}
        {...props}
      />
    </View>
  );
}

export function ActionButton({
  children,
  onPress,
  disabled = false,
  secondary = false,
}: PropsWithChildren<{
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}>) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        secondary && styles.secondaryAction,
        disabled && styles.disabledAction,
        pressed && !disabled && styles.pressed,
      ]}>
      <Text style={[styles.actionText, secondary && styles.secondaryText]}>{children}</Text>
    </Pressable>
  );
}

export function Notice({ children, error = false }: PropsWithChildren<{ error?: boolean }>) {
  return (
    <View style={[styles.notice, error && styles.errorNotice]}>
      <Text style={[styles.noticeText, error && styles.errorText]}>{children}</Text>
    </View>
  );
}

export function Surface({ children, style }: PropsWithChildren<{ style?: object }>) {
  return <View style={[styles.surface, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.paper },
  pageContent: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 22, gap: 24, paddingBottom: 36 },
  eyebrow: { color: palette.green, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  headingGroup: { gap: 8 },
  appHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  appHeaderText: { flex: 1, gap: 6 },
  headerTitle: { color: palette.ink, fontSize: 27, lineHeight: 33, fontWeight: '800' },
  signOut: { borderWidth: 1, borderColor: palette.line, borderRadius: 8, minHeight: 40, paddingHorizontal: 13, justifyContent: 'center' },
  signOutText: { color: palette.green, fontWeight: '700', fontSize: 13 },
  heading: { color: palette.ink, fontSize: 30, fontWeight: '800', lineHeight: 36 },
  detail: { color: palette.muted, fontSize: 15, lineHeight: 22 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionText: { color: palette.ink, fontSize: 18, fontWeight: '700' },
  fieldGroup: { gap: 8 },
  fieldLabel: { color: palette.ink, fontSize: 13, fontWeight: '700' },
  input: {
    height: 52,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
    color: palette.ink,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  action: {
    minHeight: 52,
    borderRadius: 8,
    backgroundColor: palette.green,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  actionText: { color: palette.white, fontSize: 15, fontWeight: '700' },
  secondaryAction: { backgroundColor: palette.lime },
  secondaryText: { color: palette.ink },
  disabledAction: { opacity: 0.55 },
  pressed: { opacity: 0.78 },
  notice: { backgroundColor: '#E8EEE5', borderRadius: 8, padding: 14 },
  errorNotice: { backgroundColor: '#F7E7E2' },
  noticeText: { color: palette.green, fontSize: 14, lineHeight: 20 },
  errorText: { color: palette.danger },
  surface: { backgroundColor: palette.surface, borderRadius: 10, padding: 18, borderWidth: 1, borderColor: palette.line },
});