import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { getApiErrorMessage } from './api';
import { useAuth } from './auth-context';
import { ActionButton, Eyebrow, Field, Heading, Notice, Page } from './ui';

// Same alphabet and length as the API (api/src/utils/access-codes.js).
const JOIN_CODE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;

function normalizeCode(value: string) {
  return value.toUpperCase().replace(/[\s-]/g, '');
}

// The printed QR holds a link to this screen (projectgymgo://join-gym?code=...); a plain code is accepted too.
function codeFromQr(data: string) {
  const fromLink = /[?&]code=([^&#]+)/.exec(data)?.[1];
  return normalizeCode(fromLink ? decodeURIComponent(fromLink) : data);
}

export default function JoinGymScreen() {
  const { user, gyms, needsGym, joinGym, signOut } = useAuth();
  const params = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState(() => normalizeCode(params.code ?? ''));
  const [isScanning, setIsScanning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [permission, requestPermission] = useCameraPermissions();
  const scanLocked = useRef(false);

  if (!user) return <Redirect href="/(auth)/login" />;

  async function submit(value = code) {
    const normalized = normalizeCode(value);
    setError('');
    if (!JOIN_CODE.test(normalized)) {
      setError('El código tiene 8 letras y números. Pídelo en la recepción de tu gimnasio.');
      return;
    }
    setIsSubmitting(true);
    try {
      const { gym, alreadyMember } = await joinGym(normalized);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        alreadyMember ? 'Ya eras miembro' : `Bienvenido a ${gym.name}`,
        alreadyMember
          ? `Cambiaste a ${gym.name}.`
          : 'Pasa a recepción para activar tu membresía y poder entrar con tu QR.',
      );
      router.replace('/(main)');
    } catch (requestError: unknown) {
      setError(getApiErrorMessage(requestError, 'No se pudo unir al gimnasio.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function startScanning() {
    setError('');
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        setError('Sin permiso de cámara puedes escribir el código a mano.');
        return;
      }
    }
    scanLocked.current = false;
    setIsScanning(true);
  }

  function handleBarcodeScanned({ data }: BarcodeScanningResult) {
    if (scanLocked.current) return;
    scanLocked.current = true;
    setIsScanning(false);
    const scanned = codeFromQr(data);
    setCode(scanned);
    void submit(scanned);
  }

  return (
    <Page dark>
      <View style={styles.header}>
        <Eyebrow>{needsGym ? 'BIENVENIDO A GYMGO' : 'OTRO GIMNASIO'}</Eyebrow>
        {needsGym ? (
          <Pressable accessibilityRole="button" onPress={() => void signOut()} style={styles.headerAction}>
            <Text style={styles.headerActionText}>Salir</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.headerAction}>
            <Text style={styles.headerActionText}>Volver</Text>
          </Pressable>
        )}
      </View>

      <Heading detail="Escanea el QR que está en la recepción o escribe el código que te den ahí.">
        Únete a tu gimnasio
      </Heading>

      {isScanning ? (
        <View style={styles.cameraBox}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={handleBarcodeScanned}
            onMountError={(event) => {
              setIsScanning(false);
              setError(event.message);
            }}
          />
          <View pointerEvents="none" style={styles.scanFrame} />
        </View>
      ) : null}

      <ActionButton secondary onPress={() => (isScanning ? setIsScanning(false) : void startScanning())} disabled={isSubmitting}>
        {isScanning ? 'Cancelar escaneo' : 'Escanear QR'}
      </ActionButton>

      <Field
        label="Código del gimnasio"
        value={code}
        onChangeText={(value) => setCode(normalizeCode(value).slice(0, 8))}
        placeholder="Ej. K7M2QX9P"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={10}
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
      />

      {error ? <Notice error>{error}</Notice> : null}

      <ActionButton onPress={() => void submit()} disabled={isSubmitting || code.length === 0}>
        {isSubmitting ? 'Uniendo…' : 'Unirme'}
      </ActionButton>
      {isSubmitting ? <ActivityIndicator color="#10FF85" /> : null}

      {gyms.length > 0 ? (
        <Text style={styles.hint}>Tus gimnasios actuales no cambian: podrás elegir entre ellos desde el inicio.</Text>
      ) : null}
    </Page>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerAction: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: '#27272A', backgroundColor: '#18181B' },
  headerActionText: { color: '#10FF85', fontSize: 13, fontWeight: '800' },
  cameraBox: { height: 280, borderRadius: 16, overflow: 'hidden', backgroundColor: '#101B18', alignItems: 'center', justifyContent: 'center' },
  scanFrame: { width: 190, height: 190, borderWidth: 3, borderColor: '#9BFF63', borderRadius: 18 },
  hint: { color: '#A1A1AA', fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
