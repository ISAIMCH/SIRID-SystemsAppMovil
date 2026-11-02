import { create, isAxiosError } from 'axios';

import { readAccessToken } from './token-storage';
import type { CustomExercisePayload, CuratedExercise, EquipmentTraffic, Promotion } from './types';

export const apiOrigin = (process.env.EXPO_PUBLIC_API_URL ?? 'https://sirid-systemsappmovil.onrender.com')
  .replace(/\/+$/, '');

export const api = create({
  baseURL: `${apiOrigin}/api`,
  timeout: 60000,
  headers: { Accept: 'application/json' },
});

export async function getPromotions() {
  const response = await api.get<{ promotions: Promotion[] }>('/store/promotions');
  return response.data.promotions.filter((promotion) => promotion.isActive !== false && promotion.active !== false);
}

// The gym the user is working in; the API scopes every request to it (X-Gym-Id).
let activeGymId: string | null = null;

export function setActiveGymHeader(gymId: string | null) {
  activeGymId = gymId;
}

api.interceptors.request.use(async (config) => {
  const token = await readAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (activeGymId && !config.headers.has('X-Gym-Id')) config.headers.set('X-Gym-Id', activeGymId);
  return config;
});

// The organization of a 403 that says SIRID suspended it; the reason only ever reaches its owner.
export type SuspendedOrganization = { id: string; name: string };

export function getSuspendedOrganization(error: unknown): SuspendedOrganization | null {
  if (!isAxiosError<{ code?: string; organization?: SuspendedOrganization }>(error) || error.response?.status !== 403) return null;
  const data = error.response.data;
  return data?.code === 'organization_suspended' && data.organization ? data.organization : null;
}

let handleUnauthorized: (() => void) | null = null;
let handleSuspended: ((organization: SuspendedOrganization) => void) | null = null;

export function setSuspendedHandler(handler: ((organization: SuspendedOrganization) => void) | null) {
  handleSuspended = handler;
}

export function setUnauthorizedHandler(handler: (() => void) | null) {
  handleUnauthorized = handler;
}

// An expired or revoked session ends here; requests sent with an older token are ignored.
// A gym whose organization was suspended mid-session is reported once per request sent to it (X-Gym-Id).
api.interceptors.response.use(undefined, async (error: unknown) => {
  if (isAxiosError(error) && error.response?.status === 401) {
    const sentAuthorization = error.config?.headers?.Authorization;
    const token = await readAccessToken();
    if (token && sentAuthorization === `Bearer ${token}`) handleUnauthorized?.();
  }
  const suspended = getSuspendedOrganization(error);
  if (suspended && isAxiosError(error) && error.config?.headers?.has('X-Gym-Id')) handleSuspended?.(suspended);
  return Promise.reject(error);
});

// The API's machine-readable reason for an error (e.g. account_pending_activation), if it sent one.
export function getApiErrorCode(error: unknown) {
  return isAxiosError<{ code?: string }>(error) ? error.response?.data?.code ?? null : null;
}

export function getApiErrorMessage(error: unknown, fallback: string) {
  if (isAxiosError<{ error?: string }>(error)) {
    if (error.response) return error.response.data?.error ?? fallback;
    if (__DEV__) console.warn(`[api] ${error.code ?? 'sin respuesta'}: ${error.message} — ${apiOrigin}`);
    return error.code === 'ECONNABORTED'
      ? 'El servidor tardó demasiado en responder. Intenta de nuevo en unos segundos.'
      : 'No pudimos conectar con GymGo. Revisa tu conexión a internet e intenta de nuevo.';
  }
  if (__DEV__ && error instanceof Error) console.warn(`[api] ${error.message}`);
  return fallback;
}

export async function getEquipmentTraffic() {
  const response = await api.get<{ traffic: EquipmentTraffic[] }>('/inventory/traffic');
  return response.data.traffic;
}

export async function createExercise(payload: CustomExercisePayload) {
  const response = await api.post<{ exercise: CuratedExercise }>('/exercises', payload);
  return response.data.exercise;
}

export async function updateExercise(id: string, payload: Partial<CustomExercisePayload>) {
  const response = await api.put<{ exercise: CuratedExercise }>(`/exercises/${id}`, payload);
  return response.data.exercise;
}

export async function deleteExercise(id: string) {
  await api.delete(`/exercises/${id}`);
}