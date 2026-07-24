// CountryFlagRow
// Wrapping row of flag emoji for a list of visited country display names.

import React, { useMemo } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { SPACING, FONT_SIZES } from '../../config/constants';
import { getCountryFlagEmoji } from '../../utils/countryUtils';

interface CountryFlagRowProps {
  countryNames: string[];
  style?: object;
}

const CountryFlagRow: React.FC<CountryFlagRowProps> = ({ countryNames, style }) => {
  const flags = useMemo(() => {
    const unique = Array.from(new Set(countryNames.map((name) => name.trim()).filter(Boolean)));
    unique.sort((a, b) => a.localeCompare(b));
    return unique.map((country) => ({ country, flag: getCountryFlagEmoji(country) }));
  }, [countryNames]);

  if (flags.length === 0) return null;

  return (
    <View style={[styles.flagRow, style]} accessibilityLabel="Visited country flags">
      {flags.map(({ country, flag }) => (
        <Text key={country} style={styles.flagEmoji} accessibilityLabel={country}>
          {flag}
        </Text>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  flagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  flagEmoji: {
    fontSize: FONT_SIZES.lg,
  },
});

export default CountryFlagRow;
