// SegmentControl
// Icon-based segment control for Review screen: active segment shows icon + label to the right; inactive shows icon only

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Text,
  Animated,
  Easing,
  LayoutAnimation,
  Platform,
  UIManager,
  type StyleProp,
  type TextStyle,
} from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { Ionicons } from '@expo/vector-icons';
import { SPACING } from '../../config/constants';
import { TEXT_STYLES } from '../../config/typography';
import { useTheme } from '../../context/ThemeContext';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import GridIcon from '../common/icons/GridIcon';

export type ReviewSection = 'stats' | 'tripAlbums' | 'bookmarks';

const VALID_SECTIONS: ReviewSection[] = ['stats', 'tripAlbums', 'bookmarks'];

/**
 * Pill chrome layout uses this duration (ease-out, no spring).
 * Active label: horizontal clip reaches full width faster than opacity reaches 1 (see `PILL_LABEL_WIDTH_DURATION_RATIO`).
 * `onSegmentChange` still runs in the same frame so the new view is not delayed.
 */
const PILL_LAYOUT_ANIM_MS = 400;
/** Width reveal completes in this fraction of the label opacity duration (both start together). */
const PILL_LABEL_WIDTH_DURATION_RATIO = 0.45;
const pillSegmentLayoutAnimation = {
  duration: PILL_LAYOUT_ANIM_MS,
  update: {
    type: LayoutAnimation.Types.easeOut,
  },
} as const;

interface ExpandingSegmentLabelProps {
  label: string;
  textStyle: StyleProp<TextStyle>;
  durationMs: number;
  reduceMotion: boolean;
}

const LABEL_MIN_FONT_SCALE = 0.82;

