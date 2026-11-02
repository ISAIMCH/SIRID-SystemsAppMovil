import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';

import { api, getApiErrorMessage } from './api';
import { FloatingCard } from './fit-ui';
import { palette } from './theme';
import { ActionButton, AppHeader, Field, Notice, Page } from './ui';

type EnrollResponse = {
  user: { name: string; lastName?: string; email: string };
  alreadyClient?: boolean;
  linkedExisting: boolean;
  activation: { code: string; expiresAt: string } | null;
};

const EMPTY = { name: '', lastName: '', email: '', phone: '' };

// Front-desk signup (Admin and Recepcion), the same flow as the dashboard: a new account gets a one-time code
// to activate the app; an existing GymGo account is linked and its holder gets a notice. Plans are sold in Caja.
export default function QuickEnrollScreen() {
  const [form, setForm] = useState(EMPTY);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<EnrollResponse | null>(null);

  const set = (field: keyof typeof EMPTY) => (value: string) => setForm((current) => ({ ...current, [field]: value }));

  async function enroll() {
    setError('');
    if (form.name.trim().length < 2) return setError('Escribe el nombre del cliente.');
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return setError('Escribe un correo válido.');
    if (form.phone.replace(/\D/g, '').length !== 10) return setError('El teléfono debe tener 10 dígitos.');

    setIsSaving(true);
    try {
      const response = await api.post<EnrollResponse>('/auth/clients', {
        name: form.name.trim(),
        lastName: form.lastName.trim() || undefined,
        email: form.email.trim().toLowerCase(),
        phone: form.phone.replace(/\D/g, ''),
      });
      setResult(response.data);
      setForm(EMPTY);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No se pudo registrar al cliente.'));
    } finally {
      setIsSaving(false);
    }
  }

  const fullName = result ? [result.user.name, result.user.lastName].filter(Boolean).join(' ') : '';

  return (
    <Page admin>
      <AppHeader title="Alta rápida" detail="Registra a un cliente en mostrador; el plan se cobra en Caja." />

      {result ? (
        <FloatingCard style={styles.result}>
          <Text style={styles.resultLabel}>{result.alreadyClient ? 'Ya era cliente' : 'Cliente registrado'}</Text>
          <Text style={styles.resultName}>{fullName}</Text>
          <Text style={styles.resultMeta}>{result.user.email}</Text>
          {result.activation ? (
            <>
              <Text style={styles.resultLabel}>Código de activación</Text>
              <Text selectable style={styles.code}>{result.activation.code}</Text>
              <Text style={styles.resultMeta}>
                Dáselo al cliente: lo usa en la app con su correo para crear su contraseña.
                Vence el {new Date(result.activation.expiresAt).toLocaleDateString('es-MX')}. Se muestra solo una vez.
              </Text>
            </>
          ) : (
            <Text style={styles.resultMeta}>
              {result.alreadyClient
                ? 'Esta cuenta ya es cliente de este gimnasio.'
                : 'Ya tenía cuenta de GymGo: la vinculamos y verá un aviso en su app.'}
            </Text>
          )}
          <ActionButton secondary onPress={() => setResult(null)}>Registrar a otro cliente</ActionButton>
        </FloatingCard>
      ) : (
        <FloatingCard style={styles.form}>
          <Field label="Nombre" autoCapitalize="words" value={form.name} onChangeText={set('name')} />
          <Field label="Apellidos (opcional)" autoCapitalize="words" value={form.lastName} onChangeText={set('lastName')} />
          <Field label="Correo electrónico" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" value={form.email} onChangeText={set('email')} />
          <Field label="Teléfono (10 dígitos)" keyboardType="phone-pad" maxLength={14} value={form.phone} onChangeText={set('phone')} />
          {error ? <Notice error>{error}</Notice> : null}
          <ActionButton onPress={() => void enroll()} disabled={isSaving}>
            {isSaving ? <ActivityIndicator color={palette.white} /> : 'Registrar cliente'}
          </ActionButton>
        </FloatingCard>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  form: { gap: 14, padding: 20 },
  result: { gap: 8, padding: 22 },
  resultLabel: { color: palette.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginTop: 6 },
  resultName: { color: palette.ink, fontSize: 22, fontWeight: '800' },
  resultMeta: { color: palette.muted, fontSize: 13, lineHeight: 19 },
  code: { color: palette.green, fontSize: 36, fontWeight: '900', letterSpacing: 6 },
});
