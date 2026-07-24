import { Entry } from '../models/Entry';
import { Journal } from '../models/Journal';
import { aggregatePalette } from './paletteAggregation';

export interface LocationPin {
  latitude: number;
  longitude: number;
  label: string;
}

export interface LocationFrequency {
  name: string;
  latitude?: number;
  longitude?: number;
  count: number;
}

export interface WeatherCondition {
  condition: string;
  percentage: number;
}

export interface EmotionFrequency {
  label: string;
  count: number;
}

export interface DayCount {
  date: string;
  count: number;
}

export function getPhotoUri(entry: Entry): string | null {
  const paths = (entry.photoPaths?.length ? entry.photoPaths : entry.mediaPaths) ?? [];
  return paths.find((p) => p && typeof p === 'string') ?? null;
}

export function getEntriesWithPhotos(entries: Entry[]): Entry[] {
  return entries.filter((e) => getPhotoUri(e) !== null);
}

export function selectFromPeriod(
  entries: Entry[],
  period: 'early' | 'mid' | 'late',
  count: number
): Entry[] {
  const withPhotos = getEntriesWithPhotos(entries);
  if (withPhotos.length === 0) return [];

  const third = Math.ceil(withPhotos.length / 3);
  let pool: Entry[];
  if (period === 'early') {
    pool = withPhotos.slice(0, third);
  } else if (period === 'mid') {
    pool = withPhotos.slice(third, third * 2);
  } else {
    pool = withPhotos.slice(third * 2);
  }

  if (pool.length === 0) pool = withPhotos;

  const bookmarked = pool.filter((e) => e.isBookmarked === true);
  const rest = pool.filter((e) => !e.isBookmarked);
  const sorted = [...bookmarked, ...rest];

  return sorted.slice(0, count);
}

const FALLBACK_PALETTE_COLORS = [
  '#8dc0e0',
  '#fed86d',
  '#487525',
  '#8A6552',
  '#B2C4B2',
  '#D4A574',
  '#6B8F71',
  '#C4A882',
];

export function extractTripColors(entries: Entry[]): string[] {
  const aggregated = aggregatePalette(entries, 8);
  return aggregated.length >= 3 ? aggregated : FALLBACK_PALETTE_COLORS.slice(0, 6);
}

