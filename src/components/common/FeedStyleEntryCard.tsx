// FeedStyleEntryCard
// Presentational card matching the HomeScreen feed-mode card visual:
// full-bleed photo, top/bottom gradients, country (top-left), date+city (top-right), title (bottom-left).
// Used in HomeScreen and CaptureSavedScreen.

import React from 'react';
import { View, Text, Image, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Entry } from '../../models/Entry';
import { EntryPhotoImage } from './EntryPhotoImage';
import GradientText from './GradientText';
import { FONTS, FONT_WEIGHTS } from '../../config/constants';
import { useTheme } from '../../context/ThemeContext';

type Props = {
  entry: Entry;
  width: number;
  aspectRatio?: number;
  style?: StyleProp<ViewStyle>;
  /** When provided, bypasses EntryPhotoImage (expo-image) and renders a plain Image for instant paint. */
  directImageUri?: string;
};

const formatCardDate = (timestamp: string): string => {
  try {
    const d = new Date(timestamp);
    const month = d.toLocaleDateString('en-US', { month: 'short' });
    return `${month} ${d.getDate()} ${d.getFullYear()}`;
  } catch {
    return '';
  }
};

const FeedStyleEntryCard: React.FC<Props> = ({ entry, width, aspectRatio = 3 / 4, style, directImageUri }) => {
  const { colors, isDark } = useTheme();
  const hasPhoto = entry.mediaType === 'photo' && entry.photoPaths && entry.photoPaths.length > 0;
  const country = (entry.country?.trim() ?? '').trim();
  const dateStr = formatCardDate(entry.timestamp);

  return (
    <View
      style={[
        {
          width,
          aspectRatio,
          borderRadius: 16,
          overflow: 'hidden',
          borderWidth: isDark ? 0 : StyleSheet.hairlineWidth,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      {directImageUri ? (
        <Image source={{ uri: directImageUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : hasPhoto ? (
        <EntryPhotoImage
          uri={entry.photoPaths[0]}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          fallbackBackgroundColor={colors.surface}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface }]} />
      )}

      <LinearGradient
        colors={['rgba(0,0,0,0.55)', 'transparent']}
        style={styles.topGradient}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.62)']}
        style={styles.bottomGradient}
        pointerEvents="none"
      />

      {country.length > 0 && (
        <Text style={styles.country} numberOfLines={1} maxFontSizeMultiplier={1.2}>
          {country}
        </Text>
      )}

      <View style={styles.topRight} pointerEvents="none">
        {dateStr.length > 0 && (
          <Text style={styles.topRightText} numberOfLines={1} maxFontSizeMultiplier={1.2}>
            {dateStr}
          </Text>
        )}
      </View>

      {entry.title ? (
        entry.isAwe ? (
          <GradientText style={styles.title}>{entry.title}</GradientText>
        ) : (
          <Text style={styles.title} numberOfLines={2} maxFontSizeMultiplier={1.2}>
            {entry.title}
          </Text>
        )
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '40%',
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '42%',
  },
  country: {
    position: 'absolute',
    top: 27,
    left: 27,
    color: '#FFFFFF',
    fontFamily: FONTS.inter,
    fontSize: 22,
    fontWeight: FONT_WEIGHTS.bold,
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  topRight: {
    position: 'absolute',
    top: 27,
    right: 27,
    alignItems: 'flex-end',
  },
  topRightText: {
    color: '#FFFFFF',
    fontFamily: FONTS.inter,
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.semibold,
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    lineHeight: 18,
  },
  title: {
    position: 'absolute',
    bottom: 27,
    left: 27,
    right: 27,
    color: '#FFFFFF',
    fontFamily: FONTS.inter,
    fontSize: 24,
    fontWeight: FONT_WEIGHTS.bold,
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});

export default FeedStyleEntryCard;
