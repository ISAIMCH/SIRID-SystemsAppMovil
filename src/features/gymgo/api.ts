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

api.interceptors.request.use(async (config) => {
  const token = await readAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let handleUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  handleUnauthorized = handler;
}

// An expired or revoked session ends here; requests sent with an older token are ignored.
api.interceptors.response.use(undefined, async (error: unknown) => {
  if (isAxiosError(error) && error.response?.status === 401) {
    const sentAuthorization = error.config?.headers?.Authorization;
    const token = await readAccessToken();
    if (token && sentAuthorization === `Bearer ${token}`) handleUnauthorized?.();
  }
  return Promise.reject(error);
});

export function getApiErrorMessage(error: unknown, fallback: string) {
  if (isAxiosError<{ error?: string }>(error)) {
    if (error.response) return error.response.data?.error ?? fallback;
    return `${fallback} (${error.code ?? 'sin respuesta'}: ${error.message}) — ${apiOrigin}`;
  }
  return error instanceof Error ? `${fallback} (${error.message})` : fallback;
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