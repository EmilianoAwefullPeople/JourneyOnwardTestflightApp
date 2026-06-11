import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, Text, View } from 'react-native';
import { Svg, Path, Circle, Line } from 'react-native-svg';
import { FONTS, FONT_WEIGHTS } from '../../../config/constants';
import { recapSlideStyles } from '../recapSlideStyles';
import RecapPostcard from '../RecapPostcard';
import RecapAnimatedTitle from '../motion/RecapAnimatedTitle';
import { useRecapStaggerEntrance } from '../motion/useRecapStaggerEntrance';
import { useRecapScaleEntrance } from '../motion/useRecapScaleEntrance';
import { useReduceMotion } from '../../../hooks/useReduceMotion';
import { recapStaggerDelay } from '../motion/recapMotionConfig';

const { width: SW, height: SH } = Dimensions.get('window');
const BAR_WIDTH = 36;
const BAR_MAX_H = 120;
const CARD_WIDTH = Math.round(SW * 0.70);

interface Props {
  conditions: Array<{ condition: string; percentage: number }>;
  photoUri: string;
}

const CloudIcon: React.FC = () => (
  <Svg width={32} height={24} viewBox="0 0 32 24" fill="none">
    <Path
      d="M24 20H8a6 6 0 010-12 6 6 0 0111.6-1.6A5 5 0 1124 20z"
      fill="rgba(255,255,255,0.7)"
    />
  </Svg>
);

const SunIcon: React.FC = () => (
  <Svg width={32} height={32} viewBox="0 0 32 32" fill="none">
    <Circle cx="16" cy="16" r="6" fill="rgba(255,255,255,0.85)" />
    {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => {
      const rad = (deg * Math.PI) / 180;
      const x1 = 16 + 9 * Math.cos(rad);
      const y1 = 16 + 9 * Math.sin(rad);
      const x2 = 16 + 13 * Math.cos(rad);
      const y2 = 16 + 13 * Math.sin(rad);
      return (
        <Line
          key={i}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="rgba(255,255,255,0.85)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      );
    })}
  </Svg>
);

const RainIcon: React.FC = () => (
  <Svg width={32} height={30} viewBox="0 0 32 30" fill="none">
    <Path
      d="M24 16H8a6 6 0 010-12 6 6 0 0111.6-1.6A5 5 0 1124 16z"
      fill="rgba(255,255,255,0.7)"
    />
    <Path
      d="M10 20l-2 4M16 20l-2 4M22 20l-2 4"
      stroke="rgba(255,255,255,0.6)"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </Svg>
);

function weatherIcon(condition: string): React.ReactNode {
  const lc = condition.toLowerCase();
  if (lc.includes('sun') || lc.includes('clear') || lc.includes('fair')) return <SunIcon />;
  if (lc.includes('rain') || lc.includes('shower') || lc.includes('drizzle')) return <RainIcon />;
  return <CloudIcon />;
}

const WeatherBar: React.FC<{
  condition: string;
  percentage: number;
  maxPct: number;
  index: number;
}> = ({ condition, percentage, maxPct, index }) => {
  const reduceMotion = useReduceMotion();
  const fillH = maxPct > 0 ? Math.max(8, Math.round((percentage / maxPct) * BAR_MAX_H)) : 0;
  const heightAnim = useRef(new Animated.Value(reduceMotion ? fillH : 0)).current;
  const { style: colStyle } = useRecapStaggerEntrance({ index, baseDelay: 220 });

  useEffect(() => {
    if (reduceMotion) {
      heightAnim.setValue(fillH);
      return;
    }
    heightAnim.setValue(0);
    Animated.timing(heightAnim, {
      toValue: fillH,
      duration: 620,
      delay: recapStaggerDelay(index, 280),
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [fillH, heightAnim, index, reduceMotion]);

  return (
    <Animated.View style={[styles.barCol, colStyle]}>
      {weatherIcon(condition)}
      <Text style={styles.pctLabel}>{percentage}%</Text>
      <View style={styles.barTrack}>
        <Animated.View style={[styles.barFill, { height: heightAnim }]} />
      </View>
      <Text style={styles.condLabel}>{condition}</Text>
    </Animated.View>
  );
};

const WeatherDataSlide: React.FC<Props> = ({ conditions, photoUri }) => {
  const top3 = conditions.slice(0, 3);
  const maxPct = Math.max(...top3.map((c) => c.percentage), 1);
  const dominant = top3[0]?.condition ?? '';
  const postcardEntrance = useRecapScaleEntrance({ index: 0, baseDelay: 680 });

  return (
    <View style={styles.container}>
      <RecapAnimatedTitle>
        Talking about the weather,{'\n'}your trip was
      </RecapAnimatedTitle>

      <View style={styles.barsRow}>
        {top3.map((c, i) => (
          <WeatherBar
            key={c.condition}
            condition={c.condition}
            percentage={c.percentage}
            maxPct={maxPct}
            index={i}
          />
        ))}
      </View>

      <Animated.View style={[styles.postcardWrap, postcardEntrance.style]}>
        <RecapPostcard photoUri={photoUri} location={dominant} tiltDeg={0} width={CARD_WIDTH} />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...recapSlideStyles.screenWithTopInset,
    alignItems: 'center',
  },
  barsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 40,
    marginBottom: 40,
  },
  barCol: {
    alignItems: 'center',
    gap: 6,
    width: BAR_WIDTH + 36,
  },
  pctLabel: {
    fontFamily: FONTS.inter,
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.regular,
    color: 'rgba(255,255,255,0.65)',
  },
  barTrack: {
    width: BAR_WIDTH,
    height: BAR_MAX_H,
    borderRadius: BAR_WIDTH / 2,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  barFill: {
    width: BAR_WIDTH,
    backgroundColor: '#87CEEB',
    borderRadius: BAR_WIDTH / 2,
  },
  condLabel: {
    fontFamily: FONTS.inter,
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.regular,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
  },
  postcardWrap: {
    alignItems: 'center',
  },
});

export default WeatherDataSlide;
