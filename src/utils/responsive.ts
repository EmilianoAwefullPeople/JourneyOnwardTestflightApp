// Responsive Utilities
// Utilities for calculating responsive dimensions based on screen size.
// Supports iPhone SE (320pt) through Pro Max (428pt+) and iPad compatibility mode.

import React from 'react';
import { Dimensions, ScaledSize } from 'react-native';

/** Minimum width for phone layout (e.g. iPhone SE 2/3) */
export const MIN_PHONE_WIDTH = 320;
/** Maximum width for scale clamping; larger (e.g. iPad) uses this for scale factor to avoid huge UI */
export const MAX_PHONE_WIDTH = 430;
/** Base reference width (iPhone standard) */
export const BASE_WIDTH = 390;
/** Base reference height */
export const BASE_HEIGHT = 852;

/** Minimum touch target size (pt) per HIG */
export const MIN_TOUCH_TARGET = 44;

// Get current window dimensions
export const getWindowDimensions = (): ScaledSize => {
  return Dimensions.get('window');
};

/** Clamp width to phone range for scale factor (avoids extreme scaling on iPad) */
export const clampWidthForScale = (width: number): number =>
  Math.min(Math.max(width, MIN_PHONE_WIDTH), MAX_PHONE_WIDTH);

export type ResponsiveDimensions = ReturnType<typeof getResponsiveDimensionsFromSize>;

// Responsive dimension calculations (from explicit size for use in hooks)
export const getResponsiveDimensionsFromSize = (screenWidth: number, screenHeight: number) => {
  const clampedWidth = clampWidthForScale(screenWidth);
  const widthScale = clampedWidth / BASE_WIDTH;
  const heightScale = screenHeight / BASE_HEIGHT;

  return {
    screenWidth,
    screenHeight,
    clampedWidth,
    widthScale,
    heightScale,
    mapWidth: screenWidth * 0.97,
    mapHeightCollapsed: screenWidth * 0.608,
    mapHeightExpanded: screenWidth * 1.282,
    feedMapLeft: (screenWidth - screenWidth * 0.97) / 2,
    headerHeight: Math.max(112 * heightScale, 100),
    cameraButtonWidth: 63 * widthScale,
    cameraButtonHeight: 48 * widthScale,
  };
};

// Responsive dimension calculations (uses current Dimensions.get('window'))
export const getResponsiveDimensions = () => {
  const { width, height } = getWindowDimensions();
  return getResponsiveDimensionsFromSize(width, height);
};

// Hook for responsive dimensions (updates on screen rotation / multi-window)
export const useResponsiveDimensions = (): ResponsiveDimensions => {
  const [dimensions, setDimensions] = React.useState(getWindowDimensions());

  React.useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setDimensions(window);
    });
    return () => subscription?.remove();
  }, []);

  return getResponsiveDimensionsFromSize(dimensions.width, dimensions.height);
};
