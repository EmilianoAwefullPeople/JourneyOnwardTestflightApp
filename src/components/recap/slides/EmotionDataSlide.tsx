import React, { useMemo } from 'react';
import { Animated, Dimensions, StyleSheet, View } from 'react-native';
import { recapSlideStyles } from '../recapSlideStyles';
import RecapAnimatedTitle from '../motion/RecapAnimatedTitle';
import { useRecapStaggerEntrance } from '../motion/useRecapStaggerEntrance';

const { width: SW, height: SH } = Dimensions.get('window');

interface Props {
  emotions: Array<{ label: string; count: number }>;
}

const EmotionDataSlide: React.FC<Props> = ({ emotions }) => {
  const EmotionWheel = useMemo(
    () => require('../charts/EmotionWheelChart').default,
    []
  );
  const chartEntrance = useRecapStaggerEntrance({ index: 0, baseDelay: 240 });

  return (
    <View style={styles.container}>
      <RecapAnimatedTitle>How you felt</RecapAnimatedTitle>
      <Animated.View style={[styles.chartWrap, chartEntrance.style]}>
        <EmotionWheel emotions={emotions} />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...recapSlideStyles.screenWithTopInset,
    alignItems: 'center',
  },
  chartWrap: {
    flex: 1,
    width: SW * 0.85,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default EmotionDataSlide;
