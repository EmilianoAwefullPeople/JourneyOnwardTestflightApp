// Navigation Types
// Type definitions for React Navigation

export type RootStackParamList = {
  Loading: undefined;
  Welcome: undefined;
  MainTabs: undefined | { screen?: keyof MainTabParamList; params?: { initialSection?: ReviewSectionParam } };
  Capture: undefined;
  EntryDetail: { entryId: string };
  JournalDetail: { journalId: string };
  NotesEditor: { entryId?: string; albumId?: string; journalPlaceholder?: string };
  TripAlbumCreate: undefined;
  TripAlbumDetail: { albumId: string };
  TripAlbumEdit: { albumId: string };
  AddPastExperiences: undefined;
  ImportLatest: undefined;
  EntryEdit: { entryId: string; focusField?: 'title' | 'description' | 'emotion' };
  EmotionCapture: { returnFrom: 'Capture' | 'EntryEdit'; initialLabels?: string[]; entryId?: string };
  Settings: undefined;
  JourneyRecapCandidates: undefined;
  JourneyRecapPlayer: { albumId: string };
  JourneyRecapPost: { albumId: string };
  FullCountryCalendar: undefined;
  CountryRankingFullList: { rows: { country: string; memories: number }[] };
};

export type ReviewSectionParam = 'bookmarks' | 'journal' | 'map' | 'timeline' | 'tripAlbums' | 'stats';

export type MainTabParamList = {
  Studio: undefined;
  Home: undefined;
  Review: { initialSection?: ReviewSectionParam };
};
