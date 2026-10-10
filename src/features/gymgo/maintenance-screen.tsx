import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { api, getApiErrorMessage } from './api';
import { useAuth } from './auth-context';
import { palette } from './theme';
import { ActionButton, AppHeader, Field, Notice, Page, SectionTitle, Surface } from './ui';

type Equipment = { _id: string; name: string; zone: string; status: 'available' | 'busy' | 'out_of_service' };
type MaintenanceReport = {
  _id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'resolved';
  createdAt: string;
  equipment: { _id: string; name: string; zone: string; status: Equipment['status'] };
  reportedBy: { _id: string; name: string; email: string };
};

const reportStatus: Record<MaintenanceReport['status'], string> = {
  pending: 'Pendiente',
  in_progress: 'En revisión',
  resolved: 'Resuelto',
};

export default function MaintenanceScreen() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
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

  useEffect(() => {
    let isCurrent = true;
    const request = isAdmin
      ? api.get<{ reports: MaintenanceReport[] }>('/maintenance/reports')
      : api.get<{ equipment: Equipment[] }>('/inventory');

    request
      .then((response) => {
        if (!isCurrent) return;
        if (isAdmin) setReports((response.data as { reports: MaintenanceReport[] }).reports);
        else setEquipment((response.data as { equipment: Equipment[] }).equipment);
      })
      .catch((requestError: unknown) => {
        if (isCurrent) setError(getApiErrorMessage(requestError, 'No se pudo cargar mantenimiento.'));
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });
    return () => { isCurrent = false; };
  }, [isAdmin, retryNumber]);

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
      setSuccess('Reporte enviado al administrador del gimnasio.');
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

  return (
    <Page admin>
      <AppHeader
        title={isAdmin ? 'Reportes de mantenimiento' : 'Reportar una falla'}
        detail={isAdmin ? 'Atiende alertas y actualiza el estado del equipo.' : 'Selecciona el equipo y describe el problema.'}
      />

      {error ? (
        <View style={styles.feedback}>
          <Notice error>{error}</Notice>
          {!isLoading ? <Pressable accessibilityRole="button" onPress={retryLoad}><Text style={styles.retry}>Reintentar carga</Text></Pressable> : null}
        </View>
      ) : null}
      {success ? <Notice>{success}</Notice> : null}
      {isLoading ? <View style={styles.loading}><ActivityIndicator color={palette.green} size="large" /></View> : null}

      {!isAdmin ? (
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
                  <Text style={[styles.equipmentName, selectedEquipment === item._id && styles.selectedText]}>{item.name}</Text>
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
        </>
      ) : (
        <>
          <SectionTitle>{`${reports.filter((report) => report.status !== 'resolved').length} alertas abiertas`}</SectionTitle>
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
  feedback: { gap: 8 },
  retry: { color: palette.green, fontSize: 13, fontWeight: '800', paddingVertical: 5 },
  loading: { minHeight: 80, alignItems: 'center', justifyContent: 'center' },
  equipmentList: { gap: 8 },
  equipmentOption: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderWidth: 1, borderColor: 'rgba(0, 0, 0, 0.05)', borderRadius: 8, backgroundColor: 'rgba(255, 255, 255, 0.7)', padding: 12 },
  selectedOption: { backgroundColor: palette.deepGreen, borderColor: palette.deepGreen },
  equipmentInfo: { flex: 1, gap: 4 },
  equipmentName: { color: palette.ink, fontSize: 14, fontWeight: '800' },
  equipmentZone: { color: palette.muted, fontSize: 11 },
  selectedText: { color: palette.white },
  radio: { color: palette.muted, fontSize: 18 },
  form: { gap: 14 },
  multiline: { minHeight: 100, textAlignVertical: 'top', paddingTop: 12 },
  reportCard: { gap: 12 },
  reportHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  reportStatus: { color: palette.coral, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  resolved: { color: palette.green },
  reportDescription: { color: palette.ink, fontSize: 13, lineHeight: 19 },
  reportMeta: { color: palette.muted, fontSize: 10 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});