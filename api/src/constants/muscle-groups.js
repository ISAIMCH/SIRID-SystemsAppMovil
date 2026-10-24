const MUSCLE_GROUPS = Object.freeze([
  'Abdominales',
  'Abductores',
  'Aductores',
  'Antebrazos',
  'Bíceps',
  'Cardio',
  'Cuello',
  'Cuádriceps',
  'Dorsales',
  'Espalda',
  'Femoral',
  'Gemelos',
  'Glúteos',
  'Hombros',
  'Lumbar',
  'Pecho',
  'Trapecio',
  'Tríceps',
]);

const LEGACY_MUSCLE_GROUPS = new Map([
  ['pierna', 'Cuádriceps'],
  ['piernas', 'Cuádriceps'],
  ['brazos', 'Bíceps'],
  ['core', 'Abdominales'],
  ['cuerpo completo', 'Cardio'],
  ['gluteo', 'Glúteos'],
  ['glúteo', 'Glúteos'],
  ['gluteos', 'Glúteos'],
  ['glúteos', 'Glúteos'],
  ['hombro', 'Hombros'],
  ['hombros', 'Hombros'],
  ['pectoral', 'Pecho'],
  ['pectorales', 'Pecho'],
  ['pecho', 'Pecho'],
  ['biceps', 'Bíceps'],
  ['bíceps', 'Bíceps'],
  ['triceps', 'Tríceps'],
  ['tríceps', 'Tríceps'],
  ['cardio', 'Cardio'],
  ['espalda', 'Espalda'],
]);

function normalizeMuscleGroup(value) {
  const normalized = String(value ?? '').trim().toLocaleLowerCase();
  return LEGACY_MUSCLE_GROUPS.get(normalized) ?? (MUSCLE_GROUPS.includes(value) ? value : 'Abdominales');
}

module.exports = { MUSCLE_GROUPS, normalizeMuscleGroup };
