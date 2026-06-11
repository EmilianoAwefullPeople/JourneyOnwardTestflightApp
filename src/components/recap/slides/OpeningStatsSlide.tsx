import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, StyleSheet, Text, View } from 'react-native';
import { Svg, Path, Rect, Circle } from 'react-native-svg';
import { FONTS, FONT_WEIGHTS } from '../../../config/constants';
import { recapSlideStyles } from '../recapSlideStyles';
import RecapAnimatedTitle from '../motion/RecapAnimatedTitle';
import { useRecapCountUp } from '../motion/useRecapCountUp';
import { recapStaggerDelay } from '../motion/recapMotionConfig';
import CalendarIcon from '../../common/icons/CalendarIcon';
import CameraIcon from '../../common/icons/CameraIcon';
import PenIcon from '../../common/icons/PenIcon';

const { width: SW, height: SH } = Dimensions.get('window');
const ICON_SIZE = 44;

interface Props {
  tripDays: number;
  memoriesCount: number;
  photosCount: number;
  journalCount: number;
}

const ImageFrameIcon: React.FC<{ size: number }> = ({ size }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="3" y="3" width="18" height="18" rx="2" stroke="#FFFFFF" strokeWidth="1.8" />
    <Path
      d="M3 16l5-5 4 4 3-3 6 6"
      stroke="#FFFFFF"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Circle cx="8.5" cy="8.5" r="1.5" fill="#FFFFFF" />
  </Svg>
);

interface StatRowProps {
  icon: React.ReactNode;
  value: number;
  label: string;
  index: number;
}

const StatRow: React.FC<StatRowProps> = ({ icon, value, label, index }) => {
  const delay = recapStaggerDelay(index, 120);
  const displayValue = useRecapCountUp(value, { delay: delay + 80 });
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 400, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 350, delay, useNativeDriver: true }),
    ]).start();
  }, [opacity, translateY, delay]);

  return (
    <Animated.View style={[styles.statRow, { opacity, transform: [{ translateY }] }]}>
      <View style={styles.iconNumberRow}>
        <View style={styles.iconWrap}>{icon}</View>
        <Text style={styles.value}>{displayValue.toLocaleString()}</Text>
      </View>
      <Text style={styles.label}>{label}</Text>
    </Animated.View>
  );
};

const OpeningStatsSlide: React.FC<Props> = ({
  tripDays,
  memoriesCount,
  photosCount,
  journalCount,
}) => {
  const stats: Array<{ icon: React.ReactNode; value: number; label: string }> = [
    {
      icon: <CalendarIcon width={ICON_SIZE} height={ICON_SIZE} color="#FFFFFF" />,
      value: tripDays,
      label: 'Days Traveling',
    },
    {
      icon: <ImageFrameIcon size={ICON_SIZE} />,
      value: memoriesCount,
      label: 'Memories Saved',
    },
    {
      icon: <CameraIcon width={ICON_SIZE} height={ICON_SIZE} color="#FFFFFF" lensFill="#141212" />,
      value: photosCount,
      label: 'Photos',
    },
    {
      icon: <PenIcon width={ICON_SIZE} height={ICON_SIZE} color="#FFFFFF" />,
      value: journalCount,
      label: 'Journal Notes',
    },
  ];

  return (
    <View style={styles.container}>
      <RecapAnimatedTitle>Some initial stats...</RecapAnimatedTitle>
      <View style={styles.list}>
        {stats.map((s, i) => (
          <StatRow key={s.label} icon={s.icon} value={s.value} label={s.label} index={i} />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...recapSlideStyles.screenWithTopInset,
    paddingHorizontal: 36,
  },
  list: {
    gap: 40,
  },
  statRow: {
    gap: 4,
  },
  iconNumberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: ICON_SIZE,
    alignItems: 'center',
  },
  value: {
    fontFamily: FONTS.inter,
    fontSize: 64,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#FFFFFF',
    lineHeight: 68,
  },
  label: {
    fontFamily: FONTS.inter,
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.regular,
    color: 'rgba(255,255,255,0.55)',
    marginLeft: ICON_SIZE + 12,
  },
});

export default OpeningStatsSlide;
