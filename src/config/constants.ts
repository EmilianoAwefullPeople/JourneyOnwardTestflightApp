// Design Constants
// Design tokens extracted from Figma designs

import { Dimensions } from 'react-native';

// Initial window size at module load (for non-layout tokens). For layout and scale factor
// use useWindowDimensions() or useResponsiveDimensions() so UI adapts to device and rotation.
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const BASE_WIDTH = 390; // iPhone standard reference width

export const COLORS = {
  // Primary colors from Figma
  lime800: '#3A6B33', // Dark green (primary accent, splash background)
  neutral900: '#141212', // Dark background (main app background)
  white: '#FFFFFF',
  black: '#141212',

  // Neutral colors
  zinc700: '#2E2E2E', // Inactive tab text, borders
  zinc900: '#1A1A1A', // Darker backgrounds
  neutral400: '#9CA3AF', // Placeholder text

  // UI elements
  stone500: '#78716C', // Camera placeholder background
  stone600: '#696969', // Inactive text, camera placeholder
  emotionGray: '#A9A9A9', // Emotion slider inactive
  red600: '#DC2626', // Video recording indicator
  redRecording: '#D22121', // Recording inner circle for video/audio
  zinc300: '#D4D4D8', // Capture button outer circle
  buttonWhite: '#D9D9D9', // Light gray tone for button borders
  buttonGray: '#363636', // Button background and text color
  infoTextGray: '#454545', // "Add more info..." text color

  // Live Aura palette
  babyBlue: '#8dc0e0',
  royalGold: '#fed86d',
  fern: '#487525',
};

export const DIMENSIONS = {
  // Header (responsive; from initial load—prefer useWindowDimensions() for layout)
  headerHeight: Math.max(112 * (SCREEN_HEIGHT / 852), 100),

  // Bottom navigation
  bottomNavHeight: 88,

  // Map dimensions (responsive - calculated as percentage of screen width)
  mapWidth: SCREEN_WIDTH * 0.97, // 97% of screen width
  mapHeightCollapsed: SCREEN_WIDTH * 0.608, // Maintain aspect ratio (237/390 ≈ 0.608)
  mapHeightExpanded: SCREEN_WIDTH * 1.282, // Maintain aspect ratio (500/390 ≈ 1.282)
  feedMapLeft: (SCREEN_WIDTH - (SCREEN_WIDTH * 0.97)) / 2, // Center the map

  // Card dimensions
  cardBorderRadius: 8,
  cardBorderWidth: 2,

  // Border radius
  borderRadiusMedium: 10,
  borderRadiusLarge: 20,
  borderRadiusModal: 24,

  // Map controls
  mapControlButtonWidth: 83,
  mapControlButtonHeight: 20,

  // Entry section
  entrySectionHeight: 80,
  entryInputPadding: 16,

  // Camera button (responsive)
  cameraButtonWidth: 63 * (SCREEN_WIDTH / BASE_WIDTH),
  cameraButtonHeight: 48 * (SCREEN_WIDTH / BASE_WIDTH), // 15% increase: 42 * 1.15 = 48.3px, round to 48px
  cameraButtonBorderRadius: 20,

  // Emotion buttons
  emotionButtonHeight: 40,
  emotionButtonWidth: 152,

  // Capture screen dimensions (base: 390px width)
  captureContainerHeight: 591.93,
  captureButtonSize: 76, // Outer circle size
  captureButtonInnerSize: 64, // Inner circle size (with border)
  cameraContainerWidth: 344, // 80px in 390px base = 344px actual
  cameraContainerHeight: 463.03,

  // Extra-data / details screen: safe blank space below SAVE button (points)
  extraDataBottomSafeInset: 28,
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
};

export const FONTS = {
  inter: 'Inter',
  playfairDisplay: 'Playfair Display',
  permanentMarker: 'PermanentMarker_400Regular',
  caveat: 'Caveat_400Regular',
  mono: 'Courier New',
};

export const FONT_SIZES = {
  xs: 8,
  sm: 12,
  base: 16,
  md: 18,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 36,
  '4xl': 40,
};

export const FONT_WEIGHTS = {
  regular: '400' as const,
  semibold: '600' as const,
  bold: '700' as const,
  black: '900' as const,
};
