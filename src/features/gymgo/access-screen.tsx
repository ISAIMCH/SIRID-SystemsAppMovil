import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { api, getApiErrorMessage } from './api';
import { palette } from './theme';
import { ActionButton, AppHeader, Notice, Page, Surface } from './ui';

type QrResponse = { qrToken: string; expiresAt: string };

export default function AccessScreen() {
  const [qr, setQr] = useState<QrResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [now, setNow] = useState(0);
  const [retryNumber, setRetryNumber] = useState(0);

  useEffect(() => {
    let isCurrent = true;
    let refreshTimer: ReturnType<typeof setTimeout>;

    async function loadQr() {
      try {
        const response = await api.post<QrResponse>('/access/qr');
        if (isCurrent) {
          setNow(Date.now());
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

  const remainingSeconds = qr ? Math.max(0, Math.ceil((new Date(qr.expiresAt).getTime() - now) / 1000)) : 0;

  return (
    <Page dark>
      <AppHeader title="Acceso al gimnasio" detail="Presenta el código al lector de la entrada." />
      <View style={styles.statusRow}>
        <View style={[styles.statusDot, remainingSeconds > 0 && styles.statusReady]} />
        <Text style={styles.statusText}>{remainingSeconds > 0 ? 'Código vigente' : 'Renovando código'}</Text>
        {remainingSeconds > 0 ? <Text style={styles.countdown}>{remainingSeconds}s</Text> : null}
      </View>

      <Surface style={styles.qrPanel}>
        {qr && remainingSeconds > 0 ? (
          <View style={styles.qrFrame}>
            <QRCode value={qr.qrToken} size={224} quietZone={12} color={palette.ink} backgroundColor={palette.white} />
          </View>
        ) : (
          <View style={styles.qrLoading}>
            {isLoading ? <ActivityIndicator color={palette.green} size="large" /> : <Text style={styles.expired}>···</Text>}
          </View>
        )}
        <Text style={styles.qrTitle}>Tu pase personal</Text>
        <Text style={styles.qrDetail}>Este código cambia automáticamente y solo puede usarse una vez.</Text>
      </Surface>

      {error ? (
        <View style={styles.retryGroup}>
          <Notice error>{error}</Notice>
          <ActionButton secondary onPress={() => {
            setError('');
            setIsLoading(true);
            setRetryNumber((current) => current + 1);
          }}>
            Intentar de nuevo
          </ActionButton>
        </View>
      ) : null}
      {error.includes('membresía') || error.includes('Membresía') ? (
        <Notice>Tu gimnasio debe activar tu membresía antes de habilitar el acceso.</Notice>
      ) : null}
      <View style={styles.securityRow}>
        <Text style={styles.securityLabel}>SEGURIDAD</Text>
        <Text style={styles.securityText}>QR temporal · Conexión cifrada</Text>
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: palette.coral },
  statusReady: { backgroundColor: '#57956D' },
  statusText: { color: palette.ink, fontSize: 13, fontWeight: '700' },
  countdown: { marginLeft: 'auto', color: palette.green, fontSize: 13, fontWeight: '800' },
  qrPanel: { alignItems: 'center', gap: 14, paddingVertical: 24 },
  qrFrame: { width: 256, height: 256, maxWidth: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: palette.white, borderRadius: 8 },
  qrLoading: { width: 256, height: 256, maxWidth: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0F1E9', borderRadius: 8 },
  expired: { color: palette.muted, fontSize: 32 },
  qrTitle: { color: palette.ink, fontSize: 19, fontWeight: '800' },
  qrDetail: { maxWidth: 280, color: palette.muted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  securityRow: { borderTopWidth: 1, borderTopColor: palette.line, paddingTop: 16, gap: 5 },
  securityLabel: { color: palette.green, fontSize: 10, fontWeight: '800' },
  securityText: { color: palette.muted, fontSize: 13 },
  retryGroup: { gap: 10 },
});