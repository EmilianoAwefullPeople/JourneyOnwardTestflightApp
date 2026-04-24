// useReduceMotion
// Returns whether the system "Reduce Motion" accessibility setting is enabled.
// Use to shorten or skip non-essential animations (section transitions, decorative effects).

import { useState, useEffect } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const update = (enabled: boolean) => {
      if (isMounted) setReduceMotion(enabled);
    };

    AccessibilityInfo.isReduceMotionEnabled().then(update).catch(() => {});

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', update);
    return () => {
      isMounted = false;
      subscription?.remove();
    };
  }, []);

  return reduceMotion;
}
