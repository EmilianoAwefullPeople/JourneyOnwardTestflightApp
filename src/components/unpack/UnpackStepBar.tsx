// Step progress indicator for the Unpack A Trip flow (4 outer stages).
// Completed + active segments reveal a tri-color gradient (babyBlue → royalGold → fern).
// Future segments are overlaid with the neutral border color.
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../context/ThemeContext';
import { COLORS } from '../../config/constants';

interface UnpackStepBarProps {
  currentStage: 1 | 2 | 3 | 4;
}

export const UnpackStepBar: React.FC<UnpackStepBarProps> = ({ currentStage }) => {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { backgroundColor: colors.background }]}>
      {/* Gradient spans the full bar — segments reveal or cover it */}
      <LinearGradient
        colors={[COLORS.babyBlue, COLORS.royalGold, COLORS.fern]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.gradientBg}
      />
      {([1, 2, 3, 4] as const).map((stage, i) => (
        <React.Fragment key={stage}>
          {/* Gap between segments uses background color to hide gradient */}
          {i > 0 && <View style={[styles.gap, { backgroundColor: colors.background }]} />}
          {/* Future segments cover the gradient; past/active are transparent */}
          <View
            style={[
              styles.segment,
              { backgroundColor: stage > currentStage ? colors.border : 'transparent' },
            ]}
          />
        </React.Fragment>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    height: 3,
    overflow: 'hidden',
    borderRadius: 1.5,
  },
  gradientBg: {
    ...StyleSheet.absoluteFillObject,
  },
  segment: {
    flex: 1,
    height: 3,
  },
  gap: {
    width: 4,
    height: 3,
  },
});
