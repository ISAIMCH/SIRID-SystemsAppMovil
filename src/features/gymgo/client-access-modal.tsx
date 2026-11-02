import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api, getApiErrorMessage } from './api';
import { accessResultCopy, useAccessResult, type AccessResult } from './client-live-updates';

type QrResponse = { qrToken: string; expiresAt: string };

export default function ClientAccessModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [qr, setQr] = useState<QrResponse | null>(null);
  const [now, setNow] = useState(0);
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
          setQr(response.data);
          setNow(Date.now());
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

  const remaining = qr ? Math.max(0, Math.ceil((new Date(qr.expiresAt).getTime() - now) / 1000)) : 0;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" statusBarTranslucent onRequestClose={onClose}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>GYMGO · ACCESO</Text>
            <Text style={styles.title}>Tu pase QR</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar acceso QR" onPress={onClose} style={styles.closeButton}>
            <MaterialIcons name="close" size={24} color="#F4F8F5" />
          </Pressable>
        </View>

        <View style={styles.center}>
          {result ? <AccessResultPanel result={result} /> : null}
          <View style={[styles.qrFrame, result ? styles.qrFrameDimmed : null]}>
            {qr && remaining > 0 ? (
              <QRCode value={qr.qrToken} size={250} quietZone={12} color="#081009" backgroundColor="#FFFFFF" />
            ) : <ActivityIndicator color="#9BFF63" size="large" />}
          </View>
          <View style={styles.status}>
            <View style={[styles.statusDot, remaining > 0 && styles.statusReady]} />
            <Text style={styles.statusText}>{remaining > 0 ? 'Código vigente' : loading ? 'Generando código' : 'Código renovándose'}</Text>
            {remaining > 0 ? <Text style={styles.countdown}>{remaining}s</Text> : null}
          </View>
          <Text style={styles.hint}>Presenta el código al lector de entrada. Solo puede usarse una vez.</Text>
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable accessibilityRole="button" onPress={() => setRetry((value) => value + 1)} style={styles.retryButton}>
                <Text style={styles.retryText}>Reintentar</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        <Pressable accessibilityRole="button" onPress={onClose} style={styles.closeCta}>
          <Text style={styles.closeCtaText}>Cerrar</Text>
        </Pressable>
      </SafeAreaView>
    </Modal>
  );
}

function AccessResultPanel({ result }: { result: AccessResult }) {
  const copy = accessResultCopy(result);
  const denied = result.event === 'denied';
  return (
    <View accessibilityRole="alert" accessibilityLabel={`${copy.title}. ${copy.detail ?? ''}`} style={[styles.result, denied && styles.resultDenied]}>
      <MaterialIcons name={denied ? 'block' : result.event === 'check-in' ? 'login' : 'logout'} size={28} color={denied ? '#FF978B' : '#9BFF63'} />
      <View style={styles.resultText}>
        <Text style={styles.resultTitle}>{copy.title}</Text>
        {copy.detail ? <Text style={styles.resultDetail}>{copy.detail}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#070B09', paddingHorizontal: 22, paddingTop: 10, paddingBottom: 18 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerText: { flex: 1, gap: 4 },
  eyebrow: { color: '#9BFF63', fontSize: 10, fontWeight: '900' },
  title: { color: '#F4F8F5', fontSize: 26, fontWeight: '900' },
  closeButton: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: '#17211C', borderWidth: 1, borderColor: '#27342E' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 20 },
  qrFrame: { width: 290, height: 290, borderRadius: 28, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#9BFF63', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.22, shadowRadius: 24, elevation: 10 },
  qrFrameDimmed: { opacity: 0.35 },
  result: { width: '100%', maxWidth: 340, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderWidth: 1, borderColor: '#2E5A3A', backgroundColor: '#12201A', padding: 14 },
  resultDenied: { borderColor: '#5A2A26', backgroundColor: '#211311' },
  resultText: { flex: 1, gap: 3 },
  resultTitle: { color: '#F4F8F5', fontSize: 16, fontWeight: '900' },
  resultDetail: { color: '#B8C4BC', fontSize: 13, lineHeight: 18 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#FF8A3D' },
  statusReady: { backgroundColor: '#9BFF63' },
  statusText: { color: '#DCE8E0', fontSize: 13, fontWeight: '700' },
  countdown: { color: '#9BFF63', fontSize: 13, fontWeight: '900' },
  hint: { maxWidth: 300, color: '#91A098', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  errorBox: { alignItems: 'center', gap: 8 },
  errorText: { color: '#FF978B', fontSize: 12, textAlign: 'center' },
  retryButton: { paddingHorizontal: 14, paddingVertical: 8 },
  retryText: { color: '#9BFF63', fontSize: 13, fontWeight: '800' },
  closeCta: { minHeight: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#9BFF63' },
  closeCtaText: { color: '#081009', fontSize: 15, fontWeight: '900' },
});
