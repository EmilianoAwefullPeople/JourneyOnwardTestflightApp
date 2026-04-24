import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

const PREFIX = '@jo_import_geo_v1:';

/** Rounded coord key (~1.1 km); aligns with dashboard `calendarCoordKey` bucketing. */
export function importLatestCoordBucketKey(lat: number, lng: number): string {
  return `${lat.toFixed(2)},${lng.toFixed(2)}`;
}

type Payload = { country: string | null };

/**
 * Load persisted coord-bucket → country results from prior import runs.
 */
export async function readImportGeoCountryCache(keys: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (keys.length === 0) return out;
  const storageKeys = keys.map((k) => `${PREFIX}${k}`);
  try {
    const pairs = await AsyncStorage.multiGet(storageKeys);
    for (let i = 0; i < pairs.length; i++) {
      const [, raw] = pairs[i];
      const coordKey = keys[i];
      if (!raw) continue;
      try {
        const p = JSON.parse(raw) as Partial<Payload>;
        if ('country' in p) {
          out.set(coordKey, p.country ?? null);
        }
      } catch {
        /* skip corrupt entry */
      }
    }
  } catch (e) {
    logger.warn('importLatestGeoCountryCache: read failed', e);
  }
  return out;
}

/**
 * Persist new geocode results (including null) so failed buckets are not hammered every run.
 */
export async function writeImportGeoCountryCache(
  entries: Array<{ key: string; country: string | null }>
): Promise<void> {
  if (entries.length === 0) return;
  const CHUNK = 50;
  try {
    for (let i = 0; i < entries.length; i += CHUNK) {
      const slice = entries.slice(i, i + CHUNK);
      const pairs: [string, string][] = slice.map(({ key, country }) => [
        `${PREFIX}${key}`,
        JSON.stringify({ country } satisfies Payload),
      ]);
      await AsyncStorage.multiSet(pairs);
    }
  } catch (e) {
    logger.warn('importLatestGeoCountryCache: write failed', e);
  }
}
