// Single source of truth for main tab bar chrome (CustomTabBar in AppNavigator).
// Tab label row height + bottom spacer must stay in sync with AppNavigator styles.

import { DIMENSIONS } from '../config/constants';

/** Minimum home-indicator gutter under tab labels; matches AppNavigator invisible spacer. */
export const MAIN_TAB_BAR_HOME_INDICATOR_MIN = 20;

/** Height of the tab label row only (styles.tabBarContainer.height). */
export function getMainTabBarRowHeight(): number {
  return DIMENSIONS.bottomNavHeight;
}

/**
 * Total height of the custom main tab bar: label row + bottom safe-area gutter.
 * Use for scroll content padding on main-tab screens so the last item clears tab chrome on all iPhones.
 */
export function getMainTabBarChromeHeight(insetsBottom: number): number {
  return getMainTabBarRowHeight() + Math.max(insetsBottom, MAIN_TAB_BAR_HOME_INDICATOR_MIN);
}

/**
 * Effective bottom inset while tab chrome animates in/out.
 * visibilityProgress: 1 = fully shown, 0 = fully hidden.
 */
export function getEffectiveMainTabInset(insetsBottom: number, visibilityProgress: number): number {
  const clamped = Math.min(1, Math.max(0, visibilityProgress));
  return Math.max(insetsBottom, MAIN_TAB_BAR_HOME_INDICATOR_MIN) + getMainTabBarRowHeight() * clamped;
}

/**
 * Bottom padding for ScrollView content on Studio / Review sections above the main tab bar.
 * @param breathingRoom - extra pt below chrome (e.g. SPACING.md)
 */
export function getMainTabScrollContentPaddingBottom(insetsBottom: number, breathingRoom = 0): number {
  return getMainTabBarChromeHeight(insetsBottom) + breathingRoom;
}
