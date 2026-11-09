/**
 * SIRID Systems design tokens.
 *
 * Identity: "volt on ink". The SIRID volt green is the single brand signal; it
 * is shared with the web dashboard so both products read as one ecosystem.
 * Neutrals are a graphite with a faint cool-green tint (dark) and a cool mist
 * (light) — never pure black or pure grey — with four depth levels each.
 *
 * Components never use raw hex: they read `colors.*` from `useTheme()`.
 */

export type ColorScheme = 'light' | 'dark';

const brand = {
  volt: '#10FF85',
  ink: '#0C110E',
};

export type ThemeColors = {
  /** App canvas behind everything. */
  background: string;
  /** Cards, list groups. */
  surface: string;
  /** Things sitting on a surface: chips, inputs, nested tiles. */
  surfaceRaised: string;
  /** Recessed wells: segmented tracks, progress tracks, skeletons. */
  surfaceSunken: string;
  /** Sheets, menus, toasts. */
  overlay: string;
  scrim: string;

  border: string;
  borderStrong: string;
  divider: string;

  text: string;
  textSecondary: string;
  /** Only for large text, placeholders and disabled content. */
  textTertiary: string;
  textInverse: string;

  /** Brand signal used for text/icons on the canvas (AA in both themes). */
  accent: string;
  /** Brand fill used for selected states, progress and charts. */
  accentFill: string;
  accentSoft: string;
  onAccentFill: string;

  /** Primary button. Dark: volt on ink. Light: ink with volt label. */
  primary: string;
  onPrimary: string;
  primaryPressed: string;

  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  info: string;
  infoSoft: string;

  /** Categorical series for charts and category icons. */
  series: [string, string, string, string, string];

  tabBar: string;
  shadow: string;
  /** Hero cards: a deep brand surface in both themes. */
  hero: string;
  heroText: string;
  heroTextSecondary: string;
};

export const darkColors: ThemeColors = {
  background: '#0B0E0D',
  surface: '#131716',
  surfaceRaised: '#1B201E',
  surfaceSunken: '#0F1211',
  overlay: '#1A1F1D',
  scrim: 'rgba(3, 6, 5, 0.72)',

  border: '#252B28',
  borderStrong: '#363E3A',
  divider: '#1F2422',

  text: '#F1F5F2',
  textSecondary: '#A4AFA9',
  textTertiary: '#6E7974',
  textInverse: brand.ink,

  accent: brand.volt,
  accentFill: brand.volt,
  accentSoft: 'rgba(16, 255, 133, 0.12)',
  onAccentFill: '#04120A',

  primary: brand.volt,
  onPrimary: '#04120A',
  primaryPressed: '#0BD870',

  success: '#3EE58F',
  successSoft: 'rgba(62, 229, 143, 0.13)',
  warning: '#FFC24D',
  warningSoft: 'rgba(255, 194, 77, 0.13)',
  danger: '#FF6B5E',
  dangerSoft: 'rgba(255, 107, 94, 0.13)',
  info: '#5CC8FF',
  infoSoft: 'rgba(92, 200, 255, 0.13)',

  series: [brand.volt, '#5CC8FF', '#FFC24D', '#FF8A6B', '#A796FF'],

  tabBar: '#101413',
  shadow: '#000000',
  hero: '#12201A',
  heroText: '#F1F5F2',
  heroTextSecondary: '#A9C2B5',
};

export const lightColors: ThemeColors = {
  background: '#F2F4F1',
  surface: '#FFFFFF',
  surfaceRaised: '#F7F9F6',
  surfaceSunken: '#E8ECE7',
  overlay: '#FFFFFF',
  scrim: 'rgba(12, 17, 14, 0.42)',

  border: '#DDE3DD',
  borderStrong: '#C3CBC4',
  divider: '#E9EDE8',

  text: '#0C110E',
  textSecondary: '#4F5A54',
  textTertiary: '#7D8781',
  textInverse: '#FFFFFF',

  accent: '#007A45',
  accentFill: '#00C46A',
  accentSoft: 'rgba(0, 170, 92, 0.11)',
  onAccentFill: '#04120A',

  primary: brand.ink,
  onPrimary: brand.volt,
  primaryPressed: '#26302B',

  success: '#007A45',
  successSoft: 'rgba(0, 170, 92, 0.11)',
  warning: '#9A5B00',
  warningSoft: 'rgba(255, 170, 30, 0.16)',
  danger: '#C2362B',
  dangerSoft: 'rgba(214, 60, 45, 0.10)',
  info: '#0A6FB0',
  infoSoft: 'rgba(30, 140, 220, 0.11)',

  series: ['#00B862', '#1E8CDC', '#E8A317', '#E8664A', '#7B61E8'],

  tabBar: '#FFFFFF',
  shadow: '#1A2620',
  hero: '#0F1A15',
  heroText: '#F1F5F2',
  heroTextSecondary: '#A9C2B5',
};

export const palettes: Record<ColorScheme, ThemeColors> = { light: lightColors, dark: darkColors };

/** 4pt rhythm. */
export const space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

/**
 * Font families, one per weight so every platform renders the exact face
 * (see makeStyles: it maps `fontWeight` to the right family automatically).
 */
export const fontFaces = {
  body: {
    '400': 'Barlow_400Regular',
    '500': 'Barlow_500Medium',
    '600': 'Barlow_600SemiBold',
    '700': 'Barlow_700Bold',
    '800': 'Barlow_800ExtraBold',
  },
  display: {
    '400': 'BarlowCondensed_500Medium',
    '500': 'BarlowCondensed_500Medium',
    '600': 'BarlowCondensed_600SemiBold',
    '700': 'BarlowCondensed_700Bold',
    '800': 'BarlowCondensed_800ExtraBold',
  },
} as const;

/** Marker for makeStyles: use the condensed display family for this style. */
export const DISPLAY = 'display';

/** Type scale (size / line height). Body never goes below 13 for content. */
export const type = {
  hero: { fontFamily: DISPLAY, fontSize: 44, lineHeight: 46, fontWeight: '800' },
  display: { fontFamily: DISPLAY, fontSize: 34, lineHeight: 38, fontWeight: '800' },
  title: { fontFamily: DISPLAY, fontSize: 26, lineHeight: 30, fontWeight: '700' },
  headline: { fontSize: 18, lineHeight: 24, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  callout: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  metric: { fontFamily: DISPLAY, fontSize: 30, lineHeight: 34, fontWeight: '700' },
} as const;

export const iconSize = { sm: 16, md: 20, lg: 24, xl: 28 } as const;

export const motion = {
  fast: 140,
  base: 220,
  slow: 360,
  stagger: 45,
} as const;

/** Minimum touch target. */
export const hitTarget = 48;

export function elevation(colors: ThemeColors, scheme: ColorScheme, level: 0 | 1 | 2 | 3) {
  if (level === 0) return {};
  // Dark mode separates layers with surface tone and borders; shadows stay subtle.
  const opacity = scheme === 'dark' ? [0, 0.28, 0.36, 0.45][level] : [0, 0.05, 0.08, 0.14][level];
  const radiusValue = [0, 8, 16, 28][level];
  const offset = [0, 2, 6, 12][level];
  return {
    shadowColor: colors.shadow,
    shadowOpacity: opacity,
    shadowRadius: radiusValue,
    shadowOffset: { width: 0, height: offset },
    elevation: [0, 1, 3, 8][level],
  };
}
