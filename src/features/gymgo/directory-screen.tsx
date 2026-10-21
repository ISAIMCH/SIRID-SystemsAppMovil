import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AdminPillToggle } from './admin-hub';
import { api, getApiErrorMessage } from './api';
import { useAuth } from './auth-context';
import type { DirectoryClient } from './directory-types';
import { FloatingCard } from './fit-ui';
import { palette } from './theme';
import { ActionButton, AppHeader, Field, Notice, Page, SectionTitle } from './ui';

type Segment = 'Cliente' | 'Coach';

const membershipLabels = { active: 'Activa', pending: 'Pendiente', suspended: 'Suspendida', expired: 'Vencida' } as const;

export default function DirectoryScreen({ initialSegment = 'Cliente', hideSegmentToggle = false }: { initialSegment?: Segment; hideSegmentToggle?: boolean }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const [segment, setSegment] = useState<Segment>(initialSegment);
  const [people, setPeople] = useState<DirectoryClient[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryNumber, setRetryNumber] = useState(0);

  useEffect(() => {
    let isCurrent = true;
    api.get<{ users: DirectoryClient[] }>('/auth/users', { params: { role: segment } })
      .then((response) => {
        if (isCurrent) setPeople(response.data.users);
      })
      .catch((requestError: unknown) => {
        if (isCurrent) setError(getApiErrorMessage(requestError, 'No se pudo cargar el directorio.'));
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });
    return () => { isCurrent = false; };
  }, [segment, retryNumber]);

  function changeSegment(next: Segment) {
    if (next === segment) return;
    setPeople([]);
    setSearch('');
    setError('');
    setIsLoading(true);
    setSegment(next);
  }

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filtered = people.filter((person) => (
    `${person.name} ${person.lastName ?? ''} ${person.email} ${person.phone ?? ''}`.toLocaleLowerCase().includes(normalizedSearch)
  ));
  const noun = segment === 'Cliente' ? 'clientes' : 'coaches';

  return (
    <Page admin={user?.role === 'Admin'} dark={user?.role === 'Coach'}>
      <AppHeader
        title={user?.role === 'Coach' ? 'Clientes' : 'Directorio'}
        detail={user?.role === 'Coach' ? 'Clientes asignados a tu perfil.' : 'Consulta y edita clientes y coaches.'}
      />

      {isAdmin && !hideSegmentToggle ? (
        <AdminPillToggle value={segment} onChange={changeSegment} options={[{ value: 'Cliente', label: 'Clientes' }, { value: 'Coach', label: 'Coaches' }]} />
      ) : null}

      <Field
        label={`Buscar ${noun}`}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Nombre, correo o teléfono"
        value={search}
        onChangeText={setSearch}
      />

      <SectionTitle>{isLoading ? `Cargando ${noun}` : `${filtered.length} ${noun}`}</SectionTitle>
      {isLoading ? <View style={styles.loading}><ActivityIndicator color={palette.green} size="large" /></View> : null}

      {error ? (
        <View style={styles.feedback}>
          <Notice error>{error}</Notice>
          <ActionButton secondary onPress={() => { setError(''); setIsLoading(true); setRetryNumber((current) => current + 1); }}>
            Intentar de nuevo
          </ActionButton>
        </View>
      ) : null}

      {!isLoading && !error && people.length === 0 ? <Notice>Aún no hay {noun} registrados.</Notice> : null}
      {!isLoading && !error && people.length > 0 && filtered.length === 0 ? <Notice>No hay resultados para esa búsqueda.</Notice> : null}

      {filtered.map((person) => (
        <Pressable
          key={person.id}
          accessibilityRole="button"
          accessibilityLabel={`Ver perfil de ${[person.name, person.lastName].filter(Boolean).join(' ')}`}
          onPress={() => router.push({ pathname: '/(main)/directory/[clientId]', params: { clientId: person.id } })}
          style={({ pressed }) => pressed && styles.pressed}>
          <FloatingCard style={[styles.row, user?.role === 'Coach' && styles.darkRow]}>
            <View style={[styles.avatar, person.role === 'Coach' && styles.coachAvatar]}>
              <Text style={styles.avatarText}>{person.name.trim().slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={styles.info}>
              <Text style={[styles.name, user?.role === 'Coach' && styles.darkName]}>{[person.name, person.lastName].filter(Boolean).join(' ')}</Text>
              <Text style={[styles.email, user?.role === 'Coach' && styles.darkSecondary]}>{person.email}</Text>
              {person.role === 'Cliente' ? (
                <Text style={[styles.coach, user?.role === 'Coach' && styles.darkSecondary]}>{person.assignedCoach ? `Coach · ${person.assignedCoach.name}` : 'Sin Coach asignado'}</Text>
              ) : (
                <Text style={[styles.coach, user?.role === 'Coach' && styles.darkSecondary]}>{person.phone || 'Sin teléfono'}</Text>
              )}
            </View>
            {person.role === 'Cliente' ? (
              <View style={[styles.chip, person.membership?.status === 'active' && styles.chipActive]}>
                <Text style={[styles.chipText, person.membership?.status === 'active' && styles.chipTextActive]}>
                  {membershipLabels[person.membership?.status ?? 'pending']}
                </Text>
              </View>
            ) : null}
            <MaterialIcons name="chevron-right" size={22} color={palette.muted} />
          </FloatingCard>
        </Pressable>
      ))}
    </Page>
  );
}

const styles = StyleSheet.create({
  loading: { minHeight: 120, justifyContent: 'center', alignItems: 'center' },
  feedback: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  darkRow: { backgroundColor: '#1E1E1E', borderColor: '#27272A' },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#F4F4F5', borderWidth: 1, borderColor: '#E4E4E7', alignItems: 'center', justifyContent: 'center' },
  coachAvatar: { backgroundColor: '#F4F4F5' },
  avatarText: { color: '#18181B', fontSize: 18, fontWeight: '800' },
  info: { flex: 1, gap: 3 },
  name: { color: '#18181B', fontSize: 16, fontWeight: '800' },
  darkName: { color: '#FFFFFF' },
  email: { color: '#52525B', fontSize: 12 },
  darkSecondary: { color: '#A1A1AA' },
  coach: { color: '#71717A', fontSize: 11, fontWeight: '700' },
  chip: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, backgroundColor: '#F4F4F5', borderWidth: 1, borderColor: '#E4E4E7' },
  chipActive: { backgroundColor: '#18181B', borderColor: '#18181B' },
  chipText: { color: '#71717A', fontSize: 10, fontWeight: '800' },
  chipTextActive: { color: '#10FF85' },
  pressed: { opacity: 0.78 },
});
