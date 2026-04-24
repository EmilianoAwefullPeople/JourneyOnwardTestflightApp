// CountryBackfillService
// Persists location text (country/city) on entries with coordinates but missing saved values.
// First applies AsyncStorage entry location cache, then reverse-geocodes remaining rows.

import { Entry } from '../models/Entry';
import * as PersistenceManager from '../storage/PersistenceManager';
import { loadEntryLocationCache } from '../utils/entryLocationCache';
import { attachCountryToEntryIfMissing } from '../utils/entryCountryResolve';
import { logger } from '../utils/logger';

const DELAY_BETWEEN_GEOCODE_MS = 350;
const MAX_ENTRIES_PER_RUN = 25;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type UpdateEntryFn = (entry: Entry) => Promise<void>;

export interface CountryBackfillOptions {
  onProgress?: (filled: number) => void;
  maxEntries?: number;
  delayMs?: number;
}

/**
 * For entries missing saved location text, copy from `@jo_entry_loc_v1` when present.
 */
export async function mergeCountryFromEntryLocationCache(updateEntry: UpdateEntryFn): Promise<number> {
  let filled = 0;
  try {
    const cache = await loadEntryLocationCache();
    const candidates = await PersistenceManager.getEntriesMissingLocationText(120);
    for (const entry of candidates) {
      const c = cache[entry.id]?.country?.trim();
      const city = cache[entry.id]?.city?.trim();
      if (!c && !city) continue;
      try {
        await updateEntry({
          ...entry,
          country: entry.country?.trim() || c || undefined,
          city: entry.city?.trim() || city || undefined,
        });
        filled++;
      } catch (e) {
        logger.warn('CountryBackfill: cache merge update failed', entry.id, e);
      }
    }
  } catch (e) {
    logger.error('CountryBackfill: mergeCountryFromEntryLocationCache failed', e);
  }
  if (filled > 0) {
    logger.log('CountryBackfill: merged location text from entry location cache for', filled, 'entries');
  }
  return filled;
}

/**
 * Fills location text via reverse geocode for entries still missing it after cache merge.
 */
export async function runCountryBackfill(
  updateEntry: UpdateEntryFn,
  options?: CountryBackfillOptions
): Promise<void> {
  await mergeCountryFromEntryLocationCache(updateEntry);

  const maxEntries = options?.maxEntries ?? MAX_ENTRIES_PER_RUN;
  const delayMs = options?.delayMs ?? DELAY_BETWEEN_GEOCODE_MS;

  let entries: Entry[];
  try {
    entries = await PersistenceManager.getEntriesMissingLocationText(maxEntries);
  } catch (error) {
    logger.error('CountryBackfill: getEntriesMissingLocationText failed', error);
    return;
  }

  if (entries.length === 0) {
    return;
  }

  logger.log('CountryBackfill: geocoding up to', entries.length, 'entries missing location text');
  let filled = 0;
  let locationModule: typeof import('expo-location') | null = null;

  for (const entry of entries) {
    if (entry.latitude == null || entry.longitude == null) continue;

    try {
      if (!locationModule) {
        locationModule = await import('expo-location');
      }
      const updated = await attachCountryToEntryIfMissing(entry, { locationModule });
      const countryChanged = (updated.country?.trim() || '') !== (entry.country?.trim() || '');
      const cityChanged = (updated.city?.trim() || '') !== (entry.city?.trim() || '');
      if ((!updated.country?.trim() && !updated.city?.trim()) || (!countryChanged && !cityChanged)) {
        await delay(delayMs);
        continue;
      }
      await updateEntry(updated);
      filled++;
      options?.onProgress?.(filled);
    } catch (error) {
      logger.warn('CountryBackfill: failed to update entry', entry.id, error);
    }

    await delay(delayMs);
  }

  if (filled > 0) {
    logger.log('CountryBackfill: filled location text for', filled, 'entries');
  }
}
