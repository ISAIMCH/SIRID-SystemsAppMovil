import { useMemo } from 'react';
import { StyleSheet, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';

import { useTheme } from './theme-provider';
import { DISPLAY, fontFaces, type ColorScheme, type ThemeColors } from './tokens';

type Weight = keyof typeof fontFaces.body;

function resolveWeight(value: unknown): Weight {
  const numeric = value === 'bold' ? 700 : value === 'normal' || value === undefined ? 400 : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 450) return '400';
  if (numeric <= 550) return '500';
  if (numeric <= 650) return '600';
  if (numeric <= 750) return '700';
  return '800';
}

/**
 * Gives every text style the SIRID face that matches its weight.
 * `fontFamily: DISPLAY` opts into Barlow Condensed. Styles with an explicit
 * real family (e.g. monospace) are left alone.
 */
export function withFonts<T extends Record<string, object>>(styles: T): T {
  const out: Record<string, object> = {};
  for (const [key, raw] of Object.entries(styles)) {
    const style = raw as Record<string, unknown>;
    const isText = 'fontSize' in style || 'fontWeight' in style || style.fontFamily === DISPLAY;
    if (!isText || (typeof style.fontFamily === 'string' && style.fontFamily !== DISPLAY)) {
      out[key] = style;
      continue;
    }
    const faces = style.fontFamily === DISPLAY ? fontFaces.display : fontFaces.body;
    const { fontWeight, ...rest } = style;
    out[key] = { ...rest, fontFamily: faces[resolveWeight(fontWeight)] };
  }
  return out as T;
}

export type StyleContext = { colors: ThemeColors; scheme: ColorScheme };

/**
 * Theme-aware StyleSheet. Usage:
 *   const useStyles = makeStyles(({ colors }) => ({ root: { backgroundColor: colors.background } }));
 *   const styles = useStyles();
 * Styles are rebuilt only when the scheme changes.
 */
type NamedStyles = Record<string, ViewStyle | TextStyle | ImageStyle>;

export function makeStyles<S extends NamedStyles>(factory: (context: StyleContext) => S & NamedStyles) {
  const cache: Partial<Record<ColorScheme, Readonly<S>>> = {};
  return function useStyles(): Readonly<S> {
    const { colors, scheme } = useTheme();
    return useMemo(() => {
      const cached = cache[scheme];
      if (cached) return cached;
      const built = StyleSheet.create(withFonts(factory({ colors, scheme })) as S);
      cache[scheme] = built;
      return built;
    }, [colors, scheme]);
  };
}

/** Font family for one-off inline text styles. */
export function fontFor(weight: Weight | number = '400', display = false) {
  const faces = display ? fontFaces.display : fontFaces.body;
  return faces[resolveWeight(weight)];
}
