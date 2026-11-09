import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from '@/hooks/haptics';
import { router, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  type TextInputInstance,
  View,
} from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/sirid';
import { makeStyles } from '@/theme/make-styles';
import { useTheme } from '@/theme/theme-provider';
import { radius, space } from '@/theme/tokens';

import { getApiErrorCode, getApiErrorMessage } from './api';
import { useAuth } from './auth-context';

const particles = [
  { left: '13%', top: '30%', size: 4, delay: 0, duration: 2500 },
  { left: '27%', top: '18%', size: 3, delay: 500, duration: 3000 },
  { left: '78%', top: '24%', size: 4, delay: 800, duration: 2800 },
  { left: '88%', top: '55%', size: 3, delay: 300, duration: 2200 },
  { left: '62%', top: '70%', size: 3, delay: 650, duration: 2600 },
] as const;

export default function AuthScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  // Reception opened this account; it needs the activation code instead of a password.
  const [needsActivation, setNeedsActivation] = useState(false);

  function openActivation() {
    const typedEmail = email.trim();
    router.push((typedEmail ? `/(auth)/activate?email=${encodeURIComponent(typedEmail)}` : '/(auth)/activate') as Href);
  }

  async function submit() {
    setError('');
    setNeedsActivation(false);
    if (!email.trim() || !password) {
      setError('Escribe tu correo y contraseña para continuar.');
      return;
    }
    if (password.length < 10) {
      setError('La contraseña debe tener al menos 10 caracteres.');
      return;
    }

    setIsSubmitting(true);
    try {
      await signIn(email, password);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(main)');
    } catch (requestError) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setNeedsActivation(getApiErrorCode(requestError) === 'account_pending_activation');
      setError(getApiErrorMessage(requestError, 'No se pudo conectar con GymGo. Intenta de nuevo.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {/* The brand panel is dark in both themes. */}
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="always" bounces={false}>
        <View style={styles.hero}>
          <SafeAreaView edges={['top']} style={styles.heroInner}>
            {particles.map((particle, index) => <Particle key={index} {...particle} />)}
            <EnergyTrails />
            <View style={styles.brandRow}>
              <View style={styles.brandMark}><Text style={styles.brandMarkText}>G</Text></View>
              <View>
                <Text style={styles.brand}>GymGo</Text>
                <Text style={styles.brandBy}>by SIRID Systems</Text>
              </View>
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.heroTitle}>Vuelve a tu{'\n'}mejor versión.</Text>
              <Text style={styles.heroSubtitle}>Tus rutinas, tu progreso y tu acceso al gimnasio en un solo lugar.</Text>
            </View>
          </SafeAreaView>
        </View>

        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Text style={styles.title} accessibilityRole="header">Iniciar sesión</Text>
            <Text style={styles.subtitle}>Usa el correo con el que te registró tu gimnasio.</Text>
          </View>

          <View style={styles.form}>
            <LoginInput
              icon="alternate-email"
              label="Correo electrónico"
              placeholder="tu@correo.com"
              value={email}
              onChangeText={setEmail}
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
              focused={emailFocused}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="next"
            />
            <LoginInput
              icon="lock-outline"
              label="Contraseña"
              placeholder="Mínimo 10 caracteres"
              value={password}
              onChangeText={setPassword}
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
              focused={passwordFocused}
              autoCapitalize="none"
              autoComplete="password"
              textContentType="password"
              secureTextEntry={!showPassword}
              onSubmitEditing={() => void submit()}
              returnKeyType="done"
              trailing={(
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  onPress={() => setShowPassword((value) => !value)}
                  hitSlop={10}
                  style={styles.eye}>
                  <MaterialIcons name={showPassword ? 'visibility-off' : 'visibility'} size={20} color={colors.textSecondary} />
                </Pressable>
              )}
            />
          </View>

          {error ? (
            <View accessibilityRole="alert" style={styles.errorBox}>
              <MaterialIcons name="error-outline" size={18} color={colors.danger} />
              <Text style={styles.error}>{error}</Text>
            </View>
          ) : null}

          <Button size="large" loading={isSubmitting} disabled={isSubmitting} onPress={() => void submit()} icon="arrow-forward">
            Entrar
          </Button>

          <Pressable
            accessibilityRole="link"
            onPress={openActivation}
            style={({ pressed }) => [styles.activationLink, needsActivation && styles.activationLinkHighlighted, pressed && styles.pressed]}>
            <MaterialIcons name="key" size={18} color={colors.accent} />
            <Text style={[styles.activationText, needsActivation && styles.activationTextHighlighted]}>
              {needsActivation ? 'Activar mi cuenta ahora' : '¿Te registraron en recepción? Activa tu cuenta'}
            </Text>
          </Pressable>

          <View style={styles.secureRow}>
            <MaterialIcons name="verified-user" size={14} color={colors.textTertiary} />
            <Text style={styles.secureNote}>Conexión cifrada · Acceso para miembros GymGo</Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function LoginInput({ icon, label, focused, inputRef, trailing, placeholder, ...props }: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  focused: boolean;
  inputRef?: React.Ref<TextInputInstance>;
  trailing?: React.ReactNode;
} & React.ComponentProps<typeof TextInput>) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.inputShell, focused && styles.inputFocused]}>
        <MaterialIcons name={icon} size={20} color={focused ? colors.accent : colors.textTertiary} />
        <TextInput
          {...props}
          ref={inputRef}
          accessibilityLabel={label}
          placeholder={placeholder ?? label}
          placeholderTextColor={colors.textTertiary}
          selectionColor={colors.accent}
          cursorColor={colors.accent}
          style={styles.input}
        />
        {trailing}
      </View>
    </View>
  );
}

