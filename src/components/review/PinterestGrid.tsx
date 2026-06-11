// PinterestGrid
// Pinterest-style masonry grid layout for entries - matches HomeScreen card style

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { SPACING, DIMENSIONS, FONT_WEIGHTS } from '../../config/constants';
import { TEXT_STYLES } from '../../config/typography';
import { useTheme } from '../../context/ThemeContext';
import { EntryPhotoImage } from '../common/EntryPhotoImage';
import { Entry } from '../../models/Entry';
import MoreIcon from '../common/icons/MoreIcon';
import GradientText from '../common/GradientText';

interface PinterestGridProps {
  entries: Entry[];
  onEntryPress: (entry: Entry) => void;
}

const PinterestGrid: React.FC<PinterestGridProps> = ({ entries, onEntryPress }) => {
  const { colors } = useTheme();
  const screenWidth = Dimensions.get('window').width;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        pinterestGrid: { alignSelf: 'center' as const },
        pinterestColumn: {},
        pinterestCard: {
          marginBottom: 12,
          marginHorizontal: 4,
          backgroundColor: 'transparent',
          borderRadius: DIMENSIONS.cardBorderRadius,
          overflow: 'visible',
        },
        pinterestMediaContainer: {
          width: '100%',
          borderRadius: 16,
          overflow: 'hidden',
          backgroundColor: colors.surface,
        },
        pinterestImage: { width: '100%', height: '100%', borderRadius: 16 },
        pinterestVideoPlaceholder: {
          width: '100%',
          height: '100%',
          backgroundColor: colors.surface,
          borderRadius: DIMENSIONS.cardBorderRadius,
          justifyContent: 'center',
          alignItems: 'center',
        },
        pinterestAudioPlaceholder: {
          width: '100%',
          height: '100%',
          backgroundColor: colors.surface,
          borderRadius: DIMENSIONS.cardBorderRadius,
          justifyContent: 'center',
          alignItems: 'center',
        },
        pinterestPlaceholder: {
          width: '100%',
          height: '100%',
          backgroundColor: colors.stone600,
          borderRadius: DIMENSIONS.cardBorderRadius,
          justifyContent: 'center',
          alignItems: 'center',
        },
        pinterestMediaIcon: { fontSize: 32, marginBottom: SPACING.xs },
        pinterestMediaLabel: {
          fontFamily: TEXT_STYLES.entryLabel.fontFamily,
          fontSize: 12,
          fontWeight: FONT_WEIGHTS.semibold,
          color: colors.textPrimary,
        },
        pinterestTitle: {
          fontFamily: TEXT_STYLES.cardTitle.fontFamily,
          fontSize: 12,
          fontWeight: '600',
          color: colors.textPrimary,
          padding: 0,
          marginTop: 6,
          marginLeft: 4,
          backgroundColor: 'transparent',
        },
        pinterestColumnsContainer: {
          flexDirection: 'row',
          width: '100%',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        },
      }),
    [colors]
  );

  // Match HomeScreen map width calculations (reduced by 40% from 0.054 to 0.0324)
  const headerPaddingLeft = screenWidth * 0.0324;
  const headerPaddingRight = screenWidth * 0.0324;
  const feedContentPadding = 16; // SPACING.md value
  const feedMapLeft = Math.max(headerPaddingLeft - feedContentPadding, 0);
  const availableWidth = screenWidth - (headerPaddingLeft + headerPaddingRight);
  const mapWidth = availableWidth;

  // Card width calculation - same as HomeScreen
  // Cards have marginHorizontal: 4, creating:
  //   - Left card: 4px left margin + cardWidth + 4px right margin
  //   - Right card: 4px left margin + cardWidth + 4px right margin
  //   - Gap between: 4px (left card right margin) + 4px (right card left margin) = 8px
  //   - Total width: 4 + cardWidth + 8 + cardWidth + 4 = 2*cardWidth + 16
  //   - To match mapWidth: cardWidth = (mapWidth - 16) / 2
  const cardWidth = (mapWidth - 16) / 2;

  const entryIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    entries.forEach((e, i) => map.set(e.id, i));
    return map;
  }, [entries]);

  // Distribute entries into two columns using shortest-column algorithm
  const distributeEntriesIntoColumns = (entries: Entry[], cardWidth: number) => {
    const leftColumn: Entry[] = [];
    const rightColumn: Entry[] = [];
    let leftHeight = 0;
    let rightHeight = 0;

    entries.forEach((entry) => {
      // Calculate entry height (same logic as in renderItem)
      const seed = entry.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const randomFactor = (seed % 100) / 100;
      const aspectRatio = 0.75 + (randomFactor * 0.9);
      const cardHeight = cardWidth * aspectRatio;
      // Add title height if present (estimate ~40px for title + padding)
      const titleHeight = entry.title ? 40 : 0;
      const totalHeight = cardHeight + titleHeight + 8; // +8 for marginBottom

      // Place in shorter column
      if (leftHeight <= rightHeight) {
        leftColumn.push(entry);
        leftHeight += totalHeight;
      } else {
        rightColumn.push(entry);
        rightHeight += totalHeight;
      }
    });

    return { leftColumn, rightColumn };
  };

  // Render card function (extracted from renderItem)
  const renderCard = (entry: Entry) => {
    const entryIndex = entryIndexMap.get(entry.id) ?? 0;
    const priority = entryIndex < 6 ? 'high' : entryIndex < 12 ? 'normal' : 'low';

    const seed = entry.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const randomFactor = (seed % 100) / 100; // 0 to 1
    // Vary aspect ratio from 0.75 (wide/square-ish) to 1.65 (tall portrait) for more noticeable height variation
    const aspectRatio = 0.75 + (randomFactor * 0.9);

    return (
      <TouchableOpacity
        key={entry.id}
        style={[styles.pinterestCard, { width: cardWidth }]}
        onPress={() => onEntryPress(entry)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={entry.title ? `Experience, ${entry.title}` : 'Experience'}
      >
        {/* Media Container */}
        <View style={[
          styles.pinterestMediaContainer,
          { aspectRatio },
        ]}>

          {entry.mediaType === 'photo' && entry.photoPaths && entry.photoPaths.length > 0 ? (
            <EntryPhotoImage
              uri={entry.thumbPaths?.[0] || entry.photoPaths[0]}
              style={styles.pinterestImage}
              resizeMode="cover"
              fallbackBackgroundColor={colors.stone600}
              priority={priority}
            />
          ) : entry.mediaType === 'video' ? (
            <View style={styles.pinterestVideoPlaceholder}>
              <Text style={styles.pinterestMediaIcon}>🎥</Text>
              <Text style={styles.pinterestMediaLabel}>Video</Text>
            </View>
          ) : entry.mediaType === 'audio' ? (
            <View style={styles.pinterestAudioPlaceholder}>
              <Text style={styles.pinterestMediaIcon}>🎵</Text>
              <Text style={styles.pinterestMediaLabel}>Audio</Text>
            </View>
          ) : (
            <View style={styles.pinterestPlaceholder}>
              <Text style={styles.pinterestMediaIcon}>📷</Text>
            </View>
          )}
        </View>

        {/* Title - bookmarked: gradient; non-bookmarked: plain text */}
        {entry.title ? (
          entry.isAwe ? (
            <GradientText style={styles.pinterestTitle}>
              {entry.title}
            </GradientText>
          ) : (
            <Text style={styles.pinterestTitle} numberOfLines={2}>
              {entry.title}
            </Text>
          )
        ) : null}
      </TouchableOpacity>
    );
  };

  // Distribute entries into columns
  const { leftColumn, rightColumn } = distributeEntriesIntoColumns(entries, cardWidth);

  return (
    <View style={[styles.pinterestGrid, { width: mapWidth }]}>
      <View style={styles.pinterestColumnsContainer}>
        {/* Left Column */}
        <View style={[styles.pinterestColumn, { width: cardWidth + 8 }]}>
          {leftColumn.map((entry) => renderCard(entry))}
        </View>

        {/* Right Column */}
        <View style={[styles.pinterestColumn, { width: cardWidth + 8 }]}>
          {rightColumn.map((entry) => renderCard(entry))}
        </View>
      </View>
    </View>
  );
};

export default PinterestGrid;
