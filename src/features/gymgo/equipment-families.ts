import type { MaterialCommunityIcons } from '@expo/vector-icons';

export type EquipmentCategory = typeof EQUIPMENT_FAMILY_OPTIONS[number]['value'];
type EquipmentIconName = keyof typeof MaterialCommunityIcons.glyphMap;

export const EQUIPMENT_FAMILY_OPTIONS = [
  { value: 'Sin equipo', label: 'Sin equipo', icon: 'human' },
  { value: 'Barras', label: 'Barras', icon: 'weight-lifter' },
  { value: 'Pesas / Mancuernas', label: 'Pesas / Mancuernas', icon: 'dumbbell' },
  { value: 'Máquinas', label: 'Máquinas', icon: 'seat' },
  { value: 'Poleas / Cables', label: 'Poleas / Cables', icon: 'cable-data' },
  { value: 'Bandas', label: 'Bandas', icon: 'bandage' },
  { value: 'Pesas rusas', label: 'Pesas rusas', icon: 'kettlebell' },
  { value: 'Otro', label: 'Otro', icon: 'dots-horizontal-circle-outline' },
] as const satisfies readonly { value: string; label: string; icon: EquipmentIconName }[];

const EQUIPMENT_ALIASES: Record<string, EquipmentCategory> = {
  'sin equipo': 'Sin equipo',
  'peso corporal': 'Sin equipo',
  'peso corporal / libre': 'Sin equipo',
  bodyweight: 'Sin equipo',
  'barras': 'Barras',
  barra: 'Barras',
  barbell: 'Barras',
  'pesas / mancuernas': 'Pesas / Mancuernas',
  mancuernas: 'Pesas / Mancuernas',
  mancuerna: 'Pesas / Mancuernas',
  dumbbell: 'Pesas / Mancuernas',
  'máquinas': 'Máquinas',
  máquina: 'Máquinas',
  maquina: 'Máquinas',
  machine: 'Máquinas',
  'poleas / cables': 'Poleas / Cables',
  polea: 'Poleas / Cables',
  cable: 'Poleas / Cables',
  cables: 'Poleas / Cables',
  'bandas': 'Bandas',
  banda: 'Bandas',
  band: 'Bandas',
  'pesas rusas': 'Pesas rusas',
  kettlebell: 'Pesas rusas',
  otro: 'Otro',
  other: 'Otro',
};

export function normalizeEquipmentCategory(value: string | null | undefined): EquipmentCategory {
  const normalized = value?.trim().toLocaleLowerCase() ?? '';
  if (!normalized) return 'Sin equipo';
  const direct = EQUIPMENT_ALIASES[normalized];
  if (direct) return direct;
  if (normalized.includes('body') || normalized.includes('corporal')) return 'Sin equipo';
  if (normalized.includes('bar')) return 'Barras';
  if (normalized.includes('mancuer') || normalized.includes('dumbbell')) return 'Pesas / Mancuernas';
  if (normalized.includes('máquina') || normalized.includes('maquina') || normalized.includes('machine')) return 'Máquinas';
  if (normalized.includes('polea') || normalized.includes('cable')) return 'Poleas / Cables';
  if (normalized.includes('banda') || normalized.includes('band')) return 'Bandas';
  if (normalized.includes('kettle')) return 'Pesas rusas';
  return 'Otro';
}
