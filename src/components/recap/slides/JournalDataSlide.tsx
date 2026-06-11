import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, StyleSheet, Text, View } from 'react-native';
import { FONTS, FONT_WEIGHTS } from '../../../config/constants';
import { recapSlideStyles } from '../recapSlideStyles';
import RecapAnimatedTitle from '../motion/RecapAnimatedTitle';
import { useRecapCountUp } from '../motion/useRecapCountUp';
import { recapStaggerDelay } from '../motion/recapMotionConfig';

const { width: SW, height: SH } = Dimensions.get('window');

interface Props {
  words: number;
  sentences: number;
  chapters: number;
}

interface StatRowProps {
  value: number;
  label: string;
  index: number;
}

const StatRow: React.FC<StatRowProps> = ({ value, label, index }) => {
  const delay = recapStaggerDelay(index, 80);
  const displayValue = useRecapCountUp(value, { delay: delay + 60 });
  const opacity = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(-20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 380, delay, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: 0, duration: 320, delay, useNativeDriver: true }),
    ]).start();
  }, [opacity, translateX, delay]);

  return (
    <Animated.View style={[styles.row, { opacity, transform: [{ translateX }] }]}>
      <Text style={styles.value}>{displayValue.toLocaleString()}</Text>
      <Text style={styles.label}>{label}</Text>
    </Animated.View>
  );
};

const JournalDataSlide: React.FC<Props> = ({ words, sentences, chapters }) => (
  <View style={styles.container}>
    <RecapAnimatedTitle>Your writing</RecapAnimatedTitle>
    <View style={styles.statsBlock}>
      <StatRow value={words} label="words written" index={0} />
      <View style={styles.divider} />
      <StatRow value={sentences} label="sentences" index={1} />
      <View style={styles.divider} />
      <StatRow
        value={chapters}
        label={chapters === 1 ? 'journal entry' : 'journal entries'}
        index={2}
      />
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    ...recapSlideStyles.screenWithTopInset,
    alignItems: 'center',
  },
  statsBlock: {
    flex: 1,
    width: '100%',
    maxWidth: 320,
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  row: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 8,
  },
  value: {
    fontFamily: FONTS.inter,
    fontSize: 56,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#FFFFFF',
    lineHeight: 62,
  },
  label: {
    fontFamily: FONTS.inter,
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.regular,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 2,
  },
  divider: {
    width: 40,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginVertical: 20,
  },
});

export default JournalDataSlide;
