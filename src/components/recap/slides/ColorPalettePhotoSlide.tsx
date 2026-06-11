import React from 'react';
import { Animated, Dimensions, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useRecapScaleEntrance } from '../motion/useRecapScaleEntrance';

const { width: SW, height: SH } = Dimensions.get('window');
const PHOTO_WIDTH = Math.round(SW * 0.58);
const PHOTO_HEIGHT = Math.round(PHOTO_WIDTH * 1.25);

interface Props {
  colors: string[];
  photoUri: string;
}

const ColorPalettePhotoSlide: React.FC<Props> = ({ colors, photoUri }) => {
  const palette =
    colors.length > 0
      ? colors
      : ['#8dc0e0', '#fed86d', '#487525', '#8A6552', '#B2C4B2', '#D4A574'];
  const photoEntrance = useRecapScaleEntrance({ index: 0, baseDelay: 280 });

  return (
    <View style={styles.container}>
      <View style={styles.stripeRow}>
        {palette.map((color, i) => (
          <View key={i} style={[styles.stripe, { backgroundColor: color }]} />
        ))}
      </View>

      <View style={styles.bgOverlay} />

      <Animated.View style={[styles.photoFrame, photoEntrance.style]}>
        <Image
          source={{ uri: photoUri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={0}
        />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: SW,
    height: SH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stripeRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
  },
  stripe: {
    flex: 1,
  },
  bgOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  photoFrame: {
    width: PHOTO_WIDTH,
    height: PHOTO_HEIGHT,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 16,
  },
});

export default ColorPalettePhotoSlide;
