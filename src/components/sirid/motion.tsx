import * as Haptics from '@/hooks/haptics';
import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  FadeInDown,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { motion } from '@/theme/tokens';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Entrance: short fade + 10px rise, staggered by `index`.
 * Reanimated skips it entirely when the OS asks to reduce motion.
 */
export function FadeIn({ children, index = 0, style }: PropsWithChildren<{ index?: number; style?: StyleProp<ViewStyle> }>) {
  return (
    <Animated.View
      entering={FadeInDown.duration(motion.slow)
        .delay(Math.min(index, 8) * motion.stagger)
        .withInitialValues({ transform: [{ translateY: 10 }] })
        .reduceMotion(ReduceMotion.System)}
      style={style}>
      {children}
    </Animated.View>
  );
}

type PressableScaleProps = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  /** Scale while pressed. 0.97 for cards, 0.95 for small controls. */
  pressedScale?: number;
  haptic?: boolean;
};

/**
 * Press feedback without layout shift: a transform scale on the UI thread
 * plus a light haptic. Falls back to a dim when reduce motion is on.
 */
export function PressableScale(
  { style, children, pressedScale = 0.97, haptic = true, onPressIn, onPressOut, onPress, disabled, ...rest }: PressableScaleProps,
) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const dim = useSharedValue(1);
  // Opacity is only animated under reduce motion, so a disabled style's opacity is never overridden.
  const animatedStyle = useAnimatedStyle(() => (reduceMotion
    ? { opacity: dim.value * (disabled ? 0.45 : 1) }
    : { transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPressIn={(event) => {
        if (reduceMotion) dim.set(withTiming(0.7, { duration: motion.fast }));
        else scale.set(withSpring(pressedScale, { damping: 20, stiffness: 420, mass: 0.6 }));
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        if (reduceMotion) dim.set(withTiming(1, { duration: motion.fast }));
        else scale.set(withSpring(1, { damping: 16, stiffness: 320, mass: 0.6 }));
        onPressOut?.(event);
      }}
      onPress={(event) => {
        if (haptic) void Haptics.selectionAsync();
        onPress?.(event);
      }}
      style={[style, animatedStyle]}
      {...rest}>
      {children}
    </AnimatedPressable>
  );
}
