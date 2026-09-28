export type DirectoryCoach = {
  id: string;
  name: string;
  email: string;
};

export type DirectoryClient = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: 'Cliente';
  isActive: boolean;
  goal?: string;
  experienceLevel?: 'principiante' | 'intermedio' | 'avanzado';
  membership?: {
    status: 'pending' | 'active' | 'suspended' | 'expired';
    startsAt?: string;
    expiresAt?: string;
  };
  assignedCoach: DirectoryCoach | null;
};