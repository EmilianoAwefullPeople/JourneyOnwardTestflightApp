import React, { forwardRef, useImperativeHandle, useMemo } from 'react';
import { View, Text, type ViewStyle, type TextStyle } from 'react-native';
import { Entry } from '../../models/Entry';
import { Journal } from '../../models/Journal';
import type { TripStoryCardData } from '../../models/TripStoryCard';
import { useMasonryGalleryScroll } from '../../hooks/useMasonryGalleryScroll';
import { buildMasonryColumnsLayout } from '../../utils/galleryMasonryLayout';
import type { ImagePriority } from '../../hooks/useFeedMediaPriority';

export type HomeGalleryFeedItem =
  | { type: 'entry'; data: Entry }
  | { type: 'journal'; data: Journal }
  | { type: 'tripStory'; data: TripStoryCardData };

function galleryItemKey(item: HomeGalleryFeedItem): string {
  if (item.type === 'entry') return `entry-${item.data.id}`;
  if (item.type === 'journal') return `journal-${item.data.id}`;
  return `trip-${item.data.kind}-${item.data.album.id}`;
}

export type HomeGalleryMasonryGridHandle = {
  notifyScroll: (offsetY: number) => void;
  resetPrefetch: () => void;
};

type GridStyles = {
  pinterestGrid: ViewStyle;
  pinterestColumnsContainer: ViewStyle;
  pinterestColumn: ViewStyle;
  placeholderText: TextStyle;
};

type Props = {
  items: HomeGalleryFeedItem[];
  galleryCardWidth: number;
  getTileHeight: (item: HomeGalleryFeedItem) => number;
  photoUris: (string | null)[];
  contentTop: number;
  viewportHeight: number;
  sessionSeed: string;
  emptyPlaceholder: string;
  styles: GridStyles;
  renderCard: (
    item: HomeGalleryFeedItem,
    sessionSeed: string,
    column: 'left' | 'right',
    globalIndex: number,
    loadMedia: boolean,
    getPriorityForUri: (uri: string | null | undefined) => ImagePriority,
  ) => React.ReactNode;
};

export const HomeGalleryMasonryGrid = React.memo(
  forwardRef<HomeGalleryMasonryGridHandle, Props>(function HomeGalleryMasonryGrid(
    {
      items,
      galleryCardWidth,
      getTileHeight,
      photoUris,
      contentTop,
      viewportHeight,
      sessionSeed,
      emptyPlaceholder,
      styles,
      renderCard,
    },
    ref,
  ) {
    const layout = useMemo(
      () => buildMasonryColumnsLayout(items, getTileHeight),
      [items, getTileHeight],
    );

    const { isMediaActive, getPriorityForUri, notifyScroll, resetPrefetch } = useMasonryGalleryScroll({
      layout,
      photoUris,
      contentTop,
      viewportHeight,
    });

    useImperativeHandle(
      ref,
      () => ({
        notifyScroll,
        resetPrefetch,
      }),
      [notifyScroll, resetPrefetch],
    );

    if (items.length === 0) {
      return (
        <Text style={styles.placeholderText} maxFontSizeMultiplier={1.3}>
          {emptyPlaceholder}
        </Text>
      );
    }

    const { left, right } = layout;

    return (
      <View style={styles.pinterestGrid}>
        <View style={styles.pinterestColumnsContainer}>
          <View style={[styles.pinterestColumn, { width: galleryCardWidth + 8 }]}>
            {left.map(({ item, globalIndex }) => {
              const loadMedia = item.type === 'entry' ? isMediaActive(globalIndex) : true;
              return (
                <React.Fragment key={galleryItemKey(item)}>
                  {renderCard(item, sessionSeed, 'left', globalIndex, loadMedia, getPriorityForUri)}
                </React.Fragment>
              );
            })}
          </View>
          <View style={[styles.pinterestColumn, { width: galleryCardWidth + 8 }]}>
            {right.map(({ item, globalIndex }) => {
              const loadMedia = item.type === 'entry' ? isMediaActive(globalIndex) : true;
              return (
                <React.Fragment key={galleryItemKey(item)}>
                  {renderCard(item, sessionSeed, 'right', globalIndex, loadMedia, getPriorityForUri)}
                </React.Fragment>
              );
            })}
          </View>
        </View>
      </View>
    );
  }),
);
