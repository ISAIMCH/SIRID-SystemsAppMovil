import { createContext, useContext, type PropsWithChildren, type ReactNode } from 'react';
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

const DarkUiContext = createContext(false);

export function useDarkUi() {
  return useContext(DarkUiContext);
}

export function Page({ children, dark = false }: PropsWithChildren<{ dark?: boolean }>) {
  return (
    <DarkUiContext.Provider value={dark}>
      <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safeArea, dark && styles.darkSafeArea]}>
        <ScrollView contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </SafeAreaView>
    </DarkUiContext.Provider>
  );
}

export function Eyebrow({ children }: PropsWithChildren) {
  const dark = useDarkUi();
  return <Text style={[styles.eyebrow, dark && styles.darkAccentText]}>{children}</Text>;
}

export function AppHeader({ title, detail }: { title: string; detail?: string }) {
  const { user, signOut } = useAuth();
  const dark = useDarkUi();
  return (
    <View style={styles.appHeader}>
      <View style={styles.appHeaderText}>
        <Eyebrow>{user?.role ?? 'GYMGO'}</Eyebrow>
        <Text style={[styles.headerTitle, dark && styles.darkPrimaryText]}>{title}</Text>
        {detail ? <Text style={[styles.detail, dark && styles.darkSecondaryText]}>{detail}</Text> : null}
      </View>
      <Pressable accessibilityRole="button" onPress={() => void signOut()} style={[styles.signOut, dark && styles.darkControl]}>
        <Text style={[styles.signOutText, dark && styles.darkAccentText]}>Salir</Text>
      </Pressable>
    </View>
  );
}

export function Heading({ children, detail }: { children: ReactNode; detail?: string }) {
  const dark = useDarkUi();
  return (
    <View style={styles.headingGroup}>
      <Text style={[styles.heading, dark && styles.darkPrimaryText]}>{children}</Text>
      {detail ? <Text style={[styles.detail, dark && styles.darkSecondaryText]}>{detail}</Text> : null}
    </View>
  );
}

export function SectionTitle({ children, accessory }: { children: ReactNode; accessory?: ReactNode }) {
  const dark = useDarkUi();
  return (
    <View style={styles.sectionTitle}>
      <Text style={[styles.sectionText, dark && styles.darkPrimaryText]}>{children}</Text>
      {accessory}
    </View>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const dark = useDarkUi();
  return (
    <View style={styles.fieldGroup}>
      <Text style={[styles.fieldLabel, dark && styles.darkPrimaryText]}>{label}</Text>
      <TextInput
        placeholderTextColor={dark ? '#91A098' : palette.muted}
        selectionColor={dark ? '#9BFF63' : palette.green}
        style={[styles.input, dark && styles.darkInput]}
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
  const dark = useDarkUi();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        secondary && (dark ? styles.darkSecondaryAction : styles.secondaryAction),
        disabled && styles.disabledAction,
        pressed && !disabled && styles.pressed,
      ]}>
      <Text style={[styles.actionText, secondary && styles.secondaryText, dark && !secondary && styles.darkActionText, dark && secondary && styles.darkSecondaryText]}>{children}</Text>
    </Pressable>
  );
}

export function Notice({ children, error = false }: PropsWithChildren<{ error?: boolean }>) {
  const dark = useDarkUi();
  return (
    <View style={[styles.notice, dark && styles.darkNotice, error && (dark ? styles.darkErrorNotice : styles.errorNotice)]}>
      <Text style={[styles.noticeText, dark && styles.darkNoticeText, error && styles.errorText]}>{children}</Text>
    </View>
  );
}

export function Surface({ children, style }: PropsWithChildren<{ style?: object }>) {
  const dark = useDarkUi();
  return <View style={[styles.surface, dark && styles.darkSurface, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.paper },
  darkSafeArea: { backgroundColor: '#070B09' },
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
  input: { height: 52, borderRadius: 8, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.surface, color: palette.ink, paddingHorizontal: 14, fontSize: 16 },
  action: { minHeight: 52, borderRadius: 8, backgroundColor: palette.green, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 18 },
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
  darkPrimaryText: { color: '#F4F8F5' },
  darkSecondaryText: { color: '#91A098' },
  darkAccentText: { color: '#9BFF63' },
  darkControl: { borderColor: '#27342E', backgroundColor: '#111815' },
  darkInput: { borderColor: '#27342E', backgroundColor: '#141A17', color: '#F4F8F5' },
  darkActionText: { color: '#081009' },
  darkSecondaryAction: { backgroundColor: '#18211D' },
  darkNotice: { backgroundColor: '#18211D' },
  darkErrorNotice: { backgroundColor: '#321B19' },
  darkNoticeText: { color: '#DCE8E0' },
  darkSurface: { backgroundColor: '#111815', borderColor: '#27342E' },
});
