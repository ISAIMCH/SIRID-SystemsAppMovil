export type Exercise = {
  _id?: string;
  name: string;
  muscleGroup: string;
  equipmentId?: string | {
    _id: string;
    name: string;
    zone: string;
    status: 'available' | 'busy' | 'out_of_service';
  };
  equipment?: string;
  day?: number;
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
  assignedTo: string | { _id: string; name: string; email: string };
  createdBy: string;
  status: 'active' | 'paused';
  exercises: Exercise[];
  updatedAt: string;
};