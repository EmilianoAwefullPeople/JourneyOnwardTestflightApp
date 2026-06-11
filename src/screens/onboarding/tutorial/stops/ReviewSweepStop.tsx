// TODO(phase2): Re-skin this component in Trip-in-Review visual format
// TODO(phase2): Navigate to Review screen and show positioned tooltip overlays over actual UI elements.
// Phase 1: Sequential tooltip callouts rendered as information cards within the tutorial screen.

import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../../../../components/common/AppText';
import { useTheme } from '../../../../context/ThemeContext';
import { FONTS, FONT_WEIGHTS, SPACING } from '../../../../config/constants';

interface Props {
  onComplete: () => void;
}

const TOOLTIPS = [
  {
    section: 'Dashboard',
    icon: 'bar-chart' as const,
    copy: 'Your stats and insights across all memories',
  },
  {
    section: 'Trip Albums',
    icon: 'albums' as const,
    copy: 'All your trips, organized',
  },
  {
    section: 'All',
    icon: 'grid' as const,
    copy: 'Every memory, free to explore',
  },
];

const ReviewSweepStop: React.FC<Props> = ({ onComplete }) => {
  const { colors } = useTheme();
  const [tooltipIndex, setTooltipIndex] = useState(0);

  const current = TOOLTIPS[tooltipIndex];
  const isLast = tooltipIndex === TOOLTIPS.length - 1;

  const dismiss = () => {
    if (isLast) {
      onComplete();
    } else {
      setTooltipIndex((i) => i + 1);
    }
  };

  return (
    <View style={styles.container}>
      <AppText style={[styles.sectionLabel, { color: colors.textSecondary }]}>Review section</AppText>
      <AppText style={[styles.progress, { color: colors.textTertiary }]}>
        {tooltipIndex + 1} of {TOOLTIPS.length}
      </AppText>

      <TouchableOpacity
        style={[styles.tooltipCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={dismiss}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`Dismiss ${current.section} tooltip`}
      >
        <View style={[styles.iconWrap, { backgroundColor: colors.surfaceVariant }]}>
          <Ionicons name={current.icon} size={26} color={colors.textPrimary} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText style={[styles.tooltipSection, { color: colors.textPrimary }]}>{current.section}</AppText>
          <AppText style={[styles.tooltipCopy, { color: colors.textSecondary }]}>{current.copy}</AppText>
        </View>
        <AppText style={[styles.tapToDismiss, { color: colors.textTertiary }]}>Tap to dismiss</AppText>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    gap: SPACING.lg,
  },
  sectionLabel: {
    fontFamily: FONTS.inter,
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  progress: { fontFamily: FONTS.inter, fontSize: 13 },
  tooltipCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tooltipSection: {
    fontFamily: FONTS.inter,
    fontSize: 18,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: 2,
  },
  tooltipCopy: { fontFamily: FONTS.inter, fontSize: 14, lineHeight: 20 },
  tapToDismiss: { fontFamily: FONTS.inter, fontSize: 12 },
});

export default ReviewSweepStop;
