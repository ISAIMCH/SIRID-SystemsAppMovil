export type Exercise = {
  _id?: string;
  name: string;
  muscleGroup: string;
  equipment?: string;
  sets: number;
  reps: string;
  suggestedWeight?: number;
  restSeconds: number;
  order: number;
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
  assignedTo: string;
  createdBy: string;
  status: 'active' | 'paused';
  exercises: Exercise[];
  updatedAt: string;
};