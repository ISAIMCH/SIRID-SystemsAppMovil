import { useEffect, useState } from 'react';
import QRCode from 'react-native-qrcode-svg';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { api, getApiErrorMessage } from './api';
import { Notice } from './ui';
import { palette } from './theme';

type QrResponse = { qrToken: string; expiresAt: string };

export default function ClientQrCard() {
  const [qr, setQr] = useState<QrResponse | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [now, setNow] = useState(0);
  const [retryNumber, setRetryNumber] = useState(0);

  useEffect(() => {
    let isCurrent = true;
    let refreshTimer: ReturnType<typeof setTimeout>;

    async function loadQr() {
      try {
        const response = await api.post<QrResponse>('/access/qr');
        if (isCurrent) {
          setQr(response.data);
          setNow(Date.now());
          setError('');
        }
      } catch (requestError) {
        if (isCurrent) setError(getApiErrorMessage(requestError, 'No se pudo generar el acceso QR.'));
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
    <View style={styles.card}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>ACCESO AL GIMNASIO</Text>
        <Text style={styles.title}>Tu pase dinámico</Text>
        <Text style={styles.description}>Muestra este código en el lector de entrada.</Text>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, remainingSeconds > 0 && styles.readyDot]} />
          <Text style={styles.statusText}>{remainingSeconds > 0 ? 'Vigente' : 'Renovando'}</Text>
          {remainingSeconds > 0 ? <Text style={styles.countdown}>{remainingSeconds}s</Text> : null}
        </View>
        <Pressable accessibilityRole="button" onPress={() => router.push('/(main)/access')} style={styles.fullAccess}>
          <Text style={styles.fullAccessText}>Ver acceso completo →</Text>
        </Pressable>
      </View>
      <View style={styles.qrFrame}>
        {qr && remainingSeconds > 0 ? (
          <QRCode value={qr.qrToken} size={142} quietZone={8} color={palette.ink} backgroundColor={palette.white} />
        ) : (
          <ActivityIndicator color={palette.green} />
        )}
      </View>
      {error ? (
        <View style={styles.errorWrap}>
          <Notice error>{error}</Notice>
          <Pressable accessibilityRole="button" onPress={() => { setIsLoading(true); setRetryNumber((value) => value + 1); }}>
            <Text style={styles.retry}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}
      {isLoading && !qr ? <Text style={styles.loadingText}>Preparando acceso…</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, borderRadius: 10, padding: 16 },
  content: { flex: 1, minWidth: 155, gap: 8 },
  eyebrow: { color: palette.green, fontSize: 10, fontWeight: '800' },
  title: { color: palette.ink, fontSize: 18, fontWeight: '800' },
  description: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.coral },
  readyDot: { backgroundColor: '#57956D' },
  statusText: { color: palette.ink, fontSize: 11, fontWeight: '700' },
  countdown: { color: palette.green, fontSize: 11, fontWeight: '800' },
  fullAccess: { alignSelf: 'flex-start', paddingVertical: 4 },
  fullAccessText: { color: palette.green, fontSize: 12, fontWeight: '800' },
  qrFrame: { width: 158, height: 158, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: palette.white },
  errorWrap: { width: '100%', gap: 6 },
  retry: { color: palette.green, fontSize: 12, fontWeight: '800', paddingVertical: 5 },
  loadingText: { width: '100%', color: palette.muted, fontSize: 11 },
});