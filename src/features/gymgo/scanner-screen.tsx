import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Redirect, useIsFocused } from 'expo-router';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/sirid';
import * as Haptics from '@/hooks/haptics';

import { api, getApiErrorMessage } from './api';
import { useAuth } from './auth-context';
import { makeStyles } from '@/theme/make-styles';
import { useTheme } from '@/theme/theme-provider';
import { radius, space } from '@/theme/tokens';

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
  const styles = useStyles();
  const { colors } = useTheme();
  const { user } = useAuth();
  const isFocused = useIsFocused();
  const [permission, requestPermission] = useCameraPermissions();
  const [scannerEnabled, setScannerEnabled] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [cameraError, setCameraError] = useState('');
  const scanLocked = useRef(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  if (user?.role !== 'Admin' && user?.role !== 'Recepcion') return <Redirect href="/(main)" />;

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
        deviceId: 'app-recepcion',
      });
      const { event, userName } = response.data.access;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setResult({
        kind: 'success',
        event,
        message: `${event === 'check-in' ? 'Entrada' : 'Salida'} registrada: ${userName || 'Cliente'}`,
      });
    } catch (error) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
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
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.permissionText}>Comprobando permiso de cámara…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionScreen}>
        <View style={styles.permissionContent}>
          <View style={styles.permissionIcon}><MaterialIcons name="photo-camera" size={36} color={colors.accent} /></View>
          <Text style={styles.permissionEyebrow}>Escáner de recepción</Text>
          <Text style={styles.permissionTitle}>Permite el acceso a la cámara</Text>
          <Text style={styles.permissionText}>
            GymGo necesita la cámara trasera para leer el QR de acceso de los clientes.
          </Text>
          <Button size="large" icon="photo-camera" onPress={() => void requestPermission()}>Permitir cámara</Button>
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

      <View style={[styles.topOverlay, { paddingTop: insets.top + space.md }]}>
        <Text style={styles.cameraEyebrow}>Recepción</Text>
        <Text style={styles.cameraTitle}>Escanear acceso</Text>
        <Text style={styles.cameraSubtitle}>Lector de entrada y salida · solo códigos QR</Text>
      </View>

      <View pointerEvents="none" style={styles.scanGuide}>
        <ScanFrame state={result?.kind ?? (isProcessing ? 'processing' : 'idle')} />
        <Text style={styles.guideText}>Centra el código QR dentro del marco</Text>
      </View>

      <View style={styles.bottomOverlay}>
        {cameraError ? (
          <View style={[styles.resultPanel, styles.resultError]}>
            <MaterialIcons name="videocam-off" size={26} color={CAMERA.danger} />
            <Text style={styles.resultMessage}>{cameraError}</Text>
          </View>
        ) : null}
        {isProcessing ? (
          <View style={styles.processing}>
            <ActivityIndicator color={CAMERA.volt} />
            <Text style={styles.processingText}>Validando acceso…</Text>
          </View>
        ) : null}
        {result ? (
          <View accessibilityRole="alert" style={[styles.resultPanel, result.kind === 'error' && styles.resultError]}>
            <MaterialIcons
              name={result.kind === 'success' ? (result.event === 'check-out' ? 'logout' : 'login') : 'error-outline'}
              size={30}
              color={result.kind === 'success' ? CAMERA.volt : CAMERA.danger}
            />
            <View style={styles.resultText}>
              <Text style={styles.resultMessage}>{result.message}</Text>
              <Text style={styles.resultHint}>El escáner se reactivará en 3 segundos.</Text>
            </View>
          </View>
        ) : !isProcessing && !cameraError ? (
          <View style={styles.secureRow}>
            <MaterialIcons name="verified-user" size={16} color={CAMERA.muted} />
            <Text style={styles.secureLabel}>Lector administrativo · sesión segura</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** The camera UI is always dark, in both themes, so it uses a fixed palette. */
const CAMERA = {
  scrim: 'rgba(6, 10, 8, 0.82)',
  text: '#F1F5F2',
  muted: '#A9B7AF',
  volt: '#10FF85',
  danger: '#FF6B5E',
};

function ScanFrame({ state }: { state: 'idle' | 'processing' | 'success' | 'error' }) {
  const styles = useStyles();
  const reduceMotion = useReducedMotion();
  const line = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    line.set(withRepeat(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.quad) }), -1, true));
  }, [line, reduceMotion]);
  const lineStyle = useAnimatedStyle(() => ({ transform: [{ translateY: line.value * 236 }] }));
  const color = state === 'success' ? CAMERA.volt : state === 'error' ? CAMERA.danger : CAMERA.text;
  return (
    <View style={styles.scanFrame}>
      <View style={[styles.corner, styles.cornerTL, { borderColor: color }]} />
      <View style={[styles.corner, styles.cornerTR, { borderColor: color }]} />
      <View style={[styles.corner, styles.cornerBL, { borderColor: color }]} />
      <View style={[styles.corner, styles.cornerBR, { borderColor: color }]} />
      {state === 'idle' && !reduceMotion ? <Animated.View style={[styles.scanLine, lineStyle]} /> : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  screen: { flex: 1, backgroundColor: '#000000', justifyContent: 'space-between' },
  permissionScreen: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: space.xxl, gap: space.lg },
  permissionContent: { width: '100%', maxWidth: 430, gap: space.lg, alignItems: 'stretch' },
  permissionIcon: { alignSelf: 'center', width: 76, height: 76, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft },
  permissionEyebrow: { color: colors.accent, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', textAlign: 'center' },
  permissionTitle: { color: colors.text, fontSize: 30, lineHeight: 34, fontWeight: '800', fontFamily: 'display', textAlign: 'center' },
  permissionText: { color: colors.textSecondary, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  permissionHint: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, textAlign: 'center' },
  topOverlay: { paddingHorizontal: space.xl, paddingBottom: space.lg, backgroundColor: CAMERA.scrim, gap: 2 },
  cameraEyebrow: { color: CAMERA.volt, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  cameraTitle: { color: CAMERA.text, fontSize: 32, lineHeight: 36, fontWeight: '800', fontFamily: 'display' },
  cameraSubtitle: { color: CAMERA.muted, fontSize: 14 },
  scanGuide: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: space.xl },
  scanFrame: { width: 260, height: 260, maxWidth: '72%', overflow: 'hidden' },
  corner: { position: 'absolute', width: 44, height: 44, borderWidth: 0 },
  cornerTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 22 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 22 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 22 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 22 },
  scanLine: { position: 'absolute', left: 16, right: 16, top: 12, height: 2, borderRadius: 1, backgroundColor: CAMERA.volt, opacity: 0.85 },
  guideText: { color: CAMERA.text, backgroundColor: CAMERA.scrim, overflow: 'hidden', borderRadius: radius.pill, paddingHorizontal: space.lg, paddingVertical: space.sm, fontSize: 14, fontWeight: '600' },
  bottomOverlay: { minHeight: 132, paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.xl, gap: space.md, backgroundColor: CAMERA.scrim, justifyContent: 'center' },
  processing: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  processingText: { color: CAMERA.text, fontSize: 16, fontWeight: '600' },
  resultPanel: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(16,255,133,0.5)', backgroundColor: 'rgba(16,255,133,0.12)', padding: space.lg },
  resultError: { borderColor: 'rgba(255,107,94,0.55)', backgroundColor: 'rgba(255,107,94,0.14)' },
  resultText: { flex: 1, gap: 2 },
  resultMessage: { flex: 1, color: CAMERA.text, fontSize: 17, fontWeight: '700' },
  resultHint: { color: CAMERA.muted, fontSize: 13 },
  secureRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  secureLabel: { color: CAMERA.muted, fontSize: 13, fontWeight: '600' },
}));
