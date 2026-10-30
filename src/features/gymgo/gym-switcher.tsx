import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getApiErrorMessage } from './api';
import { useAuth, type SessionGym } from './auth-context';

const dark = { background: '#070B09', surface: '#18181B', line: '#27272A', muted: '#A1A1AA', white: '#FFFFFF', green: '#10FF85' };

function groupByOrganization(gyms: SessionGym[]) {
  const groups = new Map<string, { name: string; gyms: SessionGym[] }>();
  for (const gym of gyms) {
    const group = groups.get(gym.organization.id) ?? { name: gym.organization.name, gyms: [] };
    group.gyms.push(gym);
    groups.set(gym.organization.id, group);
  }
  return [...groups.values()];
}

// Shows the active gym; tapping it lists every gym of the user, grouped by owner. Clients can also join another gym.
// Staff with a single gym have nothing to switch, so it renders nothing for them.
export default function GymSwitcher() {
  const { user, gyms, activeGym, selectGym } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [pendingGymId, setPendingGymId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const isClient = user?.role === 'Cliente';

  if (!activeGym || (!isClient && gyms.length < 2)) return null;
  const groups = groupByOrganization(gyms);

  async function choose(gymId: string) {
    setError('');
    setPendingGymId(gymId);
    try {
      await selectGym(gymId);
      void Haptics.selectionAsync();
      setIsOpen(false);
    } catch (requestError: unknown) {
      setError(getApiErrorMessage(requestError, 'No se pudo cambiar de gimnasio.'));
    } finally {
      setPendingGymId(null);
    }
  }

  function joinAnother() {
    setIsOpen(false);
    router.push('/join-gym');
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Gimnasio actual: ${activeGym.name}. Cambiar de gimnasio`}
        onPress={() => setIsOpen(true)}
        style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
        <MaterialIcons name="location-on" size={16} color={dark.green} />
        <Text numberOfLines={1} style={styles.chipText}>
          {groups.length > 1 ? `${activeGym.organization.name} · ${activeGym.name}` : activeGym.name}
        </Text>
        <MaterialIcons name="expand-more" size={18} color={dark.muted} />
      </Pressable>

      <Modal visible={isOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setIsOpen(false)}>
        <SafeAreaView edges={['top', 'bottom']} style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Tus gimnasios</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={() => setIsOpen(false)} style={styles.closeButton}>
              <MaterialIcons name="close" size={22} color={dark.white} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.sheetContent}>
            {groups.map((group) => (
              <View key={group.name} style={styles.group}>
                <Text style={styles.groupTitle}>{group.name.toUpperCase()}</Text>
                {group.gyms.map((gym) => {
                  const isActive = gym.id === activeGym.id;
                  return (
                    <Pressable
                      key={gym.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isActive, disabled: pendingGymId !== null }}
                      disabled={pendingGymId !== null}
                      onPress={() => void choose(gym.id)}
                      style={({ pressed }) => [styles.gymRow, isActive && styles.gymRowActive, pressed && styles.pressed]}>
                      <Text style={styles.gymName}>{gym.name}</Text>
                      {pendingGymId === gym.id ? <ActivityIndicator color={dark.green} /> : null}
                      {isActive ? <MaterialIcons name="check" size={20} color={dark.green} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            ))}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {isClient ? (
              <Pressable accessibilityRole="button" onPress={joinAnother} style={({ pressed }) => [styles.joinButton, pressed && styles.pressed]}>
                <MaterialIcons name="add" size={20} color={dark.green} />
                <Text style={styles.joinText}>Unirme a otro gimnasio</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  chip: { alignSelf: 'flex-start', maxWidth: '100%', minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 18, borderWidth: 1, borderColor: dark.line, backgroundColor: dark.surface, paddingHorizontal: 12 },
  chipText: { flexShrink: 1, color: dark.white, fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.78 },
  sheet: { flex: 1, backgroundColor: dark.background },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  sheetTitle: { color: dark.white, fontSize: 22, fontWeight: '800' },
  closeButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: dark.surface },
  sheetContent: { paddingHorizontal: 20, paddingBottom: 32, gap: 20 },
  group: { gap: 8 },
  groupTitle: { color: dark.muted, fontSize: 11, fontWeight: '900' },
  gymRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, borderColor: dark.line, backgroundColor: dark.surface, paddingHorizontal: 16 },
  gymRowActive: { borderColor: '#10FF8566' },
  gymName: { flex: 1, color: dark.white, fontSize: 15, fontWeight: '700' },
  error: { color: '#FF8A80', fontSize: 13, textAlign: 'center' },
  joinButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, borderWidth: 1, borderColor: dark.green },
  joinText: { color: dark.green, fontSize: 14, fontWeight: '800' },
});