export function getDistinctLocations(entries: Entry[]): LocationPin[] {
  const seen = new Set<string>();
  const result: LocationPin[] = [];

  for (const entry of entries) {
    if (entry.latitude == null || entry.longitude == null) continue;
    // A "place" requires a city/town/locality — country alone is not a place
    if (!entry.city) continue;
    const key = `${entry.city}|${entry.country ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      latitude: entry.latitude,
      longitude: entry.longitude,
      label: entry.city,
    });
  }

  return result;
}

export function aggregateWeather(entries: Entry[]): WeatherCondition[] {
  const counts: Record<string, number> = {};
  let total = 0;

  for (const entry of entries) {
    if (entry.weather) {
      counts[entry.weather] = (counts[entry.weather] ?? 0) + 1;
      total++;
    }
  }

  if (total === 0) return [];

  return Object.entries(counts)
    .map(([condition, count]) => ({
      condition,
      percentage: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.percentage - a.percentage);
}

export function aggregateEmotions(entries: Entry[]): EmotionFrequency[] {
  const counts: Record<string, number> = {};

  for (const entry of entries) {
    for (const label of entry.emotionLabels ?? []) {
      if (label) counts[label] = (counts[label] ?? 0) + 1;
    }
  }

  return Object.entries(counts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

export function getEntriesPerDay(
  entries: Entry[],
  startDate: string,
  endDate: string
): DayCount[] {
  const start = new Date(startDate);
  const end = new Date(endDate ?? startDate);
  const counts: Record<string, number> = {};

  for (const entry of entries) {
    const day = entry.timestamp.slice(0, 10);
    counts[day] = (counts[day] ?? 0) + 1;
  }

  const result: DayCount[] = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const endNorm = new Date(end);
  endNorm.setHours(23, 59, 59, 999);

  while (cursor <= endNorm) {
    const day = cursor.toISOString().slice(0, 10);
    result.push({ date: day, count: counts[day] ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  return result;
}

export function getFirstSentence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^[^.!?]+[.!?]/);
  if (match) return match[0].trim();
  const words = trimmed.split(/\s+/);
  return words.slice(0, 20).join(' ');
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function selectJournalForQuote(
  journals: Journal[],
  albumId: string,
  excludeId?: string
): Journal | null {
  const candidates = journals.filter(
    (j) =>
      j.albumId === albumId &&
      j.id !== excludeId &&
      countWords(j.content) >= 10
  );
  if (candidates.length === 0) return null;
  return candidates.slice().sort((a, b) => b.content.length - a.content.length)[0];
}

export function selectBookmarkedPhotoEntry(entries: Entry[]): Entry | null {
  const candidates = entries.filter((e) => e.isBookmarked === true && getPhotoUri(e) !== null);
  return candidates[0] ?? null;
}


export function computeTripDays(startDate: string, endDate?: string): number {
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : new Date(startDate);
  const diffMs = end.getTime() - start.getTime();
  return Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1);
}

export function formatDateRange(startDate: string, endDate?: string): string {
  try {
    const start = new Date(startDate);
    if (!Number.isFinite(start.getTime())) return startDate;
    if (!endDate) {
      return start.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }
    const end = new Date(endDate);
    return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  } catch {
    return startDate;
  }
}

// ─── v3.0 helpers ─────────────────────────────────────────────────────────────

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededShuffle<T>(items: T[], seed: string, keyOf: (item: T) => string): T[] {
  return [...items].sort((a, b) => hashStr(`${seed}:${keyOf(a)}`) - hashStr(`${seed}:${keyOf(b)}`));
}

/**
 * Select entries by their position percentile in the sorted array (not time).
 * startPct=0, endPct=0.35 → first 35% of entries with photos.
 */
export function selectFromPercentile(
  sortedEntries: Entry[],
  startPct: number,
  endPct: number,
  count: number,
  prioritizeBookmarks: boolean
): Entry[] {
  const withPhotos = getEntriesWithPhotos(sortedEntries);
  if (withPhotos.length === 0) return [];

  const n = withPhotos.length;
  const start = Math.floor(startPct * n);
  const end = Math.floor(endPct * n);
  let pool = withPhotos.slice(start, Math.max(end, start + 1));
  if (pool.length === 0) pool = withPhotos;

  if (prioritizeBookmarks) {
    const bookmarked = pool.filter((e) => e.isBookmarked === true);
    const rest = pool.filter((e) => !e.isBookmarked);
    pool = [...bookmarked, ...rest];
  }

  return pool.slice(0, count);
}

export function computePhotosCount(entries: Entry[]): number {
  let total = 0;
  for (const e of entries) {
    const paths = e.photoPaths?.length ? e.photoPaths : (e.mediaPaths ?? []);
    total += paths.length;
  }
  return total;
}

export function computeJournalStats(journals: Journal[]): {
  words: number;
  sentences: number;
  chapters: number;
} {
  let words = 0;
  let sentences = 0;
  for (const j of journals) {
    words += countWords(j.content);
    const matched = j.content.match(/[^.!?]+[.!?]+/g);
    sentences += matched ? matched.length : j.content.trim().length > 0 ? 1 : 0;
  }
  return { words, sentences, chapters: journals.length };
}

export function getLocationsByFrequency(entries: Entry[]): LocationFrequency[] {
  const map = new Map<string, { lat?: number; lng?: number; count: number }>();
  for (const entry of entries) {
    // A "place" requires a city/town/locality — country alone is not a place
    if (!entry.city) continue;
    const existing = map.get(entry.city);
    if (existing) {
      existing.count++;
    } else {
      map.set(entry.city, { lat: entry.latitude, lng: entry.longitude, count: 1 });
    }
  }
  return Array.from(map.entries())
    .map(([name, v]) => ({ name, latitude: v.lat, longitude: v.lng, count: v.count }))
    .sort((a, b) => b.count - a.count);
}

export function getEntryLocationLabel(entry: Entry): string | undefined {
  // Only label with a specific place (city/town/locality).
  // Country alone is not a place — return undefined so postcards stay unlabeled
  // rather than showing a country name as if it were a specific location.
  if (entry.city && entry.country) return `${entry.city}, ${entry.country}`;
  if (entry.city) return entry.city;
  return undefined;
}

/**
 * Returns null when: fewer than 2 distinct days, or there is a tie for peak day.
 * Choices are sorted chronologically; the peak day is placed randomly among them.
 */
export function computeActivityChoiceData(
  entries: Entry[],
  albumId: string
): { peakDay: string; choices: string[] } | null {
  const dayCounts: Record<string, number> = {};
  for (const e of entries) {
    const day = e.timestamp.slice(0, 10);
    dayCounts[day] = (dayCounts[day] ?? 0) + 1;
  }
  const days = Object.keys(dayCounts);
  if (days.length < 2) return null;

  const maxCount = Math.max(...days.map((d) => dayCounts[d]));
  const peakDays = days.filter((d) => dayCounts[d] === maxCount);
  if (peakDays.length !== 1) return null;

  const peakDay = peakDays[0];
  const decoyPool = days.filter((d) => d !== peakDay);
  const shuffled = seededShuffle(decoyPool, albumId, (d) => d);
  const choices = [peakDay, ...shuffled.slice(0, 3)].sort();
  return { peakDay, choices };
}

export function computeActivityDistribution(
  entries: Entry[],
  startDate: string,
  endDate: string
): { data: Array<{ date: string; count: number }>; xAxisMode: 'days' | 'weeks' } {
  const tripDays = computeTripDays(startDate, endDate);
  const dayData = getEntriesPerDay(entries, startDate, endDate);

  if (tripDays <= 14) {
    return { data: dayData, xAxisMode: 'days' };
  }

  const weekData: Array<{ date: string; count: number }> = [];
  for (let i = 0; i < dayData.length; i += 7) {
    const chunk = dayData.slice(i, i + 7);
    weekData.push({
      date: chunk[0].date,
      count: chunk.reduce((s, d) => s + d.count, 0),
    });
  }
  return { data: weekData, xAxisMode: 'weeks' };
}

function hexToHsl(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

/** Entry whose first photo palette has the lowest average saturation — for color_palette_photo. */
export function selectLowSaturationPhotoEntry(entries: Entry[]): Entry | null {
  const candidates = entries.filter(
    (e) =>
      getPhotoUri(e) !== null &&
      e.colorPalettes &&
      e.colorPalettes.length > 0 &&
      e.colorPalettes[0]?.length > 0
  );
  if (candidates.length === 0) return null;

  let best: Entry | null = null;
  let lowestSat = Infinity;

  for (const entry of candidates) {
    const palette = entry.colorPalettes![0];
    const sats = palette
      .filter((h) => typeof h === 'string' && h.startsWith('#') && h.length === 7)
      .map((h) => hexToHsl(h)[1]);
    if (sats.length === 0) continue;
    const avg = sats.reduce((a, b) => a + b, 0) / sats.length;
    if (avg < lowestSat) {
      lowestSat = avg;
      best = entry;
    }
  }
  return best;
}

/** Entry with temperatureCelsius closest to the mean, that also has a photo. */
export function findClosestToAvgTempEntry(entries: Entry[]): Entry | null {
  const candidates = entries.filter(
    (e) => e.temperatureCelsius != null && getPhotoUri(e) !== null
  );
  if (candidates.length === 0) return null;

  const avg =
    candidates.reduce((s, e) => s + e.temperatureCelsius!, 0) / candidates.length;

  return candidates.reduce((best, e) =>
    Math.abs(e.temperatureCelsius! - avg) < Math.abs(best.temperatureCelsius! - avg)
      ? e
      : best
  );
}

/**
 * Returns lowest/highest altitude entries (with photos), or null if:
 * fewer than 2 photo-entries have altitude, or spread ≤ 100 m.
 */
export function findAltitudeExtremes(entries: Entry[]): {
  lowest: { entry: Entry; altitudeMeters: number };
  highest: { entry: Entry; altitudeMeters: number };
} | null {
  const candidates = entries.filter(
    (e) => e.altitudeMeters != null && getPhotoUri(e) !== null
  );
  if (candidates.length < 2) return null;

  const lowest = candidates.reduce((b, e) =>
    e.altitudeMeters! < b.altitudeMeters! ? e : b
  );
  const highest = candidates.reduce((b, e) =>
    e.altitudeMeters! > b.altitudeMeters! ? e : b
  );

  if (highest.altitudeMeters! - lowest.altitudeMeters! <= 100) return null;

  return {
    lowest: { entry: lowest, altitudeMeters: lowest.altitudeMeters! },
    highest: { entry: highest, altitudeMeters: highest.altitudeMeters! },
  };
}
