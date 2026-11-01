import { Stack } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider, useAuth } from '@/features/gymgo/auth-context';
import StaffInvitationNotifier from '@/features/gymgo/staff-invitation-notifier';
import { palette } from '@/features/gymgo/theme';

function RootNavigator() {
  const { user, isLoading, sessionError, retrySession, suspendedOrganization, dismissSuspension } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={palette.green} size="large" />
      </View>
    );
  }

  // Clients and staff never see SIRID's reason, only this message.
  if (suspendedOrganization) {
    return (
      <View style={styles.loading}>
        <StatusBar style="dark" />
        <Text style={styles.noticeLabel}>Gimnasio suspendido</Text>
        <Text style={styles.noticeTitle}>{suspendedOrganization.name}</Text>
        <Text style={styles.errorText}>
          Este gimnasio está suspendido temporalmente. Acude a recepción para más información.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => { void dismissSuspension(); }}
          style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}>
          <Text style={styles.retryText}>Cerrar sesión</Text>
        </Pressable>
      </View>
    );
  }

  if (sessionError) {
    return (
      <View style={styles.loading}>
        <Text style={styles.errorText}>{sessionError}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={retrySession}
          style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}>
          <Text style={styles.retryText}>Reintentar</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      {/* Here rather than in (main), so an account that has not joined any gym hears about invitations too. */}
      {user ? <StaffInvitationNotifier key={user.id} /> : null}
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.paper } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(main)" />
        <Stack.Screen name="join-gym" />
        <Stack.Screen name="staff-invitations" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.paper,
    padding: 24,
    gap: 16,
  },
  errorText: { color: palette.ink, fontSize: 15, textAlign: 'center' },
  noticeLabel: { color: palette.danger, fontSize: 13, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  noticeTitle: { color: palette.ink, fontSize: 24, fontWeight: '800', textAlign: 'center' },
  retryButton: { backgroundColor: palette.green, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  retryButtonPressed: { opacity: 0.82 },
  retryText: { color: palette.white, fontSize: 15, fontWeight: '700' },
});
