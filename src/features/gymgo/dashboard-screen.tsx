import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { api, getApiErrorMessage } from './api';
import { useAuth } from './auth-context';
import { ActionButton, AppHeader, Eyebrow, Notice, SectionTitle, Surface } from './ui';
import { palette } from './theme';
import type { Routine } from './types';

export default function DashboardScreen() {
  const { user } = useAuth();
  const isClient = user?.role === 'Cliente';
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [routineError, setRoutineError] = useState('');

  useEffect(() => {
    let isCurrent = true;
    api.get<{ routines: Routine[] }>('/routines')
      .then((response) => {
        if (isCurrent) setRoutines(response.data.routines);
      })
      .catch((error: unknown) => {
        if (isCurrent) setRoutineError(getApiErrorMessage(error, 'No se pudieron cargar tus rutinas.'));
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });
    return () => { isCurrent = false; };
  }, []);

  const activeRoutineCount = routines.filter((routine) => routine.status === 'active').length;
  const roleHeading = isClient ? 'Tu semana, a tu ritmo.' : user?.role === 'Admin' ? 'Tu gimnasio, en foco.' : 'Entrena con estrategia.';

  return (
    <>
      <View style={styles.topTint} />
      <View style={styles.page}>
        <AppHeader title={`Hola, ${user?.name?.split(' ')[0] ?? 'deportista'}`} detail={user?.email} />

        <View style={styles.hero}>
          <Eyebrow>{isClient ? 'PLAN PERSONAL' : `${user?.role?.toUpperCase()} · GYMGO`}</Eyebrow>
          <Text style={styles.heroTitle}>{roleHeading}</Text>
          <Text style={styles.heroDetail}>
            {isClient
              ? user?.goal ? `Objetivo: ${user.goal}` : 'Tus rutinas y tu acceso están a un toque.'
              : 'Una vista clara de la actividad y el equipo del gimnasio.'}
          </Text>
          {isClient ? (
            <Pressable onPress={() => router.push('/(main)/access')} style={styles.qrLink}>
              <Text style={styles.qrLinkText}>Mostrar acceso QR</Text>
              <Text style={styles.arrow}>→</Text>
            </Pressable>
          ) : null}
        </View>

        {isClient ? (
          <View style={styles.metricRow}>
            <Surface style={styles.metric}>
              <Text style={styles.metricLabel}>Rutinas activas</Text>
              <Text style={styles.metricValue}>{isLoading ? '—' : activeRoutineCount}</Text>
            </Surface>
            <Surface style={styles.metric}>
              <Text style={styles.metricLabel}>Membresía</Text>
              <Text style={[styles.metricStatus, user?.membership?.status === 'active' && styles.active]}>
                {user?.membership?.status ?? 'pendiente'}
              </Text>
            </Surface>
          </View>
        ) : (
          <View style={styles.metricRow}>
            <Surface style={styles.metric}>
              <Text style={styles.metricLabel}>Rutinas activas</Text>
              <Text style={styles.metricValue}>{isLoading ? '—' : activeRoutineCount}</Text>
              <Text style={styles.metricHint}>{user?.role === 'Coach' ? 'de tus clientes' : 'en la plataforma'}</Text>
            </Surface>
            <Surface style={styles.metric}>
              <Text style={styles.metricLabel}>Demandas</Text>
              <Text style={styles.metricValue}>IoT</Text>
              <Text style={styles.metricHint}>asistencia conectada</Text>
            </Surface>
          </View>
        )}

        {routineError ? <Notice error>{routineError}</Notice> : null}

        <View style={styles.section}>
          <SectionTitle>{isClient ? 'Siguiente paso' : 'Operación del gimnasio'}</SectionTitle>
          {isClient ? (
            <View style={styles.actionStack}>
              <ActionButton onPress={() => router.push('/(main)/routines')}>Ver mis rutinas</ActionButton>
              <ActionButton secondary onPress={() => router.push('/(main)/access')}>Abrir código de acceso</ActionButton>
            </View>
          ) : (
            <View style={styles.actionStack}>
              <ActionButton onPress={() => router.push('/(main)/clients')}>Asignar clientes</ActionButton>
              <ActionButton secondary onPress={() => router.push('/(main)/routines')}>Consultar rutinas</ActionButton>
            </View>
          )}
        </View>

        {!isClient ? (
          <Surface style={styles.demandPanel}>
            <View style={styles.demandHeading}>
              <View style={styles.demandDot} />
              <Text style={styles.demandTitle}>Demanda horaria</Text>
            </View>
            <Text style={styles.demandBody}>
              La API desplegada aún no expone estadísticas agregadas de asistencia. Los eventos QR ya se registran y esta vista quedará lista para conectarlas.
            </Text>
            <View style={styles.demandFooter}>
              <Text style={styles.demandTag}>ENTRADAS / SALIDAS</Text>
              <Text style={styles.demandTag}>ZONAS</Text>
              <Text style={styles.demandTag}>HORAS PICO</Text>
            </View>
          </Surface>
        ) : null}

        {isLoading ? <ActivityIndicator color={palette.green} /> : null}
        <View style={styles.footerLine}>
          <Text style={styles.footerText}>{user?.role === 'Coach' ? 'COACH CREATOR' : 'GYMGO · MOVIMIENTO CON PROPÓSITO'}</Text>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  topTint: { position: 'absolute', height: 130, left: 0, right: 0, top: 0, backgroundColor: '#E4EAD8' },
  page: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 22, gap: 22, paddingBottom: 36 },
  hero: { backgroundColor: palette.deepGreen, borderRadius: 10, minHeight: 205, padding: 22, justifyContent: 'center', gap: 12 },
  heroTitle: { color: palette.white, fontSize: 30, lineHeight: 36, fontWeight: '800', maxWidth: 420 },
  heroDetail: { color: '#DFE8DF', fontSize: 14, lineHeight: 21 },
  qrLink: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'flex-start', paddingTop: 4 },
  qrLinkText: { color: palette.lime, fontSize: 14, fontWeight: '800' },
  arrow: { color: palette.lime, fontSize: 20, fontWeight: '700' },
  metricRow: { flexDirection: 'row', gap: 12 },
  metric: { flex: 1, minHeight: 118, justifyContent: 'space-between', gap: 12 },
  metricLabel: { color: palette.muted, fontSize: 13, fontWeight: '700' },
  metricValue: { color: palette.ink, fontSize: 29, lineHeight: 32, fontWeight: '800' },
  metricHint: { color: palette.muted, fontSize: 12 },
  metricStatus: { color: palette.coral, fontSize: 15, fontWeight: '800', textTransform: 'capitalize' },
  active: { color: palette.green },
  section: { gap: 14 },
  actionStack: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  demandPanel: { gap: 14 },
  demandHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  demandDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: palette.coral },
  demandTitle: { color: palette.ink, fontSize: 17, fontWeight: '800' },
  demandBody: { color: palette.muted, fontSize: 14, lineHeight: 21 },
  demandFooter: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  demandTag: { color: palette.green, fontSize: 10, fontWeight: '800', backgroundColor: '#E8EEE5', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 5 },
  footerLine: { borderTopWidth: 1, borderTopColor: palette.line, paddingTop: 12 },
  footerText: { color: palette.muted, fontSize: 10, fontWeight: '800' },
});