// Full-bleed placeholder for feed cards without a photo (video/audio/missing file).
// Uses the same mesh gradient language as other screens so the card never reads as "empty".

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MeshGradientBackground } from '../common/MeshGradientBackground';

type Props = {
  mediaType: 'photo' | 'audio' | 'video';
  isDark: boolean;
};

export const FeedCardPoster: React.FC<Props> = ({ mediaType, isDark }) => {
  const emoji = mediaType === 'video' ? '🎥' : mediaType === 'audio' ? '🎵' : '📷';
  const label = mediaType === 'video' ? 'Video' : mediaType === 'audio' ? 'Audio' : 'Memory';

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <MeshGradientBackground
        baseColor={isDark ? '#1c1a1a' : '#e8e8ea'}
        lightMode={!isDark}
      />
      <View style={styles.center} pointerEvents="none">
        <Text style={styles.icon} maxFontSizeMultiplier={1.25}>
          {emoji}
        </Text>
        <Text
          style={[styles.caption, { color: isDark ? 'rgba(255,255,255,0.72)' : 'rgba(20,18,18,0.62)' }]}
          maxFontSizeMultiplier={1.2}
        >
          {label}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 44,
    marginBottom: 8,
  },
  caption: {
    fontSize: 13,
    fontWeight: '600',
  },
});