function Particle({ left, top, size, delay, duration }: { left: `${number}%`; top: `${number}%`; size: number; delay: number; duration: number }) {
  const styles = useStyles();
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    progress.set(withDelay(delay, withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.ease) }), -1, true)));
  }, [delay, duration, progress, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.15 + progress.value * 0.75,
    transform: [{ translateY: 8 - progress.value * 20 }],
  }));

  return <Animated.View pointerEvents="none" style={[styles.particle, { left, top, width: size, height: size }, animatedStyle]} />;
}

function EnergyTrails() {
  const styles = useStyles();
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    pulse.set(withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.ease) }), -1, true));
  }, [pulse, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.45 + pulse.value * 0.45,
    transform: [{ rotate: '-14deg' }, { scale: 0.96 + pulse.value * 0.08 }],
  }));

  return (
    <Animated.View pointerEvents="none" style={[styles.trails, animatedStyle]}>
      <View style={styles.trailOne} />
      <View style={styles.trailTwo} />
      <View style={styles.trailThree} />
    </Animated.View>
  );
}

const VOLT = '#10FF85';

const useStyles = makeStyles(({ colors }) => ({
  screen: { flex: 1, backgroundColor: colors.hero },
  scroll: { flexGrow: 1 },
  pressed: { opacity: 0.7 },
  hero: { minHeight: 300, backgroundColor: colors.hero, overflow: 'hidden' },
  heroInner: { flex: 1, paddingHorizontal: space.xxl, paddingBottom: space.xxxl + space.lg, justifyContent: 'space-between' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingTop: space.lg },
  brandMark: { width: 44, height: 44, borderRadius: 14, backgroundColor: VOLT, alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: '#04120A', fontSize: 26, fontWeight: '800', fontFamily: 'display' },
  brand: { color: colors.heroText, fontSize: 22, lineHeight: 24, fontWeight: '800', fontFamily: 'display', letterSpacing: 0.5 },
  brandBy: { color: colors.heroTextSecondary, fontSize: 12, fontWeight: '600', letterSpacing: 0.6 },
  heroCopy: { gap: space.sm, marginTop: space.xxxl },
  heroTitle: { color: colors.heroText, fontSize: 44, lineHeight: 46, fontWeight: '800', fontFamily: 'display' },
  heroSubtitle: { color: colors.heroTextSecondary, fontSize: 15, lineHeight: 22, maxWidth: 320 },
  trails: { position: 'absolute', right: -60, top: 70, width: 320, height: 220, alignItems: 'center', justifyContent: 'center' },
  trailOne: { position: 'absolute', width: 260, height: 2, borderRadius: 1, backgroundColor: VOLT },
  trailTwo: { position: 'absolute', width: 210, height: 2, borderRadius: 1, marginTop: 34, marginLeft: 18, backgroundColor: '#5CC8FF', opacity: 0.6 },
  trailThree: { position: 'absolute', width: 170, height: 1, marginTop: -46, marginLeft: -18, backgroundColor: VOLT, opacity: 0.6 },
  particle: { position: 'absolute', borderRadius: 9, backgroundColor: VOLT },
  sheet: { flexGrow: 1, marginTop: -space.xxl, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, backgroundColor: colors.background, paddingHorizontal: space.xxl, paddingTop: space.xxl, paddingBottom: space.xxxl, gap: space.lg },
  sheetHead: { gap: 4 },
  title: { color: colors.text, fontSize: 30, lineHeight: 34, fontWeight: '800', fontFamily: 'display' },
  subtitle: { color: colors.textSecondary, fontSize: 15, lineHeight: 22 },
  form: { gap: space.md },
  field: { gap: 6 },
  fieldLabel: { color: colors.text, fontSize: 14, fontWeight: '600' },
  inputShell: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceRaised, paddingHorizontal: space.lg },
  // Only the border color may change on focus. A shadowColor turns the shell into a native "stacking context", so
  // toggling it re-parents the TextInput's native view on Android; the input loses focus, Android hands it to
  // another input, that one re-parents too... an endless focus loop between the fields.
  inputFocused: { borderColor: colors.accent },
  input: { flex: 1, color: colors.text, fontSize: 16, minHeight: 54 },
  eye: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  errorBox: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, borderRadius: radius.md, backgroundColor: colors.dangerSoft, padding: space.md },
  error: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 20 },
  activationLink: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, borderRadius: radius.md, paddingHorizontal: space.md },
  activationLinkHighlighted: { borderWidth: 1.5, borderColor: colors.accent, backgroundColor: colors.accentSoft },
  activationText: { color: colors.accent, fontSize: 14, fontWeight: '700', textAlign: 'center', flexShrink: 1 },
  activationTextHighlighted: { fontWeight: '800' },
  secureRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  secureNote: { color: colors.textTertiary, fontSize: 12, textAlign: 'center' },
}));
