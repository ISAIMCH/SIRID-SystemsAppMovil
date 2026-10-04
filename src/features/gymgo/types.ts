export type Exercise = {
  _id?: string;
  name: string;
  muscleGroup: string;
  equipmentId?: string | {
    _id: string;
    name: string;
    zone: string;
    status: 'available' | 'busy' | 'out_of_service';
    type: 'strength' | 'cardio';
  };
  equipment?: string;
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
  isActive: boolean;
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
  routine: string;
  trainingDay: number;
  completedAt: string;
  durationMinutes: number;
  totalVolumeKg: number;
  blocks?: {
    routineBlockId: string;
    blockType: RoutineBlock['blockType'];
    restSeconds: number;
    sets: {
      setNumber: number;
      completedAt: string;
      exercises: {
        routineExerciseId: string;
        exerciseName: string;
        muscleGroup: string;
        metricType: 'strength' | 'cardio';
        reps?: number;
        weightKg?: number;
        durationMinutes?: number;
        distanceKm?: number;
        level?: number;
      }[];
    }[];
  }[];
  exercises?: {
    routineExerciseId: string;
    exerciseName: string;
    sets: { reps: number; weightKg: number; restSeconds: number }[];
  }[];
};
