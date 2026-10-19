import { create, isAxiosError } from 'axios';

import { readAccessToken } from './token-storage';
import type { EquipmentTraffic, Promotion } from './types';

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