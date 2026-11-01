import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Animated, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { connectSocket } from '@/services/socket';

import { api } from './api';
import { useAuth } from './auth-context';
import { FloatingCard } from './fit-ui';
import { usePendingStaffInvitations } from './staff-invitation-notifier';
import { Page } from './ui';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const dark = {
  background: '#070B09',
  surface: '#1E1E1E',
  elevated: '#27272A',
  line: '#27272A',
  muted: '#A1A1AA',
  white: '#FFFFFF',
  green: '#10FF85',
  cyan: '#10FF85',
};

function springScale(scale: Animated.Value, toValue: number) {
  Animated.spring(scale, { toValue, friction: 5, tension: 100, useNativeDriver: true }).start();
}

export default function ClientProfileHub() {
  const { user, signOut } = useAuth();
  const [activeModal, setActiveModal] = useState<'personal' | 'security' | null>(null);
  const [weight, setWeight] = useState(user?.weightKg?.toString() ?? '');
  const [height, setHeight] = useState(user?.heightCm?.toString() ?? '');
  const [age, setAge] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const pendingRequests = usePendingHistoryRequests();
  const pendingInvitations = usePendingStaffInvitations();
  const initials = user?.name.split(' ').map((name) => name[0]).slice(0, 2).join('').toUpperCase() ?? 'GG';

  return (
    <Page dark>
      <View style={styles.header}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
        <View style={styles.headerText}>
          <Text style={styles.title}>{[user?.name, user?.lastName].filter(Boolean).join(' ') || 'Usuario GymGo'}</Text>
          <Text style={styles.subtitle}>Cliente | {user?.heightCm ?? '—'}cm | Edad pendiente</Text>
        </View>
      </View>

      <AnimatedCompetitionCard>
        <FloatingCard style={styles.competitionCard}>
          <View style={styles.competitionInfo}>
            <MaterialIcons name="emoji-events" size={30} color="#FFD54F" />
            <View>
              <Text style={styles.cardTitle}>Competición</Text>
              <Text style={styles.cardSubtitle}>Ranking GymGo / Rango: Oro II</Text>
            </View>
          </View>
          <View style={styles.viewButton}>
            <Text style={styles.viewButtonText}>Ver</Text>
          </View>
        </FloatingCard>
      </AnimatedCompetitionCard>

      <View style={styles.menuList}>
        <MenuRow icon="person-outline" title="Datos personales y físicos" onPress={() => router.push('/(main)/profile')} />
        <MenuRow icon="lock-outline" title="Seguridad y contraseña" onPress={() => setActiveModal('security')} />
        <MenuRow icon="credit-card" title="Membresía y pagos" onPress={() => router.push('/(main)/client-billing' as Href)} />
        <MenuRow icon="folder-shared" title="Mis documentos" onPress={() => router.push('/(main)/documents' as Href)} />
        <MenuRow icon="shield" title="Privacidad e historial" badge={pendingRequests} onPress={() => router.push('/(main)/privacy' as Href)} />
        {pendingInvitations > 0 ? (
          <MenuRow icon="badge" title="Invitaciones al staff" badge={pendingInvitations} onPress={() => router.push('/staff-invitations' as Href)} />
        ) : null}
        <MenuRow icon="logout" title="Cerrar sesión" warning onPress={() => void signOut()} />
      </View>

      <Modal visible={activeModal !== null} transparent animationType="slide" onRequestClose={() => setActiveModal(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{activeModal === 'personal' ? 'Datos personales' : 'Seguridad'}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={() => setActiveModal(null)}>
                <MaterialIcons name="close" size={22} color="#F4F8F5" />
              </Pressable>
            </View>
            {activeModal === 'personal' ? (
              <>
                <ProfileInput label="Peso (kg)" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" />
                <ProfileInput label="Altura (cm)" value={height} onChangeText={setHeight} keyboardType="decimal-pad" />
                <ProfileInput label="Edad" value={age} onChangeText={setAge} keyboardType="number-pad" />
              </>
            ) : (
              <>
                <ProfileInput label="Contraseña actual" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry />
                <ProfileInput label="Nueva contraseña" value={newPassword} onChangeText={setNewPassword} secureTextEntry />
                <ProfileInput label="Confirmar contraseña" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />
                <Pressable accessibilityRole="button" onPress={() => { void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); setActiveModal(null); }} style={styles.submitButton}>
                  <Text style={styles.submitText}>Actualizar contraseña</Text>
                </Pressable>
              </>
            )}
            {activeModal === 'personal' ? <Text style={styles.modalHint}>Edita tus datos desde el perfil físico.</Text> : null}
          </View>
        </View>
      </Modal>
    </Page>
  );
}

function AnimatedCompetitionCard({ children }: { children: React.ReactNode }) {
  const scale = useState(() => new Animated.Value(1))[0];
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel="Ver ranking"
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        Alert.alert('Ranking', 'El sistema de ligas y puntos estará disponible próximamente.');
      }}
      onPressIn={() => springScale(scale, 0.97)}
      onPressOut={() => springScale(scale, 1)}
      style={{ transform: [{ scale }] }}>
      {children}
    </AnimatedPressable>
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

function ProfileInput({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput {...props} placeholderTextColor="#71717A" style={styles.input} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#18181B', borderWidth: 1, borderColor: '#10FF85', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#10FF85', fontSize: 20, fontWeight: '900' },
  headerText: { flex: 1 },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  subtitle: { color: '#A1A1AA', fontSize: 13, marginTop: 5 },
  // competitionCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1E1E1E', borderColor: '#27342E', padding: 18 },
  competitionCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: dark.surface, borderColor: dark.line, padding: 18 },
  competitionInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  cardTitle: { color: '#F4F8F5', fontSize: 15, fontWeight: '800' },
  cardSubtitle: { color: '#91A098', fontSize: 12, marginTop: 4 },
  viewButton: { minHeight: 44, minWidth: 52, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#10FF85', borderRadius: 8, paddingHorizontal: 15 },
  viewButtonText: { color: '#fffffe', fontWeight: '800' },
  // streakCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, borderColor: dark.line, backgroundColor: dark.surface, padding: 16 },
  // menuList: { backgroundColor: '#1E1E1E', borderRadius: 18, borderWidth: 1, borderColor: '#27342E', overflow: 'hidden' },
  menuList: { gap: 10 },
  menuRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, borderColor: '#27272A', backgroundColor: '#1E1E1E' },
  menuTitle: { flex: 1, color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  badge: { minWidth: 22, height: 22, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: '#10FF85', paddingHorizontal: 6 },
  badgeText: { color: '#070B09', fontSize: 12, fontWeight: '800' },
  warning: { color: '#A1A1AA' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#000000B8' },
  modalCard: { gap: 16, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#1E1E1E', padding: 22 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { color: '#F4F8F5', fontSize: 20, fontWeight: '800' },
  inputGroup: { gap: 6 },
  inputLabel: { color: '#F4F8F5', fontSize: 13, fontWeight: '700' },
  input: { height: 48, borderRadius: 10, borderWidth: 1, borderColor: '#27272A', backgroundColor: '#18181B', color: '#FFFFFF', paddingHorizontal: 14, fontSize: 16 },
  submitButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#10FF85' },
  submitText: { color: '#121212', fontSize: 14, fontWeight: '800' },
  modalHint: { color: '#A1A1AA', fontSize: 12 },
});
