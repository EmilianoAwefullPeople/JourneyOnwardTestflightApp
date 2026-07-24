import type { Entry } from '../../../models/Entry';

/**
 * Caption helpers for T-11 Diptych (two-row yellow subtitles).
 * Prefer a place name on each photo; when both would repeat the same location,
 * the second caption falls back to season / weather "Memories from…" copy.
 */

function normalizeCaption(text: string): string {
  return text.trim().toLowerCase().replace(/\.+$/, '');
}

/** Best place string for a subtitle — city, else country. */
export function diptychLocationCaption(entry: Entry | null | undefined): string {
  if (!entry) return '';
  const city = entry.city?.trim() ?? '';
  const country = entry.country?.trim() ?? '';
  if (city && country) return `${city}, ${country}`;
  return city || country || '';
}

function indefiniteArticle(word: string): 'a' | 'an' {
  return /^[aeiou]/i.test(word.trim()) ? 'an' : 'a';
}

/** Season / weather fallbacks, in preference order. */
export function diptychAlternateCaptions(entry: Entry | null | undefined): string[] {
  if (!entry) return ['Memories from this day'];
  const options: string[] = [];
  const season = entry.season?.trim();
  if (season) {
    options.push(`Memories from ${season}`);
  }
  const weather = entry.weather?.trim().toLowerCase();
  if (weather) {
    options.push(`Memories from ${indefiniteArticle(weather)} ${weather} day`);
  }
  options.push('Memories from this day');
  return options;
}

/**
 * Pick a caption that prefers `preferred`, then alternate options, skipping any
 * string that collides with `otherCaption` (case/punctuation-insensitive).
 */
export function pickDistinctDiptychCaption(
  preferred: string,
  otherCaption: string,
  entry: Entry | null | undefined
): string {
  const candidates = [preferred, ...diptychAlternateCaptions(entry)].filter((c) => c.trim());
  const blocked = normalizeCaption(otherCaption);
  if (!blocked) return candidates[0] ?? '';
  return candidates.find((c) => normalizeCaption(c) !== blocked) ?? candidates[0] ?? '';
}

/**
 * Derive both diptych labels from the linked entries.
 * Slot 0 keeps its location (or first alternate if none).
 * Slot 1 uses location unless it would repeat slot 0, then season/weather.
 * Slots without an entry stay empty.
 */
export function deriveDiptychLabels(
  topEntry: Entry | null | undefined,
  bottomEntry: Entry | null | undefined
): [string, string] {
  const topPreferred = diptychLocationCaption(topEntry);
  const bottomPreferred = diptychLocationCaption(bottomEntry);

  const topLabel = topEntry
    ? pickDistinctDiptychCaption(topPreferred, '', topEntry)
    : '';
  const bottomLabel = bottomEntry
    ? pickDistinctDiptychCaption(bottomPreferred, topLabel, bottomEntry)
    : '';
  return [topLabel, bottomLabel];
}
