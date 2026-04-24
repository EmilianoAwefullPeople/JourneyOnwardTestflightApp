// Layout utilities for safe area and consistent screen chrome
// Use with useSafeAreaInsets() from react-native-safe-area-context
//
// Safe area policy: Primary actions and scroll content must respect insets.top / insets.bottom.
// Bottom-anchored controls (e.g. Save in overlays) use insets.bottom + buffer so they stay
// above the home indicator on all devices.

/** Minimum padding above home indicator for bottom-anchored primary actions (pt). */
export const BOTTOM_SAFE_BUFFER = 24;

/**
 * Default extra padding below the safe area top (e.g. for header content).
 * Header top = insets.top + LAYOUT.headerExtraTop
 */
export const LAYOUT = {
  headerExtraTop: 8,
  contentBottomExtra: 0,
} as const;

/** Minimum height to return from getAvailableHeight to avoid degenerate layouts. */
const MIN_AVAILABLE_HEIGHT = 200;

export type ScreenSafeLayout = {
  paddingTop: number;
  paddingBottom: number;
};

/**
 * Returns the vertical space available for content below the top chrome and above the bottom safe area.
 * Use for content container height so layout adapts to device and safe area.
 * Clamped to MIN_AVAILABLE_HEIGHT to avoid negative or tiny heights if insets are wrong.
 */
export function getAvailableHeight(
  windowHeight: number,
  insets: { top: number; bottom: number },
  headerOrChromeHeight: number
): number {
  const raw = windowHeight - insets.top - insets.bottom - headerOrChromeHeight;
  return Math.max(MIN_AVAILABLE_HEIGHT, raw);
}

/**
 * Returns padding values for content area that respect safe area.
 * Use when wrapping screen content to keep it below notch and above home indicator.
 */
export function getScreenSafeLayout(insets: { top: number; bottom: number }, extraTop = 0, extraBottom = 0): ScreenSafeLayout {
  return {
    paddingTop: insets.top + extraTop,
    paddingBottom: insets.bottom + extraBottom,
  };
}
