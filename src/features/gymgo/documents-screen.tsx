import { MaterialIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Redirect, router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { connectSocket } from '@/services/socket';

import { api, getApiErrorMessage } from './api';
import { useAuth } from './auth-context';
import { IconBadge } from './fit-ui';
import { palette } from './theme';
import { Notice, Page, Surface } from './ui';

type DocumentCategory = 'student_id' | 'other';
type DocumentStatus = 'pending' | 'verified' | 'rejected';
type ClientDocument = {
  id: string;
  category: DocumentCategory;
  originalName: string;
  mimeType: string;
  size: number;
  status: DocumentStatus;
  rejectionReason?: string;
  validUntil?: string | null;
  createdAt: string;
};
// What the API needs for a multipart file: a File on web, a { uri, name, type } descriptor on phones.
type PickedFile = { uri: string; name: string; type: string; file?: File };

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const CATEGORIES: { value: DocumentCategory; label: string; hint: string }[] = [
  { value: 'student_id', label: 'Credencial de estudiante', hint: 'Desbloquea promociones y planes para estudiantes.' },
  { value: 'other', label: 'Otro documento', hint: 'Cualquier documento que te pida tu gimnasio.' },
];

const STATUS: Record<DocumentStatus, { label: string; color: string; icon: keyof typeof MaterialIcons.glyphMap }> = {
  pending: { label: 'En revisión', color: '#FFD54F', icon: 'schedule' },
  verified: { label: 'Verificado', color: '#10FF85', icon: 'verified' },
  rejected: { label: 'Rechazado', color: '#FF6B6B', icon: 'cancel' },
};

function categoryLabel(category: DocumentCategory) {
  return CATEGORIES.find((entry) => entry.value === category)?.label ?? 'Documento';
}

function formatDate(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('es-MX');
}

async function pickFromCamera(): Promise<PickedFile | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new Error('Se necesita permiso para usar la cámara.');
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
  return result.canceled ? null : fromImageAsset(result.assets[0]);
}

async function pickFromGallery(): Promise<PickedFile | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error('Se necesita permiso para acceder a tus fotos.');
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
  return result.canceled ? null : fromImageAsset(result.assets[0]);
}

async function pickPdf(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (asset.size && asset.size > MAX_FILE_SIZE) throw new Error('El archivo supera el tamaño máximo de 10 MB.');
  return { uri: asset.uri, name: asset.name, type: asset.mimeType ?? 'application/pdf', file: asset.file };
}

function fromImageAsset(asset: ImagePicker.ImagePickerAsset): PickedFile {
  if (asset.fileSize && asset.fileSize > MAX_FILE_SIZE) throw new Error('La foto supera el tamaño máximo de 10 MB.');
  const type = asset.mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
  return { uri: asset.uri, name: asset.fileName ?? `documento.${type === 'image/png' ? 'png' : 'jpg'}`, type, file: asset.file };
}

export default function DocumentsScreen() {
  const { user } = useAuth();
  if (user?.role !== 'Cliente') return <Redirect href="/(main)" />;
  return <ClientDocuments />;
}

