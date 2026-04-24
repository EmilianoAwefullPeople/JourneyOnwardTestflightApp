// SuggestedActionCard
// Visual shell for a single suggested-action card (experience or CTA variant).
// Presentational only — all gesture/animation logic lives in SuggestedActionsStack.

import React, { useState } from 'react';
import {
  View,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import AppText from '../common/AppText';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { FONTS, FONT_WEIGHTS, SPACING } from '../../config/constants';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
export const CARD_WIDTH = Math.min(SCREEN_WIDTH - 48, 390);
const CARD_BORDER_RADIUS = 20;

/** Content width inside horizontal padding — matches image region width. */
const CARD_INNER_WIDTH = CARD_WIDTH - 2 * SPACING.lg;
/** Same height as experience `imageWrapper` (aspect 4:5). */
const CARD_IMAGE_REGION_HEIGHT = CARD_INNER_WIDTH * (5 / 4);
/** Two metadata lines at lineHeight 18 — fixed so CTA cards align with experience cards. */
const META_BLOCK_HEIGHT = 36;
const META_LINE_HEIGHT = 18;

// ---------------------------------------------------------------------------
// Card data types (exported so SuggestedActionsStack can construct them)
// ---------------------------------------------------------------------------

export interface ExperienceCardData {
  kind: 'experience';
  question: string;
  /** Optional first metadata line — e.g. city, country */
  metaLine1?: string;
  /** Required second metadata line — formatted date */
  metaLine2: string;
  imageUri: string;
  accessibilityLabel: string;
  onPress: () => void;
}

export interface CTACardData {
  kind: 'cta';
  question: string;
  iconName: string;
  subtitle: string;
  accessibilityLabel: string;
  onPress: () => void;
}

export type CardData = ExperienceCardData | CTACardData;

// ---------------------------------------------------------------------------

interface Props {
  data: CardData;
}

const SuggestedActionCard: React.FC<Props> = ({ data }) => {
  const { colors } = useTheme();
  const [imageError, setImageError] = useState(false);

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: colors.journeyCardBackground,
          borderColor: colors.journeyCardBorder,
        },
      ]}
      onPress={data.onPress}
      activeOpacity={0.92}
      accessibilityRole="button"
      accessibilityLabel={data.accessibilityLabel}
      accessibilityHint="Double tap to take action. Swipe left or right to skip."
    >
      {/* Question header */}
      <AppText
        style={[styles.question, { color: colors.journeyCardTextPrimary }]}
        numberOfLines={3}
        maxFontSizeMultiplier={1.3}
      >
        {data.question}
      </AppText>

      {data.kind === 'experience' ? (
        <>
          {/* Fixed-height meta block so layout matches CTA cards (two line slots). */}
          <View style={styles.metaBlock}>
            {data.metaLine1 ? (
              <AppText
                style={[styles.meta, { color: colors.journeyCardTextSecondary }]}
                numberOfLines={1}
                maxFontSizeMultiplier={1.2}
              >
                {data.metaLine1}
              </AppText>
            ) : (
              <View style={styles.metaLinePlaceholder} />
            )}
            <AppText
              style={[styles.meta, { color: colors.journeyCardTextSecondary }]}
              numberOfLines={1}
              maxFontSizeMultiplier={1.2}
            >
              {data.metaLine2}
            </AppText>
          </View>

          {/* Image block */}
          <View style={styles.imageWrapper}>
            {!imageError ? (
              <Image
                source={{ uri: data.imageUri }}
                style={styles.image}
                resizeMode="cover"
                onError={() => setImageError(true)}
                accessibilityIgnoresInvertColors
              />
            ) : (
              <View style={[styles.image, { backgroundColor: colors.surfaceVariant }]} />
            )}
          </View>
        </>
      ) : (
        /* CTA variant — same vertical structure as experience: meta block + image region */
        <>
          <View style={styles.metaBlock} />
          <View style={styles.ctaImageRegion}>
            <Ionicons
              name={data.iconName as any}
              size={52}
              color={colors.journeyCardTextPrimary}
            />
            <AppText
              style={[styles.ctaSubtitle, { color: colors.journeyCardTextSecondary }]}
              numberOfLines={2}
              maxFontSizeMultiplier={1.3}
            >
              {data.subtitle}
            </AppText>
          </View>
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    borderRadius: CARD_BORDER_RADIUS,
    borderWidth: 2,
    paddingTop: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
    overflow: 'hidden',
  },
  question: {
    fontFamily: FONTS.inter,
    fontSize: 20,
    fontWeight: FONT_WEIGHTS.bold,
    lineHeight: 26,
    marginBottom: 4,
  },
  metaBlock: {
    height: META_BLOCK_HEIGHT,
    justifyContent: 'flex-start',
  },
  metaLinePlaceholder: {
    height: META_LINE_HEIGHT,
  },
  meta: {
    fontFamily: FONTS.playfairDisplay,
    fontStyle: 'italic',
    fontSize: 13,
    lineHeight: META_LINE_HEIGHT,
  },
  imageWrapper: {
    marginTop: 12,
    borderRadius: 12,
    overflow: 'hidden',
    height: CARD_IMAGE_REGION_HEIGHT,
    width: '100%',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  ctaImageRegion: {
    marginTop: 12,
    borderRadius: 12,
    width: '100%',
    height: CARD_IMAGE_REGION_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
    gap: SPACING.md,
  },
  ctaSubtitle: {
    fontFamily: FONTS.playfairDisplay,
    fontStyle: 'italic',
    fontSize: 15,
    textAlign: 'center',
  },
});

export default SuggestedActionCard;
