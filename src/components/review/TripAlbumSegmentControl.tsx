// TripAlbumSegmentControl
// Icon-based segment control for Trip Album detail: active segment shows icon + label; inactive shows icon only.
// Mirrors Review SegmentControl behavior (same animation and layout).

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, TouchableOpacity, StyleSheet, Animated, Easing, LayoutAnimation, Platform, UIManager } from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { Ionicons } from '@expo/vector-icons';
import { SPACING } from '../../config/constants';
import { TEXT_STYLES } from '../../config/typography';
import { useTheme } from '../../context/ThemeContext';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import GridIcon from '../common/icons/GridIcon';
import LocationIcon from '../common/icons/LocationIcon';

export type TripAlbumSection = 'all' | 'dashboard' | 'map';

const VALID_SECTIONS: TripAlbumSection[] = ['all', 'dashboard', 'map'];

const LABEL_ANIM_DURATION = 220;
const LABEL_SLIDE_OFFSET = 10;

interface TripAlbumSegmentControlProps {
  activeSegment: TripAlbumSection;
  onSegmentChange: (segment: TripAlbumSection) => void;
  onActiveSegmentPress?: (segment: TripAlbumSection) => void;
  onRecapPress?: () => void;
}

const ICON_SIZE = 22;

interface AnimatedSegmentLabelProps {
  children: string;
  style: object;
  isExiting?: boolean;
  onExitComplete?: () => void;
}

function AnimatedSegmentLabel({ children, style, isExiting = false, onExitComplete }: AnimatedSegmentLabelProps) {
  const reduceMotion = useReduceMotion();
  const opacity = useRef(new Animated.Value(isExiting ? 1 : 0)).current;
  const translateX = useRef(new Animated.Value(isExiting ? 0 : -LABEL_SLIDE_OFFSET)).current;

  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(isExiting ? 0 : 1);
      translateX.setValue(isExiting ? -LABEL_SLIDE_OFFSET : 0);
      if (isExiting && onExitComplete) onExitComplete();
      return;
    }

    if (isExiting) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: LABEL_ANIM_DURATION,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(translateX, {
          toValue: -LABEL_SLIDE_OFFSET,
          duration: LABEL_ANIM_DURATION,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => {
        onExitComplete?.();
      });
      return;
    }

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: LABEL_ANIM_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateX, {
        toValue: 0,
        duration: LABEL_ANIM_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [isExiting, reduceMotion, opacity, translateX, onExitComplete]);

  return (
    <Animated.Text
      style={[
        style,
        {
          opacity,
          transform: [{ translateX }],
        },
      ]}
      numberOfLines={1}
    >
      {children}
    </Animated.Text>
  );
}

