import * as ExpoHaptics from 'expo-haptics';

// Haptics are cosmetic: if the native module is missing from the binary
// (old dev build, unsupported device) we silently skip instead of rejecting.
export { ImpactFeedbackStyle, NotificationFeedbackType } from 'expo-haptics';

export const impactAsync = (style?: ExpoHaptics.ImpactFeedbackStyle) =>
  ExpoHaptics.impactAsync(style).catch(() => {});

export const notificationAsync = (type?: ExpoHaptics.NotificationFeedbackType) =>
  ExpoHaptics.notificationAsync(type).catch(() => {});

export const selectionAsync = () => ExpoHaptics.selectionAsync().catch(() => {});
