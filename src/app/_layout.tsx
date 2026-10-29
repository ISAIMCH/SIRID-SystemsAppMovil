import { Stack } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider, useAuth } from '@/features/gymgo/auth-context';
import { palette } from '@/features/gymgo/theme';

function RootNavigator() {
  const { isLoading, sessionError, retrySession } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={palette.green} size="large" />
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
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.paper } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(main)" />
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
  retryButton: { backgroundColor: palette.green, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  retryButtonPressed: { opacity: 0.82 },
  retryText: { color: palette.white, fontSize: 15, fontWeight: '700' },
});
