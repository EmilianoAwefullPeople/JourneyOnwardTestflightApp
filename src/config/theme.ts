// Theme
// Semantic color tokens for light and dark mode. Accent colors (Live Aura, etc.) are unchanged.

import { COLORS } from './constants';

export type ColorScheme = 'light' | 'dark';

export interface ThemeColors {
  // Surfaces
  background: string;
  surface: string;
  surfaceVariant: string;
  // Text
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  // Borders
  border: string;
  borderLight: string;
  // Accents (unchanged in both modes - pass-through from COLORS)
  babyBlue: string;
  royalGold: string;
  fern: string;
  lime800: string;
  red600: string;
  redRecording: string;
  white: string;
  black: string;
  // UI elements that may need theme-aware variants
  stone500: string;
  stone600: string;
  emotionGray: string;
  zinc300: string;
  buttonWhite: string;
  buttonGray: string;
  infoTextGray: string;
  // Journey card (Studio): inverted so it stands out — light card in dark mode, dark card in light mode
  journeyCardBackground: string;
  journeyCardBorder: string;
  journeyCardTextPrimary: string;
  journeyCardTextSecondary: string;
}

const darkPalette: ThemeColors = {
  background: COLORS.neutral900,
  surface: COLORS.zinc900,
  surfaceVariant: '#222222',
  textPrimary: COLORS.white,
  textSecondary: COLORS.neutral400,
  textTertiary: COLORS.zinc700,
  border: COLORS.zinc700,
  borderLight: COLORS.buttonWhite,
  babyBlue: COLORS.babyBlue,
  royalGold: COLORS.royalGold,
  fern: COLORS.fern,
  lime800: COLORS.lime800,
  red600: COLORS.red600,
  redRecording: COLORS.redRecording,
  white: COLORS.white,
  black: COLORS.black,
  stone500: COLORS.stone500,
  stone600: COLORS.stone600,
  emotionGray: COLORS.emotionGray,
  zinc300: COLORS.zinc300,
  buttonWhite: COLORS.buttonWhite,
  buttonGray: COLORS.buttonGray,
  infoTextGray: COLORS.infoTextGray,
  journeyCardBackground: '#E5E5E5',
  journeyCardBorder: '#B0B0B0',
  journeyCardTextPrimary: COLORS.black,
  journeyCardTextSecondary: COLORS.infoTextGray,
};

const lightPalette: ThemeColors = {
  background: '#FFFBF5',
  surface: '#FFFFFF',
  surfaceVariant: '#FFF5E7',
  textPrimary: '#141212',
  textSecondary: '#6F665C',
  textTertiary: '#A49685',
  border: '#EEDFCB',
  borderLight: '#F3E8D7',
  babyBlue: COLORS.babyBlue,
  royalGold: COLORS.royalGold,
  fern: COLORS.fern,
  lime800: COLORS.lime800,
  red600: COLORS.red600,
  redRecording: COLORS.redRecording,
  white: COLORS.white,
  black: COLORS.black,
  stone500: COLORS.stone500,
  stone600: '#8F8579',
  emotionGray: COLORS.emotionGray,
  zinc300: COLORS.zinc300,
  buttonWhite: '#F3E8D7',
  buttonGray: '#F5EBDD',
  infoTextGray: '#6F665C',
  journeyCardBackground: COLORS.zinc900,
  journeyCardBorder: COLORS.zinc700,
  journeyCardTextPrimary: COLORS.white,
  journeyCardTextSecondary: COLORS.neutral400,
};

export function getThemeColors(scheme: ColorScheme): ThemeColors {
  return scheme === 'light' ? lightPalette : darkPalette;
}
