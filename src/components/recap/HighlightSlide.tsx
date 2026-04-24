// HighlightSlide
// Recap highlight slide: full-screen image + optional caption

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Image, Dimensions } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { FONTS, SPACING } from '../../config/constants';
import type { RecapSlideHighlightPayload } from '../../models/Recap';

interface HighlightSlideProps {
  payload: RecapSlideHighlightPayload;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const HighlightSlide: React.FC<HighlightSlideProps> = ({ payload }) => {
  const { colors } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
        },
        imageWrap: {
          flex: 1,
          backgroundColor: colors.surface,
        },
        image: {
          width: SCREEN_WIDTH,
          height: SCREEN_HEIGHT,
          resizeMode: 'cover',
        },
        captionWrap: {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: SPACING.lg,
          paddingVertical: SPACING.xl,
          paddingBottom: SPACING.xxl + 40,
        },
        caption: {
          fontFamily: FONTS.inter,
          fontSize: 15,
          color: colors.textPrimary,
          textShadowColor: 'rgba(0,0,0,0.6)',
          textShadowOffset: { width: 0, height: 1 },
          textShadowRadius: 4,
        },
      }),
    [colors]
  );

  return (
    <View style={styles.container}>
      <View style={styles.imageWrap}>
        <Image source={{ uri: payload.mediaUri }} style={styles.image} resizeMode="cover" />
      </View>
      {payload.caption ? (
        <View style={styles.captionWrap}>
          <Text style={styles.caption} numberOfLines={3}>
            {payload.caption}
          </Text>
        </View>
      ) : null}
    </View>
  );
};

export default HighlightSlide;
