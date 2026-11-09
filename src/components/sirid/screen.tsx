import { router } from 'expo-router';
import type { PropsWithChildren, ReactNode } from 'react';
import { RefreshControl, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { makeStyles } from '@/theme/make-styles';
import { useTheme } from '@/theme/theme-provider';
import { space } from '@/theme/tokens';

import { IconButton, Text } from './primitives';

const useStyles = makeStyles(({ colors }) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.huge, gap: space.xxl },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  headerText: { flex: 1, gap: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
}));

export function Screen({ children, refreshing, onRefresh, overlay, contentStyle, scroll = true }: PropsWithChildren<{
  refreshing?: boolean;
  onRefresh?: () => void;
  overlay?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  scroll?: boolean;
}>) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safe}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.content, contentStyle]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
          refreshControl={onRefresh ? (
            <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accentFill]} progressBackgroundColor={colors.surface} />
          ) : undefined}>
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, { flex: 1 }, contentStyle]}>{children}</View>
      )}
      {overlay}
    </SafeAreaView>
  );
}

/**
 * Screen title block. `back` shows a back button (falls back to Inicio when
 * there is no history, e.g. after a deep link).
 */
export function ScreenHeader({ eyebrow, title, subtitle, back = false, actions, children }: PropsWithChildren<{
  eyebrow?: string;
  title: string;
  subtitle?: string;
  back?: boolean;
  actions?: ReactNode;
}>) {
  const styles = useStyles();
  return (
    <View style={{ gap: space.md }}>
      <View style={styles.header}>
        {back ? (
          <IconButton
            icon="arrow-back"
            label="Volver"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(main)'))}
          />
        ) : null}
        <View style={styles.headerText}>
          {eyebrow ? <Text variant="label" tone="accent">{eyebrow}</Text> : null}
          <Text variant="display" accessibilityRole="header" numberOfLines={2}>{title}</Text>
          {subtitle ? <Text variant="callout" tone="secondary">{subtitle}</Text> : null}
        </View>
        {actions ? <View style={styles.actions}>{actions}</View> : null}
      </View>
      {children}
    </View>
  );
}
