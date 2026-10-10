import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { palette } from './theme';
import { AdminEmbeddedProvider, AppHeader, Page } from './ui';

export function AdminPillToggle<T extends string>({ value, options, onChange }: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <View accessibilityRole="tablist" style={styles.pillTrack}>
      {options.map((option) => (
        <Pressable
          key={option.value}
          accessibilityRole="tab"
          accessibilityState={{ selected: option.value === value }}
          onPress={() => onChange(option.value)}
          style={[styles.pill, option.value === value && styles.pillActive]}>
          <Text style={[styles.pillText, option.value === value && styles.pillTextActive]}>{option.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function AdminHub({ children, toggle, title, detail }: PropsWithChildren<{ toggle: ReactNode; title: string; detail: string }>) {
  return (
    <Page>
      <AppHeader title={title} detail={detail} />
      <AdminEmbeddedProvider>
        {toggle}
        {children}
      </AdminEmbeddedProvider>
    </Page>
  );
}

const styles = StyleSheet.create({
  pillTrack: { flexDirection: 'row', gap: 4, borderRadius: 20, backgroundColor: '#E9ECE3', padding: 4, marginBottom: -16 },
  pill: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 14 },
  pillActive: { backgroundColor: palette.deepGreen },
  pillText: { color: palette.ink, fontSize: 14, fontWeight: '800' },
  pillTextActive: { color: palette.white },
});
