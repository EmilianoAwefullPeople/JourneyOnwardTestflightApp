// JourneyCard
// "Your Journey & Missions" progress card for Studio (Figma Milestones)

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useProgress } from '../../context/ProgressContext';
import { useTheme } from '../../context/ThemeContext';
import { FONTS, FONT_SIZES, FONT_WEIGHTS, SPACING } from '../../config/constants';

const CIRCLE_SIZE = 11;
const CIRCLE_GAP = 8;
const TRIANGLE_SIZE = 6;

const JourneyCard: React.FC = () => {
  const { pathSteps, nextUp } = useProgress();
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 280,
      useNativeDriver: true,
    }).start();
  }, [opacity]);

  const completedCount = pathSteps.filter((s) => s.completed).length;
  const nextLine = nextUp ? `Next Up: ${nextUp.label}` : 'All done!';
  const accessibilityLabel = nextUp
    ? `Your journey, step ${completedCount + 1} of 6. Next up: ${nextUp.label}`
    : 'Your journey, all 6 steps complete.';

  const cardBg = colors.journeyCardBackground ?? colors.surfaceVariant;
  const cardBorder = colors.journeyCardBorder ?? colors.borderLight;
  const cardTextPrimary = colors.journeyCardTextPrimary ?? colors.textPrimary;
  const cardTextSecondary = colors.journeyCardTextSecondary ?? colors.textSecondary;

  return (
    <Animated.View
      style={[
        styles.card,
        {
          backgroundColor: cardBg,
          borderColor: cardBorder,
        },
        { opacity },
      ]}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="summary"
    >
      <Text style={[styles.title, { color: cardTextPrimary }]}>Your Journey & Missions</Text>

      <View style={styles.indicatorRow}>
        {pathSteps.map((step, index) => {
          const isCurrent = step.isNext;
          return (
            <View key={step.key} style={styles.stepWrapper}>
              <View
                style={[
                  styles.circle,
                  {
                    backgroundColor: step.completed ? cardTextPrimary : 'transparent',
                    borderColor: cardTextPrimary,
                  },
                ]}
              />
              {isCurrent && (
                <View
                  style={[
                    styles.triangle,
                    {
                      borderBottomColor: cardTextPrimary,
                    },
                  ]}
                />
              )}
              {index < pathSteps.length - 1 && (
                <View
                  style={[
                    styles.dash,
                    {
                      backgroundColor: cardTextPrimary,
                    },
                  ]}
                />
              )}
            </View>
          );
        })}
      </View>

      <Text style={[styles.nextUp, { color: cardTextSecondary }]}>{nextLine}</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 2,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    minWidth: 280,
    alignItems: 'center',
  },
  title: {
    fontFamily: FONTS.inter,
    fontSize: 18,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  indicatorRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
    paddingBottom: TRIANGLE_SIZE + 4,
  },
  stepWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  circle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    borderWidth: 1.5,
  },
  triangle: {
    position: 'absolute',
    left: (CIRCLE_SIZE - TRIANGLE_SIZE) / 2,
    top: CIRCLE_SIZE + 2,
    width: 0,
    height: 0,
    borderLeftWidth: TRIANGLE_SIZE / 2,
    borderRightWidth: TRIANGLE_SIZE / 2,
    borderBottomWidth: TRIANGLE_SIZE,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  dash: {
    width: 12,
    height: 1,
    marginLeft: CIRCLE_GAP / 2,
    marginRight: CIRCLE_GAP / 2,
    marginBottom: CIRCLE_SIZE / 2 - 0.5,
  },
  nextUp: {
    fontFamily: FONTS.inter,
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.regular,
    textAlign: 'center',
  },
});

export default JourneyCard;
