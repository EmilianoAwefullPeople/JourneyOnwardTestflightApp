// Typography System
// Text styles matching Figma designs

import { FONTS, FONT_SIZES, FONT_WEIGHTS, COLORS } from './constants';
import { TextStyle } from 'react-native';

export interface TypographyStyle extends Omit<TextStyle, 'fontWeight'> {
  fontFamily: string;
  fontSize: number;
  fontWeight?: TextStyle['fontWeight'];
  color: string;
}

/**
 * Predefined text styles matching Figma
 */
export const TEXT_STYLES = {
  // Header
  headerGreeting: {
    fontFamily: FONTS.inter,
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.white,
  } as TextStyle,

  // Navigation
  navTab: {
    fontFamily: FONTS.inter,
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.semibold,
  } as TextStyle,

  navTabActive: {
    color: COLORS.white,
  } as TextStyle,

  navTabInactive: {
    color: COLORS.zinc700,
  } as TextStyle,

  // Entry Cards
  cardTitle: {
    fontFamily: FONTS.inter,
    fontSize: FONT_SIZES.base,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.white,
  } as TextStyle,

  // Entry Section
  entryLabel: {
    fontFamily: FONTS.inter,
    fontSize: FONT_SIZES.base,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.lime800,
  } as TextStyle,

  entryInput: {
    fontFamily: FONTS.inter,
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.regular,
    color: COLORS.white,
  } as TextStyle,

  // Map Controls
  mapControlButton: {
    fontFamily: FONTS.inter,
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.black,
  } as TextStyle,

  mapLocationLabel: {
    fontFamily: FONTS.inter,
    fontSize: FONT_SIZES.base,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.white,
  } as TextStyle,

  // Placeholder text
  placeholderText: {
    fontFamily: FONTS.playfairDisplay,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    fontStyle: 'italic',
    color: COLORS.black,
  } as TextStyle,
};
