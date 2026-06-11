// TripAlbumsSection
// Grid view of trip albums with preview images and metadata

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TripAlbum } from '../../models/TripAlbum';
import { Entry } from '../../models/Entry';
import { Journal } from '../../models/Journal';
import { SPACING, FONT_WEIGHTS } from '../../config/constants';
import { getEffectiveMainTabInset } from '../../navigation/mainTabBarMetrics';
import { TEXT_STYLES } from '../../config/typography';
import { useTheme } from '../../context/ThemeContext';
import { EntryPhotoImage } from '../common/EntryPhotoImage';

interface TripAlbumsSectionProps {
  tripAlbums: TripAlbum[];
  entries: Entry[];
  journals: Journal[];
  onAlbumPress: (album: TripAlbum) => void;
  onCreateAlbumPress: () => void;
  onSuggestTripsPress: () => void;
  /** Optional ref for scroll-to-top when Review tab is tapped */
  scrollRef?: React.RefObject<ScrollView | null>;
  onScrollReport?: (offsetY: number) => void;
  tabBarVisibilityProgress?: number;
}

const TripAlbumsSection: React.FC<TripAlbumsSectionProps> = ({
  tripAlbums,
  entries,
  journals,
  onAlbumPress,
  onCreateAlbumPress,
  onSuggestTripsPress,
  scrollRef,
  onScrollReport,
  tabBarVisibilityProgress = 1,
}) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const screenWidth = Dimensions.get('window').width;
  const cardWidth = (screenWidth - SPACING.md * 3) / 2; // Two columns with spacing

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        scrollContent: {
          padding: SPACING.md,
          paddingBottom: getEffectiveMainTabInset(insets.bottom, tabBarVisibilityProgress) + SPACING.md,
        },
        grid: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          rowGap: SPACING.md,
        },
        albumCard: {
          marginBottom: SPACING.xs,
        },
        previewContainer: {
          width: '100%',
          aspectRatio: 1.08,
          borderRadius: 16,
          backgroundColor: colors.surface,
          overflow: 'hidden',
        },
        singlePreview: { width: '100%', height: '100%' },
        splitPreview: { width: '100%', height: '100%', flexDirection: 'row' as const },
        splitLeft: { width: '50%', height: '100%' },
        splitRight: { width: '50%', height: '100%' },
        mosaicPreview: { width: '100%', height: '100%', flexDirection: 'row' as const },
        heroPreview: { width: '67%', height: '100%' },
        stackedPreviewContainer: { width: '33%', height: '100%', flexDirection: 'column' as const },
        stackedPreviewTop: { width: '100%', height: '50%' },
        stackedPreviewBottom: { width: '100%', height: '50%' },
        emptyPreview: {
          width: '100%',
          height: '100%',
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: colors.surface,
        },
        emptyPreviewText: {
          ...TEXT_STYLES.entryInput,
          fontSize: 12,
          color: colors.textSecondary,
        },
        albumInfo: { paddingTop: SPACING.sm },
        albumName: {
          ...TEXT_STYLES.cardTitle,
          fontSize: 17,
          fontWeight: FONT_WEIGHTS.semibold,
          color: colors.textPrimary,
          marginBottom: 2,
        },
        albumDate: {
          ...TEXT_STYLES.entryInput,
          fontSize: 13,
          color: colors.textSecondary,
          marginBottom: 1,
        },
        albumCount: {
          ...TEXT_STYLES.entryInput,
          fontSize: 12,
          color: colors.textSecondary,
        },
        createCard: {
          marginBottom: SPACING.xs,
        },
        createPreviewContainer: {
          width: '100%',
          aspectRatio: 1.08,
          borderRadius: 16,
          borderWidth: 1,
          borderStyle: 'dashed',
          borderColor: colors.border,
          backgroundColor: colors.surface,
          justifyContent: 'center',
          alignItems: 'center',
        },
        createPlus: {
          ...TEXT_STYLES.cardTitle,
          fontSize: 36,
          color: colors.textSecondary,
          lineHeight: 36,
          marginBottom: SPACING.sm,
        },
        createLabel: {
          ...TEXT_STYLES.entryInput,
          fontSize: 18,
          fontWeight: FONT_WEIGHTS.semibold,
          color: colors.textSecondary,
        },
        createSubtext: {
          ...TEXT_STYLES.entryInput,
          fontSize: 12,
          color: colors.textSecondary,
        },
      }),
    [colors, insets.bottom, tabBarVisibilityProgress]
  );

  // Get preview images and count for each album
  const albumsWithPreview = useMemo(() => {
    const albums = tripAlbums ?? [];
    const eList = entries ?? [];
    const jList = journals ?? [];
    return albums.map((album) => {
      const albumEntries = eList.filter((e) => e.albumId === album.id);
      const albumJournals = jList.filter((j) => j.albumId === album.id);
      
      // Get preview images (first 3-4 photos from entries)
      const previewImages: string[] = [];
      for (const entry of albumEntries) {
        if (entry.mediaType === 'photo' && entry.photoPaths && entry.photoPaths.length > 0) {
          previewImages.push(...entry.photoPaths.slice(0, 3 - previewImages.length));
          if (previewImages.length >= 3) break;
        }
      }
      
      const totalCount = albumEntries.length + albumJournals.length;
      
      // Format date range
      const startDate = new Date(album.startDate);
      const endDate = album.endDate ? new Date(album.endDate) : null;
      const dateRange = endDate
        ? `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
        : startDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      
      return {
        album,
        previewImages,
        totalCount,
        dateRange,
      };
    });
  }, [tripAlbums, entries, journals]);

  // Render album card
  const renderAlbumCard = (albumData: typeof albumsWithPreview[0]) => {
    const { album, previewImages, totalCount, dateRange } = albumData;
    
    return (
      <TouchableOpacity
        key={album.id}
        style={[styles.albumCard, { width: cardWidth }]}
        onPress={() => onAlbumPress(album)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`Trip album, ${album.name}`}
      >
        {/* Preview Images Collage */}
        <View style={styles.previewContainer}>
          {previewImages.length > 0 ? (
            previewImages.length === 1 ? (
              <EntryPhotoImage
                uri={previewImages[0]}
                style={styles.singlePreview}
                resizeMode="cover"
                fallbackBackgroundColor={colors.surface}
              />
            ) : previewImages.length === 2 ? (
              <View style={styles.splitPreview}>
                <EntryPhotoImage
                  uri={previewImages[0]}
                  style={styles.splitLeft}
                  resizeMode="cover"
                  fallbackBackgroundColor={colors.surface}
                />
                <EntryPhotoImage
                  uri={previewImages[1]}
                  style={styles.splitRight}
                  resizeMode="cover"
                  fallbackBackgroundColor={colors.surface}
                />
              </View>
            ) : (
              <View style={styles.mosaicPreview}>
                <EntryPhotoImage
                  uri={previewImages[0]}
                  style={styles.heroPreview}
                  resizeMode="cover"
                  fallbackBackgroundColor={colors.surface}
                />
                <View style={styles.stackedPreviewContainer}>
                  <EntryPhotoImage
                    uri={previewImages[1]}
                    style={styles.stackedPreviewTop}
                    resizeMode="cover"
                    fallbackBackgroundColor={colors.surface}
                  />
                  <EntryPhotoImage
                    uri={previewImages[2]}
                    style={styles.stackedPreviewBottom}
                    resizeMode="cover"
                    fallbackBackgroundColor={colors.surface}
                  />
                </View>
              </View>
            )
          ) : (
            <View style={styles.emptyPreview}>
              <Text style={styles.emptyPreviewText}>No photos yet</Text>
            </View>
          )}
        </View>

        {/* Album Info */}
        <View style={styles.albumInfo}>
          <Text style={styles.albumName} numberOfLines={1}>
            {album.name}
          </Text>
          <Text style={styles.albumDate} numberOfLines={1}>
            {dateRange}
          </Text>
          <Text style={styles.albumCount}>
            {totalCount.toLocaleString('en-US')} {totalCount === 1 ? 'item' : 'items'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderCreateAlbumTile = () => {
    return (
      <TouchableOpacity
        key="create-album-tile"
        style={[styles.createCard, { width: cardWidth }]}
        onPress={onCreateAlbumPress}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Create new trip album"
      >
        <View style={styles.createPreviewContainer}>
          <Text style={styles.createPlus}>+</Text>
          <Text style={styles.createLabel}>Create New</Text>
        </View>
        <View style={styles.albumInfo}>
          <Text style={styles.albumName} numberOfLines={1}>
            New Album
          </Text>
          <Text style={styles.createSubtext}>0 items</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderSuggestTripsTile = () => {
    return (
      <TouchableOpacity
        key="suggest-trips-tile"
        style={[styles.createCard, { width: cardWidth }]}
        onPress={onSuggestTripsPress}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Find suggested trip albums"
      >
        <View style={styles.createPreviewContainer}>
          <Text style={styles.createPlus}>✦</Text>
          <Text style={styles.createLabel}>Suggest Trips</Text>
        </View>
        <View style={styles.albumInfo}>
          <Text style={styles.albumName} numberOfLines={1}>
            Find Trips
          </Text>
          <Text style={styles.createSubtext}>Auto-detect</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      accessibilityLabel="Trip Albums view"
      onScroll={(e) => onScrollReport?.(e.nativeEvent.contentOffset.y)}
      scrollEventThrottle={16}
    >
      <View style={styles.grid}>
        {albumsWithPreview.map(renderAlbumCard)}
        {renderCreateAlbumTile()}
        {renderSuggestTripsTile()}
      </View>
    </ScrollView>
  );
};

export default TripAlbumsSection;
