// Tutorial stop ordering — surfaces intent-matched stops first within natural section order.

import { OnboardingIntent } from '../models/UserProfile';

export type TutorialStopId =
  | 'travel_mode'
  | 'journal_entry_bar'
  | 'gallery_sync'
  | 'trip_album'
  | 'journey_recap'
  | 'postcards'
  | 'review_sweep';

export interface TutorialStop {
  id: TutorialStopId;
  /** The intent this stop is most relevant to. Used for ordering. */
  primaryIntent: OnboardingIntent | 'default';
}

const DEFAULT_STOP_ORDER: TutorialStop[] = [
  { id: 'travel_mode', primaryIntent: 'storing_memories' },
  { id: 'journal_entry_bar', primaryIntent: 'journaling_debriefing' },
  { id: 'gallery_sync', primaryIntent: 'storing_memories' },
  { id: 'trip_album', primaryIntent: 'storing_memories' },
  { id: 'journey_recap', primaryIntent: 'journaling_debriefing' },
  { id: 'postcards', primaryIntent: 'graphic_features' },
  { id: 'review_sweep', primaryIntent: 'journaling_debriefing' },
];

/**
 * Reorders tutorial stops so those matching selected intents come first,
 * maintaining logical section order (Home → Review) within each group.
 *
 * If only 'just_exploring' is selected (or intents is empty), returns default order.
 * 'just_exploring' is ignored when other intents are also selected.
 *
 * Extensible: add new stops to DEFAULT_STOP_ORDER and assign a primaryIntent.
 */
export function orderTutorialStops(intents: OnboardingIntent[]): TutorialStop[] {
  const activeIntents: OnboardingIntent[] = intents.filter((i) => i !== 'just_exploring');
  if (activeIntents.length === 0) return DEFAULT_STOP_ORDER;

  const isActiveIntent = (p: OnboardingIntent | 'default'): boolean =>
    p !== 'default' && activeIntents.includes(p);

  const matched = DEFAULT_STOP_ORDER.filter((s) => isActiveIntent(s.primaryIntent));
  const unmatched = DEFAULT_STOP_ORDER.filter((s) => !isActiveIntent(s.primaryIntent));
  return [...matched, ...unmatched];
}
