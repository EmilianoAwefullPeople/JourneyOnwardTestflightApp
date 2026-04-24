import AsyncStorage from '@react-native-async-storage/async-storage';
import { Entry } from '../models/Entry';
import { logger } from './logger';

const CACHE_KEY = '@jo_entry_loc_v1';

export interface EntryLocationData {
  country?: string;
  city?: string;
}

type LocationCache = Record<string, EntryLocationData>;

export async function loadEntryLocationCache(): Promise<LocationCache> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as LocationCache;
  } catch {
    return {};
  }
}

async function saveCache(cache: LocationCache): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    logger.error('entryLocationCache: save failed', e);
  }
}

export async function geocodeAndCacheEntries(
  entries: Entry[],
  existing: LocationCache
): Promise<LocationCache> {
  const toGeocode = entries.filter((e) => {
    if (e.latitude == null || e.longitude == null) return false;
    const ex = existing[e.id];
    const countryKnown = !!(ex?.country?.trim() || e.country?.trim());
    const cityKnown = !!(ex?.city?.trim() || e.city?.trim());
    return !(countryKnown && cityKnown);
  });
  if (toGeocode.length === 0) return existing;

  let locationModule: typeof import('expo-location') | null = null;
  try {
    locationModule = await import('expo-location');
  } catch {
    return existing;
  }

  const updated: LocationCache = { ...existing };

  for (const entry of toGeocode) {
    try {
      const results = await locationModule.reverseGeocodeAsync({
        latitude: entry.latitude!,
        longitude: entry.longitude!,
      });
      if (results && results.length > 0) {
        const r = results[0] as {
          country?: string;
          city?: string;
          locality?: string;
          subAdministrativeArea?: string;
        };
        const prior = existing[entry.id];
        updated[entry.id] = {
          country: entry.country?.trim() || prior?.country?.trim() || r.country || undefined,
          city: entry.city?.trim() || (r.city || r.locality || r.subAdministrativeArea || prior?.city)?.trim() || undefined,
        };
      }
    } catch (e) {
      logger.log('entryLocationCache: geocode failed for', entry.id, e);
    }
  }

  await saveCache(updated);
  return updated;
}
