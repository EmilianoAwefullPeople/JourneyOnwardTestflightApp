// RecapProgressBar
// Instagram Stories-style progress: one segment per slide; active segment fills over durationMs.

import React, { useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

const SEGMENT_HEIGHT = 2;
const SEGMENT_GAP = 2;

interface RecapProgressBarProps {
  currentIndex: number;
  totalCount: number;
  /** Duration in ms for the active segment to fill (current slide). */
  activeSegmentDurationMs: number;
  /** Called when the active segment has finished filling (e.g. to auto-advance). */
  onActiveSegmentComplete?: () => void;
  /** When true the active segment animation is frozen (interactive slides). */
  paused?: boolean;
}

const RecapProgressBar: React.FC<RecapProgressBarProps> = ({
  currentIndex,
  totalCount,
  activeSegmentDurationMs,
  onActiveSegmentComplete,
  paused = false,
}) => {
  const { colors } = useTheme();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progress.setValue(0);
    if (paused || activeSegmentDurationMs <= 0 || totalCount <= 0) return;

    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: activeSegmentDurationMs,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    anim.start(({ finished }) => {
      if (finished) onActiveSegmentComplete?.();
    });
    return () => anim.stop();
  }, [currentIndex, activeSegmentDurationMs, totalCount, onActiveSegmentComplete, progress, paused]);

  const segments = useMemo(() => Array.from({ length: totalCount }, (_, i) => i), [totalCount]);

  const segmentFillWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flexDirection: 'row',
          paddingTop: 8,
          paddingHorizontal: 8,
          paddingBottom: 6,
          gap: SEGMENT_GAP,
        },
        segment: {
          flex: 1,
          height: SEGMENT_HEIGHT,
          borderRadius: 1,
          overflow: 'hidden',
          backgroundColor: 'rgba(255,255,255,0.3)',
        },
        segmentFilled: {
          flex: 1,
          height: SEGMENT_HEIGHT,
          borderRadius: 1,
          backgroundColor: colors.textPrimary ?? '#FFFFFF',
        },
        segmentActiveTrack: {
          flex: 1,
          height: SEGMENT_HEIGHT,
          borderRadius: 1,
          overflow: 'hidden',
          backgroundColor: 'rgba(255,255,255,0.3)',
        },
        segmentActiveFill: {
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          borderRadius: 1,
          backgroundColor: colors.textPrimary ?? '#FFFFFF',
        },
      }),
    [colors.textPrimary]
  );

  if (totalCount <= 0) return null;

  return (
    <View style={styles.container} pointerEvents="none">
      {segments.map((i) => {
        if (i < currentIndex) {
          return <View key={i} style={styles.segmentFilled} />;
        }
        if (i === currentIndex) {
          return (
            <View key={i} style={styles.segmentActiveTrack}>
              <Animated.View style={[styles.segmentActiveFill, { width: segmentFillWidth }]} />
            </View>
          );
        }
        return <View key={i} style={styles.segment} />;
      })}
    </View>
  );
};

export default RecapProgressBar;
