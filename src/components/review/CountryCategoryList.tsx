// CountryCategoryList — tap a visited country to set its category
// (Home / Lived in / Visited / Layover). Countries whose name didn't resolve
// to an ISO code (so can't be colored on the map) render read-only. Rows are
// grouped-list style (inset dividers, no divider after the last row), matching
// the platform's standard grouped-table look.

import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_WEIGHTS, SPACING } from '../../config/constants';
import { TEXT_STYLES } from '../../config/typography';
import { useTheme } from '../../context/ThemeContext';
import { getCountryFlagEmoji, getIsoForCountryName } from '../../utils/countryUtils';
import { CATEGORY_LABELS, getCategoryColor } from '../../utils/countryCategoryColors';
import type { CountryVisitCategory } from '../../storage/countryCategoryStorage';
import CategoryPickerSheet from './CategoryPickerSheet';

interface CountryCategoryListProps {
  countryNames: string[];
  categories: Record<string, CountryVisitCategory>;
  onChangeCategory: (isoCode: string, category: CountryVisitCategory) => void;
  /** When set, only rows matching this category render. */
  filterCategory?: CountryVisitCategory | null;
}

const CountryCategoryList: React.FC<CountryCategoryListProps> = ({
  countryNames,
  categories,
  onChangeCategory,
  filterCategory,
}) => {
  const { colors } = useTheme();
  const [pickerTarget, setPickerTarget] = useState<{ iso: string; countryName: string } | null>(null);

  const rows = useMemo(() => {
    const unique = Array.from(new Set(countryNames.map((name) => name.trim()).filter(Boolean)));
    unique.sort((a, b) => a.localeCompare(b));
    return unique
      .map((countryName) => {
        const iso = getIsoForCountryName(countryName);
        const category = iso ? categories[iso] ?? 'visited' : undefined;
        return { countryName, iso, category };
      })
      .filter((row) => !filterCategory || row.category === filterCategory);
  }, [countryNames, categories, filterCategory]);

  if (rows.length === 0) {
    return (
      <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No countries in this category yet.</Text>
    );
  }

  return (
    <View>
      {rows.map(({ countryName, iso, category }, index) => (
        <TouchableOpacity
          key={countryName}
          style={[
            styles.row,
            index < rows.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
          ]}
          disabled={!iso}
          onPress={() => iso && setPickerTarget({ iso, countryName })}
          accessibilityRole={iso ? 'button' : undefined}
          accessibilityLabel={iso ? `Set category for ${countryName}` : `${countryName}, not shown on map`}
        >
          <Text style={styles.flag}>{getCountryFlagEmoji(countryName)}</Text>
          <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
            {countryName}
          </Text>
          {category ? (
            <View style={[styles.badge, { backgroundColor: `${getCategoryColor(category, colors)}26` }]}>
              <View style={[styles.badgeDot, { backgroundColor: getCategoryColor(category, colors) }]} />
              <Text style={[styles.badgeText, { color: getCategoryColor(category, colors) }]}>
                {CATEGORY_LABELS[category]}
              </Text>
            </View>
          ) : (
            <Text style={[styles.notOnMap, { color: colors.textTertiary }]}>Not on map</Text>
          )}
          {iso ? <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} style={styles.chevron} /> : null}
        </TouchableOpacity>
      ))}

      <CategoryPickerSheet
        visible={pickerTarget !== null}
        countryName={pickerTarget?.countryName ?? ''}
        currentCategory={pickerTarget?.iso ? categories[pickerTarget.iso] ?? 'visited' : 'visited'}
        onSelect={(category) => {
          if (pickerTarget) onChangeCategory(pickerTarget.iso, category);
          setPickerTarget(null);
        }}
        onCancel={() => setPickerTarget(null)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm + 2,
  },
  flag: {
    fontSize: 20,
  },
  name: {
    ...TEXT_STYLES.entryInput,
    fontSize: 15,
    flex: 1,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: SPACING.xs + 2,
    paddingVertical: 4,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeText: {
    ...TEXT_STYLES.entryInput,
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  notOnMap: {
    ...TEXT_STYLES.entryInput,
    fontSize: 11,
    fontStyle: 'italic',
  },
  chevron: {
    marginLeft: -SPACING.xs,
  },
  emptyText: {
    ...TEXT_STYLES.entryInput,
    fontSize: 14,
    paddingVertical: SPACING.md,
    textAlign: 'center',
  },
});

export default CountryCategoryList;
