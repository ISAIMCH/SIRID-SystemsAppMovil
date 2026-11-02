import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { palette } from './theme';

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

const styles = StyleSheet.create({
  pillTrack: { flexDirection: 'row', gap: 4, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E4E4E7', padding: 4, marginBottom: -16 },
  pillIndicator: { position: 'absolute', left: 4, top: 4, bottom: 4, borderRadius: 16, backgroundColor: palette.deepGreen, borderWidth: 1, borderColor: palette.deepGreen },
  pill: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, zIndex: 1 },
  pressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },
  pillText: { color: '#52525B', fontSize: 14, fontWeight: '800' },
  pillTextActive: { color: palette.white },
});
