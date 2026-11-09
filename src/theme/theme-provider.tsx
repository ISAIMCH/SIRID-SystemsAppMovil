import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SystemUI from 'expo-system-ui';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { Appearance, Platform, useColorScheme } from 'react-native';

import { palettes, type ColorScheme, type ThemeColors } from './tokens';

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'sirid.theme-preference';

type ThemeContextValue = {
  scheme: ColorScheme;
  colors: ThemeColors;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  /** False until the stored preference has been read. */
  ready: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isPreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let current = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (current && isPreference(stored)) setPreferenceState(stored);
      })
      .catch(() => undefined)
      .finally(() => {
        if (current) setReady(true);
      });
    return () => { current = false; };
  }, []);

  // Native alerts, pickers and the keyboard follow the in-app choice too.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    try {
      Appearance.setColorScheme(preference === 'system' ? 'auto' : preference);
    } catch {
      // Older runtimes without the override API keep following the system.
    }
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
  }, []);

  // With an app override active, useColorScheme already reports it; the explicit
  // branch keeps web and runtimes without the override API correct.
  const scheme: ColorScheme = preference === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : preference;
  const colors = palettes[scheme];

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.background).catch(() => undefined);
  }, [colors.background]);

  const value = useMemo(
    () => ({ scheme, colors, preference, setPreference, ready }),
    [scheme, colors, preference, setPreference, ready],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}

export function useColors(): ThemeColors {
  return useTheme().colors;
}
