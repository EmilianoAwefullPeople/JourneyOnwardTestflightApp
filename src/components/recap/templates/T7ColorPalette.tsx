import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, StyleSheet, Text, View } from 'react-native';
import { recapSlideStyles } from '../recapSlideStyles';
import RecapAnimatedTitle from '../motion/RecapAnimatedTitle';
import { useReduceMotion } from '../../../hooks/useReduceMotion';

const { width: SW, height: SH } = Dimensions.get('window');

const CARD_WIDTH = Math.round(SW * 0.82);
const CARD_HEIGHT = Math.round(SH * 0.48);
const CARD_RADIUS = 22;

interface T7ColorPaletteProps {
  colors: string[];
  tripLabel: string;
}

const AnimatedStripe: React.FC<{ color: string; index: number; total: number }> = ({
  color,
  index,
  total,
}) => {
  const reduceMotion = useReduceMotion();
  const opacity = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(1);
      return;
    }
    Animated.timing(opacity, {
      toValue: 1,
      duration: 300,
      delay: index * 100,
      useNativeDriver: true,
    }).start();
  }, [opacity, index, reduceMotion]);

  return (
    <Animated.View
      style={{
        flex: 1,
        backgroundColor: color,
        borderTopLeftRadius: index === 0 ? CARD_RADIUS : 0,
        borderTopRightRadius: index === 0 ? CARD_RADIUS : 0,
        borderBottomLeftRadius: index === total - 1 ? CARD_RADIUS : 0,
        borderBottomRightRadius: index === total - 1 ? CARD_RADIUS : 0,
        opacity,
      }}
    />
  );
};

const T7ColorPalette: React.FC<T7ColorPaletteProps> = ({ colors }) => {
  const palette = colors.length > 0 ? colors : ['#8dc0e0', '#fed86d', '#487525', '#8A6552', '#B2C4B2', '#D4A574'];

  return (
    <View style={styles.container}>
      <RecapAnimatedTitle>
        Your trip was full of colors,{'\n'}these were the main ones...
      </RecapAnimatedTitle>
      <View style={styles.card}>
        {palette.map((color, i) => (
          <AnimatedStripe key={i} color={color} index={i} total={palette.length} />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...recapSlideStyles.screenWithTopInset,
    alignItems: 'center',
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
    alignSelf: 'center',
  },
});

export default T7ColorPalette;
