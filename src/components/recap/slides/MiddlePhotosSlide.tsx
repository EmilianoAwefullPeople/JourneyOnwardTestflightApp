import React from 'react';
import { Animated, Dimensions, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useRecapStaggerEntrance } from '../motion/useRecapStaggerEntrance';

const { width: SW, height: SH } = Dimensions.get('window');
const CELL = SW / 2;

interface Props {
  photoUris: string[];
}

const MiddlePhotosSlide: React.FC<Props> = ({ photoUris }) => {
  const cells = Array.from({ length: 4 }, (_, i) => photoUris[i] ?? null);
  const gridEntrance = useRecapStaggerEntrance({ index: 0, baseDelay: 120, offsetY: 8 });

  return (
    <Animated.View style={[styles.container, gridEntrance.style]}>
      <View style={styles.grid}>
        {cells.map((uri, i) => (
          <View key={i} style={styles.cell}>
            {uri ? (
              <Image
                source={{ uri }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={0}
              />
            ) : null}
          </View>
        ))}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: SW,
    height: SH,
  },
  grid: {
    width: SW,
    height: SH,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: CELL,
    height: SH / 2,
    backgroundColor: '#1e1e1e',
    overflow: 'hidden',
  },
});

export default MiddlePhotosSlide;
