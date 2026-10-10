import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
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
const AdminEmbeddedContext = createContext(false);

export function DarkUiProvider({ children, dark = false }: PropsWithChildren<{ dark?: boolean }>) {
  return <DarkUiContext.Provider value={dark}>{children}</DarkUiContext.Provider>;
}

export function AdminEmbeddedProvider({ children }: PropsWithChildren) {
  return <AdminEmbeddedContext.Provider value>{children}</AdminEmbeddedContext.Provider>;
}

export function useAdminEmbedded() {
  return useContext(AdminEmbeddedContext);
}

export function useDarkUi() {
  return useContext(DarkUiContext);
}

export function Page({ children, dark = false, admin = false }: PropsWithChildren<{ dark?: boolean; admin?: boolean }>) {
  return (
    <DarkUiContext.Provider value={dark}>
      <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safeArea, admin && styles.adminSafeArea, dark && styles.darkSafeArea]}>
        <ScrollView contentContainerStyle={[styles.pageContent, admin && styles.adminPageContent]} keyboardShouldPersistTaps="handled">
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

export function AppHeader({ title, detail, showSignOut = true }: { title: string; detail?: string; showSignOut?: boolean }) {
  const { user, signOut } = useAuth();
  const dark = useDarkUi();
  const embedded = useContext(AdminEmbeddedContext);
  if (embedded) return null;
  return (
    <View style={styles.appHeader}>
      <View style={styles.appHeaderText}>
        <Eyebrow>{user?.role ?? 'GYMGO'}</Eyebrow>
        <Text style={[styles.headerTitle, dark && styles.darkPrimaryText]}>{title}</Text>
        {detail ? <Text style={[styles.detail, dark && styles.darkSecondaryText]}>{detail}</Text> : null}
      </View>
      {showSignOut ? (
        <Pressable accessibilityRole="button" onPress={() => void signOut()} style={[styles.signOut, dark && styles.darkControl]}>
          <Text style={[styles.signOutText, dark && styles.darkAccentText]}>Salir</Text>
        </Pressable>
      ) : null}
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
  const admin = useAdminEmbedded();
  return (
    <View style={styles.fieldGroup}>
      <Text style={[styles.fieldLabel, dark && styles.darkPrimaryText]}>{label}</Text>
      <TextInput
        placeholderTextColor={dark ? '#91A098' : palette.muted}
        selectionColor={dark ? '#9BFF63' : palette.green}
        style={[styles.input, dark && styles.darkInput, admin && styles.adminGlassInput]}
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
  const admin = useAdminEmbedded();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={() => { void Haptics.selectionAsync(); onPress(); }}
      style={({ pressed }) => [
        styles.action,
        admin && styles.adminAction,
        secondary && (dark ? styles.darkSecondaryAction : styles.secondaryAction),
        dark && !secondary && styles.darkAction,
        disabled && styles.disabledAction,
        pressed && !disabled && styles.pressed,
      ]}>
      <Text style={[styles.actionText, admin && !secondary && styles.adminActionText, secondary && styles.secondaryText, dark && !secondary && styles.darkActionText, dark && secondary && styles.darkSecondaryText]}>{children}</Text>
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
  const admin = useAdminEmbedded();
  if (admin) return <BlurView tint="light" intensity={40} style={[styles.surface, styles.adminGlassSurface, style]}>{children}</BlurView>;
  return <View style={[styles.surface, dark && styles.darkSurface, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.paper },
  darkSafeArea: { backgroundColor: '#070B09' },
  adminSafeArea: { backgroundColor: '#F8FAFC' },
  pageContent: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 22, gap: 24, paddingBottom: 36 },
  adminPageContent: { backgroundColor: '#F8FAFC' },
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
  darkAction: { backgroundColor: '#9BFF63' },
  adminAction: { backgroundColor: '#9BFF63' },
  actionText: { color: palette.white, fontSize: 15, fontWeight: '700' },
  secondaryAction: { backgroundColor: palette.lime },
  secondaryText: { color: palette.ink },
  disabledAction: { opacity: 0.55 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
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
  adminGlassInput: { backgroundColor: 'rgba(255, 255, 255, 0.7)', borderColor: 'rgba(0, 0, 0, 0.05)', borderWidth: 1 },
  darkActionText: { color: '#081009' },
  adminActionText: { color: '#081009' },
  darkSecondaryAction: { backgroundColor: '#18211D' },
  darkNotice: { backgroundColor: '#18211D' },
  darkErrorNotice: { backgroundColor: '#321B19' },
  darkNoticeText: { color: '#DCE8E0' },
  darkSurface: { backgroundColor: '#111815', borderColor: '#27342E' },
  adminGlassSurface: { backgroundColor: 'rgba(255, 255, 255, 0.7)', borderWidth: 1, borderColor: 'rgba(0, 0, 0, 0.05)' },
});