function ClientDocuments() {
  const [documents, setDocuments] = useState<ClientDocument[]>([]);
  const [category, setCategory] = useState<DocumentCategory>('student_id');
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [reloadNumber, setReloadNumber] = useState(0);

  useEffect(() => {
    let isCurrent = true;
    api.get<{ documents: ClientDocument[] }>('/documents/me')
      .then((response) => {
        if (isCurrent) setDocuments(response.data.documents);
      })
      .catch((requestError: unknown) => {
        if (isCurrent) setError(getApiErrorMessage(requestError, 'No se pudieron cargar tus documentos.'));
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });
    return () => { isCurrent = false; };
  }, [reloadNumber]);

  // Reception's verification shows up without reloading the screen.
  useEffect(() => {
    const socket = connectSocket();
    const refresh = () => setReloadNumber((value) => value + 1);
    socket.on('document-updated', refresh);
    return () => { socket.off('document-updated', refresh); };
  }, []);

  async function upload(pick: () => Promise<PickedFile | null>) {
    setError('');
    setSuccess('');
    let picked: PickedFile | null;
    try {
      picked = await pick();
    } catch (pickError) {
      setError(pickError instanceof Error ? pickError.message : 'No se pudo abrir el archivo.');
      return;
    }
    if (!picked) return;

    const form = new FormData();
    form.append('category', category);
    if (picked.file) form.append('file', picked.file, picked.name);
    else form.append('file', { uri: picked.uri, name: picked.name, type: picked.type } as unknown as Blob);

    setIsUploading(true);
    try {
      const response = await api.post<{ document: ClientDocument }>('/documents', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        transformRequest: (data) => data,
      });
      setDocuments((current) => [response.data.document, ...current]);
      setSuccess('Documento enviado. Recepción lo revisará pronto.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No se pudo subir el documento.'));
    } finally {
      setIsUploading(false);
    }
  }

  async function openDocument(document: ClientDocument) {
    setBusyId(document.id);
    try {
      const response = await api.get<{ url: string }>(`/documents/${document.id}/url`);
      await WebBrowser.openBrowserAsync(response.data.url);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No se pudo abrir el documento.'));
    } finally {
      setBusyId(null);
    }
  }

  function confirmDelete(document: ClientDocument) {
    Alert.alert(
      'Eliminar documento',
      `"${document.originalName}" se destruirá de forma permanente y no podrás recuperarlo.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            setBusyId(document.id);
            api.delete(`/documents/${document.id}`)
              .then(() => setDocuments((current) => current.filter((entry) => entry.id !== document.id)))
              .catch((requestError: unknown) => setError(getApiErrorMessage(requestError, 'No se pudo eliminar el documento.')))
              .finally(() => setBusyId(null));
          },
        },
      ],
    );
  }

  function confirmPurgeAll() {
    Alert.alert(
      'Eliminar todos mis documentos',
      'Se destruirán de forma permanente todos los documentos que has subido, en todos tus gimnasios. Perderás las promociones que dependan de ellos.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar todo',
          style: 'destructive',
          onPress: () => {
            setIsUploading(true);
            api.post<{ purged: number }>('/documents/me/purge')
              .then((response) => {
                setDocuments([]);
                setSuccess(response.data.purged ? 'Tus documentos fueron destruidos.' : 'No tenías documentos guardados.');
              })
              .catch((requestError: unknown) => setError(getApiErrorMessage(requestError, 'No se pudieron eliminar tus documentos.')))
              .finally(() => setIsUploading(false));
          },
        },
      ],
    );
  }

  const selectedCategory = CATEGORIES.find((entry) => entry.value === category);

  return (
    <Page dark>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver al perfil"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => { if (router.canGoBack()) { router.back(); } else { router.push('/(main)/billing'); } }}>
          <IconBadge name="arrow-back" color="#FFFFFF" />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Mis documentos</Text>
          <Text style={styles.headerDetail}>Solo tú y el personal de recepción pueden verlos.</Text>
        </View>
      </View>

      {error ? <Notice error>{error}</Notice> : null}
      {success ? <Notice>{success}</Notice> : null}

      <Surface style={styles.uploadCard}>
        <Text style={styles.sectionLabel}>SUBIR DOCUMENTO</Text>
        <View style={styles.chips}>
          {CATEGORIES.map((entry) => (
            <Pressable
              key={entry.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: entry.value === category }}
              onPress={() => setCategory(entry.value)}
              style={[styles.chip, entry.value === category && styles.chipSelected]}>
              <Text style={[styles.chipText, entry.value === category && styles.chipTextSelected]}>{entry.label}</Text>
            </Pressable>
          ))}
        </View>
        {selectedCategory ? <Text style={styles.hint}>{selectedCategory.hint}</Text> : null}
        <View style={styles.sources}>
          <SourceButton icon="photo-camera" label="Cámara" disabled={isUploading} onPress={() => void upload(pickFromCamera)} />
          <SourceButton icon="photo-library" label="Galería" disabled={isUploading} onPress={() => void upload(pickFromGallery)} />
          <SourceButton icon="picture-as-pdf" label="PDF" disabled={isUploading} onPress={() => void upload(pickPdf)} />
        </View>
        {isUploading ? <ActivityIndicator color={palette.neon} /> : <Text style={styles.hint}>PDF, JPG o PNG de hasta 10 MB.</Text>}
      </Surface>

      <Text style={styles.sectionLabel}>MIS ARCHIVOS</Text>
      {isLoading ? <ActivityIndicator color={palette.neon} size="large" /> : null}
      {!isLoading && documents.length === 0 ? (
        <Text style={styles.empty}>Todavía no has subido documentos.</Text>
      ) : null}
      {documents.map((document) => {
        const status = STATUS[document.status];
        const validUntil = formatDate(document.validUntil);
        return (
          <Surface key={document.id} style={styles.documentCard}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Ver ${document.originalName}`}
              disabled={busyId === document.id}
              onPress={() => void openDocument(document)}
              style={styles.documentMain}>
              <MaterialIcons name={document.mimeType === 'application/pdf' ? 'picture-as-pdf' : 'image'} size={28} color="#A1A1AA" />
              <View style={styles.documentText}>
                <Text numberOfLines={1} style={styles.documentName}>{document.originalName}</Text>
                <Text style={styles.documentMeta}>{categoryLabel(document.category)} · {formatDate(document.createdAt)}</Text>
                <View style={styles.statusRow}>
                  <MaterialIcons name={status.icon} size={14} color={status.color} />
                  <Text style={[styles.statusText, { color: status.color }]}>
                    {status.label}{document.status === 'verified' && validUntil ? ` hasta ${validUntil}` : ''}
                  </Text>
                </View>
                {document.status === 'rejected' && document.rejectionReason ? (
                  <Text style={styles.rejection}>Motivo: {document.rejectionReason}. Sube uno nuevo.</Text>
                ) : null}
              </View>
            </Pressable>
            {busyId === document.id ? <ActivityIndicator color={palette.neon} /> : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Eliminar ${document.originalName}`}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                onPress={() => confirmDelete(document)}>
                <MaterialIcons name="delete-outline" size={22} color="#A1A1AA" />
              </Pressable>
            )}
          </Surface>
        );
      })}

      <Pressable accessibilityRole="button" disabled={isUploading} onPress={confirmPurgeAll} style={styles.purge}>
        <Text style={styles.purgeText}>Eliminar todos mis documentos</Text>
      </Pressable>
    </Page>
  );
}

function SourceButton({ icon, label, onPress, disabled }: { icon: keyof typeof MaterialIcons.glyphMap; label: string; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Subir desde ${label}`}
      disabled={disabled}
      onPress={() => { void Haptics.selectionAsync(); onPress(); }}
      style={({ pressed }) => [styles.source, disabled && styles.disabled, pressed && styles.pressed]}>
      <MaterialIcons name={icon} size={24} color="#10FF85" />
      <Text style={styles.sourceText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#27272A' },
  headerText: { flex: 1, gap: 4 },
  headerTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  headerDetail: { color: '#A1A1AA', fontSize: 13 },
  uploadCard: { gap: 12 },
  sectionLabel: { color: '#A1A1AA', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 36, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: '#3F3F46', paddingHorizontal: 14 },
  chipSelected: { borderColor: '#10FF85', backgroundColor: 'rgba(16, 255, 133, 0.12)' },
  chipText: { color: '#D4D4D8', fontSize: 13, fontWeight: '700' },
  chipTextSelected: { color: '#10FF85' },
  hint: { color: '#A1A1AA', fontSize: 12 },
  sources: { flexDirection: 'row', gap: 10 },
  source: { flex: 1, minHeight: 72, alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 16, backgroundColor: '#27272A' },
  sourceText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.97 }] },
  empty: { color: '#A1A1AA', fontSize: 14, textAlign: 'center', paddingVertical: 16 },
  documentCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  documentMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  documentText: { flex: 1, gap: 3 },
  documentName: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  documentMeta: { color: '#A1A1AA', fontSize: 12 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusText: { fontSize: 12, fontWeight: '800' },
  rejection: { color: '#FCA5A5', fontSize: 12 },
  purge: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
  purgeText: { color: '#FF6B6B', fontSize: 14, fontWeight: '700' },
});
