import AsyncStorage from '@react-native-async-storage/async-storage';
import { isAxiosError } from 'axios';
import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { Alert } from 'react-native';

import { disconnectSocket } from '../../services/socket';
import { useCartStore } from '../../store/cartStore';
import { api, getSuspendedOrganization, setActiveGymHeader, setSuspendedHandler, setUnauthorizedHandler, type SuspendedOrganization } from './api';
import { readAccessToken, removeAccessToken, writeAccessToken } from './token-storage';

export type GymGoRole = 'Admin' | 'Coach' | 'Recepcion' | 'Cliente';
export type GymGoCoach = { id?: string; name?: string; email?: string };

export type GymGoUser = {
  id: string;
  name: string;
  lastName?: string;
  email: string;
  phone?: string;
  address?: string;
  documents?: string[];
  role: GymGoRole;
  isActive?: boolean;
  goal?: string;
  experienceLevel?: 'principiante' | 'intermedio' | 'avanzado';
  availableTrainingDays?: number[];
  preferredTrainingTime?: string;
  restrictions?: string;
  preferredZones?: string[];
  weightKg?: number;
  heightCm?: number;
  membership?: {
    status: 'pending' | 'active' | 'suspended' | 'expired';
    startsAt?: string;
    expiresAt?: string;
    planName?: string;
    price?: number;
    currency?: string;
    durationDays?: number;
    autoRenew?: boolean;
    planType?: 'standard' | 'promotional';
  };
  assignedCoach?: string | GymGoCoach | null;
};

// A gym the user belongs to, with their roles there (Propietario/Cliente apply to the whole organization).
export type SessionGym = {
  id: string;
  name: string;
  organization: { id: string; name: string };
  roles: string[];
};

type SessionResponse = { user: GymGoUser; gyms?: SessionGym[]; defaultGymId?: string | null };
type JoinGymResponse = { gym: Omit<SessionGym, 'roles'>; alreadyMember: boolean; gyms: SessionGym[] };

type AuthContextValue = {
  user: GymGoUser | null;
  gyms: SessionGym[];
  activeGym: SessionGym | null;
  // A client who has not joined any gym yet can only join one or sign out.
  needsGym: boolean;
  selectGym: (gymId: string) => Promise<void>;
  joinGym: (code: string) => Promise<JoinGymResponse>;
  // Reloads gyms and roles, e.g. after joining a gym's staff; keeps the active gym when it is still there.
  refreshSession: () => Promise<void>;
  isLoading: boolean;
  sessionError: string | null;
  retrySession: () => void;
  // Set when SIRID suspended the only organization the user can work in; the app shows a notice instead.
  suspendedOrganization: SuspendedOrganization | null;
  dismissSuspension: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: ClientRegistration) => Promise<void>;
  // An account reception opened: the one-time code it gave the client plus a password of their own. Signs in.
  activateAccount: (input: { email: string; code: string; password: string }) => Promise<void>;
  signOut: () => Promise<void>;
  updateUser: (user: GymGoUser) => void;
};

export type ClientRegistration = {
  name: string;
  lastName?: string;
  email: string;
  password: string;
  joinCode?: string;
  goal?: string;
  experienceLevel?: GymGoUser['experienceLevel'];
  availableTrainingDays?: number[];
  preferredTrainingTime?: string;
  restrictions?: string;
  preferredZones?: string[];
};

const AuthContext = createContext<AuthContextValue | null>(null);

const activeGymKey = (userId: string) => `gymgo.activeGym.${userId}`;

