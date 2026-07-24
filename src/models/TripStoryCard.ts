// TripStoryCard
// Shared shape for a trip's Recap/Stories card, used by both the Home feed (FlashList) and
// the Home gallery (masonry grid) — see HomeScreen.tsx and HomeGalleryMasonryGrid.tsx.

import { TripAlbum } from './TripAlbum';

export interface TripStoryCardData {
  kind: 'recap' | 'stories';
  album: TripAlbum;
  coverUri: string;
}
