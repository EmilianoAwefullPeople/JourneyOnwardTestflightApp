// Navigation Types
// Type definitions for React Navigation

import type { OnboardingProfileDraft } from '../models/UserProfile';
import type {
  ImportLatestRange,
  PickedGalleryAsset,
  SuggestedExperienceWithDisplayUris,
} from '../services/ImportLatestService';

export type QSImportSelectionMode = 'date_range' | 'manual';

export type RootStackParamList = {
  Loading: undefined;
  Welcome: undefined;
  MainTabs: undefined | { screen?: keyof MainTabParamList; params?: { initialSection?: ReviewSectionParam } };
  // Onboarding
  OnboardingGate: undefined;
  OnboardingPathSelect: { draft: OnboardingProfileDraft };
  OnboardingQSCountry: { draft: OnboardingProfileDraft };
  OnboardingQSImport: { draft: OnboardingProfileDraft; country: string };
  OnboardingQSSelectExperiences: {
    draft: OnboardingProfileDraft;
    country: string;
    mode: QSImportSelectionMode;
    range?: ImportLatestRange;
    pickedAssets?: PickedGalleryAsset[];
  };
  OnboardingQSProcessing: {
    draft: OnboardingProfileDraft;
    country: string;
    pickedAssets: PickedGalleryAsset[];
  };
  OnboardingQSExperiences: {
    draft: OnboardingProfileDraft;
    country: string;
    selectedSuggestions: SuggestedExperienceWithDisplayUris[];
  };
  OnboardingQSGenerating: {
    draft: OnboardingProfileDraft;
    country: string;
    selectedSuggestions: SuggestedExperienceWithDisplayUris[];
    note?: string;
  };
  OnboardingQSResults: { draft: OnboardingProfileDraft; albumId: string };
  OnboardingQSEmail: { draft: OnboardingProfileDraft; albumId: string };
  OnboardingTutorial: { draft: OnboardingProfileDraft; resumeStep?: number };
  OnboardingTutorialExit: undefined;
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
  FullCountryCalendar: undefined;
  CountryRankingFullList: { rows: { country: string; memories: number }[] };
  PostcardTemplates: undefined;
  PostcardEditor: { templateId?: string; postcardId?: string };
  SavedPostcards: undefined;
  SuggestedAlbums: undefined;
};

export type ReviewSectionParam = 'bookmarks' | 'journal' | 'map' | 'timeline' | 'tripAlbums' | 'stats';

export type MainTabParamList = {
  Home: undefined;
  Review: { initialSection?: ReviewSectionParam };
};