// The gym picked last time on this device, if the user still belongs to it; else the API's default.
async function pickActiveGym(userId: string, gyms: SessionGym[], defaultGymId?: string | null) {
  const stored = await AsyncStorage.getItem(activeGymKey(userId)).catch(() => null);
  return [stored, defaultGymId, gyms[0]?.id].find((gymId) => gymId && gyms.some((gym) => gym.id === gymId)) ?? null;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<GymGoUser | null>(null);
  const [gyms, setGyms] = useState<SessionGym[]>([]);
  const [activeGymId, setActiveGymId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [suspendedOrganization, setSuspendedOrganization] = useState<SuspendedOrganization | null>(null);
  // Several requests can fail at once when the gym is suspended; only the first one recovers.
  const isRecovering = useRef(false);

  useEffect(() => {
    let isCurrent = true;

    async function restoreSession() {
      try {
        const token = await readAccessToken();
        if (!token) return;
        setActiveGymHeader(null);
        // Render cold starts can take close to a minute.
        const response = await api.get<SessionResponse>('/auth/me', { timeout: 60000 });
        if (isCurrent) await applySession(response.data);
      } catch (error) {
        // Only a rejected token ends the session; network failures keep it so the user can retry.
        const suspended = getSuspendedOrganization(error);
        if (isAxiosError(error) && error.response?.status === 401) {
          await removeAccessToken();
        } else if (suspended) {
          if (isCurrent) setSuspendedOrganization(suspended);
        } else if (isCurrent) {
          setSessionError('No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.');
        }
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    }

    void restoreSession();
    return () => {
      isCurrent = false;
    };
  }, [restoreAttempt]);

  useEffect(() => {
    setUnauthorizedHandler(() => { void signOut(); });
    return () => setUnauthorizedHandler(null);
  }, []);

  // Re-registered on every render so the handler always sees the current session.
  useEffect(() => {
    setSuspendedHandler((organization) => { void leaveSuspendedGym(organization); });
    return () => setSuspendedHandler(null);
  });

  // The active gym's organization was suspended: move to another gym the user still has, so their
  // training elsewhere is not interrupted, or show the notice when there is none.
  async function leaveSuspendedGym(organization: SuspendedOrganization) {
    if (isRecovering.current) return;
    isRecovering.current = true;
    try {
      setActiveGymHeader(null);
      const { data } = await api.get<SessionResponse>('/auth/me');
      const gymId = await applySession(data);
      const nextGym = data.gyms?.find((gym) => gym.id === gymId);
      if (nextGym && data.user.id) await AsyncStorage.setItem(activeGymKey(data.user.id), nextGym.id).catch(() => undefined);
      useCartStore.getState().clearCart();
      Alert.alert(
        'Gimnasio suspendido',
        `${organization.name} está suspendido temporalmente.${nextGym ? ` Te cambiamos a ${nextGym.name} para que sigas entrenando.` : ''}`,
      );
    } catch (error) {
      const suspended = getSuspendedOrganization(error);
      if (suspended) setSuspendedOrganization(suspended);
    } finally {
      isRecovering.current = false;
    }
  }

  async function dismissSuspension() {
    setSuspendedOrganization(null);
    await signOut();
  }

  // Loads the session for the chosen gym: the user (with that organization's membership) comes from /auth/me.
  async function applySession(session: SessionResponse, preferredGymId?: string) {
    const sessionGyms = session.gyms ?? [];
    const gymId = preferredGymId && sessionGyms.some((gym) => gym.id === preferredGymId)
      ? preferredGymId
      : await pickActiveGym(session.user.id, sessionGyms, session.defaultGymId);
    setActiveGymHeader(gymId);
    let sessionUser = session.user;
    if (gymId && gymId !== session.defaultGymId) {
      sessionUser = (await api.get<SessionResponse>('/auth/me')).data.user;
    }
    setGyms(sessionGyms);
    setActiveGymId(gymId);
    setUser(sessionUser);
    return gymId;
  }

  async function selectGym(gymId: string) {
    if (!user || gymId === activeGymId) return;
    setActiveGymHeader(gymId);
    let response;
    try {
      response = await api.get<SessionResponse>('/auth/me');
    } catch (error) {
      setActiveGymHeader(activeGymId);
      throw error;
    }
    await AsyncStorage.setItem(activeGymKey(user.id), gymId).catch(() => undefined);
    useCartStore.getState().clearCart();
    setActiveGymId(gymId);
    setGyms(response.data.gyms ?? gyms);
    setUser(response.data.user);
  }

  // Joining switches to the new gym right away.
  async function joinGym(code: string) {
    const { data } = await api.post<JoinGymResponse>('/gyms/join', { code });
    if (user) await AsyncStorage.setItem(activeGymKey(user.id), data.gym.id).catch(() => undefined);
    setActiveGymHeader(data.gym.id);
    const response = await api.get<SessionResponse>('/auth/me');
    useCartStore.getState().clearCart();
    await applySession(response.data, data.gym.id);
    return data;
  }

  async function refreshSession() {
    const { data } = await api.get<SessionResponse>('/auth/me');
    await applySession(data, activeGymId ?? undefined);
  }

  function retrySession() {
    setSessionError(null);
    setIsLoading(true);
    setRestoreAttempt((value) => value + 1);
  }

  async function signIn(email: string, password: string) {
    setActiveGymHeader(null);
    let response;
    try {
      response = await api.post<SessionResponse & { token: string }>('/auth/login', {
        email: email.trim().toLowerCase(),
        password,
      });
    } catch (error) {
      const suspended = getSuspendedOrganization(error);
      if (suspended) setSuspendedOrganization(suspended);
      throw error;
    }
    await writeAccessToken(response.data.token);
    await applySession(response.data);
  }

  async function signUp(input: ClientRegistration) {
    setActiveGymHeader(null);
    const response = await api.post<SessionResponse & { token: string }>('/auth/register', {
      ...input,
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
    });
    await writeAccessToken(response.data.token);
    await applySession(response.data);
  }

  async function activateAccount(input: { email: string; code: string; password: string }) {
    setActiveGymHeader(null);
    const response = await api.post<SessionResponse & { token: string }>('/auth/activate', {
      email: input.email.trim().toLowerCase(),
      code: input.code,
      password: input.password,
    });
    await writeAccessToken(response.data.token);
    await applySession(response.data);
  }

  async function signOut() {
    disconnectSocket();
    useCartStore.getState().clearCart();
    await removeAccessToken();
    setActiveGymHeader(null);
    setGyms([]);
    setActiveGymId(null);
    setUser(null);
  }

  const activeGym = gyms.find((gym) => gym.id === activeGymId) ?? null;
  const needsGym = user?.role === 'Cliente' && !gyms.some((gym) => gym.roles.includes('Cliente'));

  return (
    <AuthContext.Provider value={{ user, gyms, activeGym, needsGym, selectGym, joinGym, refreshSession, isLoading, sessionError, retrySession, suspendedOrganization, dismissSuspension, signIn, signUp, activateAccount, signOut, updateUser: setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider.');
  return context;
}