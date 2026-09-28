import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const TOKEN_KEY = 'gymgo.jwt';

function getWebStorage() {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage;
}

export async function readAccessToken() {
  if (Platform.OS === 'web') return getWebStorage()?.getItem(TOKEN_KEY) ?? null;
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function writeAccessToken(token: string) {
  if (Platform.OS === 'web') {
    getWebStorage()?.setItem(TOKEN_KEY, token);
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function removeAccessToken() {
  if (Platform.OS === 'web') {
    getWebStorage()?.removeItem(TOKEN_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}