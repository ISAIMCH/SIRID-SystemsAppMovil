import { router, type Href } from 'expo-router';
import { Alert, View } from 'react-native';

import { Card, FadeIn, ListGroup, ListRow, Screen, ScreenHeader, Text } from '@/components/sirid';
import { ThemeSelector } from '@/components/sirid/theme-selector';
import { makeStyles } from '@/theme/make-styles';
import { radius, space } from '@/theme/tokens';

import { useAuth } from './auth-context';
import GymSwitcher from './gym-switcher';
import { usePendingStaffInvitations } from './staff-invitation-notifier';

const ROLE_LABEL: Record<string, string> = { Cliente: 'Cliente', Coach: 'Coach', Admin: 'Administrador', Recepcion: 'Recepción' };

const useStyles = makeStyles(({ colors }) => ({
  profile: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  avatar: { width: 60, height: 60, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  avatarText: { color: colors.onPrimary, fontSize: 22, fontWeight: '800', fontFamily: 'display' },
  profileText: { flex: 1, gap: 2 },
  section: { gap: space.md },
}));

export function initialsOf(name?: string, lastName?: string) {
  const parts = [name, lastName].filter(Boolean).join(' ').split(' ').filter(Boolean);
  return parts.map((part) => part[0]).slice(0, 2).join('').toUpperCase() || 'S';
}

/** Cuenta, apariencia y sesión. Staff reach it from the tab bar; clients from Perfil. */
export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const styles = useStyles();
  const pendingInvitations = usePendingStaffInvitations();

  function confirmSignOut() {
    Alert.alert('Cerrar sesión', '¿Quieres salir de tu cuenta en este dispositivo?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar sesión', style: 'destructive', onPress: () => void signOut() },
    ]);
  }

  return (
    <Screen>
      <ScreenHeader eyebrow="Cuenta" title="Ajustes" back={user?.role === 'Cliente'} />

      <FadeIn>
        <Card>
          <View style={styles.profile}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{initialsOf(user?.name, user?.lastName)}</Text></View>
            <View style={styles.profileText}>
              <Text variant="headline" numberOfLines={1}>{[user?.name, user?.lastName].filter(Boolean).join(' ') || 'Usuario GymGo'}</Text>
              <Text variant="caption" tone="secondary" numberOfLines={1}>{user?.email}</Text>
              <Text variant="label" tone="accent">{ROLE_LABEL[user?.role ?? ''] ?? ''}</Text>
            </View>
          </View>
          <GymSwitcher />
        </Card>
      </FadeIn>

      <FadeIn index={1} style={styles.section}>
        <Text variant="label" tone="secondary">Apariencia</Text>
        <ThemeSelector />
        <Text variant="caption" tone="secondary">Automático sigue el modo claro u oscuro de tu teléfono.</Text>
      </FadeIn>

      <FadeIn index={2} style={styles.section}>
        <Text variant="label" tone="secondary">Sesión</Text>
        <ListGroup>
          {pendingInvitations > 0 ? (
            <ListRow
              icon="badge"
              title="Invitaciones al staff"
              subtitle={pendingInvitations === 1 ? '1 invitación pendiente' : `${pendingInvitations} invitaciones pendientes`}
              onPress={() => router.push('/staff-invitations' as Href)}
            />
          ) : null}
          <ListRow icon="logout" iconTone="danger" title="Cerrar sesión" divider={false} chevron={false} onPress={confirmSignOut} />
        </ListGroup>
      </FadeIn>
    </Screen>
  );
}
