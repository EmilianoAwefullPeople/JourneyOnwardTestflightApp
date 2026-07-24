// CountriesVisitedMap
// Dashboard-card version of the world map: fixed size, non-interactive, with
// a flag row below. See WorldMapSvg for the underlying map and
// CountriesVisitedMapScreen for the pinch-zoomable, category-editable
// full-screen version.

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SPACING } from '../../config/constants';
import type { ThemeColors } from '../../config/theme';
import type { CountryVisitCategory } from '../../storage/countryCategoryStorage';
import WorldMapSvg from './WorldMapSvg';
import CountryFlagRow from './CountryFlagRow';

interface CountriesVisitedMapProps {
  /** ISO 3166-1 alpha-2 -> category, for every visited country (defaults to 'visited' when uncategorized). */
  categories: Record<string, CountryVisitCategory>;
  /** Display names of visited countries (as stored on Entry.country), for the flag row below the map. */
  countryNames: string[];
  width: number;
  colors: ThemeColors;
}

const CountriesVisitedMap: React.FC<CountriesVisitedMapProps> = ({ categories, countryNames, width, colors }) => {
  return (
    <View>
      <WorldMapSvg categories={categories} width={width} colors={colors} />
      <CountryFlagRow countryNames={countryNames} style={styles.flagRow} />
    </View>
  );
};

const styles = StyleSheet.create({
  flagRow: {
    marginTop: SPACING.sm,
  },
});

export default CountriesVisitedMap;
