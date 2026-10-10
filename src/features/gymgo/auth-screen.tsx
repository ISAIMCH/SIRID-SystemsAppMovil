import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    Easing,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

import { getApiErrorMessage } from './api';
import { useAuth } from './auth-context';

const neon = '#9BFF63';
const background = '#080B09';
const surface = '#121512';
const border = '#1E2A21';
const primaryText = '#F4F8F5';
const mutedText = '#888F8A';
const particles = [
  { left: '13%', top: '28%', size: 3, delay: 0, duration: 2500 },
  { left: '25%', top: '18%', size: 2, delay: 500, duration: 3000 },
  { left: '77%', top: '25%', size: 3, delay: 800, duration: 2800 },
  { left: '86%', top: '49%', size: 2, delay: 300, duration: 2200 },
  { left: '19%', top: '57%', size: 2, delay: 1100, duration: 3200 },
  { left: '70%', top: '65%', size: 3, delay: 650, duration: 2600 },
] as const;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function AuthScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const buttonScale = useRef(new Animated.Value(1)).current;

  async function submit() {
    setError('');
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
      setError(getApiErrorMessage(requestError, 'No se pudo conectar con GymGo. Intenta de nuevo.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  function pressIn() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.spring(buttonScale, { toValue: 0.96, friction: 5, tension: 100, useNativeDriver: true }).start();
  }

  function pressOut() {
    Animated.spring(buttonScale, { toValue: 1, friction: 5, tension: 100, useNativeDriver: true }).start();
  }

  return (
    // <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#0a0f0d' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#0a0f0d' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} enabled={Platform.OS === 'ios'}>
      <View style={styles.backgroundLayer} pointerEvents="none">
        <View style={styles.hero} pointerEvents="none">
          <LinearGradient pointerEvents="none" colors={['#142316', '#080B09']} style={StyleSheet.absoluteFill} />
          {particles.map((particle, index) => <Particle key={index} {...particle} />)}
          <EnergyTrails />
          <View style={styles.brandOverlay}>
            <View style={styles.brandMark}><Text style={styles.brandMarkText}>G</Text></View>
            <Text style={styles.brand}>GYMGO</Text>
          </View>
          <View style={styles.athleteGlow}>
            <MaterialIcons name="fitness-center" size={112} color={neon} />
          </View>
          <Text style={styles.heroCaption}>ENTRENA CON INTENCIÓN</Text>
        </View>
      </View>

      {/* <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20 }} keyboardShouldPersistTaps="handled" bounces={false}> */}
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20 }} keyboardShouldPersistTaps="always" bounces={false}>
        <View style={styles.card}>
          <Text style={styles.title}>VUELVE A TU MEJOR VERSIÓN</Text>
          <Text style={styles.subtitle}>Accede a tus rutinas y a tu espacio en el gimnasio.</Text>

          <View style={styles.form}>
            <LoginInput
              icon="fitness-center"
              label="Correo electrónico"
              value={email}
              onChangeText={(value) => { setEmail(value); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              onFocus={() => setEmailFocused(true)}
              focused={emailFocused}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              returnKeyType="next"
            />
            <LoginInput
              icon="vpn-key"
              label="Contraseña"
              value={password}
              onChangeText={(value) => { setPassword(value); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              onFocus={() => setPasswordFocused(true)}
              focused={passwordFocused}
              autoCapitalize="none"
              autoComplete="password"
              secureTextEntry
              onSubmitEditing={() => void submit()}
              returnKeyType="done"
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <AnimatedPressable
            accessibilityRole="button"
            disabled={isSubmitting}
            onPress={() => void submit()}
            onPressIn={pressIn}
            onPressOut={pressOut}
            style={[styles.submitButton, { transform: [{ scale: buttonScale }] }, isSubmitting && styles.disabled]}>
            {isSubmitting ? <ActivityIndicator color="#071007" /> : <Text style={styles.submitText}>INICIAR SESIÓN</Text>}
          </AnimatedPressable>
          <Text style={styles.secureNote}>Acceso seguro para miembros GymGo</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function LoginInput({ icon, label, focused, ...props }: { icon: keyof typeof MaterialIcons.glyphMap; label: string; focused: boolean } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={[styles.inputShell, focused && styles.inputFocused]}>
      <MaterialIcons name={icon} size={18} color={focused ? neon : mutedText} />
      <TextInput {...props} placeholder={label} placeholderTextColor={mutedText} style={styles.input} />
    </View>
  );
}

function Particle({ left, top, size, delay, duration }: { left: `${number}%`; top: `${number}%`; size: number; delay: number; duration: number }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(progress, { toValue: 1, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(progress, { toValue: 0, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [delay, duration, progress]);

  return (
    <Animated.View style={[styles.particle, { left, top, width: size, height: size, opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.9] }), transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [8, -12] }) }] }]} />
  );
}

