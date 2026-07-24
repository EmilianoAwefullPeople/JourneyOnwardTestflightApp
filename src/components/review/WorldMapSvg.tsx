// WorldMapSvg
// Pure static equirectangular world map choropleth (no flags, no chrome).
// Each country with an entry in `categories` is filled per its category color
// (Home / Lived in / Visited / Layover); everything else is a neutral theme
// surface color. Vector-based via react-native-svg, so it stays crisp at any
// size — used both at card size and pinch-zoomed full screen.

import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { ThemeColors } from '../../config/theme';
import { WORLD_COUNTRY_PATHS, WORLD_MAP_VIEWBOX } from '../../data/worldCountryPaths';
import type { CountryVisitCategory } from '../../storage/countryCategoryStorage';
import { getCategoryColor } from '../../utils/countryCategoryColors';

interface WorldMapSvgProps {
  /** ISO 3166-1 alpha-2 -> category, for every country the user has a category for. */
  categories: Record<string, CountryVisitCategory>;
  width: number;
  colors: ThemeColors;
  style?: object;
  /** When set, fades out categorized countries that don't match — used by the category filter chips. */
  highlightCategory?: CountryVisitCategory | null;
}

const DIMMED_OPACITY = 0.22;

const WorldMapSvg: React.FC<WorldMapSvgProps> = ({ categories, width, colors, style, highlightCategory }) => {
  const height = width * 0.5; // matches the 360x180 viewBox aspect ratio

  const paths = useMemo(
    () =>
      WORLD_COUNTRY_PATHS.map(({ code, d }) => {
        const category = categories[code];
        const dimmed = !!(highlightCategory && category && category !== highlightCategory);
        return {
          code,
          d,
          fill: category ? getCategoryColor(category, colors) : colors.surfaceVariant,
          opacity: dimmed ? DIMMED_OPACITY : 1,
        };
      }),
    [categories, colors, highlightCategory]
  );

  return (
    <View style={[styles.container, { width, height }, style]} accessibilityLabel="World map of countries visited">
      <Svg width={width} height={height} viewBox={WORLD_MAP_VIEWBOX}>
        {paths.map(({ code, d, fill, opacity }) => (
          <Path
            key={code}
            d={d}
            fill={fill}
            fillOpacity={opacity}
            stroke={colors.border}
            strokeWidth={0.3}
            fillRule="evenodd"
          />
        ))}
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderRadius: 8,
  },
});

export default WorldMapSvg;
