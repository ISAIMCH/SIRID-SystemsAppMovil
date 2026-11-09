import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from '@/hooks/haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  type TextInputInstance,
  View,
} from 'react-native';

import { getApiErrorMessage } from './api';
import { LoginInput } from './auth-screen';
import { useAuth } from './auth-context';
import { makeStyles } from '@/theme/make-styles';
import { useTheme } from '@/theme/theme-provider';


// Same alphabet and length as the API (api/src/utils/access-codes.js); printed codes may come with spaces or dashes.
const ACTIVATION_CODE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;

function normalizeCode(value: string) {
  return value.toUpperCase().replace(/[\s-]/g, '');
}

type Field = 'email' | 'code' | 'password' | 'confirmation';

// For clients reception registered without the app: email + the one-time code from the front desk + a new password.
export default function ActivateAccountScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { activateAccount } = useAuth();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [focused, setFocused] = useState<Field | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const codeRef = useRef<TextInputInstance>(null);
  const passwordRef = useRef<TextInputInstance>(null);
  const confirmationRef = useRef<TextInputInstance>(null);

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
    // iOS only, same as the login: Android already pans the window to the focused input.
    <KeyboardAvoidingView style={styles.screen} behavior="padding" enabled={Platform.OS === 'ios'}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" bounces={false}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={goBack} hitSlop={12} style={styles.back}>
          <MaterialIcons name="arrow-back" size={22} color={colors.text} />
        </Pressable>

        <View style={styles.card}>
          <Text style={styles.title}>ACTIVA TU CUENTA</Text>
          <Text style={styles.subtitle}>
            Tu gimnasio ya te registró. Usa el correo que diste en recepción, el código que te entregaron y crea tu contraseña.
          </Text>

          {/* Autofill is off: the pair of new-password fields only invites the system to fill and move between them.
              The code is uppercased on submit, not per keystroke, so Android never rewrites text the keyboard is composing. */}
          <View style={styles.form}>
            <LoginInput
              icon="mail-outline"
              label="Correo electrónico"
              value={email}
              onChangeText={setEmail}
              onFocus={() => setFocused('email')}
              focused={focused === 'email'}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              importantForAutofill="no"
              keyboardType="email-address"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => codeRef.current?.focus()}
            />
            <LoginInput
              inputRef={codeRef}
              icon="confirmation-number"
              label="Código de activación"
              value={code}
              onChangeText={setCode}
              onFocus={() => setFocused('code')}
              focused={focused === 'code'}
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
              importantForAutofill="no"
              maxLength={12}
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
            <LoginInput
              inputRef={passwordRef}
              icon="vpn-key"
              label="Contraseña nueva (mínimo 10)"
              value={password}
              onChangeText={setPassword}
              onFocus={() => setFocused('password')}
              focused={focused === 'password'}
              autoCapitalize="none"
              autoComplete="off"
              importantForAutofill="no"
              secureTextEntry
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => confirmationRef.current?.focus()}
            />
            <LoginInput
              inputRef={confirmationRef}
              icon="vpn-key"
              label="Repite la contraseña"
              value={confirmation}
              onChangeText={setConfirmation}
              onFocus={() => setFocused('confirmation')}
              focused={focused === 'confirmation'}
              autoCapitalize="none"
              autoComplete="off"
              importantForAutofill="no"
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
            {isSubmitting ? <ActivityIndicator color={colors.onAccentFill} /> : <Text style={styles.submitText}>ACTIVAR CUENTA</Text>}
          </Pressable>
          <Text style={styles.note}>¿Perdiste tu código o ya venció? Pide uno nuevo en recepción.</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: 'center', padding: 20, gap: 16 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: 'rgba(20, 25, 22, 0.75)' },
  card: { gap: 16, borderRadius: 24, padding: 24, borderWidth: 1, borderColor: 'rgba(155, 255, 99, 0.15)', backgroundColor: 'rgba(20, 25, 22, 0.75)' },
  title: { color: colors.text, fontSize: 25, lineHeight: 30, fontWeight: '900', letterSpacing: 0.5 },
  subtitle: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
  form: { gap: 12, marginTop: 4 },
  error: { color: colors.danger, fontSize: 12, lineHeight: 18 },
  submitButton: { minHeight: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.accent },
  submitText: { color: colors.onAccentFill, fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.6 },
  note: { color: colors.textSecondary, fontSize: 12, textAlign: 'center' },
}));