function TripAlbumSegmentControl({ activeSegment, onSegmentChange, onActiveSegmentPress, onRecapPress }: TripAlbumSegmentControlProps) {
  const { colors, isDark } = useTheme();
  const reduceMotion = useReduceMotion();
  const [exitingSegment, setExitingSegment] = useState<TripAlbumSection | null>(null);
  const [pendingSegment, setPendingSegment] = useState<TripAlbumSection | null>(null);

  const normalizedActive = VALID_SECTIONS.includes(activeSegment) ? activeSegment : 'all';

  const handleSegmentPress = useCallback(
    (segment: TripAlbumSection) => {
      if (segment === normalizedActive) {
        onActiveSegmentPress?.(segment);
        return;
      }
      if (exitingSegment != null) return;

      if (reduceMotion) {
        onSegmentChange(segment);
        return;
      }

      setPendingSegment(segment);
      setExitingSegment(normalizedActive);
    },
    [normalizedActive, exitingSegment, reduceMotion, onSegmentChange, onActiveSegmentPress]
  );

  const handleExitComplete = useCallback(() => {
    const next = pendingSegment;
    setExitingSegment(null);
    setPendingSegment(null);
    if (next != null) {
      onSegmentChange(next);
    }
  }, [pendingSegment, onSegmentChange]);

  useEffect(() => {
    if (!reduceMotion && normalizedActive != null && exitingSegment == null) {
      LayoutAnimation.configureNext(
        LayoutAnimation.create(220, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity)
      );
    }
  }, [normalizedActive, exitingSegment, reduceMotion]);

  const labelStyle = [styles.segmentText, { color: colors.textPrimary }, styles.segmentTextActive];

  const displayActive = exitingSegment ?? normalizedActive;
  const showLabel = (key: TripAlbumSection) => normalizedActive === key || exitingSegment === key;
  const isExiting = (key: TripAlbumSection) => exitingSegment === key;

  return (
    <View style={styles.outer}>
      <View
        style={[
          styles.container,
          {
            backgroundColor: isDark ? 'rgba(20,18,18,0.86)' : 'rgba(248,248,248,0.97)',
            borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(20,18,18,0.1)',
          },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.segmentButton,
            displayActive === 'all' && {
              backgroundColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(16,16,16,0.12)',
            },
            displayActive === 'all' ? styles.segmentButtonActive : styles.segmentButtonInactive,
          ]}
          onPress={() => handleSegmentPress('all')}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="All Memories"
          accessibilityState={{ selected: displayActive === 'all' }}
          disabled={exitingSegment != null}
        >
          <View style={styles.segmentContent}>
            <GridIcon width={ICON_SIZE} height={ICON_SIZE} color={displayActive === 'all' ? colors.textPrimary : colors.textSecondary} />
            {showLabel('all') && (
              <AnimatedSegmentLabel
                style={labelStyle}
                isExiting={isExiting('all')}
                onExitComplete={isExiting('all') ? handleExitComplete : undefined}
              >
                All Memories
              </AnimatedSegmentLabel>
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.segmentButton,
            displayActive === 'dashboard' && {
              backgroundColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(16,16,16,0.12)',
            },
            displayActive === 'dashboard' ? styles.segmentButtonActive : styles.segmentButtonInactive,
          ]}
          onPress={() => handleSegmentPress('dashboard')}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Dashboard"
          accessibilityState={{ selected: displayActive === 'dashboard' }}
          disabled={exitingSegment != null}
        >
          <View style={styles.segmentContent}>
            <Ionicons name="stats-chart-outline" size={ICON_SIZE} color={displayActive === 'dashboard' ? colors.textPrimary : colors.textSecondary} />
            {showLabel('dashboard') && (
              <AnimatedSegmentLabel
                style={labelStyle}
                isExiting={isExiting('dashboard')}
                onExitComplete={isExiting('dashboard') ? handleExitComplete : undefined}
              >
                Dashboard
              </AnimatedSegmentLabel>
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.segmentButton,
            displayActive === 'map' && {
              backgroundColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(16,16,16,0.12)',
            },
            displayActive === 'map' ? styles.segmentButtonActive : styles.segmentButtonInactive,
          ]}
          onPress={() => handleSegmentPress('map')}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Map"
          accessibilityState={{ selected: displayActive === 'map' }}
          disabled={exitingSegment != null}
        >
          <View style={styles.segmentContent}>
            <LocationIcon width={ICON_SIZE} height={ICON_SIZE} color={displayActive === 'map' ? colors.textPrimary : colors.textSecondary} />
            {showLabel('map') && (
              <AnimatedSegmentLabel
                style={labelStyle}
                isExiting={isExiting('map')}
                onExitComplete={isExiting('map') ? handleExitComplete : undefined}
              >
                Map
              </AnimatedSegmentLabel>
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.segmentButton, styles.segmentButtonInactive]}
          onPress={onRecapPress}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Play recap"
          disabled={exitingSegment != null}
        >
          <View style={styles.segmentContent}>
            <Ionicons name="play-circle-outline" size={ICON_SIZE} color={colors.textSecondary} />
          </View>
        </TouchableOpacity>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
  },
  container: {
    flexDirection: 'row',
    paddingHorizontal: 4,
    paddingVertical: 4,
    flexWrap: 'nowrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    borderRadius: 30,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 56,
  },
  segmentButton: {
    flexShrink: 0,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    minHeight: 48,
  },
  segmentButtonActive: {
    minWidth: 128,
    paddingHorizontal: SPACING.md,
  },
  segmentButtonInactive: {
    minWidth: 58,
    paddingHorizontal: SPACING.xs,
  },
  segmentContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  segmentText: {
    ...TEXT_STYLES.entryInput,
    fontSize: 16,
  },
  segmentTextActive: {
    fontWeight: '600',
  },
});

export default TripAlbumSegmentControl;
