// TripAlbumsSection
// Grid of trip albums using FlatList numColumns={2} for native recycling.

import React, { useMemo, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, FlatList, TouchableOpacity, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TripAlbum } from '../../models/TripAlbum';
import { Entry } from '../../models/Entry';
import { Journal } from '../../models/Journal';
import { FONTS, SPACING, FONT_WEIGHTS } from '../../config/constants';
import { getEffectiveMainTabInset } from '../../navigation/mainTabBarMetrics';
import { TEXT_STYLES } from '../../config/typography';
import { useTheme } from '../../context/ThemeContext';
import { EntryPhotoImage } from '../common/EntryPhotoImage';
import TripRecapsRow from './TripRecapsRow';
import StoryCard, { getStoryCardSize } from './StoryCard';
import { getAllTripPhotoUris, getSessionRandomTripPhoto } from '../../utils/randomTripCover';

interface TripAlbumsSectionProps {
  tripAlbums: TripAlbum[];
  /** Trips currently in progress (today falls within their date range). Shown in their own
   *  section above Recaps/Albums — slideshow + album only, no recap (trip isn't over yet) —
   *  and excluded from the Recaps row and the Albums grid so they aren't shown twice. */
  activeTripAlbums: TripAlbum[];
  entries: Entry[];
  journals: Journal[];
  onAlbumPress: (album: TripAlbum) => void;
  onCreateAlbumPress: () => void;
  onSuggestTripsPress: () => void;
  onRecapPress: (album: TripAlbum) => void;
  onSlideshowPress: (album: TripAlbum) => void;
  scrollRef?: React.RefObject<ScrollView | null>;
  onScrollReport?: (offsetY: number) => void;
  tabBarVisibilityProgress?: number;
}

type AlbumPreview = {
  album: TripAlbum;
  previewImages: string[];
  totalCount: number;
  dateRange: string;
};

type TileItem =
  | { type: 'album'; data: AlbumPreview }
  | { type: 'create' }
  | { type: 'suggest' };

