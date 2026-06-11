import { useEffect, useRef } from 'react';
import { Animated, type ViewStyle } from 'react-native';
import { useReduceMotion } from '../../../hooks/useReduceMotion';
import { RECAP_ENTRANCE_MS, recapStaggerDelay } from './recapMotionConfig';

type StaggerOptions = {
  index?: number;
  baseDelay?: number;
  offsetY?: number;
};

/** Fade + rise on mount; use on slide content blocks (not the shared title). */
export function useRecapStaggerEntrance(options: StaggerOptions = {}): {
  style: Animated.WithAnimatedValue<ViewStyle>;
} {
  const { index = 0, baseDelay, offsetY = 12 } = options;
  const reduceMotion = useReduceMotion();
  const opacity = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const translateY = useRef(new Animated.Value(reduceMotion ? 0 : offsetY)).current;

  useEffect(() => {
    if (reduceMotion) return;

    const delay = recapStaggerDelay(index, baseDelay);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: RECAP_ENTRANCE_MS + 120,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: RECAP_ENTRANCE_MS + 80,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, [baseDelay, index, opacity, reduceMotion, translateY]);

  return {
    style: {
      opacity,
      transform: [{ translateY }],
    },
  };
}
