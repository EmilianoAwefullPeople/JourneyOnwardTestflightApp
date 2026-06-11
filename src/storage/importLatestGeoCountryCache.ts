import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

// v2: stores ISO 3166-1 alpha-2 codes (locale-invariant) + cachedAt for null-TTL.
// v1 entries (localized country name strings) are simply abandoned.
const PREFIX = '@jo_import_geo_v2:';

// Null results (geocoding failed or offline) expire after 7 days so transient failures
// don't permanently blacklist a coordinate bucket.
const NULL_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Rounded coord key (~11 km grid). Coarser than v1's ~1.1 km — sufficient for
 * country-level detection and yields ~100x fewer unique geocoding calls per trip.
 */
export function importLatestCoordBucketKey(lat: number, lng: number): string {
  return `${lat.toFixed(1)},${lng.toFixed(1)}`;
}

type Payload = { isoCode: string | null; cachedAt: number };

export async function readImportGeoCountryCache(keys: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (keys.length === 0) return out;
  const storageKeys = keys.map((k) => `${PREFIX}${k}`);
  try {
    const pairs = await AsyncStorage.multiGet(storageKeys);
    const now = Date.now();
    for (let i = 0; i < pairs.length; i++) {
      const [, raw] = pairs[i];
      const coordKey = keys[i];
      if (!raw) continue;
      try {
        const p = JSON.parse(raw) as Partial<Payload>;
        if (!('isoCode' in p)) continue;
        // Expired null entries are treated as cache misses so geocoding retries.
        if (p.isoCode === null && typeof p.cachedAt === 'number' && now - p.cachedAt > NULL_CACHE_TTL_MS) continue;
        out.set(coordKey, p.isoCode ?? null);
      } catch {
        /* skip corrupt entry */
      }
    }
  } catch (e) {
    logger.warn('importLatestGeoCountryCache: read failed', e);
  }
  return out;
}

export async function writeImportGeoCountryCache(
  entries: Array<{ key: string; isoCode: string | null }>
): Promise<void> {
  if (entries.length === 0) return;
  const CHUNK = 50;
  const now = Date.now();
  try {
    for (let i = 0; i < entries.length; i += CHUNK) {
      const slice = entries.slice(i, i + CHUNK);
      const pairs: [string, string][] = slice.map(({ key, isoCode }) => [
        `${PREFIX}${key}`,
        JSON.stringify({ isoCode, cachedAt: now } satisfies Payload),
      ]);
      await AsyncStorage.multiSet(pairs);
    }
  } catch (e) {
    logger.warn('importLatestGeoCountryCache: write failed', e);
  }
}
