import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FONT_WEIGHTS, SPACING } from '../../config/constants';
import { TEXT_STYLES } from '../../config/typography';
import type { ThemeColors } from '../../config/theme';

export interface DashboardGeneralKpiStripProps {
  /** Same as card inner / chart width so the strip aligns with dashboard cards. */
  innerWidth: number;
  memories: number;
  journalNotes: number;
  countries: number;
  trips: number;
  colors: ThemeColors;
}

const DashboardGeneralKpiStrip: React.FC<DashboardGeneralKpiStripProps> = ({
  innerWidth,
  memories,
  journalNotes,
  countries,
  trips,
  colors,
}) => {
  return (
    <View style={[styles.outer, { width: innerWidth }]} accessibilityLabel="General dashboard stats">
      <View style={styles.row}>
        <View style={styles.cell}>
          <Text
            style={[styles.value, { color: colors.textPrimary }]}
            maxFontSizeMultiplier={1.35}
          >
            {memories}
          </Text>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Memories</Text>
        </View>
        <View style={styles.cell}>
          <Text
            style={[styles.value, { color: colors.textPrimary }]}
            maxFontSizeMultiplier={1.35}
          >
            {journalNotes}
          </Text>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Journal Notes</Text>
        </View>
        <View style={styles.cell}>
          <Text
            style={[styles.value, { color: colors.textPrimary }]}
            maxFontSizeMultiplier={1.35}
          >
            {countries}
          </Text>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Countries</Text>
        </View>
        <View style={styles.cell}>
          <Text
            style={[styles.value, { color: colors.textPrimary }]}
            maxFontSizeMultiplier={1.35}
          >
            {trips}
          </Text>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Trips</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  outer: {
    alignSelf: 'center',
  },
  row: {
    flexDirection: 'row',
    width: '100%',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  cell: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
  },
  value: {
    ...TEXT_STYLES.entryInput,
    fontSize: 36,
    lineHeight: 40,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: 2,
    textAlign: 'center',
    width: '100%',
  },
  label: {
    ...TEXT_STYLES.entryInput,
    fontSize: 13,
    textAlign: 'center',
    width: '100%',
  },
});

export default DashboardGeneralKpiStrip;
