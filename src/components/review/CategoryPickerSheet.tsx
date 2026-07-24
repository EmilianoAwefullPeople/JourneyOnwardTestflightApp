// CategoryPickerSheet — modal for setting a visited country's category
// (Home / Lived in / Visited / Layover) from the expanded countries map.

import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { FONT_WEIGHTS, SPACING } from '../../config/constants';
import { TEXT_STYLES } from '../../config/typography';
import { useTheme } from '../../context/ThemeContext';
import { getCountryFlagEmoji } from '../../utils/countryUtils';
import { CATEGORY_LABELS, CATEGORY_ORDER, getCategoryColor } from '../../utils/countryCategoryColors';
import type { CountryVisitCategory } from '../../storage/countryCategoryStorage';

type Props = {
  visible: boolean;
  countryName: string;
  currentCategory: CountryVisitCategory;
  onSelect: (category: CountryVisitCategory) => void;
  onCancel: () => void;
};

const CategoryPickerSheet: React.FC<Props> = ({ visible, countryName, currentCategory, onSelect, onCancel }) => {
  const { colors } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} accessibilityLabel="Dismiss">
        <Pressable style={[styles.sheet, { backgroundColor: colors.surface }]} onPress={() => {}}>
          <Text style={[styles.title, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.3}>
            {getCountryFlagEmoji(countryName)} {countryName}
          </Text>
          {CATEGORY_ORDER.map((category) => {
            const selected = category === currentCategory;
            return (
              <Pressable
                key={category}
                style={[
                  styles.option,
                  { borderColor: selected ? colors.textPrimary : colors.border },
                  selected && { backgroundColor: colors.background },
                ]}
                onPress={() => onSelect(category)}
                accessibilityRole="button"
                accessibilityLabel={CATEGORY_LABELS[category]}
                accessibilityState={{ selected }}
              >
                <View style={[styles.dot, { backgroundColor: getCategoryColor(category, colors) }]} />
                <Text style={[styles.optionText, { color: colors.textPrimary }]}>{CATEGORY_LABELS[category]}</Text>
              </Pressable>
            );
          })}
          <Pressable onPress={onCancel} style={styles.cancelBtn} accessibilityRole="button">
            <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    padding: SPACING.lg,
  },
  title: {
    ...TEXT_STYLES.cardTitle,
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: SPACING.md,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  optionText: {
    ...TEXT_STYLES.entryInput,
    fontSize: 15,
  },
  cancelBtn: {
    marginTop: SPACING.sm,
    alignSelf: 'center',
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
  },
  cancelText: {
    ...TEXT_STYLES.entryInput,
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});

export default CategoryPickerSheet;
