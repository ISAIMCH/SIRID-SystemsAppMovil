const EQUIPMENT_CATEGORIES = Object.freeze([
  'Sin equipo',
  'Barras',
  'Pesas / Mancuernas',
  'Máquinas',
  'Poleas / Cables',
  'Bandas',
  'Pesas rusas',
  'Otro',
]);

const EQUIPMENT_ALIASES = new Map([
  ['body weight', 'Sin equipo'], ['bodyweight', 'Sin equipo'], ['assisted', 'Sin equipo'],
  ['barbell', 'Barras'], ['ez barbell', 'Barras'], ['olympic barbell', 'Barras'], ['trap bar', 'Barras'],
  ['dumbbell', 'Pesas / Mancuernas'], ['weighted', 'Pesas / Mancuernas'],
  ['leverage machine', 'Máquinas'], ['smith machine', 'Máquinas'], ['sled machine', 'Máquinas'],
  ['assisted machine', 'Máquinas'], ['stationary bike', 'Máquinas'], ['elliptical machine', 'Máquinas'],
  ['stepmill machine', 'Máquinas'], ['skierg machine', 'Máquinas'], ['upper body ergometer', 'Máquinas'],
  ['hammer', 'Máquinas'], ['cable', 'Poleas / Cables'], ['rope', 'Poleas / Cables'],
  ['band', 'Bandas'], ['resistance band', 'Bandas'], ['kettlebell', 'Pesas rusas'],
  ['sin equipo', 'Sin equipo'], ['peso corporal', 'Sin equipo'], ['barras', 'Barras'],
  ['barra', 'Barras'], ['pesas / mancuernas', 'Pesas / Mancuernas'], ['mancuernas', 'Pesas / Mancuernas'],
  ['máquinas', 'Máquinas'], ['maquinas', 'Máquinas'], ['poleas / cables', 'Poleas / Cables'],
  ['poleas', 'Poleas / Cables'], ['bandas', 'Bandas'], ['pesas rusas', 'Pesas rusas'],
]);

function normalizeText(value) {
  return String(value ?? '').trim().toLocaleLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function normalizeEquipmentCategory(value) {
  const normalized = normalizeText(value);
  if (!normalized) return 'Otro';
  const direct = EQUIPMENT_ALIASES.get(normalized);
  if (direct) return direct;
  if (normalized.includes('body') || normalized.includes('corporal')) return 'Sin equipo';
  if (normalized.includes('bar') || normalized.includes('barra')) return 'Barras';
  if (normalized.includes('dumbbell') || normalized.includes('mancuern') || normalized.includes('pesa')) return 'Pesas / Mancuernas';
  if (normalized.includes('machine') || normalized.includes('maquina') || normalized.includes('prensa')
    || normalized.includes('caminadora') || normalized.includes('eliptica') || normalized.includes('bicicleta')) return 'Máquinas';
  if (normalized.includes('cable') || normalized.includes('polea') || normalized.includes('rope')) return 'Poleas / Cables';
  if (normalized.includes('band') || normalized.includes('banda')) return 'Bandas';
  if (normalized.includes('kettle')) return 'Pesas rusas';
  return 'Otro';
}

function inferEquipmentCategory(item = {}) {
  const explicit = item.category ?? item.family;
  if (explicit) return normalizeEquipmentCategory(explicit);
  return normalizeEquipmentCategory(`${item.name ?? ''} ${item.zone ?? ''}`);
}

module.exports = { EQUIPMENT_CATEGORIES, normalizeEquipmentCategory, inferEquipmentCategory };
