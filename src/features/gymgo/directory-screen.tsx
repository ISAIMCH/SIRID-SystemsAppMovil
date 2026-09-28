import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { api, getApiErrorMessage } from './api';
import { useAuth } from './auth-context';
import { ActionButton, AppHeader, Field, Notice, Page, SectionTitle, Surface } from './ui';
import { palette } from './theme';
import type { DirectoryClient } from './directory-types';

export default function DirectoryScreen() {
  const { user } = useAuth();
  const [clients, setClients] = useState<DirectoryClient[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryNumber, setRetryNumber] = useState(0);

  useEffect(() => {
    let isCurrent = true;

    async function loadDirectory() {
      setIsLoading(true);
      setError('');
      try {
        const response = await api.get<{ users: DirectoryClient[] }>('/auth/users', {
          params: { role: 'Cliente' },
        });
        if (isCurrent) setClients(response.data.users);
      } catch (requestError) {
        if (isCurrent) setError(getApiErrorMessage(requestError, 'No se pudo cargar el directorio.'));
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    }

    void loadDirectory();
    return () => { isCurrent = false; };
  }, [retryNumber]);

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filteredClients = clients.filter((client) => (
    `${client.name} ${client.email} ${client.phone ?? ''}`.toLocaleLowerCase().includes(normalizedSearch)
  ));

  return (
    <Page>
      <AppHeader
        title="Directorio"
        detail={user?.role === 'Coach' ? 'Clientes asignados a tu perfil.' : 'Clientes registrados en tu gimnasio.'}
      />

      <Field
        label="Buscar clientes"
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Nombre, correo o teléfono"
        value={search}
        onChangeText={setSearch}
      />

      <SectionTitle>{isLoading ? 'Cargando clientes' : `${filteredClients.length} clientes`}</SectionTitle>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={palette.green} size="large" />
        </View>
      ) : null}

      {error ? (
        <View style={styles.feedback}>
          <Notice error>{error}</Notice>
          <ActionButton secondary onPress={() => setRetryNumber((current) => current + 1)}>
            Intentar de nuevo
          </ActionButton>
        </View>
      ) : null}

      {!isLoading && !error && clients.length === 0 ? (
        <Notice>Aún no hay clientes registrados en el directorio.</Notice>
      ) : null}
      {!isLoading && !error && clients.length > 0 && filteredClients.length === 0 ? (
        <Notice>No hay clientes que coincidan con esa búsqueda.</Notice>
      ) : null}

      {filteredClients.map((client) => (
        <Pressable
          key={client.id}
          accessibilityRole="button"
          accessibilityLabel={`Ver perfil de ${client.name}`}
          onPress={() => router.push({
            pathname: '/(main)/directory/[clientId]',
            params: { clientId: client.id },
          })}
          style={({ pressed }) => pressed && styles.pressed}>
          <Surface style={styles.clientRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{client.name.trim().slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={styles.clientInfo}>
              <Text style={styles.clientName}>{client.name}</Text>
              <Text style={styles.clientEmail}>{client.email}</Text>
              <Text style={styles.coachName}>
                {client.assignedCoach ? `Coach · ${client.assignedCoach.name}` : 'Sin Coach asignado'}
              </Text>
            </View>
            <View style={styles.rowAside}>
              <Text style={[styles.membership, client.membership?.status === 'active' && styles.membershipActive]}>
                {client.membership?.status ?? 'pendiente'}
              </Text>
              <Text style={styles.chevron}>›</Text>
            </View>
          </Surface>
        </Pressable>
      ))}
    </Page>
  );
}

const styles = StyleSheet.create({
  loading: { minHeight: 120, justifyContent: 'center', alignItems: 'center' },
  feedback: { gap: 10 },
  clientRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: palette.lime, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: palette.deepGreen, fontSize: 17, fontWeight: '800' },
  clientInfo: { flex: 1, gap: 3 },
  clientName: { color: palette.ink, fontSize: 15, fontWeight: '800' },
  clientEmail: { color: palette.muted, fontSize: 12 },
  coachName: { color: palette.green, fontSize: 11, fontWeight: '700' },
  rowAside: { alignItems: 'flex-end', gap: 5 },
  membership: { color: palette.coral, backgroundColor: '#F7E9E3', borderRadius: 5, paddingHorizontal: 7, paddingVertical: 4, fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  membershipActive: { color: palette.green, backgroundColor: '#E6EED7' },
  chevron: { color: palette.muted, fontSize: 20, lineHeight: 20 },
  pressed: { opacity: 0.76 },
});