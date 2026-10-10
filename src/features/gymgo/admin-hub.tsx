import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useState, type PropsWithChildren, type ReactNode } from 'react';
import { Animated, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { palette } from './theme';
import { AdminEmbeddedProvider, AppHeader, Page } from './ui';

export function AdminPillToggle<T extends string>({ value, options, onChange }: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const [trackWidth, setTrackWidth] = useState(0);
  const [indicator] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.spring(indicator, { toValue: selectedIndex, friction: 7, tension: 80, useNativeDriver: true }).start();
  }, [indicator, selectedIndex]);
  const optionWidth = trackWidth / options.length;
  return (
    <View accessibilityRole="tablist" onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)} style={styles.pillTrack}>
      {trackWidth > 0 ? <Animated.View style={[styles.pillIndicator, { width: optionWidth, transform: [{ translateX: indicator.interpolate({ inputRange: [0, Math.max(1, options.length - 1)], outputRange: [0, optionWidth * Math.max(1, options.length - 1)] }) }] }]} /> : null}
      {options.map((option) => (
        <Pressable
          key={option.value}
          accessibilityRole="tab"
          accessibilityState={{ selected: option.value === value }}
          onPress={() => { void Haptics.selectionAsync(); onChange(option.value); }}
          style={({ pressed }) => [styles.pill, pressed && styles.pressed]}>
          <Text style={[styles.pillText, option.value === value && styles.pillTextActive]}>{option.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function AdminCategoryRail<T extends string>({ value, options, onChange }: {
  value: T;
  options: readonly { value: T; label: string; icon: keyof typeof MaterialIcons.glyphMap }[];
  onChange: (value: T) => void;
}) {
  return (
    <FlatList
      accessibilityRole="tablist"
      data={options}
      horizontal
      keyExtractor={(item) => item.value}
      renderItem={({ item }) => {
        const selected = item.value === value;
        return (
          <Pressable accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => { void Haptics.selectionAsync(); onChange(item.value); }} style={({ pressed }) => [styles.categoryChip, selected && styles.categoryChipActive, pressed && styles.pressed]}>
            <MaterialIcons name={item.icon} size={18} color={selected ? palette.white : palette.green} />
            <Text style={[styles.categoryText, selected && styles.categoryTextActive]}>{item.label}</Text>
          </Pressable>
        );
      }}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.categoryRail}
    />
  );
}

export function AdminHub({ children, toggle, title, detail }: PropsWithChildren<{ toggle: ReactNode; title: string; detail: string }>) {
  return (
    <Page admin>
      <AppHeader title={title} detail={detail} />
      <AdminEmbeddedProvider>
        {toggle}
        {children}
      </AdminEmbeddedProvider>
    </Page>
  );
}

const styles = StyleSheet.create({
  pillTrack: { flexDirection: 'row', gap: 4, borderRadius: 20, backgroundColor: 'rgba(255, 255, 255, 0.7)', borderWidth: 1, borderColor: 'rgba(0, 0, 0, 0.05)', padding: 4, marginBottom: -16 },
  pillIndicator: { position: 'absolute', left: 4, top: 4, bottom: 4, borderRadius: 16, backgroundColor: palette.deepGreen, borderWidth: 1, borderColor: palette.deepGreen },
  pill: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 14, zIndex: 1 },
  pressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },
  pillText: { color: palette.ink, fontSize: 14, fontWeight: '800' },
  pillTextActive: { color: palette.white },
  categoryRail: { gap: 8, paddingRight: 22 },
  categoryChip: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 44, borderRadius: 22, paddingHorizontal: 14, backgroundColor: 'rgba(255, 255, 255, 0.7)', borderWidth: 1, borderColor: 'rgba(0, 0, 0, 0.05)' },
  categoryChipActive: { backgroundColor: palette.deepGreen, borderColor: palette.deepGreen },
  categoryText: { color: palette.green, fontSize: 13, fontWeight: '800' },
  categoryTextActive: { color: palette.white },
});
