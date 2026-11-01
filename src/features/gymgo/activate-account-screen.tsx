import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { getApiErrorMessage } from './api';
import { LoginInput } from './auth-screen';
import { useAuth } from './auth-context';

const neon = '#9BFF63';
const primaryText = '#F4F8F5';
const mutedText = '#888F8A';

// Same alphabet and length as the API (api/src/utils/access-codes.js); printed codes may come with spaces or dashes.
const ACTIVATION_CODE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;

function normalizeCode(value: string) {
  return value.toUpperCase().replace(/[\s-]/g, '');
}

type Field = 'email' | 'code' | 'password' | 'confirmation';

// For clients reception registered without the app: email + the one-time code from the front desk + a new password.
export default function ActivateAccountScreen() {
  const { activateAccount } = useAuth();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [focused, setFocused] = useState<Field | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setError('');
    const normalizedCode = normalizeCode(code);
    if (!email.trim() || !normalizedCode || !password) {
      setError('Escribe tu correo, el código de recepción y una contraseña.');
      return;
    }
    if (!ACTIVATION_CODE.test(normalizedCode)) {
      setError('El código tiene 8 letras y números, como aparece en tu hoja de recepción.');
      return;
    }
    if (password.length < 10) {
      setError('La contraseña debe tener al menos 10 caracteres.');
      return;
    }
    if (password !== confirmation) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setIsSubmitting(true);
    try {
      await activateAccount({ email, code: normalizedCode, password });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(main)');
    } catch (requestError) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(getApiErrorMessage(requestError, 'No se pudo activar tu cuenta. Intenta de nuevo.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/(auth)/login');
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} enabled={Platform.OS === 'ios'}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="always" bounces={false}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={goBack} hitSlop={12} style={styles.back}>
          <MaterialIcons name="arrow-back" size={22} color={primaryText} />
        </Pressable>

        <View style={styles.card}>
          <Text style={styles.title}>ACTIVA TU CUENTA</Text>
          <Text style={styles.subtitle}>
            Tu gimnasio ya te registró. Usa el correo que diste en recepción, el código que te entregaron y crea tu contraseña.
          </Text>

          <View style={styles.form}>
            <LoginInput
              icon="mail-outline"
              label="Correo electrónico"
              value={email}
              onChangeText={setEmail}
              onFocus={() => setFocused('email')}
              focused={focused === 'email'}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              returnKeyType="next"
            />
            <LoginInput
              icon="confirmation-number"
              label="Código de activación"
              value={code}
              onChangeText={(value) => setCode(value.toUpperCase())}
              onFocus={() => setFocused('code')}
              focused={focused === 'code'}
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
              maxLength={12}
              returnKeyType="next"
            />
            <LoginInput
              icon="vpn-key"
              label="Contraseña nueva (mínimo 10)"
              value={password}
              onChangeText={setPassword}
              onFocus={() => setFocused('password')}
              focused={focused === 'password'}
              autoCapitalize="none"
              autoComplete="new-password"
              secureTextEntry
              returnKeyType="next"
            />
            <LoginInput
              icon="vpn-key"
              label="Repite la contraseña"
              value={confirmation}
              onChangeText={setConfirmation}
              onFocus={() => setFocused('confirmation')}
              focused={focused === 'confirmation'}
              autoCapitalize="none"
              autoComplete="new-password"
              secureTextEntry
              onSubmitEditing={() => void submit()}
              returnKeyType="done"
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            accessibilityRole="button"
            disabled={isSubmitting}
            onPress={() => void submit()}
            style={({ pressed }) => [styles.submitButton, pressed && styles.pressed, isSubmitting && styles.disabled]}>
            {isSubmitting ? <ActivityIndicator color="#071007" /> : <Text style={styles.submitText}>ACTIVAR CUENTA</Text>}
          </Pressable>
          <Text style={styles.note}>¿Perdiste tu código o ya venció? Pide uno nuevo en recepción.</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0a0f0d' },
  content: { flexGrow: 1, justifyContent: 'center', padding: 20, gap: 16 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: 'rgba(20, 25, 22, 0.75)' },
  card: { gap: 16, borderRadius: 24, padding: 24, borderWidth: 1, borderColor: 'rgba(155, 255, 99, 0.15)', backgroundColor: 'rgba(20, 25, 22, 0.75)' },
  title: { color: primaryText, fontSize: 25, lineHeight: 30, fontWeight: '900', letterSpacing: 0.5 },
  subtitle: { color: mutedText, fontSize: 14, lineHeight: 21 },
  form: { gap: 12, marginTop: 4 },
  error: { color: '#FF8A80', fontSize: 12, lineHeight: 18 },
  submitButton: { minHeight: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: neon },
  submitText: { color: '#071007', fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.6 },
  note: { color: '#626A64', fontSize: 12, textAlign: 'center' },
});
