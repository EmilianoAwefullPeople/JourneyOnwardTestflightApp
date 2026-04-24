// OutroSlide
// Recap outro slide: closing message

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { FONTS, FONT_WEIGHTS, SPACING } from '../../config/constants';
import type { RecapSlideOutroPayload } from '../../models/Recap';

interface OutroSlideProps {
  payload: RecapSlideOutroPayload;
}

const OutroSlide: React.FC<OutroSlideProps> = ({ payload }) => {
  const { colors } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: SPACING.xl,
          paddingVertical: SPACING.xxl,
        },
        message: {
          fontFamily: FONTS.inter,
          fontSize: 22,
          fontWeight: FONT_WEIGHTS.semibold,
          color: colors.textPrimary,
          textAlign: 'center',
        },
      }),
    [colors]
  );

  return (
    <View style={styles.container}>
      <Text style={styles.message} numberOfLines={2}>
        {payload.message}
      </Text>
    </View>
  );
};

export default OutroSlide;
