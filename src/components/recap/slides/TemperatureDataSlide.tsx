import React from 'react';
import { Animated, Dimensions, StyleSheet, Text, View } from 'react-native';
import { FONTS, FONT_WEIGHTS } from '../../../config/constants';
import { recapSlideStyles } from '../recapSlideStyles';
import RecapPostcard from '../RecapPostcard';
import RecapAnimatedTitle from '../motion/RecapAnimatedTitle';
import { useRecapCountUp } from '../motion/useRecapCountUp';
import { useRecapStaggerEntrance } from '../motion/useRecapStaggerEntrance';
import { useRecapScaleEntrance } from '../motion/useRecapScaleEntrance';
import { RECAP_CONTENT_BASE_DELAY_MS } from '../motion/recapMotionConfig';

const { width: SW, height: SH } = Dimensions.get('window');
const CARD_WIDTH = Math.round(SW * 0.72);

interface Props {
  averageCelsius: number;
  lowestCelsius: number;
  highestCelsius: number;
  photoUri: string;
}

const fmt = (c: number) => `${Math.round(c)}°C`;

const TemperatureDataSlide: React.FC<Props> = ({
  averageCelsius,
  lowestCelsius,
  highestCelsius,
  photoUri,
}) => {
  const avgDisplay = useRecapCountUp(Math.round(averageCelsius), {
    delay: RECAP_CONTENT_BASE_DELAY_MS,
  });
  const extremesEntrance = useRecapStaggerEntrance({ index: 1, baseDelay: 480 });
  const postcardEntrance = useRecapScaleEntrance({ index: 2, baseDelay: 600 });

  return (
    <View style={styles.container}>
      <RecapAnimatedTitle>The average temperature was:</RecapAnimatedTitle>

      <Text style={styles.average}>{fmt(avgDisplay)}</Text>

      <Animated.View style={[styles.extremesRow, extremesEntrance.style]}>
        <View style={styles.extremeCol}>
          <Text style={styles.extremeValue}>{fmt(lowestCelsius)}</Text>
          <Text style={styles.extremeLabel}>Lowest</Text>
        </View>
        <View style={styles.extremeCol}>
          <Text style={styles.extremeValue}>{fmt(highestCelsius)}</Text>
          <Text style={styles.extremeLabel}>Highest</Text>
        </View>
      </Animated.View>

      <Animated.View style={[styles.postcardWrap, postcardEntrance.style]}>
        <RecapPostcard photoUri={photoUri} tiltDeg={5} width={CARD_WIDTH} />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...recapSlideStyles.screenWithTopInset,
    alignItems: 'center',
  },
  average: {
    fontFamily: FONTS.inter,
    fontSize: 64,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#FFFFFF',
    lineHeight: 70,
    marginBottom: 20,
  },
  extremesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 40,
    paddingHorizontal: 8,
    width: '100%',
    maxWidth: 280,
  },
  extremeCol: {
    alignItems: 'flex-start',
  },
  extremeValue: {
    fontFamily: FONTS.inter,
    fontSize: 24,
    fontWeight: FONT_WEIGHTS.regular,
    color: '#FFFFFF',
  },
  extremeLabel: {
    fontFamily: FONTS.inter,
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.regular,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 2,
  },
  postcardWrap: {
    alignSelf: 'center',
  },
});

export default TemperatureDataSlide;
