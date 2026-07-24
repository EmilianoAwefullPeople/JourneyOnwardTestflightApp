// CategoryFilterChips — doubles as the map legend and a tap-to-isolate filter.
// Tapping a chip highlights that category on the map and narrows the country
// list to it; tapping the same chip again clears the filter.

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FONT_WEIGHTS, SPACING } from '../../config/constants';
import { TEXT_STYLES } from '../../config/typography';
import { useTheme } from '../../context/ThemeContext';
import type { CountryVisitCategory } from '../../storage/countryCategoryStorage';
import { CATEGORY_LABELS, CATEGORY_ORDER, getCategoryColor } from '../../utils/countryCategoryColors';

interface CategoryFilterChipsProps {
  selected: CountryVisitCategory | null;
  onToggle: (category: CountryVisitCategory) => void;
}

const CategoryFilterChips: React.FC<CategoryFilterChipsProps> = ({ selected, onToggle }) => {
  const { colors } = useTheme();

  return (
    <View style={styles.row}>
      {CATEGORY_ORDER.map((category) => {
        const color = getCategoryColor(category, colors);
        const active = selected === category;
        return (
          <Pressable
            key={category}
            onPress={() => onToggle(category)}
            style={[
              styles.chip,
              {
                borderColor: active ? color : colors.border,
                backgroundColor: active ? `${color}26` : colors.surfaceVariant,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${CATEGORY_LABELS[category]}${active ? ', filter active' : ''}`}
            accessibilityState={{ selected: active }}
            hitSlop={4}
          >
            <View style={[styles.dot, { backgroundColor: color }]} />
            <Text style={[styles.label, { color: active ? color : colors.textSecondary }]}>
              {CATEGORY_LABELS[category]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    ...TEXT_STYLES.entryInput,
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});

export default CategoryFilterChips;
