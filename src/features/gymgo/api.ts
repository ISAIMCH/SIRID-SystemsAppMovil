import { create, isAxiosError } from 'axios';

import { readAccessToken } from './token-storage';

const apiOrigin = (process.env.EXPO_PUBLIC_API_URL ?? 'https://sirid-systemsappmovil.onrender.com')
  .replace(/\/+$/, '');

export const api = create({
  baseURL: `${apiOrigin}/api`,
  timeout: 15000,
  headers: { Accept: 'application/json' },
});

api.interceptors.request.use(async (config) => {
  const token = await readAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function getApiErrorMessage(error: unknown, fallback: string) {
  if (isAxiosError<{ error?: string }>(error)) {
    return error.response?.data?.error ?? fallback;
  }
  return fallback;
}