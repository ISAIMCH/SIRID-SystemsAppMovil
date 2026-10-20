import { MaterialIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { palette } from './theme';
import { useAdminEmbedded, useDarkUi } from './ui';

export type SelectOption = { value: string; label: string; hint?: string };

export function SelectField({ label, placeholder, options, value, onChange, clearLabel, emptyText, addOption, filterable = false }: {
  label: string;
  placeholder: string;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  clearLabel?: string;
  emptyText?: string;
  addOption?: { label: string; onSelect: () => void };
  filterable?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const admin = useAdminEmbedded();
  const dark = useDarkUi();
  const selected = options.find((option) => option.value === value);
  const visibleOptions = options.filter((option) => `${option.label} ${option.hint ?? ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  return (
    <View style={styles.group}>
      <Text style={[styles.label, dark && styles.darkLabel]}>{label}</Text>
      <Pressable accessibilityRole="button" onPress={() => { setIsOpen((open) => !open); setQuery(''); }} style={[styles.select, dark && styles.darkSelect, admin && styles.adminGlassInput]}>
        <Text numberOfLines={1} style={[styles.selectText, dark && styles.darkSelectText, !selected && styles.placeholder, dark && !selected && styles.darkPlaceholder]}>{selected?.label ?? placeholder}</Text>
        <MaterialIcons name={isOpen ? 'expand-less' : 'expand-more'} size={22} color={dark ? '#9CA3AF' : palette.muted} />
      </Pressable>
      {isOpen ? (
        <View style={[styles.options, dark && styles.darkOptions, admin && styles.adminGlassInput]}>
          {filterable ? <TextInput value={query} onChangeText={setQuery} placeholder="Buscar..." placeholderTextColor={dark ? '#9CA3AF' : palette.muted} style={[styles.filterInput, dark && styles.darkFilterInput, admin && styles.adminGlassInput]} autoFocus /> : null}
          {clearLabel ? (
            <Pressable accessibilityRole="button" onPress={() => { onChange(''); setIsOpen(false); }} style={styles.option}>
              <Text style={[styles.optionText, styles.clearText]}>{clearLabel}</Text>
            </Pressable>
          ) : null}
          {visibleOptions.length === 0 ? <Text style={styles.empty}>{emptyText ?? 'Sin opciones disponibles.'}</Text> : null}
          {visibleOptions.map((option) => (
            <Pressable key={option.value} accessibilityRole="button" onPress={() => { onChange(option.value); setIsOpen(false); }} style={[styles.option, dark && styles.darkOption]}>
              <Text style={[styles.optionText, dark && styles.darkOptionText, option.value === value && (dark ? styles.darkOptionSelected : styles.optionSelected)]}>{option.label}</Text>
              {option.hint ? <Text style={[styles.hint, dark && styles.darkHint]}>{option.hint}</Text> : null}
            </Pressable>
          ))}
          {addOption ? (
            <Pressable accessibilityRole="button" onPress={() => { addOption.onSelect(); setIsOpen(false); }} style={styles.option}>
              <Text style={[styles.optionText, styles.addText]}>{addOption.label}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 8 },
  label: { color: palette.ink, fontSize: 13, fontWeight: '700' },
  darkLabel: { color: '#F4F8F5' },
  select: { height: 52, borderRadius: 16, backgroundColor: '#F2F4EE', paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  darkSelect: { backgroundColor: '#1E1E1E', borderWidth: 1, borderColor: '#333333' },
  selectText: { flex: 1, color: palette.ink, fontSize: 15, fontWeight: '600' },
  darkSelectText: { color: '#FFFFFF' },
  placeholder: { color: palette.muted, fontWeight: '400' },
  darkPlaceholder: { color: '#9CA3AF' },
  options: { borderRadius: 16, backgroundColor: palette.white, borderWidth: 1, borderColor: palette.line, overflow: 'hidden' },
  darkOptions: { backgroundColor: '#1E1E1E', borderColor: '#333333' },
  option: { paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: palette.line, gap: 2 },
  darkOption: { borderBottomColor: '#27272A' },
  optionText: { color: palette.ink, fontSize: 15 },
  darkOptionText: { color: '#FFFFFF' },
  optionSelected: { color: palette.green, fontWeight: '800' },
  darkOptionSelected: { color: '#10FF85', fontWeight: '800' },
  clearText: { color: palette.muted },
  addText: { color: palette.cyan, fontWeight: '800' },
  hint: { color: palette.muted, fontSize: 12 },
  darkHint: { color: '#9CA3AF' },
  empty: { color: palette.muted, fontSize: 13, padding: 16 },
  filterInput: { height: 44, color: palette.ink, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: palette.line, fontSize: 14 },
  darkFilterInput: { color: '#FFFFFF', backgroundColor: '#18181B', borderBottomColor: '#27272A' },
  adminGlassInput: { backgroundColor: 'rgba(255, 255, 255, 0.7)', borderWidth: 1, borderColor: 'rgba(0, 0, 0, 0.05)' },
});
