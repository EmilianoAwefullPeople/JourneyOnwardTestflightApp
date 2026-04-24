import type { Entry } from '../models/Entry';
import type { ExpoLocationModule } from './dateUtils';
import { getCountryFromCoordinates } from './dateUtils';

export type ResolveCountryOptions = {
  locationModule?: ExpoLocationModule;
};

/**
 * Human-readable country from coordinates (expo-location reverse geocode).
 * Returns null on failure or missing coords.
 */
export async function resolveCountryForCoordinates(
  latitude: number,
  longitude: number,
  options?: ResolveCountryOptions
): Promise<string | null> {
  return getCountryFromCoordinates(latitude, longitude, {
    locationModule: options?.locationModule,
  });
}

/** Sets `country` only when missing and geocode succeeds; never overwrites an existing country. */
export async function attachCountryToEntryIfMissing(
  entry: Entry,
  options?: ResolveCountryOptions
): Promise<Entry> {
  if (entry.latitude == null || entry.longitude == null) return entry;
  const hasCountry = !!entry.country?.trim();
  const hasCity = !!entry.city?.trim();
  if (hasCountry && hasCity) return entry;

  const locationModule = options?.locationModule ?? (await import('expo-location'));
  const addresses = await locationModule.reverseGeocodeAsync({
    latitude: entry.latitude,
    longitude: entry.longitude,
  });
  const first = addresses?.[0] as
    | { country?: string; city?: string; locality?: string; subAdministrativeArea?: string }
    | undefined;
  if (!first) return entry;

  const nextCountry = hasCountry ? entry.country?.trim() : first.country?.trim();
  const nextCity = hasCity
    ? entry.city?.trim()
    : (first.city || first.locality || first.subAdministrativeArea)?.trim();

  if (!nextCountry && !nextCity) return entry;
  return {
    ...entry,
    country: nextCountry || undefined,
    city: nextCity || undefined,
  };
}
