import React, { useEffect, useRef } from 'react';
import { Animated, type StyleProp, type TextProps, type TextStyle } from 'react-native';
import { useReduceMotion } from '../../../hooks/useReduceMotion';
import { recapSlideStyles } from '../recapSlideStyles';
import { RECAP_ENTRANCE_MS, RECAP_TITLE_OFFSET_Y } from './recapMotionConfig';

interface Props extends TextProps {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
}

const RecapAnimatedTitle: React.FC<Props> = ({ children, style, ...rest }) => {
  const reduceMotion = useReduceMotion();
  const opacity = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const translateY = useRef(new Animated.Value(reduceMotion ? 0 : RECAP_TITLE_OFFSET_Y)).current;

  useEffect(() => {
    if (reduceMotion) return;
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: RECAP_ENTRANCE_MS,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: RECAP_ENTRANCE_MS,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, reduceMotion, translateY]);

  return (
    <Animated.Text
      style={[recapSlideStyles.title, style, { opacity, transform: [{ translateY }] }]}
      {...rest}
    >
      {children}
    </Animated.Text>
  );
};

export default RecapAnimatedTitle;
