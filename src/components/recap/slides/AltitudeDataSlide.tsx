import React from 'react';
import { Animated, Dimensions, StyleSheet, Text, View } from 'react-native';
import { FONTS, FONT_WEIGHTS } from '../../../config/constants';
import { recapSlideStyles } from '../recapSlideStyles';
import RecapPostcard from '../RecapPostcard';
import RecapAnimatedTitle from '../motion/RecapAnimatedTitle';
import { useRecapScaleEntrance } from '../motion/useRecapScaleEntrance';
import { useRecapStaggerEntrance } from '../motion/useRecapStaggerEntrance';

const { width: SW, height: SH } = Dimensions.get('window');
const CARD_WIDTH = Math.round(SW * 0.52);

interface AltitudePanel {
  altitudeMeters: number;
  photoUri: string;
}

interface Props {
  lowest: AltitudePanel;
  highest: AltitudePanel;
}

const fmt = (m: number) => `${Math.round(m).toLocaleString()}m`;

const AltitudeDataSlide: React.FC<Props> = ({ lowest, highest }) => {
  const lowTextEntrance = useRecapStaggerEntrance({ index: 0, baseDelay: 220 });
  const lowCardEntrance = useRecapScaleEntrance({ index: 1, baseDelay: 320 });
  const highCardEntrance = useRecapScaleEntrance({ index: 2, baseDelay: 420 });
  const highTextEntrance = useRecapStaggerEntrance({ index: 3, baseDelay: 520 });

  return (
    <View style={styles.container}>
      <RecapAnimatedTitle>Altitude across your trip</RecapAnimatedTitle>

      <View style={styles.row}>
        <Animated.View style={[styles.textBlock, lowTextEntrance.style]}>
          <Text style={styles.altLabel}>Lowest:</Text>
          <Text style={styles.altValue}>{fmt(lowest.altitudeMeters)}</Text>
          <Text style={styles.altSublabel}>Above Sea Level</Text>
        </Animated.View>
        <Animated.View style={[styles.cardRight, lowCardEntrance.style]}>
          <RecapPostcard photoUri={lowest.photoUri} tiltDeg={6} width={CARD_WIDTH} />
        </Animated.View>
      </View>

      <View style={[styles.row, styles.rowBottom]}>
        <Animated.View style={[styles.cardLeft, highCardEntrance.style]}>
          <RecapPostcard photoUri={highest.photoUri} tiltDeg={-5} width={CARD_WIDTH} />
        </Animated.View>
        <Animated.View style={[styles.textBlock, styles.textBlockRight, highTextEntrance.style]}>
          <Text style={styles.altLabel}>Highest:</Text>
          <Text style={styles.altValue}>{fmt(highest.altitudeMeters)}</Text>
          <Text style={styles.altSublabel}>Above Sea Level</Text>
        </Animated.View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...recapSlideStyles.screenWithTopInset,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 20,
  },
  rowBottom: {
    alignItems: 'center',
  },
  textBlock: {
    flex: 1,
    paddingLeft: 8,
  },
  textBlockRight: {
    paddingLeft: 16,
    paddingRight: 8,
  },
  altLabel: {
    fontFamily: FONTS.inter,
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.regular,
    color: 'rgba(255,255,255,0.55)',
    marginBottom: 4,
  },
  altValue: {
    fontFamily: FONTS.inter,
    fontSize: 44,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#FFFFFF',
    lineHeight: 50,
  },
  altSublabel: {
    fontFamily: FONTS.inter,
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.regular,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 2,
  },
  cardRight: {
    alignItems: 'flex-end',
  },
  cardLeft: {
    alignItems: 'flex-start',
  },
});

export default AltitudeDataSlide;