/** Active title: horizontal clip expand (faster) + opacity fade-in (slower); font shrinks to fit to avoid ellipsis. */
function ExpandingSegmentLabel({ label, textStyle, durationMs, reduceMotion }: ExpandingSegmentLabelProps) {
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const widthAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (measuredWidth <= 0) return;
    if (reduceMotion) {
      widthAnim.setValue(measuredWidth);
      opacityAnim.setValue(1);
      return;
    }
    widthAnim.setValue(0);
    opacityAnim.setValue(0);
    const opacityDurationMs = durationMs;
    const widthDurationMs = Math.max(100, Math.round(opacityDurationMs * PILL_LABEL_WIDTH_DURATION_RATIO));
    // Both use layout driver (cannot mix native/non-native drivers); different durations so full width precedes full opacity.
    const anim = Animated.parallel([
      Animated.timing(widthAnim, {
        toValue: measuredWidth,
        duration: widthDurationMs,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: opacityDurationMs,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [measuredWidth, durationMs, reduceMotion, widthAnim, opacityAnim]);

  return (
    <View style={styles.expandingLabelRoot}>
      <Text
        style={[textStyle, styles.measureText]}
        numberOfLines={1}
        accessible={false}
        importantForAccessibility="no"
        onLayout={e => {
          const w = e.nativeEvent.layout.width;
          if (w <= 0) return;
          setMeasuredWidth(prev => (Math.abs(w - prev) > 0.5 ? w : prev));
        }}
      >
        {label}
      </Text>
      <Animated.View style={[styles.expandingClip, { width: widthAnim }]}>
        <Animated.View style={[styles.expandingLabelInner, { opacity: opacityAnim }]}>
          <Text
            style={[textStyle, styles.expandingLabelText]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={LABEL_MIN_FONT_SCALE}
          >
            {label}
          </Text>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

interface SegmentControlProps {
  activeSegment: ReviewSection;
  onSegmentChange: (segment: ReviewSection) => void;
}

const ICON_SIZE = 22;

function SegmentControl({ activeSegment, onSegmentChange }: SegmentControlProps) {
  const { colors, isDark } = useTheme();
  const reduceMotion = useReduceMotion();

  const normalizedActive = VALID_SECTIONS.includes(activeSegment) ? activeSegment : 'stats';

  const handleSegmentPress = useCallback(
    (segment: ReviewSection) => {
      if (segment === normalizedActive) return;
      if (!reduceMotion) {
        LayoutAnimation.configureNext(pillSegmentLayoutAnimation);
      }
      onSegmentChange(segment);
    },
    [normalizedActive, reduceMotion, onSegmentChange]
  );

  const labelStyle = [styles.segmentText, { color: colors.textPrimary }, styles.segmentTextActive];

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
            normalizedActive === 'stats' && {
              backgroundColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(16,16,16,0.12)',
            },
            normalizedActive === 'stats' ? styles.segmentButtonActive : styles.segmentButtonInactive,
          ]}
          onPress={() => handleSegmentPress('stats')}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Dashboard"
          accessibilityState={{ selected: normalizedActive === 'stats' }}
        >
          <View style={styles.segmentContent}>
            <Ionicons name="stats-chart-outline" size={ICON_SIZE} color={normalizedActive === 'stats' ? colors.textPrimary : colors.textSecondary} />
            {normalizedActive === 'stats' && (
              <ExpandingSegmentLabel
                key="stats-label"
                label="Dashboard"
                textStyle={labelStyle}
                durationMs={PILL_LAYOUT_ANIM_MS}
                reduceMotion={reduceMotion}
              />
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.segmentButton,
            normalizedActive === 'tripAlbums' && {
              backgroundColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(16,16,16,0.12)',
            },
            normalizedActive === 'tripAlbums' ? styles.segmentButtonActive : styles.segmentButtonInactive,
          ]}
          onPress={() => handleSegmentPress('tripAlbums')}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Trip Albums"
          accessibilityState={{ selected: normalizedActive === 'tripAlbums' }}
        >
          <View style={styles.segmentContent}>
            <Ionicons name="book-outline" size={ICON_SIZE} color={normalizedActive === 'tripAlbums' ? colors.textPrimary : colors.textSecondary} />
            {normalizedActive === 'tripAlbums' && (
              <ExpandingSegmentLabel
                key="tripAlbums-label"
                label="Trip Albums"
                textStyle={labelStyle}
                durationMs={PILL_LAYOUT_ANIM_MS}
                reduceMotion={reduceMotion}
              />
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.segmentButton,
            normalizedActive === 'bookmarks' && {
              backgroundColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(16,16,16,0.12)',
            },
            normalizedActive === 'bookmarks' ? styles.segmentButtonActive : styles.segmentButtonInactive,
          ]}
          onPress={() => handleSegmentPress('bookmarks')}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="All Memories"
          accessibilityState={{ selected: normalizedActive === 'bookmarks' }}
        >
          <View style={styles.segmentContent}>
            <GridIcon width={ICON_SIZE} height={ICON_SIZE} color={normalizedActive === 'bookmarks' ? colors.textPrimary : colors.textSecondary} />
            {normalizedActive === 'bookmarks' && (
              <ExpandingSegmentLabel
                key="bookmarks-label"
                label="All Memories"
                textStyle={labelStyle}
                durationMs={PILL_LAYOUT_ANIM_MS}
                reduceMotion={reduceMotion}
              />
            )}
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
    paddingHorizontal: SPACING.sm,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    minHeight: 48,
    flexShrink: 0,
  },
  segmentButtonActive: {
    minWidth: 176,
    paddingHorizontal: SPACING.md,
  },
  segmentButtonInactive: {
    minWidth: 68,
    paddingHorizontal: SPACING.xs,
  },
  segmentContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  segmentText: {
    ...TEXT_STYLES.entryInput,
    fontSize: 16,
  },
  segmentTextActive: {
    fontWeight: '600',
  },
  expandingLabelRoot: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  measureText: {
    position: 'absolute',
    opacity: 0,
    zIndex: -1,
    left: 0,
    top: 0,
  },
  expandingClip: {
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
  },
  expandingLabelInner: {
    flexShrink: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  expandingLabelText: {
    width: '100%',
  },
});

export default SegmentControl;
