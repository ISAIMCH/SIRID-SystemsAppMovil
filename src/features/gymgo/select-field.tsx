import { MaterialIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { useAdminEmbedded, useAdminLight, useDarkUi } from './ui';
import { makeStyles } from '@/theme/make-styles';
import { useTheme } from '@/theme/theme-provider';

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
  const styles = useStyles();
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const embedded = useAdminEmbedded();
  const adminLight = useAdminLight();
  const admin = embedded || adminLight;
  const dark = useDarkUi();
  const selected = options.find((option) => option.value === value);
  const visibleOptions = options.filter((option) => `${option.label} ${option.hint ?? ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  return (
    <View style={styles.group}>
      <Text style={[styles.label, dark && styles.darkLabel]}>{label}</Text>
      <Pressable accessibilityRole="button" onPress={() => { setIsOpen((open) => !open); setQuery(''); }} style={[styles.select, dark && styles.darkSelect, admin && styles.adminGlassInput]}>
        <Text numberOfLines={1} style={[styles.selectText, dark && styles.darkSelectText, !selected && styles.placeholder, dark && !selected && styles.darkPlaceholder]}>{selected?.label ?? placeholder}</Text>
        <MaterialIcons name={isOpen ? 'expand-less' : 'expand-more'} size={22} color={dark ? colors.textSecondary : colors.textSecondary} />
      </Pressable>
      {isOpen ? (
        <View style={[styles.options, dark && styles.darkOptions, admin && styles.adminGlassInput]}>
          {filterable ? <TextInput value={query} onChangeText={setQuery} placeholder="Buscar..." placeholderTextColor={dark ? colors.textSecondary : colors.textSecondary} style={[styles.filterInput, dark && styles.darkFilterInput, admin && styles.adminGlassInput]} autoFocus /> : null}
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

const useStyles = makeStyles(({ colors }) => ({
  group: { gap: 8 },
  label: { color: colors.text, fontSize: 13, fontWeight: '700' },
  darkLabel: { color: colors.text },
  select: { height: 52, borderRadius: 12, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  darkSelect: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  selectText: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '600' },
  darkSelectText: { color: colors.text },
  placeholder: { color: colors.textSecondary, fontWeight: '400' },
  darkPlaceholder: { color: colors.textSecondary },
  options: { borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  darkOptions: { backgroundColor: colors.surface, borderColor: colors.border },
  option: { paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 2 },
  darkOption: { borderBottomColor: colors.border },
  optionText: { color: colors.text, fontSize: 15 },
  darkOptionText: { color: colors.text },
  optionSelected: { color: colors.accent, fontWeight: '800' },
  darkOptionSelected: { color: colors.accent, fontWeight: '800' },
  clearText: { color: colors.textSecondary },
  addText: { color: colors.info, fontWeight: '800' },
  hint: { color: colors.textSecondary, fontSize: 12 },
  darkHint: { color: colors.textSecondary },
  empty: { color: colors.textSecondary, fontSize: 13, padding: 16 },
  filterInput: { height: 44, color: colors.text, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border, fontSize: 14 },
  darkFilterInput: { color: colors.text, backgroundColor: colors.surface, borderBottomColor: colors.border },
  adminGlassInput: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.text },
}));
