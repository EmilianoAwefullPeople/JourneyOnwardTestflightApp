import { Dimensions, StyleSheet } from 'react-native';
import { FONTS, FONT_WEIGHTS } from '../../config/constants';

const { width: SW, height: SH } = Dimensions.get('window');

/** Horizontal inset for recap slide titles (ActivityDistributionGraphSlide reference). */
export const RECAP_SLIDE_H_MARGIN = 24;

export const recapSlideStyles = StyleSheet.create({
  screen: {
    width: SW,
    height: SH,
    backgroundColor: '#141212',
  },
  screenWithTopInset: {
    width: SW,
    height: SH,
    backgroundColor: '#141212',
    paddingTop: SH * 0.15,
  },
  title: {
    fontFamily: FONTS.inter,
    fontSize: 18,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 44,
    paddingHorizontal: RECAP_SLIDE_H_MARGIN,
  },
});
