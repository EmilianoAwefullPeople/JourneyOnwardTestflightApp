// Progress Storage
// Load/save milestone progress with error handling and default state

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReviewSectionParam } from '../navigation/types';
import { logger } from './logger';

export const PROGRESS_STORAGE_KEY = '@awefull_people:progress';

export type MilestoneKey =
  | 'trip_album_created'
  | 'first_live_capture'
  | 'first_journal'
  | 'first_past_memory'
  | 'review_explorer'
  | 'album_explorer';

export type TripAlbumSection = 'all' | 'dashboard' | 'map' | 'journal' | 'timeline' | 'stats';

export interface ProgressState {
  achievements: Record<string, { unlockedAt: number }>;
  visitedReviewSections: ReviewSectionParam[];
  visitedTripAlbumSections: Record<string, TripAlbumSection[]>;
}

const DEFAULT_STATE: ProgressState = {
  achievements: {},
  visitedReviewSections: [],
  visitedTripAlbumSections: {},
};

function isValidState(raw: unknown): raw is ProgressState {
  if (!raw || typeof raw !== 'object') return false;
  const o = raw as Record<string, unknown>;
  if (!o.achievements || typeof o.achievements !== 'object') return false;
  if (!Array.isArray(o.visitedReviewSections)) return false;
  if (!o.visitedTripAlbumSections || typeof o.visitedTripAlbumSections !== 'object') return false;
  return true;
}

export async function loadProgress(): Promise<ProgressState> {
  try {
    const json = await AsyncStorage.getItem(PROGRESS_STORAGE_KEY);
    if (json == null) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(json) as unknown;
    if (!isValidState(parsed)) return { ...DEFAULT_STATE };
    return parsed;
  } catch (error) {
    logger.warn('Progress load failed, using defaults:', error);
    return { ...DEFAULT_STATE };
  }
}

export async function saveProgress(state: ProgressState): Promise<void> {
  try {
    await AsyncStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    logger.warn('Progress save failed:', error);
  }
}
