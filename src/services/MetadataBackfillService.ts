// MetadataBackfillService
// Fetches weather for entries that have coordinates but no weather (e.g. saved offline).
// Best-effort only; never throws. Invoked when app comes back online.

import * as PersistenceManager from '../storage/PersistenceManager';
import { getWeatherAtLocation } from './WeatherService';
import { logger } from '../utils/logger';

const DELAY_BETWEEN_REQUESTS_MS = 400;
const MAX_ENTRIES_PER_RUN = 30;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface MetadataBackfillOptions {
  /** Called after each entry is successfully updated with weather. */
  onProgress?: (filled: number) => void;
  /** Max entries to process this run. Default 30. */
  maxEntries?: number;
  /** Delay in ms between API requests. Default 400. */
  delayMs?: number;
}

/**
 * Fetches weather for entries missing it (have lat/lng but no weather) and persists
 * it via a scoped DB update that never touches photo paths.
 * Best-effort: logs and continues on per-entry failures; never throws.
 */
export async function runMetadataBackfill(
  options?: MetadataBackfillOptions
): Promise<void> {
  const maxEntries = options?.maxEntries ?? MAX_ENTRIES_PER_RUN;
  const delayMs = options?.delayMs ?? DELAY_BETWEEN_REQUESTS_MS;

  let entries;
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

      await PersistenceManager.updateEntryWeather(
        entry.id,
        weather.condition,
        weather.temperatureCelsius ?? null
      );
      filled++;
      options?.onProgress?.(filled);
    } catch (error) {
      logger.warn('MetadataBackfill: failed to update entry', entry.id, error);
    }

    await delay(delayMs);
  }

  if (filled > 0) {
    logger.log('MetadataBackfill: filled weather for', filled, 'entries');
  }
}

/**
 * Best-effort weather enrichment for a targeted list of entry IDs.
 * Useful for warming up newly imported onboarding entries before recap/dashboard usage.
 */
export async function enrichWeatherForEntries(
  entryIds: string[],
  options?: MetadataBackfillOptions
): Promise<void> {
  if (!Array.isArray(entryIds) || entryIds.length === 0) return;

  const maxEntries = options?.maxEntries ?? MAX_ENTRIES_PER_RUN;
  const delayMs = options?.delayMs ?? DELAY_BETWEEN_REQUESTS_MS;
  const uniqueIds = Array.from(new Set(entryIds)).slice(0, maxEntries);

  let entries;
  try {
    const allEntries = await PersistenceManager.getEntries();
    entries = allEntries.filter((entry) =>
      uniqueIds.includes(entry.id) &&
      entry.latitude != null &&
      entry.longitude != null &&
      (entry.weather == null || entry.weather === '')
    );
  } catch (error) {
    logger.error('MetadataBackfill: enrichWeatherForEntries failed to load entries', error);
    return;
  }

  if (entries.length === 0) return;

  let filled = 0;
  for (const entry of entries) {
    try {
      const weather = await getWeatherAtLocation(entry.latitude as number, entry.longitude as number);
      if (!weather) {
        await delay(delayMs);
        continue;
      }
      await PersistenceManager.updateEntryWeather(
        entry.id,
        weather.condition,
        weather.temperatureCelsius ?? null
      );
      filled++;
      options?.onProgress?.(filled);
    } catch (error) {
      logger.warn('MetadataBackfill: enrichWeatherForEntries failed for entry', entry.id, error);
    }
    await delay(delayMs);
  }

  if (filled > 0) {
    logger.log('MetadataBackfill: enriched weather for targeted entries', filled);
  }
}
