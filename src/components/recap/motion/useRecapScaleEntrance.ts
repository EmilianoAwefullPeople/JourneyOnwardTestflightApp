import { useEffect, useRef } from 'react';
import { Animated, type ViewStyle } from 'react-native';
import { useReduceMotion } from '../../../hooks/useReduceMotion';
import { RECAP_ENTRANCE_MS, recapStaggerDelay } from './recapMotionConfig';

type ScaleOptions = {
  delay?: number;
  index?: number;
  baseDelay?: number;
};

/** Opacity + scale 0.94→1 for photos / postcards. */
export function useRecapScaleEntrance(options: ScaleOptions = {}): {
  style: Animated.WithAnimatedValue<ViewStyle>;
} {
  const { index = 0, baseDelay } = options;
  const delay =
    options.delay ?? (baseDelay !== undefined ? recapStaggerDelay(index, baseDelay) : recapStaggerDelay(index));
  const reduceMotion = useReduceMotion();
  const opacity = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const scale = useRef(new Animated.Value(reduceMotion ? 1 : 0.94)).current;

  useEffect(() => {
    if (reduceMotion) return;
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: RECAP_ENTRANCE_MS + 140,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: RECAP_ENTRANCE_MS + 200,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, [delay, opacity, reduceMotion, scale]);

  return {
    style: {
      opacity,
      transform: [{ scale }],
    },
  };
}
