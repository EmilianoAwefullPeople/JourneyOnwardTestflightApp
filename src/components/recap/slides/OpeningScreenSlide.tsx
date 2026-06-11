import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, StyleSheet, View } from 'react-native';
import RecapPostcard from '../RecapPostcard';
import { useReduceMotion } from '../../../hooks/useReduceMotion';
import type { PostcardItem } from '../../../models/Recap';

const { width: SW } = Dimensions.get('window');
const CARD_WIDTH = Math.round(SW * 0.72);
const DRIFT_PX = 6;

interface Props {
  postcards: PostcardItem[];
}

function tiltForIndex(i: number): number {
  return i % 2 === 0 ? 3 : -3;
}

const OpeningScreenSlide: React.FC<Props> = ({ postcards }) => {
  const reduceMotion = useReduceMotion();
  const opacities = useRef<Animated.Value[]>(
    postcards.map((_, i) => new Animated.Value(i === 0 ? 1 : 0))
  ).current;
  const translateYs = useRef<Animated.Value[]>(
    postcards.map((_, i) => new Animated.Value(i === 0 ? 0 : DRIFT_PX))
  ).current;

  const idxRef = useRef(0);

  useEffect(() => {
    if (postcards.length <= 1) return;

    const advance = () => {
      const current = idxRef.current;
      const next = (current + 1) % postcards.length;

      if (reduceMotion) {
        opacities[current].setValue(0);
        opacities[next].setValue(1);
        translateYs[current].setValue(DRIFT_PX);
        translateYs[next].setValue(0);
        idxRef.current = next;
        return;
      }

      Animated.parallel([
        Animated.timing(opacities[current], {
          toValue: 0,
          duration: 130,
          useNativeDriver: true,
        }),
        Animated.timing(translateYs[current], {
          toValue: -DRIFT_PX,
          duration: 130,
          useNativeDriver: true,
        }),
      ]).start(() => {
        translateYs[next].setValue(DRIFT_PX);
        Animated.parallel([
          Animated.timing(opacities[next], {
            toValue: 1,
            duration: 180,
            useNativeDriver: true,
          }),
          Animated.timing(translateYs[next], {
            toValue: 0,
            duration: 180,
            useNativeDriver: true,
          }),
        ]).start(() => {
          idxRef.current = next;
        });
      });
    };

    const timer = setInterval(advance, 1000);
    return () => clearInterval(timer);
  }, [opacities, postcards.length, reduceMotion, translateYs]);

  if (postcards.length === 0) return <View style={styles.container} />;

  return (
    <View style={styles.container}>
      {postcards.map((card, i) => (
        <Animated.View
          key={card.photoUri}
          style={[
            StyleSheet.absoluteFillObject,
            styles.cardWrap,
            { opacity: opacities[i], transform: [{ translateY: translateYs[i] }] },
          ]}
          pointerEvents="none"
        >
          <RecapPostcard
            photoUri={card.photoUri}
            location={card.location}
            tiltDeg={tiltForIndex(i)}
            width={CARD_WIDTH}
          />
        </Animated.View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#141212',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default OpeningScreenSlide;
