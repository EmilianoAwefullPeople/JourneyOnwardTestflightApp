// MetadataBackfillService
// Fetches weather for entries that have coordinates but no weather (e.g. saved offline).
// Best-effort only; never throws. Invoked when app comes back online.

import { Entry } from '../models/Entry';
import * as PersistenceManager from '../storage/PersistenceManager';
import { getWeatherAtLocation } from './WeatherService';
import { logger } from '../utils/logger';

const DELAY_BETWEEN_REQUESTS_MS = 400;
const MAX_ENTRIES_PER_RUN = 30;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type UpdateEntryFn = (entry: Entry) => Promise<void>;

export interface MetadataBackfillOptions {
  /** Called after each entry is successfully updated with weather. */
  onProgress?: (filled: number) => void;
  /** Max entries to process this run. Default 30. */
  maxEntries?: number;
  /** Delay in ms between API requests. Default 400. */
  delayMs?: number;
}

/**
 * Fetches weather for entries missing it (have lat/lng but no weather), then updates each via the provided updateEntry.
 * Uses existing WeatherService; processes sequentially with a short delay to respect rate limits.
 * Best-effort: logs and continues on per-entry failures; never throws.
 */
export async function runMetadataBackfill(
  updateEntry: UpdateEntryFn,
  options?: MetadataBackfillOptions
): Promise<void> {
  const maxEntries = options?.maxEntries ?? MAX_ENTRIES_PER_RUN;
  const delayMs = options?.delayMs ?? DELAY_BETWEEN_REQUESTS_MS;

  let entries: Entry[];
  try {
    entries = await PersistenceManager.getEntriesMissingWeather(maxEntries);
  } catch (error) {
    logger.error('MetadataBackfill: getEntriesMissingWeather failed', error);
    return;
  }

  if (entries.length === 0) {
    return;
  }

  logger.log('MetadataBackfill: processing', entries.length, 'entries missing weather');
  let filled = 0;

  for (const entry of entries) {
    const lat = entry.latitude;
    const lon = entry.longitude;
    if (lat == null || lon == null) {
      continue;
    }

    try {
      const weather = await getWeatherAtLocation(lat, lon);
      if (!weather) {
        logger.warn('MetadataBackfill: no weather for entry', entry.id);
        await delay(delayMs);
        continue;
      }

      const updated: Entry = {
        ...entry,
        weather: weather.condition,
        temperatureCelsius: weather.temperatureCelsius,
      };

      await updateEntry(updated);
      filled++;
      options?.onProgress?.(filled);
    } catch (error) {
      logger.warn('MetadataBackfill: failed to update entry', entry.id, error);
      // Continue with next entry
    }

    await delay(delayMs);
  }

  if (filled > 0) {
    logger.log('MetadataBackfill: filled weather for', filled, 'entries');
  }
}
