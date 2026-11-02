import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { router } from 'expo-router';

import { connectSocket } from '@/services/socket';

import { api, getApiErrorMessage } from './api';
import { useAuth } from './auth-context';
import { IconBadge } from './fit-ui';
import { palette } from './theme';
import { ActionButton, AppHeader, Field, Notice, Page, SectionTitle, Surface } from './ui';

type Equipment = { _id: string; name: string; zone: string; status: 'available' | 'busy' | 'out_of_service' };
type MaintenanceReport = {
  _id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'resolved';
  createdAt: string;
  equipment: { _id: string; name: string; zone: string; status: Equipment['status'] };
  reportedBy: { _id: string; name: string; email?: string };
  adminNote?: string;
};

const reportStatus: Record<MaintenanceReport['status'], string> = {
  pending: 'Pendiente',
  in_progress: 'En revisión',
  resolved: 'Resuelto',
};

export default function MaintenanceScreen() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const isCoach = user?.role === 'Coach';
  // Admins manage the gym's reports; coaches only read them to plan routines; clients report and follow their own.
  const readsGymReports = isAdmin || isCoach;
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [reports, setReports] = useState<MaintenanceReport[]>([]);
  const [selectedEquipment, setSelectedEquipment] = useState('');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [updatingReport, setUpdatingReport] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [retryNumber, setRetryNumber] = useState(0);

  const loadReports = useCallback(async () => {
    const response = await api.get<{ reports: MaintenanceReport[] }>(readsGymReports ? '/maintenance/reports' : '/maintenance/reports/me');
    return response.data.reports;
  }, [readsGymReports]);

  useEffect(() => {
    let isCurrent = true;
    const request = readsGymReports
      ? loadReports().then((loaded) => { if (isCurrent) setReports(loaded); })
      : Promise.all([api.get<{ equipment: Equipment[] }>('/inventory'), loadReports()]).then(([response, loaded]) => {
        if (!isCurrent) return;
        setEquipment(response.data.equipment);
        setReports(loaded);
      });

    request
      .catch((requestError: unknown) => {
        if (isCurrent) setError(getApiErrorMessage(requestError, 'No se pudo cargar mantenimiento.'));
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });
    return () => { isCurrent = false; };
  }, [readsGymReports, loadReports, retryNumber]);

  // New reports and status changes made from the dashboard show up without reloading.
  useEffect(() => {
    const socket = connectSocket();
    const refresh = () => { loadReports().then(setReports).catch(() => undefined); };
    socket.on('maintenance-updated', refresh);
    return () => { socket.off('maintenance-updated', refresh); };
  }, [loadReports]);

  function retryLoad() {
    setError('');
    setIsLoading(true);
    setRetryNumber((current) => current + 1);
  }

  async function submitReport() {
    setError('');
    setSuccess('');
    if (!selectedEquipment) {
      setError('Selecciona el equipo que presenta la falla.');
      return;
    }
    if (description.trim().length < 5) {
      setError('Describe la falla con al menos 5 caracteres.');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post('/maintenance/reports', {
        equipmentId: selectedEquipment,
        description: description.trim(),
      });
      setSelectedEquipment('');
      setDescription('');
      setSuccess('Reporte enviado al gimnasio. Aquí verás cuando lo revisen.');
      loadReports().then(setReports).catch(() => undefined);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No se pudo enviar el reporte.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function updateReport(report: MaintenanceReport, action: 'out_of_service' | 'repaired') {
    setError('');
    setUpdatingReport(report._id);
    try {
      const response = await api.patch<{ report: MaintenanceReport }>(`/maintenance/reports/${report._id}`, {
        status: action === 'repaired' ? 'resolved' : 'in_progress',
        equipmentStatus: action === 'repaired' ? 'available' : 'out_of_service',
      });
      setReports((current) => current.map((item) => item._id === report._id ? response.data.report : item));
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No se pudo actualizar el reporte.'));
    } finally {
      setUpdatingReport(null);
    }
  }

  const openReports = reports.filter((report) => report.status !== 'resolved');

  return (
    <Page admin={isAdmin} dark={!isAdmin}>
      {isAdmin ? (
        <AppHeader title="Reportes de mantenimiento" detail="Atiende alertas y actualiza el estado del equipo." />
      ) : (
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Volver"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={() => { if (router.canGoBack()) { router.back(); } else { router.push('/(main)'); } }}>
            <IconBadge name="arrow-back" color="#FFFFFF" />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>{isCoach ? 'Alertas de mantenimiento' : 'Reportar una falla'}</Text>
            <Text style={styles.headerDetail}>
              {isCoach ? 'Equipos con fallas reportadas; tenlos en cuenta al planear rutinas.' : 'Selecciona el equipo y describe el problema.'}
            </Text>
          </View>
        </View>
      )}

      {error ? (
        <View style={styles.feedback}>
          <Notice error>{error}</Notice>
          {!isLoading ? <Pressable accessibilityRole="button" onPress={retryLoad}><Text style={styles.retry}>Reintentar carga</Text></Pressable> : null}
        </View>
      ) : null}
      {success ? <Notice>{success}</Notice> : null}
      {isLoading ? <View style={styles.loading}><ActivityIndicator color={palette.green} size="large" /></View> : null}

      {isCoach ? (
        <>
          <SectionTitle>{`${openReports.length} alertas abiertas`}</SectionTitle>
          {!isLoading && !error && openReports.length === 0 ? <Notice>Todo el equipo está funcionando.</Notice> : null}
          {openReports.map((report) => (
            <Surface key={report._id} style={styles.reportCard}>
              <View style={styles.reportHeader}>
                <View style={styles.equipmentInfo}>
                  <Text style={[styles.equipmentName, styles.darkText]}>{report.equipment?.name ?? 'Equipo'}</Text>
                  <Text style={styles.equipmentZone}>{report.equipment?.zone ?? 'Zona desconocida'}</Text>
                </View>
                <Text style={styles.reportStatus}>{reportStatus[report.status]}</Text>
              </View>
              <Text style={[styles.reportDescription, styles.darkText]}>{report.description}</Text>
              <Text style={styles.reportMeta}>Reportó {report.reportedBy?.name ?? 'Cliente'} · {new Date(report.createdAt).toLocaleString()}</Text>
            </Surface>
          ))}
        </>
      ) : !isAdmin ? (
        <>
          <SectionTitle>Selecciona el equipo</SectionTitle>
          {equipment.filter((item) => item.status !== 'out_of_service').length === 0 && !isLoading ? (
            <Notice>No hay equipos disponibles en el inventario para reportar.</Notice>
          ) : null}
          <View style={styles.equipmentList}>
            {equipment.filter((item) => item.status !== 'out_of_service').map((item) => (
              <Pressable
                key={item._id}
                accessibilityRole="radio"
                accessibilityState={{ checked: selectedEquipment === item._id }}
                onPress={() => setSelectedEquipment(item._id)}
                style={[styles.equipmentOption, selectedEquipment === item._id && styles.selectedOption]}>
                <View style={styles.equipmentInfo}>
                  <Text style={[styles.equipmentName, styles.darkText, selectedEquipment === item._id && styles.selectedText]}>{item.name}</Text>
                  <Text style={[styles.equipmentZone, selectedEquipment === item._id && styles.selectedText]}>{item.zone}</Text>
                </View>
                <Text style={[styles.radio, selectedEquipment === item._id && styles.selectedText]}>{selectedEquipment === item._id ? '●' : '○'}</Text>
              </Pressable>
            ))}
          </View>
          <Surface style={styles.form}>
            <Field
              label="Descripción de la falla"
              multiline
              numberOfLines={4}
              maxLength={1500}
              placeholder="¿Qué problema observaste?"
              value={description}
              onChangeText={setDescription}
              style={styles.multiline}
            />
            <ActionButton onPress={() => void submitReport()} disabled={isSubmitting || isLoading}>
              {isSubmitting ? <ActivityIndicator color={palette.white} /> : 'Enviar reporte'}
            </ActionButton>
          </Surface>

          <SectionTitle>Mis reportes</SectionTitle>
          {!isLoading && reports.length === 0 ? <Notice>Aún no has reportado fallas.</Notice> : null}
          {reports.map((report) => (
            <Surface key={report._id} style={styles.reportCard}>
              <View style={styles.reportHeader}>
                <View style={styles.equipmentInfo}>
                  <Text style={[styles.equipmentName, styles.darkText]}>{report.equipment?.name ?? 'Equipo'}</Text>
                  <Text style={styles.equipmentZone}>{new Date(report.createdAt).toLocaleDateString()}</Text>
                </View>
                <Text style={[styles.reportStatus, report.status === 'resolved' && styles.resolvedDark]}>{reportStatus[report.status]}</Text>
              </View>
              <Text style={[styles.reportDescription, styles.darkText]}>{report.description}</Text>
              {report.adminNote ? <Text style={styles.reportMeta}>Nota del gimnasio: {report.adminNote}</Text> : null}
            </Surface>
          ))}
        </>
      ) : (
        <>
          <SectionTitle>{`${openReports.length} alertas abiertas`}</SectionTitle>
          {!isLoading && !error && reports.length === 0 ? <Notice>No hay reportes de mantenimiento.</Notice> : null}
          {reports.map((report) => (
            <Surface key={report._id} style={styles.reportCard}>
              <View style={styles.reportHeader}>
                <View style={styles.equipmentInfo}>
                  <Text style={styles.equipmentName}>{report.equipment?.name ?? 'Equipo'}</Text>
                  <Text style={styles.equipmentZone}>{report.equipment?.zone ?? 'Zona desconocida'}</Text>
                </View>
                <Text style={[styles.reportStatus, report.status === 'resolved' && styles.resolved]}>{reportStatus[report.status]}</Text>
              </View>
              <Text style={styles.reportDescription}>{report.description}</Text>
              <Text style={styles.reportMeta}>Reportó {report.reportedBy?.name ?? 'Cliente'} · {new Date(report.createdAt).toLocaleString()}</Text>
              {report.status !== 'resolved' ? (
                <View style={styles.actions}>
                  <ActionButton onPress={() => void updateReport(report, 'out_of_service')} disabled={updatingReport === report._id}>
                    {updatingReport === report._id ? <ActivityIndicator color={palette.white} /> : 'Fuera de servicio'}
                  </ActionButton>
                  <ActionButton secondary onPress={() => void updateReport(report, 'repaired')} disabled={updatingReport === report._id}>
                    Marcar reparado
                  </ActionButton>
                </View>
              ) : null}
            </Surface>
          ))}
        </>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#27272A' },
  headerText: { flex: 1, gap: 4 },
  headerTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  headerDetail: { color: '#A1A1AA', fontSize: 13 },
  feedback: { gap: 8 },
  retry: { color: palette.green, fontSize: 13, fontWeight: '800', paddingVertical: 5 },
  loading: { minHeight: 80, alignItems: 'center', justifyContent: 'center' },
  equipmentList: { gap: 8 },
  equipmentOption: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderWidth: 1, borderColor: '#27272A', borderRadius: 8, backgroundColor: '#18181B', padding: 12 },
  selectedOption: { backgroundColor: '#10FF85', borderColor: '#10FF85' },
  equipmentInfo: { flex: 1, gap: 4 },
  equipmentName: { color: palette.ink, fontSize: 14, fontWeight: '800' },
  equipmentZone: { color: palette.muted, fontSize: 11 },
  selectedText: { color: '#081009' },
  radio: { color: palette.muted, fontSize: 18 },
  form: { gap: 14 },
  multiline: { minHeight: 100, textAlignVertical: 'top', paddingTop: 12 },
  reportCard: { gap: 12 },
  reportHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  reportStatus: { color: palette.coral, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  resolved: { color: palette.green },
  resolvedDark: { color: '#10FF85' },
  darkText: { color: '#F4F8F5' },
  reportDescription: { color: palette.ink, fontSize: 13, lineHeight: 19 },
  reportMeta: { color: palette.muted, fontSize: 10 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});