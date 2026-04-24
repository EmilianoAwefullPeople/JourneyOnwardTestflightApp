// TitleSlide
// Recap title slide: trip name + date range

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { FONTS, FONT_WEIGHTS, SPACING } from '../../config/constants';
import type { RecapSlideTitlePayload } from '../../models/Recap';

function formatDateRange(startDate: string, endDate: string): string {
  try {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return `${startDate} – ${endDate}`;
    const sameYear = start.getFullYear() === end.getFullYear();
    return sameYear
      ? `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
      : `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  } catch {
    return `${startDate} – ${endDate}`;
  }
}

interface TitleSlideProps {
  payload: RecapSlideTitlePayload;
}

const TitleSlide: React.FC<TitleSlideProps> = ({ payload }) => {
  const { colors } = useTheme();
  const dateRangeStr = formatDateRange(payload.startDate, payload.endDate);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: SPACING.xl,
        },
        subtitle: {
          fontFamily: FONTS.inter,
          fontSize: 14,
          color: colors.textSecondary,
          textAlign: 'center',
          marginBottom: SPACING.sm,
        },
        title: {
          fontFamily: FONTS.inter,
          fontSize: 26,
          fontWeight: FONT_WEIGHTS.bold,
          color: colors.textPrimary,
          textAlign: 'center',
          marginBottom: SPACING.md,
        },
        dateRange: {
          fontFamily: FONTS.inter,
          fontSize: 16,
          color: colors.textSecondary,
          textAlign: 'center',
        },
      }),
    [colors]
  );

  return (
    <View style={styles.container}>
      {payload.subtitle ? <Text style={styles.subtitle}>{payload.subtitle}</Text> : null}
      <Text style={styles.title} numberOfLines={3}>
        {payload.displayName}
      </Text>
      <Text style={styles.dateRange}>{dateRangeStr}</Text>
    </View>
  );
};

export default TitleSlide;
