export const MUSCLE_GROUPS = [
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
] as const;

export type MuscleGroup = typeof MUSCLE_GROUPS[number];

const legacyMuscleGroups: Record<string, MuscleGroup> = {
  pierna: 'Cuádriceps',
  piernas: 'Cuádriceps',
  brazos: 'Bíceps',
  core: 'Abdominales',
  'cuerpo completo': 'Cardio',
  gluteo: 'Glúteos',
  glúteo: 'Glúteos',
  gluteos: 'Glúteos',
  glúteos: 'Glúteos',
  hombro: 'Hombros',
  hombros: 'Hombros',
  pecho: 'Pecho',
  pectoral: 'Pecho',
  pectorales: 'Pecho',
  espalda: 'Espalda',
  biceps: 'Bíceps',
  bíceps: 'Bíceps',
  triceps: 'Tríceps',
  tríceps: 'Tríceps',
  cardio: 'Cardio',
};

export function normalizeMuscleGroup(value: string | null | undefined): MuscleGroup {
  const normalized = value?.trim().toLocaleLowerCase() ?? '';
  return legacyMuscleGroups[normalized] ?? (isMuscleGroup(value ?? '') ? value as MuscleGroup : 'Abdominales');
}

export function isMuscleGroup(value: string): value is MuscleGroup {
  return (MUSCLE_GROUPS as readonly string[]).includes(value);
}

export type Exercise = {
  _id?: string;
  name: string;
  muscleGroup: MuscleGroup;
  equipmentId?: string | {
    _id: string;
    name: string;
    zone: string;
    status: 'available' | 'busy' | 'out_of_service';
    type: 'strength' | 'cardio';
  };
  equipment?: string;
  gifUrl?: string;
  videoUrl?: string;
  bodyweight?: boolean;
  metricType?: 'strength' | 'cardio';
  day?: number;
  sets?: number;
  reps?: string;
  suggestedWeight?: number;
  restSeconds?: number;
  order: number;
  targetDurationMinutes?: number;
  targetDistanceKm?: number;
  targetLevel?: number;
};

export type RoutineBlock = {
  _id: string;
  day: number;
  blockType: 'single' | 'superset' | 'circuit';
  sets: number;
  restSeconds: number;
  order: number;
  exercises: Exercise[];
};

export type CuratedExercise = {
  _id: string;
  name: string;
  muscleGroup: MuscleGroup;
  equipment: string | null;
  gifUrl?: string | null;
  videoUrl: string;
  isCustom?: boolean;
};

export type CustomExercisePayload = {
  name: string;
  muscleGroup: MuscleGroup;
  equipment?: string | null;
  videoUrl?: string | null;
};

export type Routine = {
  _id: string;
  title: string;
  description?: string;
  goal?: string;
  level: 'principiante' | 'intermedio' | 'avanzado';
  durationWeeks: number;
  daysPerWeek: number;
  scheduleDays?: number[];
  assignedTo: string | { _id: string; name: string; email: string };
  createdBy: string;
  status: 'active' | 'paused';
  sourceTemplate?: string | null;
  blocks?: RoutineBlock[];
  exercises: Exercise[];
  updatedAt: string;
};
export type MembershipPlan = {
  _id: string;
  name: string;
  price: number;
  durationInDays: number;
  specifications: string[];
  planType?: 'standard' | 'promotional';
  autoRenew?: boolean;
  isActive: boolean;
};

export type Promotion = {
  _id: string;
  title: string;
  description?: string;
  discountPercentage?: number;
  applicableProducts?: string[];
  validUntil?: string;
  isActive?: boolean;
  active?: boolean;
  imageUrl?: string;
  // A verified document the client needs for the discount (uploaded in Mis documentos).
  requiredDocument?: 'student_id' | null;
};

export type Order = {
  _id: string;
  items: {
    productId: { _id: string; name: string; imageUrl?: string } | string;
    quantity: number;
    price: number;
  }[];
  totalAmount: number;
  promotionId?: string;
  discountApplied?: number;
  status: 'pending' | 'paid' | 'cancelled';
  pickupPin?: string;
  createdAt: string;
};

export type Sale = {
  _id?: string;
  promotionId?: string;
  discountApplied?: number;
};

export type RoutineTemplate = {
  _id: string;
  title: string;
  description?: string;
  goal?: string;
  level: Routine['level'];
  durationWeeks: number;
  daysPerWeek: number;
  scheduleDays: number[];
  blocks?: RoutineBlock[];
  exercises: Exercise[];
  updatedAt: string;
};

export type WorkoutSessionLog = {
  _id: string;
  routine?: string | { _id?: string; title?: string; goal?: string } | null;
  routineTitle?: string;
  routineGoal?: string;
  trainingDay: number;
  completedAt: string;
  durationMinutes: number;
  caloriesBurned?: number;
  totalRestSeconds?: number;
  activeDurationMinutes?: number;
  targetSetsTotal?: number;
  perceivedExertion?: number;
  clientNotes?: string;
  totalVolumeKg: number;
  blocks?: {
    routineBlockId: string;
    blockType: RoutineBlock['blockType'];
    restSeconds: number;
    targetSets?: number;
    sets: {
      setNumber: number;
      completedAt: string;
      actualRestSeconds?: number;
      addedRestCount?: number;
      restSkipped?: boolean;
      exercises: {
        routineExerciseId: string;
        exerciseName: string;
        muscleGroup: MuscleGroup;
        gifUrl?: string;
        metricType: 'strength' | 'cardio';
        skipped?: boolean;
        reps?: number;
        weightKg?: number;
        durationMinutes?: number;
        distanceKm?: number;
        level?: number;
        targetReps?: number | null;
        targetWeightKg?: number | null;
        targetDurationMinutes?: number | null;
        targetDistanceKm?: number | null;
        targetLevel?: number | null;
      }[];
    }[];
  }[];
  exercises?: {
    routineExerciseId: string;
    exerciseName: string;
    sets: { reps: number; weightKg: number; restSeconds: number; skipped?: boolean }[];
  }[];
};

export type WorkoutSessionPayload = {
  routineId: string;
  trainingDay: number;
  durationMinutes: number;
  totalRestSeconds: number;
  activeDurationMinutes?: number;
  blocks: {
    routineBlockId: string;
    sets: {
      setNumber: number;
      actualRestSeconds?: number;
      addedRestCount?: number;
      restSkipped?: boolean;
      exercises: {
        routineExerciseId: string;
        skipped: boolean;
        reps?: number;
        weightKg?: number;
        durationMinutes?: number;
        distanceKm?: number;
        level?: number;
      }[];
    }[];
  }[];
  perceivedExertion?: number;
  clientNotes?: string;
};

export type EquipmentTraffic = {
  equipmentId: string;
  name: string;
  zone?: string;
  usableUnits: number;
  trafficLevel: 'free' | 'moderate' | 'busy' | 'out_of_service';
  estimatedWaitMinutes: number;
};