function EnergyTrails() {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  return (
    <Animated.View style={[styles.trails, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.48, 0.92] }), transform: [{ rotate: '-12deg' }, { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.04] }) }] }]}>
      <View style={styles.trailOne} />
      <View style={styles.trailTwo} />
      <View style={styles.trailThree} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: background },
  backgroundLayer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  hero: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  brandOverlay: { position: 'absolute', top: 28, left: 24, flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 38, height: 38, borderRadius: 12, backgroundColor: neon, alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: '#071007', fontSize: 23, fontWeight: '900' },
  brand: { color: primaryText, fontSize: 16, fontWeight: '900', letterSpacing: 2 },
  athleteGlow: { width: 190, height: 190, borderRadius: 95, alignItems: 'center', justifyContent: 'center', backgroundColor: '#9BFF6315', shadowColor: neon, shadowOpacity: 0.55, shadowRadius: 44, shadowOffset: { width: 0, height: 0 }, elevation: 12 },
  heroCaption: { position: 'absolute', bottom: 26, color: '#B8C5B9', fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  trails: { position: 'absolute', width: 320, height: 220, alignItems: 'center', justifyContent: 'center' },
  trailOne: { position: 'absolute', width: 260, height: 2, backgroundColor: neon, shadowColor: neon, shadowOpacity: 0.9, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
  trailTwo: { position: 'absolute', width: 220, height: 2, marginTop: 34, marginLeft: 18, backgroundColor: '#55D6D0', opacity: 0.65 },
  trailThree: { position: 'absolute', width: 180, height: 1, marginTop: -48, marginLeft: -18, backgroundColor: neon, opacity: 0.7 },
  particle: { position: 'absolute', borderRadius: 9, backgroundColor: neon, shadowColor: neon, shadowOpacity: 0.8, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
  card: { gap: 16, zIndex: 10, elevation: 10, borderRadius: 24, padding: 24, borderWidth: 1, borderColor: 'rgba(155, 255, 99, 0.15)', backgroundColor: 'rgba(20, 25, 22, 0.75)', overflow: 'hidden' },
  title: { color: primaryText, fontSize: 25, lineHeight: 30, fontWeight: '900', letterSpacing: 0.5 },
  subtitle: { color: mutedText, fontSize: 14, lineHeight: 21, maxWidth: 330 },
  form: { gap: 12, marginTop: 4 },
  inputShell: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#1E1E1E', borderRadius: 14, backgroundColor: 'rgba(13, 16, 14, 0.8)', paddingHorizontal: 16 },
  inputFocused: { borderColor: neon, shadowColor: neon, shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
  input: { flex: 1, color: primaryText, fontSize: 15, minHeight: 54 },
  error: { color: '#FF8A80', fontSize: 12, lineHeight: 18 },
  submitButton: { minHeight: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: neon, shadowColor: neon, shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 5 }, elevation: 8 },
  submitText: { color: '#071007', fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  disabled: { opacity: 0.6 },
  secureNote: { color: '#626A64', fontSize: 11, textAlign: 'center' },
});
