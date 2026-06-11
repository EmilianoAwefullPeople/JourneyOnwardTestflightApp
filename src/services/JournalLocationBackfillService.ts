// JournalLocationBackfillService
// Persists location text (country/city) on journals with coordinates but missing saved values.

import { Journal } from '../models/Journal';
import * as PersistenceManager from '../storage/PersistenceManager';
import { logger } from '../utils/logger';

interface GeocodedAddressWithLocality {
  city?: string;
  country?: string;
  subAdministrativeArea?: string;
  locality?: string;
}

const DELAY_BETWEEN_GEOCODE_MS = 350;
const MAX_JOURNALS_PER_RUN = 25;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type UpdateJournalFn = (journal: Journal) => Promise<void>;

export interface JournalLocationBackfillOptions {
  onProgress?: (filled: number) => void;
  maxJournals?: number;
  delayMs?: number;
}

/**
 * Fills location text via reverse geocode for journals still missing it.
 */
export async function runJournalLocationBackfill(
  updateJournal: UpdateJournalFn,
  options?: JournalLocationBackfillOptions
): Promise<void> {
  const maxJournals = options?.maxJournals ?? MAX_JOURNALS_PER_RUN;
  const delayMs = options?.delayMs ?? DELAY_BETWEEN_GEOCODE_MS;

  let journals: Journal[];
  try {
    journals = await PersistenceManager.getJournalsMissingLocationText(maxJournals);
  } catch (error) {
    logger.error('JournalLocationBackfill: getJournalsMissingLocationText failed', error);
    return;
  }

  if (journals.length === 0) return;

  logger.log('JournalLocationBackfill: geocoding up to', journals.length, 'journals missing location text');
  let filled = 0;
  let locationModule: typeof import('expo-location') | null = null;

  for (const journal of journals) {
    if (journal.latitude == null || journal.longitude == null) continue;

    try {
      if (!locationModule) {
        locationModule = await import('expo-location');
      }
      const addresses = await locationModule.reverseGeocodeAsync({
        latitude: journal.latitude,
        longitude: journal.longitude,
      });
      const address = addresses?.[0];
      if (!address) {
        await delay(delayMs);
        continue;
      }
      const geocoded = address as GeocodedAddressWithLocality;

      const nextCity = (geocoded.city || geocoded.locality || geocoded.subAdministrativeArea || '').trim() || undefined;
      const nextCountry = (geocoded.country || '').trim() || undefined;
      const cityChanged = (nextCity || '') !== (journal.city?.trim() || '');
      const countryChanged = (nextCountry || '') !== (journal.country?.trim() || '');

      if ((!nextCity && !nextCountry) || (!cityChanged && !countryChanged)) {
        await delay(delayMs);
        continue;
      }

      await updateJournal({
        ...journal,
        city: journal.city?.trim() || nextCity,
        country: journal.country?.trim() || nextCountry,
      });
      filled++;
      options?.onProgress?.(filled);
    } catch (error) {
      logger.warn('JournalLocationBackfill: failed to update journal', journal.id, error);
    }

    await delay(delayMs);
  }

  if (filled > 0) {
    logger.log('JournalLocationBackfill: filled location text for', filled, 'journals');
  }
}
