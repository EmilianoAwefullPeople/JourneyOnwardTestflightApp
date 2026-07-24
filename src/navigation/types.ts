// Navigation Types
// Type definitions for React Navigation

import type {
  PickedGalleryAsset,
  SuggestedExperienceWithDisplayUris,
} from '../services/ImportLatestService';

export type UnpackTripDetailsParams = {
  suggestions: SuggestedExperienceWithDisplayUris[];
  inferredStartDate: string;
  inferredEndDate: string;
};

export type RootStackParamList = {
  OnboardingSlides: undefined;
  OnboardingPath: undefined;
  MainTabs: undefined | { screen?: keyof MainTabParamList; params?: { initialSection?: ReviewSectionParam } };
  Capture: undefined;
  CaptureSaved: { entryId: string; previewFirstPhotoUri?: string };
  EntryDetail: { entryId: string };
  JournalDetail: { journalId: string };
  NotesEditor: {
    entryId?: string;
    albumId?: string;
    journalPlaceholder?: string;
    /** When true with `entryId`, saves to entry `description` (caption) instead of creating a journal. */
    editEntryDescription?: boolean;
  };
  TripAlbumCreate: undefined;
  TripAlbumDetail: { albumId: string };
  TripAlbumEdit: { albumId: string };
  AddPastExperiences: undefined;
  ImportLatest: undefined;
  EntryEdit: { entryId: string; focusField?: 'title' | 'description' | 'emotion' };
  EmotionCapture: { returnFrom: 'Capture' | 'EntryEdit' | 'CaptureSaved'; initialLabels?: string[]; entryId?: string };
  Settings: undefined;
  JourneyRecapCandidates: undefined;
  JourneyRecapPlayer: { albumId: string };
  JourneyRecapPost: { albumId: string };
  MemoriesSlideshow: { albumId: string };
  FullCountryCalendar: undefined;
  /** dayKey format: `${year}-${monthIndex0}-${day}` (local calendar day, matches dayKeyUtils). */
  DayDetail: { dayKey: string };
  CountryRankingFullList: { rows: { country: string; memories: number }[] };
  CountriesVisitedMapFull: { visitedIsoCodes: string[]; countryNames: string[] };
  PostcardTemplates: undefined;
  PostcardEditor: { templateId?: string; postcardId?: string };
  SavedPostcards: undefined;
  PostcardStoryEditor: { photoUri: string; entryId?: string };
  SuggestedAlbums: undefined;
  // Unpack A Trip flow
  UnpackTripDetails: UnpackTripDetailsParams | undefined;
  UnpackAddMemories: {
    albumId?: string;
    tripStartDate?: string;
    tripEndDate?: string;
    // Album metadata carried forward — album is not persisted to DB until Stage 3
    albumName?: string;
    albumDescription?: string;
  };
  UnpackProcessing: {
    albumId?: string;
    pickedAssets: PickedGalleryAsset[];
    // Album metadata forwarded from UnpackAddMemories → UnpackHighlight
    albumName?: string;
    albumStartDate?: string;
    albumEndDate?: string;
    albumDescription?: string;
  };
  UnpackHighlight: {
    albumId: string;
    suggestions: SuggestedExperienceWithDisplayUris[];
    // Present when album has not been persisted to DB yet (deferred from Stage 1)
    albumName?: string;
    albumStartDate?: string;
    albumEndDate?: string;
    albumDescription?: string;
  };
  UnpackUnpacking: { albumId: string; highlightedIds: string[] };
};

export type ReviewSectionParam = 'bookmarks' | 'journal' | 'map' | 'timeline' | 'tripAlbums' | 'stats';

export type MainTabParamList = {
  Home: undefined;
  Review: { initialSection?: ReviewSectionParam };
};
