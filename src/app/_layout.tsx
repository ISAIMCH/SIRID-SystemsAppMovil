import {
  Barlow_400Regular,
  Barlow_500Medium,
  Barlow_600SemiBold,
  Barlow_700Bold,
  Barlow_800ExtraBold,
} from '@expo-google-fonts/barlow';
import {
  BarlowCondensed_500Medium,
  BarlowCondensed_600SemiBold,
  BarlowCondensed_700Bold,
  BarlowCondensed_800ExtraBold,
} from '@expo-google-fonts/barlow-condensed';
import { MaterialIcons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Button, Text } from '@/components/sirid';
import { AuthProvider, useAuth } from '@/features/gymgo/auth-context';
import EnrollmentNotifier from '@/features/gymgo/enrollment-notifier';
import StaffInvitationNotifier from '@/features/gymgo/staff-invitation-notifier';
import { makeStyles } from '@/theme/make-styles';
import { ThemeProvider, useTheme } from '@/theme/theme-provider';
import { radius, space } from '@/theme/tokens';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

const useStyles = makeStyles(({ colors }) => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, padding: space.xxl, gap: space.lg },
  icon: { width: 72, height: 72, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.dangerSoft },
  text: { textAlign: 'center', maxWidth: 360 },
}));

function StatusScreen({ icon, label, title, message, action, onAction }: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label?: string;
  title: string;
  message: string;
  action: string;
  onAction: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.center}>
      <View style={styles.icon}><MaterialIcons name={icon} size={34} color={colors.danger} /></View>
      {label ? <Text variant="label" tone="danger">{label}</Text> : null}
      <Text variant="title" style={styles.text} accessibilityRole="header">{title}</Text>
      <Text variant="body" tone="secondary" style={styles.text}>{message}</Text>
      <Button onPress={onAction} style={{ alignSelf: 'stretch', maxWidth: 360, width: '100%', alignItems: 'center' }}>{action}</Button>
    </View>
  );
}

function RootNavigator() {
  const { user, isLoading, sessionError, retrySession, suspendedOrganization, dismissSuspension } = useAuth();
  const { colors, scheme } = useTheme();
  const styles = useStyles();

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  // Clients and staff never see SIRID's reason, only this message.
  if (suspendedOrganization) {
    return (
      <StatusScreen
        icon="block"
        label="Gimnasio suspendido"
        title={suspendedOrganization.name}
        message="Este gimnasio está suspendido temporalmente. Acude a recepción para más información."
        action="Cerrar sesión"
        onAction={() => { void dismissSuspension(); }}
      />
    );
  }

  if (sessionError) {
    return (
      <StatusScreen icon="cloud-off" title="Sin conexión" message={sessionError} action="Reintentar" onAction={retrySession} />
    );
  }

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {/* Here rather than in (main), so an account that has not joined any gym hears about invitations too. */}
      {user ? <StaffInvitationNotifier key={`staff-${user.id}`} /> : null}
      {user ? <EnrollmentNotifier key={`enrollment-${user.id}`} /> : null}
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'fade_from_bottom',
          contentStyle: { backgroundColor: colors.background },
        }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(main)" />
        <Stack.Screen name="join-gym" />
        <Stack.Screen name="staff-invitations" options={{ animation: 'slide_from_right' }} />
      </Stack>
    </>
  );
}

function ThemedRoot() {
  const { ready, colors } = useTheme();
  const [fontsLoaded, fontError] = useFonts({
    Barlow_400Regular,
    Barlow_500Medium,
    Barlow_600SemiBold,
    Barlow_700Bold,
    Barlow_800ExtraBold,
    BarlowCondensed_500Medium,
    BarlowCondensed_600SemiBold,
    BarlowCondensed_700Bold,
    BarlowCondensed_800ExtraBold,
  });
  // A font failure must not lock the user out: fall back to the system face.
  const appReady = ready && (fontsLoaded || Boolean(fontError));

  useEffect(() => {
    if (appReady) void SplashScreen.hideAsync().catch(() => undefined);
  }, [appReady]);

  if (!appReady) return <View style={{ flex: 1, backgroundColor: colors.background }} />;

  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <ThemedRoot />
    </ThemeProvider>
  );
}
