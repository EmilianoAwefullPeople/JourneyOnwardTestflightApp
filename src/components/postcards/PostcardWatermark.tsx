import React from 'react';
import { Image, StyleSheet } from 'react-native';

/**
 * Small, low-opacity Journey Onward wordmark stamped at the bottom of every
 * postcard template. Sized as a percentage of the card so it stays
 * consistently subtle across thumbnails, the editor, and full-size exports.
 */
export function PostcardWatermark() {
  return (
    <Image
      source={require('../../../assets/postcard-watermark.png')}
      style={st.watermark}
      resizeMode="contain"
    />
  );
}

const st = StyleSheet.create({
  watermark: {
    position: 'absolute',
    bottom: '2.5%',
    alignSelf: 'center',
    width: '16%',
    aspectRatio: 783 / 319,
    opacity: 0.5,
    zIndex: 20,
    pointerEvents: 'none',
  },
});
