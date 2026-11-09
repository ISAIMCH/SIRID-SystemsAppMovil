import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from '@/hooks/haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { Button, Sheet } from '@/components/sirid';
import { makeStyles } from '@/theme/make-styles';
import { useTheme } from '@/theme/theme-provider';
import { radius, space } from '@/theme/tokens';

import { getApiErrorMessage } from './api';
import { useAuth, type SessionGym } from './auth-context';

const useStyles = makeStyles(({ colors }) => ({
  chip: { alignSelf: 'flex-start', maxWidth: '100%', minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised, paddingHorizontal: 12 },
  chipText: { flexShrink: 1, color: colors.text, fontSize: 14, fontWeight: '600' },
  pressed: { opacity: 0.7 },
  list: { gap: space.xl, paddingBottom: space.sm },
  group: { gap: space.sm },
  groupTitle: { color: colors.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  gymRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surfaceRaised, paddingHorizontal: 16 },
  gymRowActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  gymName: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '600' },
  error: { color: colors.danger, fontSize: 14, textAlign: 'center' },
}));

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
  const styles = useStyles();
  const { colors } = useTheme();
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
        <MaterialIcons name="location-on" size={16} color={colors.accent} />
        <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={styles.chipText}>
          {groups.length > 1 ? `${activeGym.organization.name} · ${activeGym.name}` : activeGym.name}
        </Text>
        <MaterialIcons name="expand-more" size={18} color={colors.textSecondary} />
      </Pressable>

      <Sheet visible={isOpen} onClose={() => setIsOpen(false)} title="Tus gimnasios" subtitle="Cambia de sede o de gimnasio">
        <ScrollView contentContainerStyle={styles.list}>
          {groups.map((group) => (
            <View key={group.name} style={styles.group}>
              <Text style={styles.groupTitle}>{group.name}</Text>
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
                    <MaterialIcons name="fitness-center" size={18} color={isActive ? colors.accent : colors.textSecondary} />
                    <Text style={styles.gymName}>{gym.name}</Text>
                    {pendingGymId === gym.id ? <ActivityIndicator color={colors.accent} /> : null}
                    {isActive ? <MaterialIcons name="check-circle" size={22} color={colors.accent} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ))}

          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

          {isClient ? <Button variant="secondary" icon="add" onPress={joinAnother}>Unirme a otro gimnasio</Button> : null}
        </ScrollView>
      </Sheet>
    </>
  );
}
