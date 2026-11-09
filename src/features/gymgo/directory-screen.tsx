import { MaterialIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { connectSocket } from '@/services/socket';

import { api, getApiErrorMessage } from './api';
import { useAuth } from './auth-context';
import type { DirectoryClient } from './directory-types';
import { FloatingCard } from './fit-ui';
import { membershipDisplayStatus, membershipLabel } from './membership-status';
import { ActionButton, AppHeader, Field, Notice, Page, SectionTitle } from './ui';
import { makeStyles } from '@/theme/make-styles';
import { useTheme } from '@/theme/theme-provider';

// The Coach's assigned clients; staff directories live in the web dashboard.
export default function DirectoryScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { user } = useAuth();
  const [people, setPeople] = useState<DirectoryClient[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryNumber, setRetryNumber] = useState(0);

  useFocusEffect(useCallback(() => {
    let isCurrent = true;
    api.get<{ users: DirectoryClient[] }>('/auth/users', { params: { role: 'Cliente' } })
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
  // retryNumber is a manual "reintentar" trigger.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryNumber]));

  // Reception enrolls clients and managers assign coaches from the dashboard: reload when the directory changes.
  useEffect(() => {
    const socket = connectSocket();
    const reload = () => setRetryNumber((current) => current + 1);
    socket.on('directory-updated', reload);
    return () => { socket.off('directory-updated', reload); };
  }, []);


  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filtered = people.filter((person) => (
    `${person.name} ${person.lastName ?? ''} ${person.email} ${person.phone ?? ''}`.toLocaleLowerCase().includes(normalizedSearch)
  ));
  const noun = 'clientes';

  return (
    <Page admin={user?.role === 'Admin'} dark={user?.role === 'Coach'}>
      <AppHeader
        title={user?.role === 'Coach' ? 'Clientes' : 'Directorio'}
        detail={user?.role === 'Coach' ? 'Clientes asignados a tu perfil.' : 'Consulta y edita clientes y coaches.'}
      />

      <Field
        label={`Buscar ${noun}`}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Nombre, correo o teléfono"
        value={search}
        onChangeText={setSearch}
      />

      <SectionTitle>{isLoading ? `Cargando ${noun}` : `${filtered.length} ${noun}`}</SectionTitle>
      {isLoading ? <View style={styles.loading}><ActivityIndicator color={colors.accent} size="large" /></View> : null}

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
              <View style={[styles.chip, membershipDisplayStatus(person.membership) === 'active' && styles.chipActive]}>
                <Text style={[styles.chipText, membershipDisplayStatus(person.membership) === 'active' && styles.chipTextActive]}>
                  {membershipLabel(person.membership)}
                </Text>
              </View>
            ) : null}
            <MaterialIcons name="chevron-right" size={22} color={colors.textSecondary} />
          </FloatingCard>
        </Pressable>
      ))}
    </Page>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  loading: { minHeight: 120, justifyContent: 'center', alignItems: 'center' },
  feedback: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  darkRow: { backgroundColor: colors.surface, borderColor: colors.border },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  coachAvatar: { backgroundColor: colors.background },
  avatarText: { color: colors.text, fontSize: 18, fontWeight: '800' },
  info: { flex: 1, gap: 3 },
  name: { color: colors.text, fontSize: 16, fontWeight: '800' },
  darkName: { color: colors.text },
  email: { color: colors.textSecondary, fontSize: 12 },
  darkSecondary: { color: colors.textSecondary },
  coach: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  chip: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.surface, borderColor: colors.border },
  chipText: { color: colors.textSecondary, fontSize: 12, fontWeight: '800' },
  chipTextActive: { color: colors.accent },
  pressed: { opacity: 0.78 },
}));
