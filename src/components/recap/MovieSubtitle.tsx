import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';

interface MovieSubtitleProps {
  text: string;
}

const MovieSubtitle: React.FC<MovieSubtitleProps> = ({ text }) => {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.timing(opacity, {
      toValue: 1,
      duration: 200,
      delay: 150,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View style={[styles.container, { opacity }]}>
      <Text style={styles.text}>{text.toLowerCase()}</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 88,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  text: {
    fontFamily: 'Inter',
    fontSize: 13,
    color: 'rgba(255,255,255,0.88)',
    letterSpacing: 0.5,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});

export default MovieSubtitle;
