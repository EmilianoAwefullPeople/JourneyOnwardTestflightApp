// StatSlide
// Recap stat slide: optional prefix, number (with count-up), and label

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { FONTS, FONT_WEIGHTS, SPACING } from '../../config/constants';
import type { RecapSlideStatPayload } from '../../models/Recap';

const COUNT_UP_DURATION_MS = 600;

interface StatSlideProps {
  payload: RecapSlideStatPayload;
}

const StatSlide: React.FC<StatSlideProps> = ({ payload }) => {
  const { colors } = useTheme();
  const animatedValue = useRef(new Animated.Value(0)).current;
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    animatedValue.setValue(0);
    setDisplayValue(0);
    const listenerId = animatedValue.addListener(({ value }) => {
      setDisplayValue(Math.round(value));
    });
    Animated.timing(animatedValue, {
      toValue: payload.value,
      duration: COUNT_UP_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => {
      animatedValue.removeListener(listenerId);
    };
  }, [payload.value, animatedValue]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: SPACING.xl,
        },
        prefix: {
          fontFamily: FONTS.inter,
          fontSize: 16,
          color: colors.textSecondary,
          marginBottom: SPACING.sm,
        },
        value: {
          fontFamily: FONTS.inter,
          fontSize: 56,
          fontWeight: FONT_WEIGHTS.bold,
          color: colors.textPrimary,
          marginBottom: SPACING.sm,
        },
        label: {
          fontFamily: FONTS.inter,
          fontSize: 20,
          color: colors.textSecondary,
        },
      }),
    [colors]
  );

  return (
    <View style={styles.container}>
      {payload.prefix ? <Text style={styles.prefix}>{payload.prefix}</Text> : null}
      <Text style={styles.value}>{displayValue}</Text>
      <Text style={styles.label}>{payload.label}</Text>
    </View>
  );
};

export default StatSlide;
