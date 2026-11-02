import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { connectSocket } from '@/services/socket';

import { api } from './api';
import { useAuth } from './auth-context';
import { usePendingStaffInvitations } from './staff-invitation-notifier';
import { Page } from './ui';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function springScale(scale: Animated.Value, toValue: number) {
  Animated.spring(scale, { toValue, friction: 5, tension: 100, useNativeDriver: true }).start();
}

export default function ClientProfileHub() {
  const { user, signOut } = useAuth();
  const pendingRequests = usePendingHistoryRequests();
  const pendingInvitations = usePendingStaffInvitations();
  const initials = user?.name.split(' ').map((name) => name[0]).slice(0, 2).join('').toUpperCase() ?? 'GG';

  return (
    <Page dark>
      <View style={styles.header}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
        <View style={styles.headerText}>
          <Text style={styles.title}>{[user?.name, user?.lastName].filter(Boolean).join(' ') || 'Usuario GymGo'}</Text>
          <Text style={styles.subtitle}>{user?.heightCm ? `Cliente | ${user.heightCm} cm` : 'Cliente'}</Text>
        </View>
      </View>

      <View style={styles.menuList}>
        <MenuRow icon="person-outline" title="Datos personales y físicos" onPress={() => router.push('/(main)/profile')} />
        <MenuRow icon="credit-card" title="Membresía y pagos" onPress={() => router.push('/(main)/client-billing' as Href)} />
        <MenuRow icon="folder-shared" title="Mis documentos" onPress={() => router.push('/(main)/documents' as Href)} />
        <MenuRow icon="shield" title="Privacidad e historial" badge={pendingRequests} onPress={() => router.push('/(main)/privacy' as Href)} />
        {pendingInvitations > 0 ? (
          <MenuRow icon="badge" title="Invitaciones al staff" badge={pendingInvitations} onPress={() => router.push('/staff-invitations' as Href)} />
        ) : null}
        <MenuRow icon="logout" title="Cerrar sesión" warning onPress={() => void signOut()} />
      </View>
    </Page>
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

function MenuRow({ icon, title, onPress, warning = false, badge = 0 }: { icon: keyof typeof MaterialIcons.glyphMap; title: string; onPress: () => void; warning?: boolean; badge?: number }) {
  const scale = useState(() => new Animated.Value(1))[0];
  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      onPressIn={() => springScale(scale, 0.97)}
      onPressOut={() => springScale(scale, 1)}
      style={[styles.menuRow, { transform: [{ scale }] }]}>
      <MaterialIcons name={icon} size={22} color={warning ? '#A1A1AA' : '#10FF85'} />
      <Text style={[styles.menuTitle, warning && styles.warning]}>{title}</Text>
      {badge > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View> : null}
      {!warning ? <MaterialIcons name="chevron-right" size={22} color="#91A098" /> : null}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#18181B', borderWidth: 1, borderColor: '#10FF85', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#10FF85', fontSize: 20, fontWeight: '900' },
  headerText: { flex: 1 },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  subtitle: { color: '#A1A1AA', fontSize: 13, marginTop: 5 },
  menuList: { gap: 10 },
  menuRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, borderColor: '#27272A', backgroundColor: '#1E1E1E' },
  menuTitle: { flex: 1, color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  badge: { minWidth: 22, height: 22, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: '#10FF85', paddingHorizontal: 6 },
  badgeText: { color: '#070B09', fontSize: 12, fontWeight: '800' },
  warning: { color: '#A1A1AA' },
});
