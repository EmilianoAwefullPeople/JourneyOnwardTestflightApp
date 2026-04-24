// Animation Utilities
// Centralized animation configuration and helper functions

import { Easing } from 'react-native';

export const ANIMATION_CONFIG = {
  // Durations (ms)
  durations: {
    fast: 200,        // Quick feedback (button press)
    normal: 300,     // Standard transitions
    slow: 400,       // Major transitions (keyboard, modals)
  },
  
  // Easing curves
  easing: {
    // iOS standard - smooth, natural
    iosStandard: Easing.bezier(0.42, 0.0, 0.58, 1.0),
    // Out cubic - deceleration (entrances)
    easeOut: Easing.out(Easing.cubic),
    // In-out cubic - smooth both ways
    easeInOut: Easing.inOut(Easing.cubic),
    // Spring configuration for press feedback
    spring: {
      damping: 12,
      stiffness: 200,
      mass: 0.8,
    },
  },
};

/**
 * Creates a staggered delay for animations
 * @param index - Index of the item (0-based)
 * @param staggerMs - Delay between items in milliseconds
 * @returns Delay in milliseconds
 */
export const createStaggeredDelay = (index: number, staggerMs: number = 50): number => {
  return index * staggerMs;
};

/**
 * Creates a spring animation configuration
 * @param customConfig - Optional custom spring config
 * @returns Spring animation config
 */
export const createSpringConfig = (customConfig?: Partial<typeof ANIMATION_CONFIG.easing.spring>) => {
  return {
    ...ANIMATION_CONFIG.easing.spring,
    ...customConfig,
  };
};
