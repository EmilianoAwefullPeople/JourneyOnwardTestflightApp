// CollageSlide
// Recap collage slide: 2–4 images in a grid (1×2 when two images, 2×2 otherwise)

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Image, Dimensions } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { FONTS, SPACING } from '../../config/constants';
import type { RecapSlideCollagePayload } from '../../models/Recap';

interface CollageSlideProps {
  payload: RecapSlideCollagePayload;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const GAP = 4;
const LABEL_AREA_HEIGHT = 14 + SPACING.sm * 2;

const CollageSlide: React.FC<CollageSlideProps> = ({ payload }) => {
  const { colors } = useTheme();
  const uris = payload.mediaUris.slice(0, 4);
  const isTwoImage = uris.length === 2;
  const hasLabel = Boolean(payload.label?.trim());

  const gridHeight = SCREEN_HEIGHT - GAP * 2 - (hasLabel ? LABEL_AREA_HEIGHT : 0);
  const cellW = (SCREEN_WIDTH - GAP * 2) / 2;
  const cellH = (gridHeight - GAP) / 2;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.surface,
        },
        label: {
          fontFamily: FONTS.inter,
          fontSize: 14,
          color: colors.textSecondary,
          textAlign: 'center',
          marginBottom: SPACING.sm,
          paddingHorizontal: SPACING.xl,
        },
        grid: {
          flex: 1,
          flexDirection: 'row',
          flexWrap: isTwoImage ? ('nowrap' as const) : ('wrap' as const),
          padding: GAP / 2,
        },
        cell: {
          width: isTwoImage ? undefined : cellW,
          height: isTwoImage ? undefined : cellH,
          flex: isTwoImage ? 1 : undefined,
          padding: GAP / 2,
        },
        image: {
          width: '100%',
          height: '100%',
          borderRadius: 8,
          backgroundColor: colors.surfaceVariant,
        },
      }),
    [colors, isTwoImage, cellW, cellH]
  );

  return (
    <View style={styles.container}>
      {hasLabel ? <Text style={styles.label}>{payload.label}</Text> : null}
      <View style={styles.grid}>
        {uris.map((uri, i) => (
          <View key={i} style={styles.cell}>
            <Image source={{ uri }} style={styles.image} resizeMode="cover" />
          </View>
        ))}
      </View>
    </View>
  );
};

export default CollageSlide;
