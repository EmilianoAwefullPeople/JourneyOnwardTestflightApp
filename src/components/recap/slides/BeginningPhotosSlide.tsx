import React from 'react';
import { Animated, Dimensions, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import RecapPostcard from '../RecapPostcard';
import { useRecapScaleEntrance } from '../motion/useRecapScaleEntrance';
import type { PostcardItem } from '../../../models/Recap';

const { width: SW, height: SH } = Dimensions.get('window');
const CARD_WIDTH = Math.round(SW * 0.52);

interface Props {
  bgPhotoUri: string;
  postcards: PostcardItem[];
}

const BeginningPhotosSlide: React.FC<Props> = ({ bgPhotoUri, postcards }) => {
  const [card1, card2] = postcards;
  const card1Entrance = useRecapScaleEntrance({ index: 0, baseDelay: 200 });
  const card2Entrance = useRecapScaleEntrance({ index: 1, baseDelay: 320 });

  return (
    <View style={styles.container}>
      <Image
        source={{ uri: bgPhotoUri }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={0}
      />
      <BlurView intensity={80} tint="default" style={StyleSheet.absoluteFill} />
      <View style={styles.overlay} />

      <View style={styles.cardsArea}>
        {card1 && (
          <Animated.View style={[styles.card1Wrap, card1Entrance.style]}>
            <RecapPostcard
              photoUri={card1.photoUri}
              location={card1.location}
              tiltDeg={-5}
              width={CARD_WIDTH}
            />
          </Animated.View>
        )}
        {card2 && (
          <Animated.View style={[styles.card2Wrap, card2Entrance.style]}>
            <RecapPostcard
              photoUri={card2.photoUri}
              location={card2.location}
              tiltDeg={4}
              width={CARD_WIDTH}
            />
          </Animated.View>
        )}
      </View>
    </View>
  );
};

const CARD_HEIGHT = Math.round(CARD_WIDTH * 1.38);

const styles = StyleSheet.create({
  container: {
    width: SW,
    height: SH,
    backgroundColor: '#141212',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,10,10,0.45)',
  },
  cardsArea: {
    width: SW,
    height: CARD_HEIGHT + 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card1Wrap: {
    position: 'absolute',
    left: SW * 0.08,
    top: 0,
  },
  card2Wrap: {
    position: 'absolute',
    right: SW * 0.08,
    bottom: 0,
  },
});

export default BeginningPhotosSlide;
