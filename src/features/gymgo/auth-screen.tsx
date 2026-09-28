import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { useAuth } from './auth-context';
import { getApiErrorMessage } from './api';
import { ActionButton, Eyebrow, Field, Notice } from './ui';
import { palette } from './theme';

export default function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [isRegistering, setIsRegistering] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setError('');
    if (!email.trim() || !password) {
      setError('Escribe tu correo y contraseña para continuar.');
      return;
    }
    if (isRegistering && name.trim().length < 2) {
      setError('El nombre debe tener al menos 2 caracteres.');
      return;
    }
    if (password.length < 10) {
      setError('La contraseña debe tener al menos 10 caracteres.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isRegistering) await signUp(name, email, password);
      else await signIn(email, password);
      router.replace('/(main)');
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No se pudo conectar con GymGo. Intenta de nuevo.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.colorBand} />
      <View style={styles.content}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark}><Text style={styles.markText}>G</Text></View>
          <Text style={styles.brand}>GYMGO</Text>
        </View>
        <Eyebrow>ENTRENA CON INTENCIÓN</Eyebrow>
        <Text style={styles.title}>{isRegistering ? 'Tu ritmo empieza aquí.' : 'Vuelve a tu mejor versión.'}</Text>
        <Text style={styles.subtitle}>
          {isRegistering ? 'Crea tu cuenta de cliente y conecta con tu gimnasio.' : 'Accede a tus rutinas y a tu espacio en el gimnasio.'}
        </Text>

        <View style={styles.form}>
          {isRegistering ? <Field label="Nombre completo" autoCapitalize="words" value={name} onChangeText={setName} /> : null}
          <Field
            label="Correo electrónico"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <Field
            label="Contraseña"
            autoCapitalize="none"
            autoComplete={isRegistering ? 'new-password' : 'password'}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={() => void submit()}
            returnKeyType="done"
          />
          {error ? <Notice error>{error}</Notice> : null}
          <ActionButton onPress={() => void submit()} disabled={isSubmitting}>
            {isSubmitting ? <ActivityIndicator color={palette.white} /> : isRegistering ? 'Crear cuenta' : 'Iniciar sesión'}
          </ActionButton>
        </View>

        <View style={styles.switchRow}>
          <Text style={styles.switchText}>{isRegistering ? '¿Ya tienes cuenta?' : '¿Primera vez en GymGo?'}</Text>
          <Text
            accessibilityRole="button"
            onPress={() => { setIsRegistering(!isRegistering); setError(''); }}
            style={styles.switchAction}>
            {isRegistering ? 'Inicia sesión' : 'Crear cuenta'}
          </Text>
        </View>
        {isRegistering ? <Text style={styles.footnote}>Tu cuenta se activa cuando el gimnasio confirma tu membresía.</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.paper, justifyContent: 'center' },
  colorBand: { position: 'absolute', top: 0, left: 0, right: 0, height: '34%', backgroundColor: palette.deepGreen },
  content: { width: '100%', maxWidth: 520, alignSelf: 'center', padding: 24, gap: 16 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  brandMark: { width: 38, height: 38, borderRadius: 10, backgroundColor: palette.lime, alignItems: 'center', justifyContent: 'center' },
  markText: { color: palette.deepGreen, fontSize: 22, fontWeight: '900' },
  brand: { color: palette.white, fontWeight: '900', fontSize: 16 },
  title: { color: palette.ink, fontSize: 34, lineHeight: 39, fontWeight: '800', maxWidth: 390 },
  subtitle: { color: palette.muted, fontSize: 15, lineHeight: 22, marginBottom: 8 },
  form: { gap: 16, marginTop: 10 },
  switchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 4 },
  switchText: { color: palette.muted, fontSize: 14 },
  switchAction: { color: palette.green, fontWeight: '800', fontSize: 14, paddingVertical: 6 },
  footnote: { color: palette.muted, fontSize: 12, lineHeight: 18 },
});