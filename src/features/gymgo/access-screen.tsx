import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, ErrorBanner, FadeIn, Screen, ScreenHeader, Text } from '@/components/sirid';
import { makeStyles } from '@/theme/make-styles';
import { useTheme } from '@/theme/theme-provider';
import { radius, space } from '@/theme/tokens';

import { api, getApiErrorMessage } from './api';
import { accessResultCopy, useAccessResult, type AccessResult } from './client-live-updates';
import GymSwitcher from './gym-switcher';
import { QrPass } from './qr-pass';

type QrResponse = { qrToken: string; expiresAt: string };

export default function AccessScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const [qr, setQr] = useState<QrResponse | null>(null);
  const [issuedAt, setIssuedAt] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [now, setNow] = useState(0);
  const [retryNumber, setRetryNumber] = useState(0);
  const [result, setResult] = useState<AccessResult | null>(null);

  // A scanned code is spent: show what the reader decided and get a fresh code right away.
  useAccessResult((recorded) => {
    setResult(recorded);
    setRetryNumber((current) => current + 1);
  });

  useEffect(() => {
    if (!result) return undefined;
    const timer = setTimeout(() => setResult(null), 6000);
    return () => clearTimeout(timer);
  }, [result]);

  useEffect(() => {
    let isCurrent = true;
    let refreshTimer: ReturnType<typeof setTimeout>;

    async function loadQr() {
      try {
        const response = await api.post<QrResponse>('/access/qr');
        if (isCurrent) {
          const fetchedAt = Date.now();
          setNow(fetchedAt);
          setIssuedAt(fetchedAt);
          setQr(response.data);
          setError('');
        }
      } catch (requestError) {
        if (isCurrent) setError(getApiErrorMessage(requestError, 'No se pudo generar tu código.'));
      } finally {
        if (isCurrent) {
          setIsLoading(false);
          refreshTimer = setTimeout(() => void loadQr(), 45000);
        }
      }
    }

    void loadQr();
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      isCurrent = false;
      clearTimeout(refreshTimer);
      clearInterval(clock);
    };
  }, [retryNumber]);

  const expiresAt = qr ? new Date(qr.expiresAt).getTime() : 0;
  const remainingSeconds = qr ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : 0;
  const totalSeconds = qr ? Math.max(1, Math.ceil((expiresAt - issuedAt) / 1000)) : 0;
  const copy = result ? accessResultCopy(result) : null;
  const denied = result?.event === 'denied';
  const membershipIssue = /membres[ií]a/i.test(error);

  return (
    <Screen>
      <ScreenHeader eyebrow="Acceso" title="Tu pase QR" subtitle="Acércalo al lector de la entrada." />
      <GymSwitcher />

      {result && copy ? (
        <FadeIn>
          <View accessibilityRole="alert" style={[styles.result, denied && styles.resultDenied]}>
            <MaterialIcons name={denied ? 'block' : result.event === 'check-in' ? 'login' : 'logout'} size={28} color={denied ? colors.danger : colors.success} />
            <View style={styles.flex}>
              <Text variant="headline">{copy.title}</Text>
              {copy.detail ? <Text variant="callout" tone="secondary">{copy.detail}</Text> : null}
            </View>
          </View>
        </FadeIn>
      ) : null}

      <FadeIn index={1} style={styles.passWrap}>
        <QrPass token={qr?.qrToken ?? null} remaining={remainingSeconds} total={totalSeconds} loading={isLoading} dimmed={Boolean(result)} />
      </FadeIn>

      {error ? (
        <View style={styles.errorGroup}>
          <ErrorBanner
            message={error}
            onRetry={() => {
              setError('');
              setIsLoading(true);
              setRetryNumber((current) => current + 1);
            }}
          />
          {membershipIssue ? <Text variant="callout" tone="secondary">Tu gimnasio debe activar tu membresía antes de habilitar el acceso.</Text> : null}
        </View>
      ) : null}

      <View style={styles.facts}>
        <Fact icon="autorenew" text="Se renueva solo cada 45 segundos" />
        <Fact icon="lock" text="Un solo uso · conexión cifrada" />
        <Fact icon="brightness-high" text="Sube el brillo si el lector no lo detecta" />
      </View>

      {!qr && !isLoading && !error ? <Button variant="secondary" onPress={() => setRetryNumber((value) => value + 1)}>Generar código</Button> : null}
    </Screen>
  );
}

function Fact({ icon, text }: { icon: keyof typeof MaterialIcons.glyphMap; text: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.fact}>
      <MaterialIcons name={icon} size={18} color={colors.textSecondary} />
      <Text variant="callout" tone="secondary" style={styles.flex}>{text}</Text>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  flex: { flex: 1 },
  passWrap: { alignItems: 'center', paddingVertical: space.sm },
  result: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.success, backgroundColor: colors.successSoft, padding: space.lg },
  resultDenied: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  errorGroup: { gap: space.sm },
  facts: { gap: space.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: space.lg },
  fact: { flexDirection: 'row', alignItems: 'center', gap: space.md },
}));
