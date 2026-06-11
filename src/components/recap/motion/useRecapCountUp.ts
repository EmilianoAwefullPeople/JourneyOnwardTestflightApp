import { useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { useReduceMotion } from '../../../hooks/useReduceMotion';
import { RECAP_COUNT_MS } from './recapMotionConfig';

export function useRecapCountUp(
  target: number,
  options?: { delay?: number; duration?: number }
): number {
  const { delay = 0, duration = RECAP_COUNT_MS } = options ?? {};
  const reduceMotion = useReduceMotion();
  const [display, setDisplay] = useState(reduceMotion ? target : 0);
  const progress = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      setDisplay(target);
      return;
    }

    progress.stopAnimation();
    progress.setValue(0);
    setDisplay(0);

    const listenerId = progress.addListener(({ value }) => {
      setDisplay(Math.round(target * value));
    });

    const anim = Animated.timing(progress, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    anim.start(({ finished }) => {
      if (finished) setDisplay(target);
    });

    return () => {
      anim.stop();
      progress.removeListener(listenerId);
    };
  }, [target, delay, duration, reduceMotion, progress]);

  return display;
}
