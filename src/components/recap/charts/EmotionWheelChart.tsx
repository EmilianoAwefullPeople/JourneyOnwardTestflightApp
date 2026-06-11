import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { FONTS, FONT_WEIGHTS } from '../../../config/constants';

// Lazily created on first render — avoids calling createAnimatedComponent at module
// evaluation time, which can trigger native init too early on some Hermes setups.
let _AnimatedCircle: React.ComponentType<any> | null = null;
function getAnimatedCircle(): React.ComponentType<any> {
  if (!_AnimatedCircle) _AnimatedCircle = Animated.createAnimatedComponent(Circle);
  return _AnimatedCircle;
}

interface EmotionFrequency {
  label: string;
  count: number;
}

interface EmotionWheelChartProps {
  emotions: EmotionFrequency[];
}

const SIZE = 220;
const RADIUS = 80;
const STROKE_WIDTH = 28;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const CENTER = SIZE / 2;

const ARC_COLORS = [
  '#fed86d',
  '#8dc0e0',
  '#487525',
  '#D4A574',
  '#B2C4B2',
  '#C4A882',
];

interface ArcProps {
  percentage: number;
  offset: number;
  color: string;
  index: number;
}

const Arc: React.FC<ArcProps> = ({ percentage, offset, color, index }) => {
  const AnimatedCircle = useMemo(() => getAnimatedCircle(), []);
  const dashArray = CIRCUMFERENCE;
  const targetDash = CIRCUMFERENCE * (1 - percentage / 100);
  const dashOffset = useRef(new Animated.Value(CIRCUMFERENCE)).current;

  useEffect(() => {
    Animated.timing(dashOffset, {
      toValue: targetDash,
      duration: 700,
      delay: index * 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [dashOffset, targetDash, index]);

  return (
    <AnimatedCircle
      cx={CENTER}
      cy={CENTER}
      r={RADIUS}
      fill="none"
      stroke={color}
      strokeWidth={STROKE_WIDTH}
      strokeDasharray={`${dashArray} ${dashArray}`}
      strokeDashoffset={dashOffset}
      strokeLinecap="butt"
      rotation={-90 + (offset / 100) * 360}
      origin={`${CENTER}, ${CENTER}`}
    />
  );
};

const EmotionWheelChart: React.FC<EmotionWheelChartProps> = ({ emotions }) => {
  const top = emotions.slice(0, 6);
  const total = top.reduce((s, e) => s + e.count, 0);
  if (total === 0) return null;

  const percentages = top.map((e) => (e.count / total) * 100);

  let cumOffset = 0;
  const arcs = top.map((e, i) => {
    const pct = percentages[i];
    const arc = { emotion: e, pct, offset: cumOffset, color: ARC_COLORS[i % ARC_COLORS.length] };
    cumOffset += pct;
    return arc;
  });

  const dominant = top[0];

  return (
    <View style={styles.container}>
      <View style={styles.svgWrap}>
        <Svg width={SIZE} height={SIZE}>
          {/* Background ring */}
          <Circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={STROKE_WIDTH}
          />
          <G>
            {arcs.map((arc, i) => (
              <Arc
                key={arc.emotion.label}
                percentage={arc.pct}
                offset={arc.offset}
                color={arc.color}
                index={i}
              />
            ))}
          </G>
        </Svg>
        <View style={styles.centerLabel}>
          <Text style={styles.centerText}>{dominant.label.toLowerCase()}</Text>
        </View>
      </View>
      <View style={styles.legend}>
        {arcs.map((arc) => (
          <View key={arc.emotion.label} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: arc.color }]} />
            <Text style={styles.legendLabel}>{arc.emotion.label.toLowerCase()}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 24,
  },
  svgWrap: {
    width: SIZE,
    height: SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerLabel: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerText: {
    fontFamily: FONTS.inter,
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#FFFFFF',
    textTransform: 'capitalize',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontFamily: FONTS.inter,
    fontSize: 13,
    color: 'rgba(255,255,255,0.65)',
    textTransform: 'capitalize',
  },
});

export default EmotionWheelChart;
