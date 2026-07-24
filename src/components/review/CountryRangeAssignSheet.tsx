// CountryRangeAssignSheet — modal prompt shown after a long-press-drag range
// selection on a calendar (DashboardDayFlagCalendar). Lets the user assign one
// country to every day in the selected range in a single action.

import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AppTextInput from '../common/AppTextInput';
import { FONT_WEIGHTS, SPACING } from '../../config/constants';
import { TEXT_STYLES } from '../../config/typography';
import { useTheme } from '../../context/ThemeContext';
import { ALL_COUNTRY_NAMES, getCountryFlagEmoji } from '../../utils/countryUtils';

type Props = {
  visible: boolean;
  dayCount: number;
  onCancel: () => void;
  onSave: (country: string) => void;
};

const MAX_SUGGESTIONS = 6;

const CountryRangeAssignSheet: React.FC<Props> = ({ visible, dayCount, onCancel, onSave }) => {
  const { colors } = useTheme();
  const [input, setInput] = useState('');

  const suggestions = useMemo(() => {
    const query = input.trim().toLowerCase();
    if (!query) return [];
    return ALL_COUNTRY_NAMES.filter((name) => name.toLowerCase().includes(query)).slice(0, MAX_SUGGESTIONS);
  }, [input]);

  const handleSave = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setInput('');
    onSave(trimmed);
  };

  const handleCancel = () => {
    setInput('');
    onCancel();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleCancel}>
      <Pressable style={styles.backdrop} onPress={handleCancel} accessibilityLabel="Dismiss">
        <Pressable style={[styles.sheet, { backgroundColor: colors.surface }]} onPress={() => {}}>
          <Text style={[styles.title, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.3}>
            Set country for {dayCount} {dayCount === 1 ? 'day' : 'days'}
          </Text>
          <AppTextInput
            value={input}
            onChangeText={setInput}
            placeholder="Type a country name"
            placeholderTextColor={colors.textTertiary}
            style={[
              styles.input,
              { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.background },
            ]}
            autoCapitalize="words"
            autoCorrect={false}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => handleSave(input)}
          />
          {suggestions.length > 0 ? (
            <View style={styles.suggestionsWrap}>
              {suggestions.map((name) => (
                <TouchableOpacity
                  key={name}
                  style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.background }]}
                  onPress={() => handleSave(name)}
                  accessibilityRole="button"
                >
                  <Text style={[styles.chipText, { color: colors.textPrimary }]}>
                    {getCountryFlagEmoji(name)} {name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
          <TouchableOpacity onPress={handleCancel} style={styles.cancelBtn} accessibilityRole="button">
            <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
          </TouchableOpacity>
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
  input: {
    ...TEXT_STYLES.entryInput,
    fontSize: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  suggestionsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginTop: SPACING.sm,
  },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
  },
  chipText: {
    ...TEXT_STYLES.entryInput,
    fontSize: 13,
  },
  cancelBtn: {
    marginTop: SPACING.md,
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

export default CountryRangeAssignSheet;
