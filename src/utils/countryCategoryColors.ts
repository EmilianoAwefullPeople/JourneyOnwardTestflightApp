import { COLORS } from '../config/constants';
import type { ThemeColors } from '../config/theme';
import type { CountryVisitCategory } from '../storage/countryCategoryStorage';

export const CATEGORY_ORDER: CountryVisitCategory[] = ['home', 'livedIn', 'visited', 'layover'];

export const CATEGORY_LABELS: Record<CountryVisitCategory, string> = {
  home: 'Home',
  livedIn: 'Lived in',
  visited: 'Visited',
  layover: 'Layover',
};

/** Warm umber for light-mode visited fills — readable on the cream map without pure black. */
const VISITED_LIGHT = '#4A4036';

/** 'visited' is white in dark mode; warm dark brown in light. Other categories use fixed brand colors. */
export function getCategoryColor(category: CountryVisitCategory, colors: ThemeColors): string {
  switch (category) {
    case 'home':
      return COLORS.royalGold;
    case 'livedIn':
      return COLORS.babyBlue;
    case 'layover':
      return COLORS.fern;
    case 'visited':
    default:
      // Light palette background is cream; use that to pick the softer visited fill.
      return colors.background === '#FFFBF5' ? VISITED_LIGHT : colors.textPrimary;
  }
}
