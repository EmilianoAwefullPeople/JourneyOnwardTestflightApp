import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { FONTS, FONT_WEIGHTS, SPACING } from '../../../config/constants';
import { useRecapStaggerEntrance } from '../motion/useRecapStaggerEntrance';
import { useReduceMotion } from '../../../hooks/useReduceMotion';

const { width: SW, height: SH } = Dimensions.get('window');

interface Props {
  tripName: string;
  dateRange: string;
  backgroundPhotoUri?: string;
  onStart: () => void;
}

const TitleCardSlide: React.FC<Props> = ({
  tripName,
  dateRange,
  backgroundPhotoUri,
  onStart,
}) => {
  const reduceMotion = useReduceMotion();
  const dateEntrance = useRecapStaggerEntrance({ index: 0, baseDelay: 100, offsetY: 10 });
  const nameEntrance = useRecapStaggerEntrance({ index: 1, baseDelay: 180, offsetY: 10 });
  const readyEntrance = useRecapStaggerEntrance({ index: 2, baseDelay: 260, offsetY: 8 });
  const buttonEntrance = useRecapStaggerEntrance({ index: 3, baseDelay: 340, offsetY: 6 });
  const buttonScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduceMotion) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(buttonScale, {
          toValue: 1.04,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(buttonScale, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );
    const timer = setTimeout(() => pulse.start(), 1400);
    return () => {
      clearTimeout(timer);
      pulse.stop();
      buttonScale.setValue(1);
    };
  }, [buttonScale, reduceMotion]);

  return (
    <View style={styles.container}>
      {!!backgroundPhotoUri && (
        <>
          <Image
            source={{ uri: backgroundPhotoUri }}
            style={styles.bg}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={0}
          />
          <BlurView intensity={60} tint="default" style={StyleSheet.absoluteFill} />
        </>
      )}
      <View style={styles.overlay} />
      <View style={styles.content}>
        <Animated.Text style={[styles.dateRange, dateEntrance.style]}>{dateRange}</Animated.Text>
        <Animated.Text style={[styles.tripName, nameEntrance.style]}>{tripName}</Animated.Text>
        <Animated.Text style={[styles.readyLabel, readyEntrance.style]}>Ready to start?</Animated.Text>
        <Animated.View style={buttonEntrance.style}>
          <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
            <TouchableOpacity
              style={styles.button}
              onPress={onStart}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Start recap"
            >
              <Text style={styles.buttonText}>Let's go</Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: SW,
    height: SH,
    backgroundColor: '#141212',
  },
  bg: {
    ...StyleSheet.absoluteFillObject,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.52)',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  dateRange: {
    fontFamily: FONTS.inter,
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.regular,
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  tripName: {
    fontFamily: FONTS.inter,
    fontSize: 34,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 40,
    marginBottom: 48,
  },
  readyLabel: {
    fontFamily: FONTS.inter,
    fontSize: 15,
    fontWeight: FONT_WEIGHTS.regular,
    color: 'rgba(255,255,255,0.55)',
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    paddingHorizontal: 44,
    borderRadius: 32,
  },
  buttonText: {
    fontFamily: FONTS.inter,
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#141212',
    letterSpacing: 0.3,
  },
});

export default TitleCardSlide;
