import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api, getApiErrorMessage } from './api';
import { accessResultCopy, useAccessResult, type AccessResult } from './client-live-updates';
import { Button, ErrorBanner, IconButton } from '@/components/sirid';
import { makeStyles } from '@/theme/make-styles';
import { useTheme } from '@/theme/theme-provider';
import { radius, space } from '@/theme/tokens';

import { QrPass } from './qr-pass';

type QrResponse = { qrToken: string; expiresAt: string };

export default function ClientAccessModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const styles = useStyles();
  const [qr, setQr] = useState<QrResponse | null>(null);
  const [now, setNow] = useState(0);
  const [issuedAt, setIssuedAt] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<AccessResult | null>(null);

  // A scanned code is spent: show what the reader decided and get a fresh code right away.
  useAccessResult((recorded) => {
    if (!visible) return;
    setResult(recorded);
    setRetry((value) => value + 1);
  });

  useEffect(() => {
    if (!result) return undefined;
    const timer = setTimeout(() => setResult(null), 6000);
    return () => clearTimeout(timer);
  }, [result]);

  useEffect(() => {
    if (!visible) return undefined;
    let current = true;
    let refresh: ReturnType<typeof setTimeout>;

    async function generate() {
      setLoading(true);
      try {
        const response = await api.post<QrResponse>('/access/qr');
        if (current) {
          const fetchedAt = Date.now();
          setQr(response.data);
          setNow(fetchedAt);
          setIssuedAt(fetchedAt);
          setError('');
        }
      } catch (requestError) {
        if (current) setError(getApiErrorMessage(requestError, 'No se pudo generar el código QR.'));
      } finally {
        if (current) {
          setLoading(false);
          refresh = setTimeout(() => void generate(), 45000);
        }
      }
    }

    void generate();
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      current = false;
      clearTimeout(refresh);
      clearInterval(clock);
    };
  }, [visible, retry]);

  const expiresAt = qr ? new Date(qr.expiresAt).getTime() : 0;
  const remaining = qr ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : 0;
  const total = qr ? Math.max(1, Math.ceil((expiresAt - issuedAt) / 1000)) : 0;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>Acceso</Text>
            <Text style={styles.title}>Tu pase QR</Text>
          </View>
          <IconButton icon="close" label="Cerrar acceso QR" onPress={onClose} />
        </View>

        <View style={styles.center}>
          {result ? <AccessResultPanel result={result} /> : null}
          <QrPass token={qr?.qrToken ?? null} remaining={remaining} total={total} size={250} loading={loading} dimmed={Boolean(result)} />
          <Text style={styles.hint}>Presenta el código al lector de entrada. Solo puede usarse una vez.</Text>
          {error ? <ErrorBanner message={error} onRetry={() => setRetry((value) => value + 1)} /> : null}
        </View>

        <Button variant="secondary" size="large" onPress={onClose}>Listo</Button>
      </SafeAreaView>
    </Modal>
  );
}

function AccessResultPanel({ result }: { result: AccessResult }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const copy = accessResultCopy(result);
  const denied = result.event === 'denied';
  return (
    <View accessibilityRole="alert" accessibilityLabel={`${copy.title}. ${copy.detail ?? ''}`} style={[styles.result, denied && styles.resultDenied]}>
      <MaterialIcons name={denied ? 'block' : result.event === 'check-in' ? 'login' : 'logout'} size={28} color={denied ? colors.danger : colors.accent} />
      <View style={styles.resultText}>
        <Text style={styles.resultTitle}>{copy.title}</Text>
        {copy.detail ? <Text style={styles.resultDetail}>{copy.detail}</Text> : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  headerText: { flex: 1, gap: 2 },
  eyebrow: { color: colors.accent, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  title: { color: colors.text, fontSize: 34, lineHeight: 38, fontWeight: '800', fontFamily: 'display' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: space.xl },
  result: { width: '100%', maxWidth: 360, flexDirection: 'row', alignItems: 'center', gap: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.success, backgroundColor: colors.successSoft, padding: space.lg },
  resultDenied: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  resultText: { flex: 1, gap: 3 },
  resultTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  resultDetail: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  hint: { maxWidth: 300, color: colors.textSecondary, fontSize: 14, lineHeight: 20, textAlign: 'center' },
}));
