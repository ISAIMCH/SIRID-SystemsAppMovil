import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, type Href } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Animated, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuth } from './auth-context';
import { FloatingCard } from './fit-ui';
import { Page } from './ui';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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
  const initials = user?.name.split(' ').map((name) => name[0]).slice(0, 2).join('').toUpperCase() ?? 'GG';

  return (
    <Page dark>
      <View style={styles.header}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
        <View style={styles.headerText}>
          <Text style={styles.title}>{user?.name ?? 'Usuario GymGo'}</Text>
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
  const scale = useRef(new Animated.Value(1)).current;
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

function MenuRow({ icon, title, onPress, warning = false }: { icon: keyof typeof MaterialIcons.glyphMap; title: string; onPress: () => void; warning?: boolean }) {
  const scale = useRef(new Animated.Value(1)).current;
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
      <MaterialIcons name={icon} size={22} color={warning ? '#FF8A80' : '#F4F8F5'} />
      <Text style={[styles.menuTitle, warning && styles.warning]}>{title}</Text>
      {!warning ? <MaterialIcons name="chevron-right" size={22} color="#91A098" /> : null}
    </AnimatedPressable>
  );
}

function ProfileInput({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput {...props} placeholderTextColor="#91A098" style={styles.input} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#18211D', borderWidth: 1, borderColor: '#27342E', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#9BFF63', fontSize: 20, fontWeight: '900' },
  headerText: { flex: 1 },
  title: { color: '#F4F8F5', fontSize: 22, fontWeight: '800' },
  subtitle: { color: '#91A098', fontSize: 13, marginTop: 5 },
  competitionCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1E1E1E', borderColor: '#27342E', padding: 18 },
  competitionInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  cardTitle: { color: '#F4F8F5', fontSize: 15, fontWeight: '800' },
  cardSubtitle: { color: '#91A098', fontSize: 12, marginTop: 4 },
  viewButton: { minHeight: 44, minWidth: 52, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#9BFF63', borderRadius: 8, paddingHorizontal: 15 },
  viewButtonText: { color: '#9BFF63', fontWeight: '800' },
  menuList: { backgroundColor: '#1E1E1E', borderRadius: 18, borderWidth: 1, borderColor: '#27342E', overflow: 'hidden' },
  menuRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#27342E' },
  menuTitle: { flex: 1, color: '#F4F8F5', fontSize: 14, fontWeight: '700' },
  warning: { color: '#FF8A80' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#000000B8' },
  modalCard: { gap: 16, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#1E1E1E', padding: 22 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { color: '#F4F8F5', fontSize: 20, fontWeight: '800' },
  inputGroup: { gap: 6 },
  inputLabel: { color: '#F4F8F5', fontSize: 13, fontWeight: '700' },
  input: { height: 48, borderRadius: 12, borderWidth: 1, borderColor: '#27342E', backgroundColor: '#121212', color: '#F4F8F5', paddingHorizontal: 14, fontSize: 16 },
  submitButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#9BFF63' },
  submitText: { color: '#121212', fontSize: 14, fontWeight: '800' },
  modalHint: { color: '#91A098', fontSize: 12 },
});
