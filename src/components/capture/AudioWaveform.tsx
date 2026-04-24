// AudioWaveform
// Real-time waveform visualization for audio recording

import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { COLORS, SPACING } from '../../config/constants';

interface AudioWaveformProps {
  isRecording: boolean;
  audioLevel?: number; // 0-1, audio input level
}

const AudioWaveform: React.FC<AudioWaveformProps> = ({ isRecording, audioLevel = 0 }) => {
  const bars = Array.from({ length: 40 }, (_, i) => i);
  const animations = useRef(bars.map(() => new Animated.Value(0.1))).current;

  useEffect(() => {
    if (!isRecording) {
      // Reset all bars when not recording
      animations.forEach(anim => {
        Animated.timing(anim, {
          toValue: 0.1,
          duration: 200,
          useNativeDriver: true,
        }).start();
      });
      return;
    }

    // Animate bars based on audio level
    const animateBars = () => {
      animations.forEach((anim, index) => {
        // Create wave pattern with some randomness
        const baseHeight = audioLevel;
        const waveOffset = Math.sin((index / bars.length) * Math.PI * 2) * 0.3;
        const randomOffset = (Math.random() - 0.5) * 0.2;
        const targetHeight = Math.max(0.1, Math.min(1, baseHeight + waveOffset + randomOffset));
        
        Animated.timing(anim, {
          toValue: targetHeight,
          duration: 100,
          useNativeDriver: true,
        }).start();
      });
    };

    const interval = setInterval(animateBars, 100);
    return () => clearInterval(interval);
  }, [isRecording, audioLevel, animations]);

  return (
    <View style={styles.container}>
      {bars.map((_, index) => (
        <Animated.View
          key={index}
          style={[
            styles.bar,
            {
              height: animations[index].interpolate({
                inputRange: [0, 1],
                outputRange: [4, 60],
              }),
            },
          ]}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 80,
    paddingHorizontal: SPACING.md,
  },
  bar: {
    width: 3,
    backgroundColor: COLORS.lime800,
    marginHorizontal: 1,
    borderRadius: 1.5,
  },
});

export default AudioWaveform;
