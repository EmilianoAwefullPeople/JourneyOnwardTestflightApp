// TripRecapsRow
// Horizontal row of Instagram-Stories-style cards above the Albums grid in "Your Trips".
// Each completed trip with at least one photo contributes up to 2 cards: a Recap (gradient
// ring, opens the generated Journey Recap) and Stories (plain ring, opens a chronological
// slideshow of that trip's photo memories). Active (in-progress) trips are handled separately —
// see TripAlbumsSection's active-trip section — and should be excluded via the `tripAlbums`
// prop before it reaches this component.

import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Dimensions } from 'react-native';
import { TripAlbum } from '../../models/TripAlbum';
import { Entry } from '../../models/Entry';
import { SPACING } from '../../config/constants';
import StoryCard, { getStoryCardSize } from './StoryCard';
import RecapCoverImage from './RecapCoverImage';
import { getAllTripPhotoUris, getFirstTripPhotoUri, getSessionRandomTripPhoto } from '../../utils/randomTripCover';
import { isTripFinished } from '../../utils/albumUtils';

interface TripRecapsRowProps {
  tripAlbums: TripAlbum[];
  entries: Entry[];
  onRecapPress: (album: TripAlbum) => void;
  onSlideshowPress: (album: TripAlbum) => void;
}

type StoryKind = 'recap' | 'slideshow';

interface StoryItem {
  key: string;
  kind: StoryKind;
  album: TripAlbum;
  coverUri: string;
}

function sortByRecency(albums: TripAlbum[]): TripAlbum[] {
  return [...albums].sort((a, b) => {
    const endA = a.endDate ? new Date(a.endDate).getTime() : new Date(a.startDate).getTime();
    const endB = b.endDate ? new Date(b.endDate).getTime() : new Date(b.startDate).getTime();
    return endB - endA;
  });
}

const TripRecapsRow: React.FC<TripRecapsRowProps> = ({
  tripAlbums,
  entries,
  onRecapPress,
  onSlideshowPress,
}) => {
  const screenWidth = Dimensions.get('window').width;
  const gridColumnWidth = (screenWidth - SPACING.md * 3) / 2;
  const { width: cardWidth, height: cardHeight } = getStoryCardSize(gridColumnWidth);

  const storyItems = useMemo<StoryItem[]>(() => {
    const albums = sortByRecency(tripAlbums ?? []);
    const items: StoryItem[] = [];
    for (const album of albums) {
      const coverUri = getFirstTripPhotoUri(album.id, entries ?? []);
      if (!coverUri) continue;
      const allPhotoUris = getAllTripPhotoUris(album.id, entries ?? []);
      const slideshowCoverUri = getSessionRandomTripPhoto(album.id, allPhotoUris) ?? coverUri;
      // Recap summarizes a finished trip — not offered until the trip is over.
      if (isTripFinished(album)) {
        items.push({ key: `${album.id}-recap`, kind: 'recap', album, coverUri });
      }
      items.push({ key: `${album.id}-slideshow`, kind: 'slideshow', album, coverUri: slideshowCoverUri });
    }
    return items;
  }, [tripAlbums, entries]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        scrollContent: {
          paddingHorizontal: SPACING.md,
          gap: SPACING.md,
        },
      }),
    []
  );

  if (storyItems.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
    >
      {storyItems.map((item) => {
        const isRecap = item.kind === 'recap';
        return (
          <StoryCard
            key={item.key}
            coverUri={item.coverUri}
            title={item.album.name}
            subtitle={isRecap ? 'Recap' : 'Stories'}
            ring={isRecap ? 'gradient' : 'plain'}
            width={cardWidth}
            height={cardHeight}
            onPress={() => (isRecap ? onRecapPress(item.album) : onSlideshowPress(item.album))}
            accessibilityLabel={
              isRecap ? `${item.album.name}, recap` : `${item.album.name}, stories`
            }
            renderCover={
              isRecap
                ? () => <RecapCoverImage coverUri={item.coverUri} tripName={item.album.name} />
                : undefined
            }
            showTitleOverlay={!isRecap}
          />
        );
      })}
    </ScrollView>
  );
};

export default TripRecapsRow;
