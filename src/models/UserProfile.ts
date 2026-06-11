// TODO(backend): Connect this model to Supabase when backend is implemented.
// Field names and types are designed to map cleanly to a Supabase PostgreSQL schema.

export type TravelerTier =
  | 'curious_explorer'
  | 'seasoned_adventurer'
  | 'world_wanderer'
  | 'global_nomad';

export type OnboardingIntent =
  | 'storing_memories'
  | 'journaling_debriefing'
  | 'graphic_features'
  | 'just_exploring';

export type OnboardingPath = 'quick_start' | 'tutorial';

export interface UserProfile {
  id: string;
  name: string;
  travelerTier?: TravelerTier;
  intent: OnboardingIntent[];
  email?: string;
  // TODO(future): Add phone collection prompt, requires Supabase backend
  phone?: string;
  onboardingCompletedAt?: string;
  onboardingPathTaken?: OnboardingPath;
  // Try-interaction tracking: analytics signals for future use, not completion gates
  triedTravelMode: boolean;
  triedJournalEntry: boolean;
  triedGallerySync: boolean;
  triedTripAlbum: boolean;
  triedJourneyRecap: boolean;
  triedPostcards: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Partial profile collected during Phase 0 gate. Passed between onboarding screens via nav params. */
export interface OnboardingProfileDraft {
  name: string;
  travelerTier?: TravelerTier;
  intent: OnboardingIntent[];
  email?: string;
}

export const TRAVELER_TIER_OPTIONS: {
  range: string;
  tier: TravelerTier;
  label: string;
}[] = [
  { range: '1–3 countries', tier: 'curious_explorer', label: 'Curious Explorer' },
  { range: '4–15 countries', tier: 'seasoned_adventurer', label: 'Seasoned Adventurer' },
  { range: '16–30 countries', tier: 'world_wanderer', label: 'World Wanderer' },
  { range: '30+ countries', tier: 'global_nomad', label: 'Global Nomad' },
];

export const INTENT_OPTIONS: {
  intent: OnboardingIntent;
  emoji: string;
  label: string;
}[] = [
  { intent: 'storing_memories', emoji: '🧳', label: 'Storing memories' },
  { intent: 'journaling_debriefing', emoji: '📓', label: 'Journaling & debriefing' },
  { intent: 'graphic_features', emoji: '🎨', label: 'Using graphic features' },
  { intent: 'just_exploring', emoji: '🔍', label: 'Just exploring' },
];
