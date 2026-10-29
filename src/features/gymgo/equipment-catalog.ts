import type { MaterialCommunityIcons } from '@expo/vector-icons';

import type { EquipmentCategory } from './equipment-families';

export type PhysicalEquipmentCategory = Exclude<EquipmentCategory, 'Sin equipo'>;
export type CatalogEquipmentType = 'strength' | 'cardio';
export type EquipmentCatalogItem = {
  id: string;
  name: string;
  equipmentCategory: PhysicalEquipmentCategory;
  type: CatalogEquipmentType;
  defaultZone: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
};

export const EQUIPMENT_CATALOG: EquipmentCatalogItem[] = [
  { id: 'treadmill', name: 'Caminadora', equipmentCategory: 'Máquinas', type: 'cardio', defaultZone: 'Cardio', icon: 'run' },
  { id: 'elliptical', name: 'Elíptica', equipmentCategory: 'Máquinas', type: 'cardio', defaultZone: 'Cardio', icon: 'bike' },
  { id: 'stationary-bike', name: 'Bicicleta fija', equipmentCategory: 'Máquinas', type: 'cardio', defaultZone: 'Cardio', icon: 'bike' },
  { id: 'stepmill', name: 'Escaladora', equipmentCategory: 'Máquinas', type: 'cardio', defaultZone: 'Cardio', icon: 'stairs' },
  { id: 'row-ergometer', name: 'Remo ergómetro', equipmentCategory: 'Máquinas', type: 'cardio', defaultZone: 'Cardio', icon: 'rowing' },
  { id: 'leg-press', name: 'Prensa de piernas', equipmentCategory: 'Máquinas', type: 'strength', defaultZone: 'Zona de piernas', icon: 'seat' },
  { id: 'hack-squat', name: 'Hack Squat', equipmentCategory: 'Máquinas', type: 'strength', defaultZone: 'Zona de piernas', icon: 'seat' },
  { id: 'leg-extension', name: 'Extensión de cuádriceps', equipmentCategory: 'Máquinas', type: 'strength', defaultZone: 'Zona de piernas', icon: 'seat' },
  { id: 'lying-leg-curl', name: 'Femoral acostado', equipmentCategory: 'Máquinas', type: 'strength', defaultZone: 'Zona de piernas', icon: 'seat' },
  { id: 'seated-leg-curl', name: 'Femoral sentado', equipmentCategory: 'Máquinas', type: 'strength', defaultZone: 'Zona de piernas', icon: 'seat' },
  { id: 'abductor-adductor', name: 'Máquina de abductores / aductores', equipmentCategory: 'Máquinas', type: 'strength', defaultZone: 'Zona de piernas', icon: 'seat' },
  { id: 'chest-press', name: 'Press de pecho en máquina', equipmentCategory: 'Máquinas', type: 'strength', defaultZone: 'Zona de pecho', icon: 'seat' },
  { id: 'shoulder-press', name: 'Press de hombro en máquina', equipmentCategory: 'Máquinas', type: 'strength', defaultZone: 'Zona de pecho', icon: 'seat' },
  { id: 'pec-deck', name: 'Contractor / Pec Deck', equipmentCategory: 'Máquinas', type: 'strength', defaultZone: 'Zona de pecho', icon: 'seat' },
  { id: 'lat-pulldown', name: 'Jalón al pecho (Polea alta)', equipmentCategory: 'Poleas / Cables', type: 'strength', defaultZone: 'Máquinas', icon: 'cable-data' },
  { id: 'seated-cable-row', name: 'Remo sentado en polea', equipmentCategory: 'Poleas / Cables', type: 'strength', defaultZone: 'Máquinas', icon: 'cable-data' },
  { id: 'crossover', name: 'Polea dual / Crossover', equipmentCategory: 'Poleas / Cables', type: 'strength', defaultZone: 'Máquinas', icon: 'cable-data' },
  { id: 'smith-machine', name: 'Máquina Smith', equipmentCategory: 'Máquinas', type: 'strength', defaultZone: 'Máquinas', icon: 'weight-lifter' },
  { id: 'squat-rack', name: 'Rack de sentadillas / Jaula', equipmentCategory: 'Barras', type: 'strength', defaultZone: 'Peso libre', icon: 'weight-lifter' },
  { id: 'flat-bench', name: 'Banco plano', equipmentCategory: 'Otro', type: 'strength', defaultZone: 'Peso libre', icon: 'seat' },
  { id: 'adjustable-bench', name: 'Banco ajustable', equipmentCategory: 'Otro', type: 'strength', defaultZone: 'Peso libre', icon: 'seat' },
  { id: 'preacher-curl-bench', name: 'Banco predicador', equipmentCategory: 'Otro', type: 'strength', defaultZone: 'Peso libre', icon: 'seat' },
  { id: 'olympic-barbell', name: 'Barra olímpica', equipmentCategory: 'Barras', type: 'strength', defaultZone: 'Peso libre', icon: 'weight' },
  { id: 'ez-bar', name: 'Barra Z', equipmentCategory: 'Barras', type: 'strength', defaultZone: 'Peso libre', icon: 'weight' },
  { id: 'hex-bar', name: 'Barra hexagonal', equipmentCategory: 'Barras', type: 'strength', defaultZone: 'Peso libre', icon: 'weight' },
  { id: 'dumbbell-set', name: 'Set de mancuernas', equipmentCategory: 'Pesas / Mancuernas', type: 'strength', defaultZone: 'Peso libre', icon: 'dumbbell' },
  { id: 'kettlebell-set', name: 'Pesas rusas (Kettlebells)', equipmentCategory: 'Pesas rusas', type: 'strength', defaultZone: 'Funcional', icon: 'kettlebell' },
  { id: 'resistance-bands', name: 'Bandas de resistencia', equipmentCategory: 'Bandas', type: 'strength', defaultZone: 'Funcional', icon: 'bandage' },
  { id: 'parallel-bars', name: 'Barras paralelas / Fondos', equipmentCategory: 'Otro', type: 'strength', defaultZone: 'Funcional', icon: 'human-handsup' },
  { id: 'back-extension', name: 'Banco lumbar / Hiperextensiones', equipmentCategory: 'Otro', type: 'strength', defaultZone: 'Zona de piernas', icon: 'seat' },
  { id: 'pull-up-bar', name: 'Barra de dominadas', equipmentCategory: 'Barras', type: 'strength', defaultZone: 'Funcional', icon: 'human-handsup' },
  { id: 'dip-machine', name: 'Máquina de fondos asistidos', equipmentCategory: 'Máquinas', type: 'strength', defaultZone: 'Máquinas', icon: 'seat' },
  { id: 'calf-machine', name: 'Máquina de pantorrilla', equipmentCategory: 'Máquinas', type: 'strength', defaultZone: 'Zona de piernas', icon: 'seat' },
  { id: 'glute-machine', name: 'Máquina de glúteo', equipmentCategory: 'Máquinas', type: 'strength', defaultZone: 'Zona de piernas', icon: 'seat' },
  { id: 'reverse-fly', name: 'Máquina de deltoides posterior', equipmentCategory: 'Máquinas', type: 'strength', defaultZone: 'Zona de pecho', icon: 'seat' },
  { id: 'landmine', name: 'Landmine', equipmentCategory: 'Barras', type: 'strength', defaultZone: 'Peso libre', icon: 'weight' },
  { id: 'medicine-ball', name: 'Balón medicinal', equipmentCategory: 'Otro', type: 'strength', defaultZone: 'Funcional', icon: 'basketball' },
  { id: 'plyo-box', name: 'Cajón pliométrico', equipmentCategory: 'Otro', type: 'strength', defaultZone: 'Funcional', icon: 'cube-outline' },
  { id: 'ab-wheel', name: 'Rueda abdominal', equipmentCategory: 'Otro', type: 'strength', defaultZone: 'Funcional', icon: 'rotate-3d-variant' },
  { id: 'battle-rope', name: 'Cuerda de batalla', equipmentCategory: 'Bandas', type: 'strength', defaultZone: 'Funcional', icon: 'link-variant' },
  { id: 'sled', name: 'Trineo de empuje', equipmentCategory: 'Máquinas', type: 'strength', defaultZone: 'Funcional', icon: 'sledding' },
];
