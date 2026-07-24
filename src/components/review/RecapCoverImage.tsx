// RecapCoverImage
// Cover for the Recap story card: a blurred trip photo with just "{Trip name} recap" centered
// on it — the same visual language as the recap's own opening "Let's go" title card
// (TitleCardSlide), scaled down to card size with no date range, subtitle, or button.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { BlurView } from 'expo-blur';
import { FONTS, FONT_WEIGHTS } from '../../config/constants';

interface RecapCoverImageProps {
  coverUri: string;
  tripName: string;
}

const RecapCoverImage: React.FC<RecapCoverImageProps> = ({ coverUri, tripName }) => (
  <View style={StyleSheet.absoluteFill}>
    <ExpoImage
      source={{ uri: coverUri }}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      cachePolicy="memory-disk"
      transition={0}
    />
    <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
    <View style={styles.overlay} />
    <View style={styles.content}>
      <Text style={styles.title} numberOfLines={4}>
        {tripName} recap
      </Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.52)',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  title: {
    fontFamily: FONTS.inter,
    fontSize: 15,
    fontWeight: FONT_WEIGHTS.semibold,
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 19,
  },
});

export default RecapCoverImage;
