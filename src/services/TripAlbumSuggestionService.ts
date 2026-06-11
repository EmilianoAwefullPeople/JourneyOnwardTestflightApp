// TripAlbumSuggestionService
// Clusters existing in-app entries into candidate trip albums by time gap + country.

import { Entry } from '../models/Entry';
import { getCountryFlagEmoji } from '../utils/countryUtils';
import * as PersistenceManager from '../storage/PersistenceManager';
import { logger } from '../utils/logger';

const GAP_THRESHOLD_MS = 72 * 60 * 60 * 1000; // 72 hours
const GEOCODE_DELAY_MS = 300;

export interface SuggestedTripAlbum {
  /** Ephemeral client-side id; not persisted. */
  id: string;
  /** Display name e.g. "🇮🇹 Italy · May 2024" */
  name: string;
  flag: string;
  country: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  entries: Entry[];
}

function filterEligible(entries: Entry[]): Entry[] {
  return entries.filter(e => !e.albumId && !e.isDraft && !!e.timestamp);
}

async function geocodeMissing(entries: Entry[]): Promise<Entry[]> {
  const needsGeocode = entries.filter(
    e => !e.country?.trim() && e.latitude != null && e.longitude != null
  );
  if (needsGeocode.length === 0) return entries;

  let locationModule: typeof import('expo-location') | null = null;
  const updatedMap = new Map<string, { country: string; city: string }>();

  for (const entry of needsGeocode) {
    try {
      if (!locationModule) locationModule = await import('expo-location');
      const addresses = await locationModule.reverseGeocodeAsync({
        latitude: entry.latitude!,
        longitude: entry.longitude!,
      });
      const first = addresses?.[0] as any;
      if (!first) continue;
      const country = (first.country ?? '').trim();
      const city = ((first.city || first.locality || first.subAdministrativeArea) ?? '').trim();
      if (!country && !city) continue;
      await PersistenceManager.updateEntryLocationText(entry.id, country || null, city || null);
      updatedMap.set(entry.id, { country, city });
    } catch (err) {
      logger.warn('TripAlbumSuggestion: geocode failed for entry', entry.id, err);
    }
    await new Promise(r => setTimeout(r, GEOCODE_DELAY_MS));
  }

  return entries.map(e => {
    const up = updatedMap.get(e.id);
    if (!up) return e;
    return { ...e, country: up.country || e.country, city: up.city || e.city };
  });
}

function clusterEntries(entries: Entry[]): Entry[][] {
  if (entries.length < 2) return [];
  const sorted = [...entries].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const clusters: Entry[][] = [];
  let current: Entry[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = current[current.length - 1];
    const curr = sorted[i];
    const timeDiff = new Date(curr.timestamp).getTime() - new Date(prev.timestamp).getTime();
    const prevCountry = prev.country?.trim();
    const currCountry = curr.country?.trim();
    const countryChanged = !!(prevCountry && currCountry && prevCountry !== currCountry);

    if (timeDiff > GAP_THRESHOLD_MS || countryChanged) {
      clusters.push(current);
      current = [curr];
    } else {
      current.push(curr);
    }
  }
  clusters.push(current);
  return clusters.filter(c => c.length >= 2);
}

function buildSuggestion(cluster: Entry[]): SuggestedTripAlbum {
  const countryCounts = new Map<string, number>();
  for (const e of cluster) {
    const c = e.country?.trim();
    if (c) countryCounts.set(c, (countryCounts.get(c) ?? 0) + 1);
  }
  let country = '';
  let maxCount = 0;
  for (const [c, n] of countryCounts) {
    if (n > maxCount) { maxCount = n; country = c; }
  }

  const flag = getCountryFlagEmoji(country);
  const times = cluster.map(e => new Date(e.timestamp).getTime());
  const startDate = new Date(Math.min(...times));
  const endDate = new Date(Math.max(...times));
  const monthYear = startDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const name = country
    ? `${flag} ${country} · ${monthYear}`
    : `${flag} Trip · ${monthYear}`;

  return {
    id: `suggestion-${Math.random().toString(36).slice(2)}-${Date.now()}`,
    name,
    flag,
    country: country || 'Unknown',
    startDate: startDate.toISOString().slice(0, 10),
    endDate: endDate.toISOString().slice(0, 10),
    entries: cluster,
  };
}

export async function computeSuggestions(allEntries: Entry[]): Promise<SuggestedTripAlbum[]> {
  try {
    const eligible = filterEligible(allEntries);
    if (eligible.length < 2) return [];
    const withLocation = await geocodeMissing(eligible);
    const clusters = clusterEntries(withLocation);
    return clusters.map(buildSuggestion);
  } catch (err) {
    logger.error('TripAlbumSuggestion: computeSuggestions failed', err);
    return [];
  }
}
