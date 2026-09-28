import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';

import { api } from './api';
import { removeAccessToken, readAccessToken, writeAccessToken } from './token-storage';

export type GymGoRole = 'Admin' | 'Coach' | 'Cliente';

export type GymGoUser = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: GymGoRole;
  isActive: boolean;
  goal?: string;
  experienceLevel?: 'principiante' | 'intermedio' | 'avanzado';
  membership?: {
    status: 'pending' | 'active' | 'suspended' | 'expired';
    startsAt?: string;
    expiresAt?: string;
  };
  assignedCoach?: string | null;
};

type AuthContextValue = {
  user: GymGoUser | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<GymGoUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isCurrent = true;

    async function restoreSession() {
      try {
        const token = await readAccessToken();
        if (!token) return;
        const response = await api.get<{ user: GymGoUser }>('/auth/me');
        if (isCurrent) setUser(response.data.user);
      } catch {
        await removeAccessToken();
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    }

    void restoreSession();
    return () => {
      isCurrent = false;
    };
  }, []);

  async function signIn(email: string, password: string) {
    const response = await api.post<{ token: string; user: GymGoUser }>('/auth/login', {
      email: email.trim().toLowerCase(),
      password,
    });
    await writeAccessToken(response.data.token);
    setUser(response.data.user);
  }

  async function signUp(name: string, email: string, password: string) {
    const response = await api.post<{ token: string; user: GymGoUser }>('/auth/register', {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
    });
    await writeAccessToken(response.data.token);
    setUser(response.data.user);
  }

  async function signOut() {
    await removeAccessToken();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider.');
  return context;
}