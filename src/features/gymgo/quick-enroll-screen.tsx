import { useRef, useState, type ComponentRef } from 'react';
import { TextInput, View } from 'react-native';

import { Badge, Button, Card, ErrorBanner, FadeIn, IconTile, Screen, ScreenHeader, Text, TextField } from '@/components/sirid';
import * as Haptics from '@/hooks/haptics';
import { makeStyles } from '@/theme/make-styles';
import { radius, space } from '@/theme/tokens';

import { api, getApiErrorMessage } from './api';

type EnrollResponse = {
  user: { name: string; lastName?: string; email: string };
  alreadyClient?: boolean;
  linkedExisting: boolean;
  activation: { code: string; expiresAt: string } | null;
};

const EMPTY = { name: '', lastName: '', email: '', phone: '' };
type FieldName = keyof typeof EMPTY;
type FieldErrors = Partial<Record<FieldName, string>>;

// Same rules as before, now reported next to each field.
function validate(form: typeof EMPTY): FieldErrors {
  const errors: FieldErrors = {};
  if (form.name.trim().length < 2) errors.name = 'Escribe el nombre del cliente.';
  if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errors.email = 'Escribe un correo válido.';
  if (form.phone.replace(/\D/g, '').length !== 10) errors.phone = 'El teléfono debe tener 10 dígitos.';
  return errors;
}

// Front-desk signup (Admin and Recepcion), the same flow as the dashboard: a new account gets a one-time code
// to activate the app; an existing GymGo account is linked and its holder gets a notice. Plans are sold in Caja.
export default function QuickEnrollScreen() {
  const styles = useStyles();
  const [form, setForm] = useState(EMPTY);
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<EnrollResponse | null>(null);
  const lastNameRef = useRef<ComponentRef<typeof TextInput>>(null);
  const emailRef = useRef<ComponentRef<typeof TextInput>>(null);
  const phoneRef = useRef<ComponentRef<typeof TextInput>>(null);

  const errors = validate(form);
  const visibleError = (field: FieldName) => (submitted || touched[field]) ? errors[field] : undefined;
  const set = (field: FieldName) => (value: string) => setForm((current) => ({ ...current, [field]: value }));
  const touch = (field: FieldName) => () => setTouched((current) => ({ ...current, [field]: true }));

  async function enroll() {
    setError('');
    setSubmitted(true);
    if (Object.keys(validate(form)).length) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    setIsSaving(true);
    try {
      const response = await api.post<EnrollResponse>('/auth/clients', {
        name: form.name.trim(),
        lastName: form.lastName.trim() || undefined,
        email: form.email.trim().toLowerCase(),
        phone: form.phone.replace(/\D/g, ''),
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setResult(response.data);
      setForm(EMPTY);
      setTouched({});
      setSubmitted(false);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No se pudo registrar al cliente.'));
    } finally {
      setIsSaving(false);
    }
  }

  const fullName = result ? [result.user.name, result.user.lastName].filter(Boolean).join(' ') : '';

  return (
    <Screen>
      <ScreenHeader eyebrow="Recepción" title="Alta rápida" subtitle="Registra a un cliente en mostrador; el plan se cobra en Caja." />

      {result ? (
        <FadeIn>
          <Card variant="raised" style={styles.result}>
            <View style={styles.resultHead}>
              <IconTile name={result.activation ? 'how-to-reg' : 'link'} tone="success" size={48} />
              <View style={styles.flex}>
                <Badge tone="success" icon="check">{result.alreadyClient ? 'Ya era cliente' : 'Cliente registrado'}</Badge>
                <Text variant="title" numberOfLines={2}>{fullName}</Text>
                <Text variant="callout" tone="secondary">{result.user.email}</Text>
              </View>
            </View>
            {result.activation ? (
              <View style={styles.codeBox}>
                <Text variant="label" tone="heroSecondary">Código de activación</Text>
                <Text selectable style={styles.code} accessibilityLabel={`Código de activación ${result.activation.code.split('').join(' ')}`}>
                  {result.activation.code}
                </Text>
                <Text variant="caption" tone="heroSecondary">
                  Vence el {new Date(result.activation.expiresAt).toLocaleDateString('es-MX')} · Se muestra solo una vez.
                </Text>
              </View>
            ) : null}
            <Text variant="callout" tone="secondary">
              {result.activation
                ? 'Dáselo al cliente: lo usa en la app con su correo para crear su contraseña.'
                : result.alreadyClient
                  ? 'Esta cuenta ya es cliente de este gimnasio.'
                  : 'Ya tenía cuenta de GymGo: la vinculamos y verá un aviso en su app.'}
            </Text>
            <Button variant="secondary" icon="person-add-alt-1" onPress={() => setResult(null)}>Registrar a otro cliente</Button>
          </Card>
        </FadeIn>
      ) : (
        <FadeIn>
          <Card style={styles.form}>
            <TextField
              label="Nombre"
              icon="person"
              autoCapitalize="words"
              autoComplete="name-given"
              returnKeyType="next"
              value={form.name}
              onChangeText={set('name')}
              onBlur={touch('name')}
              onSubmitEditing={() => lastNameRef.current?.focus()}
              error={visibleError('name')}
            />
            <TextField
              ref={lastNameRef}
              label="Apellidos"
              hint="Opcional"
              icon="badge"
              autoCapitalize="words"
              autoComplete="name-family"
              returnKeyType="next"
              value={form.lastName}
              onChangeText={set('lastName')}
              onSubmitEditing={() => emailRef.current?.focus()}
            />
            <TextField
              ref={emailRef}
              label="Correo electrónico"
              icon="alternate-email"
              placeholder="cliente@correo.com"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              returnKeyType="next"
              value={form.email}
              onChangeText={set('email')}
              onBlur={touch('email')}
              onSubmitEditing={() => phoneRef.current?.focus()}
              error={visibleError('email')}
            />
            <TextField
              ref={phoneRef}
              label="Teléfono"
              hint="10 dígitos"
              icon="phone"
              keyboardType="phone-pad"
              autoComplete="tel"
              maxLength={14}
              returnKeyType="done"
              value={form.phone}
              onChangeText={set('phone')}
              onBlur={touch('phone')}
              onSubmitEditing={() => void enroll()}
              error={visibleError('phone')}
            />
            {error ? <ErrorBanner message={error} /> : null}
            <Button size="large" icon="person-add-alt-1" loading={isSaving} disabled={isSaving} onPress={() => void enroll()}>
              Registrar cliente
            </Button>
          </Card>
        </FadeIn>
      )}
    </Screen>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  flex: { flex: 1, gap: 4 },
  form: { gap: space.lg },
  result: { gap: space.lg },
  resultHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  codeBox: { alignItems: 'center', gap: space.xs, borderRadius: radius.lg, backgroundColor: colors.hero, padding: space.xl },
  code: { color: '#10FF85', fontSize: 44, lineHeight: 50, fontWeight: '800', fontFamily: 'display', letterSpacing: 8 },
}));
