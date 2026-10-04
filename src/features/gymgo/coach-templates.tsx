import { MaterialIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { api, getApiErrorMessage } from './api';
import type { DirectoryClient } from './directory-types';
import { FloatingCard, IconBadge } from './fit-ui';
import { routineEditorHref } from './routine-links';
import { SelectField } from './select-field';
import { palette } from './theme';
import type { RoutineTemplate } from './types';
import { ActionButton, Notice, SectionTitle } from './ui';

export default function CoachTemplates({ onAssigned }: { onAssigned: () => void }) {
  const [templates, setTemplates] = useState<RoutineTemplate[]>([]);
  const [clients, setClients] = useState<DirectoryClient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [clientId, setClientId] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  useFocusEffect(useCallback(() => {
    let isCurrent = true;
    Promise.all([
      api.get<{ templates: RoutineTemplate[] }>('/routine-templates'),
      api.get<{ users: DirectoryClient[] }>('/auth/users', { params: { role: 'Cliente' } }),
    ])
      .then(([templatesResponse, clientsResponse]) => {
        if (!isCurrent) return;
        setTemplates(templatesResponse.data.templates);
        setClients(clientsResponse.data.users);
        setError('');
      })
      .catch((requestError: unknown) => {
        if (isCurrent) setError(getApiErrorMessage(requestError, 'No se pudieron cargar tus plantillas.'));
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });
    return () => { isCurrent = false; };
  }, []));

  async function assign(template: RoutineTemplate) {
    if (!clientId) return setError('Selecciona un cliente.');
    setError('');
    setSuccess('');
    setIsBusy(true);
    try {
      await api.post(`/routine-templates/${template._id}/assign`, { clientId });
      const client = clients.find((entry) => entry.id === clientId);
      setSuccess(`Copia de "${template.title}" asignada a ${client?.name ?? 'el cliente'}.`);
      setAssigningId(null);
      setClientId('');
      onAssigned();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No se pudo asignar la plantilla.'));
    } finally {
      setIsBusy(false);
    }
  }

  async function remove(template: RoutineTemplate) {
    setError('');
    try {
      await api.delete(`/routine-templates/${template._id}`);
      setTemplates((current) => current.filter((entry) => entry._id !== template._id));
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'No se pudo eliminar la plantilla.'));
    }
  }

  return (
    <View style={styles.wrapper}>
      <SectionTitle>Mis plantillas</SectionTitle>
      {isLoading ? <ActivityIndicator color={palette.green} /> : null}
      {error ? <Notice error>{error}</Notice> : null}
      {success ? <Notice>{success}</Notice> : null}
      {!isLoading && !error && templates.length === 0 ? (
        <Notice>Aún no tienes plantillas. Crea una base y asígnala a tus clientes como copia independiente.</Notice>
      ) : null}

      {templates.map((template) => (
        <FloatingCard key={template._id} style={styles.card}>
          <View style={styles.top}>
            <IconBadge name="content-copy" color={palette.violet} />
            <View style={styles.info}>
              <Text style={styles.title}>{template.title}</Text>
              <Text style={styles.meta}>
                {template.level} · {template.daysPerWeek} días/semana · {(template.blocks ?? []).reduce((sum, block) => sum + block.exercises.length, 0)} ejercicios
              </Text>
            </View>
          </View>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={() => router.push(routineEditorHref({ mode: 'template', templateId: template._id }))} style={styles.action}>
              <MaterialIcons name="edit" size={16} color={palette.cyan} />
              <Text style={[styles.actionText, { color: palette.cyan }]}>Editar</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => { setAssigningId(assigningId === template._id ? null : template._id); setClientId(''); setError(''); }} style={styles.action}>
              <MaterialIcons name="person-add" size={16} color={palette.green} />
              <Text style={[styles.actionText, { color: palette.green }]}>Asignar</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => void remove(template)} style={styles.action}>
              <MaterialIcons name="delete" size={16} color={palette.danger} />
              <Text style={[styles.actionText, { color: palette.danger }]}>Eliminar</Text>
            </Pressable>
          </View>
          {assigningId === template._id ? (
            <View style={styles.assign}>
              <SelectField
                label="Asignar a cliente"
                placeholder="Selecciona un cliente"
                emptyText="No tienes clientes asignados."
                options={clients.map((client) => ({ value: client.id, label: `${client.name} - ${client.email}` }))}
                value={clientId}
                onChange={setClientId}
              />
              <ActionButton onPress={() => void assign(template)} disabled={isBusy}>
                {isBusy ? <ActivityIndicator color={palette.white} /> : 'Crear copia para el cliente'}
              </ActionButton>
            </View>
          ) : null}
        </FloatingCard>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 14 },
  card: { gap: 12 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  info: { flex: 1, gap: 3 },
  title: { color: palette.ink, fontSize: 16, fontWeight: '800' },
  meta: { color: palette.muted, fontSize: 12, textTransform: 'capitalize' },
  actions: { flexDirection: 'row', gap: 18 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4 },
  actionText: { fontSize: 13, fontWeight: '800' },
  assign: { gap: 12, borderTopWidth: 1, borderTopColor: palette.line, paddingTop: 12 },
});
