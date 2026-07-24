// StoryCard
// Single Instagram-Stories-style card: gradient ring (Recap) or plain ring (Stories), cover
// photo, small type label below ("Recap" / "Stories"). Shared by TripRecapsRow and the
// active-trip section in TripAlbumsSection so both use identical card visuals.

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, FONTS, FONT_WEIGHTS, SPACING } from '../../config/constants';
import { useTheme } from '../../context/ThemeContext';
import { EntryPhotoImage } from '../common/EntryPhotoImage';

const RING_GAP = 3;
const CARD_RADIUS = 16;
const RECAP_GRADIENT = [COLORS.babyBlue, COLORS.royalGold, COLORS.fern] as const;

/** Story card size derived from a grid column width (matches the Albums grid's card width). */
export function getStoryCardSize(gridColumnWidth: number): { width: number; height: number } {
  const width = gridColumnWidth * 0.72;
  return { width, height: width * 1.6 };
}

export interface StoryCardProps {
  coverUri: string;
  /** Trip name. Only shown (overlaid bottom-left on the cover) when `showTitleOverlay` is set. */
  title: string;
  subtitle: string;
  ring: 'gradient' | 'plain';
  width: number;
  height: number;
  onPress: () => void;
  accessibilityLabel: string;
  /** Overrides the default cover-photo rendering, e.g. a blurred title-card for Recap covers. */
  renderCover?: () => React.ReactNode;
  /** Overlays `title` bottom-left inside the cover (Stories cards, which have no other trip label). */
  showTitleOverlay?: boolean;
}

const StoryCard: React.FC<StoryCardProps> = ({
  coverUri,
  title,
  subtitle,
  ring,
  width,
  height,
  onPress,
  accessibilityLabel,
  renderCover,
  showTitleOverlay = false,
}) => {
  const { colors } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: { width },
        ringGradient: {
          width,
          height,
          borderRadius: CARD_RADIUS,
          padding: RING_GAP,
        },
        ringPlain: {
          width,
          height,
          borderRadius: CARD_RADIUS,
          borderWidth: RING_GAP,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        },
        ringInner: {
          flex: 1,
          borderRadius: CARD_RADIUS - RING_GAP,
          overflow: 'hidden',
          backgroundColor: colors.surface,
        },
        cardImage: { width: '100%', height: '100%' },
        titleOverlayScrim: {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: '50%',
        },
        titleOverlayWrap: {
          position: 'absolute',
          left: 8,
          right: 8,
          bottom: 8,
        },
        titleOverlayText: {
          fontFamily: FONTS.inter,
          fontSize: 12,
          fontWeight: FONT_WEIGHTS.semibold,
          color: '#FFFFFF',
        },
        subtitleWrap: { paddingTop: SPACING.sm },
        cardSubtitle: {
          fontFamily: FONTS.inter,
          fontSize: 11,
          color: colors.textSecondary,
        },
      }),
    [colors, width, height]
  );

  const coverContent = renderCover ? (
    renderCover()
  ) : (
    <EntryPhotoImage
      uri={coverUri}
      style={styles.cardImage}
      resizeMode="cover"
      fallbackBackgroundColor={colors.surface}
    />
  );

  const ringContent = (
    <View style={styles.ringInner}>
      {coverContent}
      {showTitleOverlay && (
        <>
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.65)']}
            style={styles.titleOverlayScrim}
            pointerEvents="none"
          />
          <View style={styles.titleOverlayWrap} pointerEvents="none">
            <Text style={styles.titleOverlayText} numberOfLines={2}>
              {title}
            </Text>
          </View>
        </>
      )}
    </View>
  );

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {ring === 'gradient' ? (
        <LinearGradient
          colors={RECAP_GRADIENT}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.ringGradient}
        >
          {ringContent}
        </LinearGradient>
      ) : (
        <View style={styles.ringPlain}>{ringContent}</View>
      )}
      <View style={styles.subtitleWrap}>
        <Text style={styles.cardSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

export default StoryCard;
