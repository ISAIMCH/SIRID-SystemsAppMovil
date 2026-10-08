import { MaterialIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { palette } from './theme';

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
  const selected = options.find((option) => option.value === value);
  const visibleOptions = options.filter((option) => `${option.label} ${option.hint ?? ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <Pressable accessibilityRole="button" onPress={() => { setIsOpen((open) => !open); setQuery(''); }} style={styles.select}>
        <Text numberOfLines={1} style={[styles.selectText, !selected && styles.placeholder]}>{selected?.label ?? placeholder}</Text>
        <MaterialIcons name={isOpen ? 'expand-less' : 'expand-more'} size={22} color={palette.muted} />
      </Pressable>
      {isOpen ? (
        <View style={styles.options}>
          {filterable ? <TextInput value={query} onChangeText={setQuery} placeholder="Buscar..." placeholderTextColor={palette.muted} style={styles.filterInput} autoFocus /> : null}
          {clearLabel ? (
            <Pressable accessibilityRole="button" onPress={() => { onChange(''); setIsOpen(false); }} style={styles.option}>
              <Text style={[styles.optionText, styles.clearText]}>{clearLabel}</Text>
            </Pressable>
          ) : null}
          {visibleOptions.length === 0 ? <Text style={styles.empty}>{emptyText ?? 'Sin opciones disponibles.'}</Text> : null}
          {visibleOptions.map((option) => (
            <Pressable key={option.value} accessibilityRole="button" onPress={() => { onChange(option.value); setIsOpen(false); }} style={styles.option}>
              <Text style={[styles.optionText, option.value === value && styles.optionSelected]}>{option.label}</Text>
              {option.hint ? <Text style={styles.hint}>{option.hint}</Text> : null}
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
  select: { height: 52, borderRadius: 16, backgroundColor: '#F2F4EE', paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  selectText: { flex: 1, color: palette.ink, fontSize: 15, fontWeight: '600' },
  placeholder: { color: palette.muted, fontWeight: '400' },
  options: { borderRadius: 16, backgroundColor: palette.white, borderWidth: 1, borderColor: palette.line, overflow: 'hidden' },
  option: { paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: palette.line, gap: 2 },
  optionText: { color: palette.ink, fontSize: 15 },
  optionSelected: { color: palette.green, fontWeight: '800' },
  clearText: { color: palette.muted },
  addText: { color: palette.cyan, fontWeight: '800' },
  hint: { color: palette.muted, fontSize: 12 },
  empty: { color: palette.muted, fontSize: 13, padding: 16 },
  filterInput: { height: 44, color: palette.ink, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: palette.line, fontSize: 14 },
});
