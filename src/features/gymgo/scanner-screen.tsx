import { useEffect, useRef, useState } from 'react';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Redirect, useIsFocused } from 'expo-router';

import { api, getApiErrorMessage } from './api';
import { useAuth } from './auth-context';
import { ActionButton, AppHeader, Notice } from './ui';
import { palette } from './theme';

type ScanResult = { kind: 'success' | 'error'; message: string; event?: 'check-in' | 'check-out' };
type AccessResponse = {
  accepted: true;
  access: {
    event: 'check-in' | 'check-out';
    occurredAt: string;
    userId: string;
    userName: string;
  };
};

function extractQrToken(data: string) {
  try {
    const parsed: unknown = JSON.parse(data);
    if (parsed && typeof parsed === 'object' && 'qrToken' in parsed && typeof parsed.qrToken === 'string') {
      return parsed.qrToken;
    }
  } catch {
    return data.trim();
  }
  return data.trim();
}

export default function ScannerScreen() {
  const { user } = useAuth();
  const isFocused = useIsFocused();
  const [permission, requestPermission] = useCameraPermissions();
  const [scannerEnabled, setScannerEnabled] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [cameraError, setCameraError] = useState('');
  const scanLocked = useRef(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  if (user?.role !== 'Admin') return <Redirect href="/(main)" />;

  async function handleBarcodeScanned(scanningResult: BarcodeScanningResult) {
    if (scanLocked.current) return;
    scanLocked.current = true;
    setScannerEnabled(false);
    setIsProcessing(true);
    setResult(null);
    setCameraError('');

    try {
      const qrToken = extractQrToken(scanningResult.data);
      if (!qrToken) throw new Error('El código QR está vacío.');

      const response = await api.post<AccessResponse>('/iot/access', {
        qrToken,
        deviceId: 'admin-reception-simulator',
      });
      const { event, userName } = response.data.access;
      setResult({
        kind: 'success',
        event,
        message: `${event === 'check-in' ? 'Entrada' : 'Salida'} registrada: ${userName || 'Cliente'}`,
      });
    } catch (error) {
      setResult({ kind: 'error', message: getApiErrorMessage(error, 'QR inválido o expirado.') });
    } finally {
      setIsProcessing(false);
      resetTimer.current = setTimeout(() => {
        setResult(null);
        setScannerEnabled(true);
        scanLocked.current = false;
      }, 3000);
    }
  }

  if (!permission) {
    return (
      <View style={styles.permissionScreen}>
        <ActivityIndicator color={palette.lime} size="large" />
        <Text style={styles.permissionText}>Comprobando permiso de cámara…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionScreen}>
        <View style={styles.permissionContent}>
          <Text style={styles.permissionEyebrow}>ESCÁNER DE RECEPCIÓN</Text>
          <Text style={styles.permissionTitle}>Permite el acceso a la cámara</Text>
          <Text style={styles.permissionText}>
            GymGo necesita la cámara trasera para leer el QR de acceso de los clientes.
          </Text>
          <ActionButton onPress={() => void requestPermission()}>Permitir cámara</ActionButton>
          {!permission.canAskAgain ? (
            <Text style={styles.permissionHint}>El permiso está bloqueado. Habilita la cámara para GymGo desde la configuración del dispositivo.</Text>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {isFocused ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={scannerEnabled ? handleBarcodeScanned : undefined}
          onMountError={(event) => setCameraError(event.message)}
        />
      ) : null}

      <View style={styles.topOverlay}>
        <AppHeader title="Escáner de recepción" detail="Simulación de lector IoT · Solo códigos QR" />
      </View>

      <View pointerEvents="none" style={styles.scanGuide}>
        <View style={styles.scanFrame} />
        <Text style={styles.guideText}>Centra el código QR dentro del marco</Text>
      </View>

      <View style={styles.bottomOverlay}>
        {cameraError ? <Notice error>{cameraError}</Notice> : null}
        {isProcessing ? (
          <View style={styles.processing}>
            <ActivityIndicator color={palette.lime} />
            <Text style={styles.processingText}>Validando acceso…</Text>
          </View>
        ) : null}
        {result ? (
          <View style={[styles.resultPanel, result.kind === 'error' && styles.resultError]}>
            <Text style={styles.resultSymbol}>{result.kind === 'success' ? '✓' : '!'}</Text>
            <Text style={styles.resultMessage}>{result.message}</Text>
            <Text style={styles.resultHint}>El escáner se reactivará en 3 segundos.</Text>
          </View>
        ) : (
          <Text style={styles.secureLabel}>LECTOR ADMINISTRATIVO · SESIÓN SEGURA</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#101B18', justifyContent: 'space-between' },
  permissionScreen: { flex: 1, backgroundColor: palette.deepGreen, alignItems: 'center', justifyContent: 'center', padding: 24 },
  permissionContent: { width: '100%', maxWidth: 430, gap: 16 },
  permissionEyebrow: { color: palette.lime, fontSize: 11, fontWeight: '800' },
  permissionTitle: { color: palette.white, fontSize: 28, lineHeight: 34, fontWeight: '800' },
  permissionText: { color: '#E2E9E1', fontSize: 14, lineHeight: 21, textAlign: 'center' },
  permissionHint: { color: '#D5DFD4', fontSize: 12, lineHeight: 18, textAlign: 'center' },
  topOverlay: { paddingTop: 58, paddingHorizontal: 18, paddingBottom: 16, backgroundColor: 'rgba(16,27,24,0.88)' },
  scanGuide: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 18 },
  scanFrame: { width: 260, height: 260, maxWidth: '72%', borderWidth: 3, borderColor: palette.lime, borderRadius: 20, backgroundColor: 'transparent' },
  guideText: { color: palette.white, backgroundColor: 'rgba(16,27,24,0.72)', overflow: 'hidden', borderRadius: 7, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, fontWeight: '700' },
  bottomOverlay: { minHeight: 118, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 34, gap: 10, backgroundColor: 'rgba(16,27,24,0.9)' },
  processing: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  processingText: { color: palette.white, fontSize: 14, fontWeight: '700' },
  resultPanel: { alignItems: 'center', gap: 5, borderRadius: 9, backgroundColor: '#DDEFD9', paddingHorizontal: 14, paddingVertical: 12 },
  resultError: { backgroundColor: '#F4DDD6' },
  resultSymbol: { color: palette.green, fontSize: 21, fontWeight: '900' },
  resultMessage: { color: palette.ink, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  resultHint: { color: palette.muted, fontSize: 11, textAlign: 'center' },
  secureLabel: { color: '#D5DFD4', fontSize: 10, fontWeight: '800', textAlign: 'center' },
});