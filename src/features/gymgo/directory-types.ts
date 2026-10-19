export type DirectoryCoach = {
  id: string;
  name: string;
  lastName?: string;
  email: string;
};

export type DirectoryClient = {
  id: string;
  name: string;
  lastName?: string;
  email: string;
  phone?: string;
  address?: string;
  documents?: string[];
  role: 'Cliente' | 'Coach';
  isActive?: boolean;
  goal?: string;
  experienceLevel?: 'principiante' | 'intermedio' | 'avanzado';
  availableTrainingDays?: number[];
  observations?: string;
  membership?: {
    status: 'pending' | 'active' | 'suspended' | 'expired';
    startsAt?: string;
    expiresAt?: string;
  };
  assignedCoach?: DirectoryCoach | null;
};