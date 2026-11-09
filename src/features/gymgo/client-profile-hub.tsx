import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Badge, Card, FadeIn, ListGroup, ListRow, Screen, ScreenHeader, Text } from '@/components/sirid';
import { makeStyles } from '@/theme/make-styles';
import { radius, space } from '@/theme/tokens';
import { connectSocket } from '@/services/socket';

import { api } from './api';
import { useAuth } from './auth-context';
import GymSwitcher from './gym-switcher';
import { membershipDisplayStatus, membershipLabel } from './membership-status';
import { initialsOf } from './settings-screen';
import { usePendingStaffInvitations } from './staff-invitation-notifier';

const useStyles = makeStyles(({ colors }) => ({
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  avatar: { width: 72, height: 72, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  avatarText: { color: colors.onPrimary, fontSize: 28, fontWeight: '800', fontFamily: 'display' },
  identityText: { flex: 1, gap: 4 },
  facts: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: space.md },
  fact: { flex: 1, gap: 2 },
  section: { gap: space.md },
}));

export default function ClientProfileHub() {
  const { user } = useAuth();
  const styles = useStyles();
  const pendingRequests = usePendingHistoryRequests();
  const pendingInvitations = usePendingStaffInvitations();
  const membership = user?.membership;
  const membershipActive = membershipDisplayStatus(membership) === 'active';

  return (
    <Screen>
      <ScreenHeader eyebrow="Tu cuenta" title="Perfil" />

      <FadeIn>
        <Card variant="raised">
          <View style={styles.identity}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{initialsOf(user?.name, user?.lastName)}</Text></View>
            <View style={styles.identityText}>
              <Text variant="title" numberOfLines={2}>{[user?.name, user?.lastName].filter(Boolean).join(' ') || 'Usuario GymGo'}</Text>
              <Badge tone={membershipActive ? 'success' : 'warning'} dot>{membershipLabel(membership)}</Badge>
            </View>
          </View>
          <View style={styles.facts}>
            <View style={styles.fact}>
              <Text variant="label" tone="secondary">Estatura</Text>
              <Text variant="bodyStrong">{user?.heightCm ? `${user.heightCm} cm` : '—'}</Text>
            </View>
            <View style={styles.fact}>
              <Text variant="label" tone="secondary">Objetivo</Text>
              <Text variant="bodyStrong" numberOfLines={1}>{user?.goal || '—'}</Text>
            </View>
          </View>
          <GymSwitcher />
        </Card>
      </FadeIn>

      <FadeIn index={1} style={styles.section}>
        <Text variant="label" tone="secondary">Mi información</Text>
        <ListGroup>
          <ListRow icon="monitor-weight" title="Datos personales y físicos" subtitle="Peso, estatura y objetivo" onPress={() => router.push('/(main)/profile')} />
          <ListRow icon="credit-card" iconTone="info" title="Membresía y pagos" subtitle="Plan, vigencia y comprobantes" onPress={() => router.push('/(main)/client-billing' as Href)} />
          <ListRow icon="folder-shared" iconTone="info" title="Mis documentos" onPress={() => router.push('/(main)/documents' as Href)} />
          <ListRow icon="storefront" iconTone="warning" title="Tienda del gimnasio" divider={false} onPress={() => router.push('/(main)/store')} />
        </ListGroup>
      </FadeIn>

      <FadeIn index={2} style={styles.section}>
        <Text variant="label" tone="secondary">Gimnasio y privacidad</Text>
        <ListGroup>
          <ListRow icon="build" iconTone="warning" title="Mis reportes de equipo" onPress={() => router.push('/(main)/maintenance' as Href)} />
          <ListRow
            icon="shield"
            iconTone="success"
            title="Privacidad e historial"
            trailing={pendingRequests > 0 ? <Badge tone="danger">{String(pendingRequests)}</Badge> : undefined}
            onPress={() => router.push('/(main)/privacy' as Href)}
          />
          {pendingInvitations > 0 ? (
            <ListRow icon="badge" title="Invitaciones al staff" trailing={<Badge tone="accent">{String(pendingInvitations)}</Badge>} onPress={() => router.push('/staff-invitations' as Href)} />
          ) : null}
          <ListRow icon="settings" iconTone="neutral" title="Ajustes y apariencia" subtitle="Tema claro u oscuro, cerrar sesión" divider={false} onPress={() => router.push('/(main)/settings' as Href)} />
        </ListGroup>
      </FadeIn>
    </Screen>
  );
}

// How many gyms are waiting for the client to answer a history request.
function usePendingHistoryRequests() {
  const [count, setCount] = useState(0);
  const [reloadNumber, setReloadNumber] = useState(0);

  useEffect(() => {
    let isCurrent = true;
    api.get<{ shares: { status: string }[] }>('/history-shares/me')
      .then((response) => {
        if (isCurrent) setCount(response.data.shares.filter((share) => share.status === 'pending').length);
      })
      .catch(() => undefined);
    return () => { isCurrent = false; };
  }, [reloadNumber]);

  useEffect(() => {
    const socket = connectSocket();
    const refresh = () => setReloadNumber((value) => value + 1);
    socket.on('history-share:updated', refresh);
    return () => { socket.off('history-share:updated', refresh); };
  }, []);

  return count;
}