const TripAlbumsSection: React.FC<TripAlbumsSectionProps> = ({
  tripAlbums,
  activeTripAlbums,
  entries,
  journals,
  onAlbumPress,
  onCreateAlbumPress,
  onSuggestTripsPress,
  onRecapPress,
  onSlideshowPress,
  scrollRef,
  onScrollReport,
  tabBarVisibilityProgress = 1,
}) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList<TileItem>>(null);
  const screenWidth = Dimensions.get('window').width;
  const cardWidth = (screenWidth - SPACING.md * 3) / 2;
  const { width: storyCardWidth, height: storyCardHeight } = getStoryCardSize(cardWidth);

  const activeAlbumIds = useMemo(
    () => new Set((activeTripAlbums ?? []).map((a) => a.id)),
    [activeTripAlbums]
  );

  // Bridge external ScrollView ref to FlatList
  useEffect(() => {
    if (!scrollRef) return;
    (scrollRef as any).current = {
      scrollTo: ({ animated }: { y?: number; animated?: boolean } = {}) => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: animated ?? false });
      },
    };
  }, [scrollRef]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        sectionLabel: {
          fontFamily: FONTS.inter,
          fontSize: 16,
          fontWeight: FONT_WEIGHTS.bold,
          color: colors.textPrimary,
          paddingHorizontal: SPACING.md,
          marginBottom: SPACING.sm,
        },
        recapsRow: {
          marginBottom: SPACING.lg,
        },
        albumsLabel: {
          marginTop: SPACING.xs,
        },
        activeTripSection: {
          marginBottom: SPACING.lg,
        },
        activeTripScrollContent: {
          paddingHorizontal: SPACING.md,
          gap: SPACING.md,
        },
        columnWrapper: {
          justifyContent: 'space-between',
          paddingHorizontal: SPACING.md,
          marginBottom: SPACING.md,
        },
        tileOuter: { width: cardWidth },
        albumCard: {},
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
        albumInfo: { paddingTop: SPACING.sm, paddingBottom: SPACING.xs },
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
    [colors, cardWidth]
  );

  const albumsWithPreview = useMemo<AlbumPreview[]>(() => {
    const albums = tripAlbums ?? [];
    const eList = entries ?? [];
    const jList = journals ?? [];
    return albums.map((album) => {
      const albumEntries = eList.filter((e) => e.albumId === album.id);
      const albumJournals = jList.filter((j) => j.albumId === album.id);

      const previewImages: string[] = [];
      for (const entry of albumEntries) {
        if (entry.mediaType === 'photo' && entry.photoPaths && entry.photoPaths.length > 0) {
          // Prefer thumbnail for faster load; fall back to full photo
          const photoCount = entry.photoPaths.length;
          for (let i = 0; i < photoCount && previewImages.length < 3; i++) {
            previewImages.push(entry.thumbPaths?.[i] || entry.photoPaths[i]);
          }
          if (previewImages.length >= 3) break;
        }
      }

      const totalCount = albumEntries.length + albumJournals.length;

      const startDate = new Date(album.startDate);
      const endDate = album.endDate ? new Date(album.endDate) : null;
      const dateRange = endDate
        ? `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
        : startDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

      return { album, previewImages, totalCount, dateRange };
    });
  }, [tripAlbums, entries, journals]);

  // Active trips get their own section (rendered separately, above Recaps/Albums) and must
  // not also appear in the Albums grid or the Recaps row below.
  const activeAlbumPreviews = useMemo(
    () => albumsWithPreview.filter((a) => activeAlbumIds.has(a.album.id)),
    [albumsWithPreview, activeAlbumIds]
  );
  const inactiveAlbumPreviews = useMemo(
    () => albumsWithPreview.filter((a) => !activeAlbumIds.has(a.album.id)),
    [albumsWithPreview, activeAlbumIds]
  );
  const inactiveTripAlbums = useMemo(
    () => (tripAlbums ?? []).filter((a) => !activeAlbumIds.has(a.id)),
    [tripAlbums, activeAlbumIds]
  );

  const tiles = useMemo<TileItem[]>(() => [
    ...inactiveAlbumPreviews.map((data): TileItem => ({ type: 'album', data })),
    { type: 'create' },
    { type: 'suggest' },
  ], [inactiveAlbumPreviews]);

  const hasRecaps = useMemo(
    () => inactiveAlbumPreviews.some((a) => a.previewImages.length > 0),
    [inactiveAlbumPreviews]
  );

  const renderPreviewCollage = (previewImages: string[]) => {
    if (previewImages.length === 0) {
      return (
        <View style={styles.emptyPreview}>
          <Text style={styles.emptyPreviewText}>No photos yet</Text>
        </View>
      );
    }
    if (previewImages.length === 1) {
      return (
        <EntryPhotoImage
          uri={previewImages[0]}
          style={styles.singlePreview}
          resizeMode="cover"
          fallbackBackgroundColor={colors.surface}
        />
      );
    }
    if (previewImages.length === 2) {
      return (
        <View style={styles.splitPreview}>
          <EntryPhotoImage uri={previewImages[0]} style={styles.splitLeft} resizeMode="cover" fallbackBackgroundColor={colors.surface} />
          <EntryPhotoImage uri={previewImages[1]} style={styles.splitRight} resizeMode="cover" fallbackBackgroundColor={colors.surface} />
        </View>
      );
    }
    return (
      <View style={styles.mosaicPreview}>
        <EntryPhotoImage uri={previewImages[0]} style={styles.heroPreview} resizeMode="cover" fallbackBackgroundColor={colors.surface} />
        <View style={styles.stackedPreviewContainer}>
          <EntryPhotoImage uri={previewImages[1]} style={styles.stackedPreviewTop} resizeMode="cover" fallbackBackgroundColor={colors.surface} />
          <EntryPhotoImage uri={previewImages[2]} style={styles.stackedPreviewBottom} resizeMode="cover" fallbackBackgroundColor={colors.surface} />
        </View>
      </View>
    );
  };

  const renderAlbumCard = (preview: AlbumPreview) => {
    const { album, previewImages, totalCount, dateRange } = preview;
    return (
      <TouchableOpacity
        key={album.id}
        style={[styles.tileOuter, styles.albumCard]}
        onPress={() => onAlbumPress(album)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`Trip album, ${album.name}`}
      >
        <View style={styles.previewContainer}>
          {renderPreviewCollage(previewImages)}
        </View>
        <View style={styles.albumInfo}>
          <Text style={styles.albumName} numberOfLines={1}>{album.name}</Text>
          <Text style={styles.albumDate} numberOfLines={1}>{dateRange}</Text>
          <Text style={styles.albumCount}>
            {totalCount.toLocaleString('en-US')} {totalCount === 1 ? 'item' : 'items'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderTile = ({ item }: { item: TileItem }) => {
    if (item.type === 'album') {
      return renderAlbumCard(item.data);
    }

    if (item.type === 'create') {
      return (
        <TouchableOpacity
          style={styles.tileOuter}
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
            <Text style={styles.albumName} numberOfLines={1}>New Album</Text>
            <Text style={styles.createSubtext}>0 items</Text>
          </View>
        </TouchableOpacity>
      );
    }

    // type === 'suggest'
    return (
      <TouchableOpacity
        style={styles.tileOuter}
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
          <Text style={styles.albumName} numberOfLines={1}>Find Trips</Text>
          <Text style={styles.createSubtext}>Auto-detect</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderListHeader = () => (
    <View>
      {activeAlbumPreviews.map((preview) => {
        const allPhotoUris = getAllTripPhotoUris(preview.album.id, entries ?? []);
        const slideshowCoverUri = getSessionRandomTripPhoto(preview.album.id, allPhotoUris);
        return (
          <View key={preview.album.id} style={styles.activeTripSection}>
            <Text style={styles.sectionLabel}>This Trip</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.activeTripScrollContent}
            >
              {slideshowCoverUri && (
                <StoryCard
                  coverUri={slideshowCoverUri}
                  title={preview.album.name}
                  subtitle="Stories"
                  ring="plain"
                  width={storyCardWidth}
                  height={storyCardHeight}
                  onPress={() => onSlideshowPress(preview.album)}
                  accessibilityLabel={`${preview.album.name}, stories`}
                  showTitleOverlay
                />
              )}
              {renderAlbumCard(preview)}
            </ScrollView>
          </View>
        );
      })}
      {hasRecaps && (
        <>
          <Text style={styles.sectionLabel}>Recaps & Stories</Text>
          <View style={styles.recapsRow}>
            <TripRecapsRow
              tripAlbums={inactiveTripAlbums}
              entries={entries ?? []}
              onRecapPress={onRecapPress}
              onSlideshowPress={onSlideshowPress}
            />
          </View>
        </>
      )}
      <Text style={[styles.sectionLabel, (activeAlbumPreviews.length > 0 || hasRecaps) && styles.albumsLabel]}>Albums</Text>
    </View>
  );

  return (
    <FlatList
      ref={flatListRef}
      data={tiles}
      renderItem={renderTile}
      keyExtractor={(item) => item.type === 'album' ? item.data.album.id : item.type}
      numColumns={2}
      style={styles.container}
      columnWrapperStyle={styles.columnWrapper}
      ListHeaderComponent={renderListHeader}
      contentContainerStyle={{
        paddingTop: SPACING.md,
        paddingBottom: getEffectiveMainTabInset(insets.bottom, tabBarVisibilityProgress) + SPACING.md,
      }}
      showsVerticalScrollIndicator={false}
      onScroll={(e) => onScrollReport?.(e.nativeEvent.contentOffset.y)}
      scrollEventThrottle={16}
      accessibilityLabel="Your Trips view"
    />
  );
};

export default TripAlbumsSection;
