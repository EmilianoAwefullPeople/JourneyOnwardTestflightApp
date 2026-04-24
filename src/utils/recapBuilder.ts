// recapBuilder
// Builds the ordered sequence of RecapSlides from a RecapCandidate and its entries.

import { Entry } from '../models/Entry';
import type { RecapCandidate, RecapSlide } from '../models/Recap';
import type {
  RecapSlideTitlePayload,
  RecapSlideStatPayload,
  RecapSlideHighlightPayload,
  RecapSlideCollagePayload,
  RecapSlideOutroPayload,
} from '../models/Recap';

const TITLE_DURATION_MS = 6000;
const STAT_DURATION_MS = 5000;
const HIGHLIGHT_DURATION_MS = 6000;
const COLLAGE_DURATION_MS = 7000;
const OUTRO_DURATION_MS = 5000;

const MAX_HIGHLIGHT_SLIDES = 5;
const COLLAGE_IMAGE_COUNT = 4;
const OUTRO_DISPLAY_NAME_MAX_LEN = 40;
const OUTRO_DISPLAY_NAME_FALLBACK = 'journey';

/**
 * Get first usable media URI for an entry (photoPaths then mediaPaths, same as TripAlbumsSection).
 */
function getEntryMediaUri(entry: Entry): string | null {
  const paths = (entry.photoPaths?.length ? entry.photoPaths : entry.mediaPaths) ?? [];
  const uri = paths.find((p) => p && typeof p === 'string');
  return uri ?? null;
}

/**
 * Entries that have at least one photo/media URI.
 */
function entriesWithMedia(entries: Entry[]): Entry[] {
  return entries.filter((e) => getEntryMediaUri(e) != null);
}

/**
 * Pick up to maxCount highlight entries: prefer isAwe, then spread over trip order.
 */
function pickHighlightEntries(entries: Entry[], maxCount: number): Entry[] {
  const withMedia = entriesWithMedia(entries);
  if (withMedia.length === 0) return [];
  if (withMedia.length <= maxCount) return withMedia;

  const awe = withMedia.filter((e) => e.isAwe === true);
  const rest = withMedia.filter((e) => !e.isAwe);
  const pool = [...awe, ...rest];

  if (pool.length <= maxCount) return pool;

  const step = Math.max(1, Math.floor(pool.length / maxCount));
  const indices: number[] = [];
  for (let i = 0; i < maxCount; i++) {
    const idx = Math.min(i * step, pool.length - 1);
    if (!indices.includes(idx)) indices.push(idx);
  }
  indices.sort((a, b) => a - b);
  const seen = new Set<number>();
  const result: Entry[] = [];
  for (const i of indices) {
    if (!seen.has(i)) {
      seen.add(i);
      result.push(pool[i]);
    }
  }
  while (result.length < maxCount && result.length < pool.length) {
    for (let j = 0; j < pool.length && result.length < maxCount; j++) {
      if (!result.includes(pool[j])) result.push(pool[j]);
    }
    break;
  }
  return result.slice(0, maxCount);
}

/**
 * Truncate display name for outro message; use fallback when empty or whitespace.
 */
function truncateDisplayNameForOutro(name: string): string {
  const trimmed = (name ?? '').trim();
  if (trimmed.length === 0) return OUTRO_DISPLAY_NAME_FALLBACK;
  if (trimmed.length <= OUTRO_DISPLAY_NAME_MAX_LEN) return trimmed;
  return trimmed.slice(0, OUTRO_DISPLAY_NAME_MAX_LEN).trim() + '…';
}

/**
 * Pick up to maxCount entries for collage (with media), spread over trip.
 */
function pickCollageEntries(entries: Entry[], maxCount: number): Entry[] {
  const withMedia = entriesWithMedia(entries);
  if (withMedia.length === 0) return [];
  if (withMedia.length <= maxCount) return withMedia;
  const step = Math.floor(withMedia.length / maxCount);
  const result: Entry[] = [];
  for (let i = 0; i < maxCount; i++) {
    result.push(withMedia[Math.min(i * step, withMedia.length - 1)]);
  }
  return result;
}

/**
 * Build the ordered recap slides for a candidate and its entries.
 * Title → stats → highlights → optional collage → outro.
 */
export function buildRecapSlides(candidate: RecapCandidate, entries: Entry[]): RecapSlide[] {
  const slides: RecapSlide[] = [];
  const album = candidate.album;
  const orderedEntries = candidate.entryIds
    .map((id) => entries.find((e) => e.id === id))
    .filter((e): e is Entry => e != null);

  let slideIndex = 0;
  const nextId = () => `recap-${candidate.id}-${slideIndex++}`;

  const endDateDisplay = album.endDate ?? album.startDate;

  slides.push({
    id: nextId(),
    type: 'title',
    durationMs: TITLE_DURATION_MS,
    payload: {
      displayName: candidate.displayName,
      startDate: album.startDate,
      endDate: endDateDisplay,
      subtitle: 'Your journey',
    } as RecapSlideTitlePayload,
  });

  const experienceCount = orderedEntries.length;
  slides.push({
    id: nextId(),
    type: 'stat',
    durationMs: STAT_DURATION_MS,
    payload: {
      value: experienceCount,
      label: experienceCount === 1 ? 'Experience' : 'Experiences',
      prefix: 'You captured',
    } as RecapSlideStatPayload,
  });

  const aweCount = orderedEntries.filter((e) => e.isAwe === true).length;
  if (aweCount > 0) {
    slides.push({
      id: nextId(),
      type: 'stat',
      durationMs: STAT_DURATION_MS,
      payload: {
        value: aweCount,
        label: aweCount === 1 ? 'Awe moment' : 'Awe moments',
        prefix: 'You had',
      } as RecapSlideStatPayload,
    });
  }

  const highlightEntries = pickHighlightEntries(orderedEntries, MAX_HIGHLIGHT_SLIDES);
  for (const entry of highlightEntries) {
    const uri = getEntryMediaUri(entry);
    if (!uri) continue;
    slides.push({
      id: nextId(),
      type: 'highlight',
      durationMs: HIGHLIGHT_DURATION_MS,
      payload: {
        entryId: entry.id,
        mediaUri: uri,
        caption: entry.title ?? (entry.description ? entry.description.slice(0, 80) : undefined),
      } as RecapSlideHighlightPayload,
    });
  }

  const collageEntries = pickCollageEntries(orderedEntries, COLLAGE_IMAGE_COUNT);
  if (collageEntries.length >= 2) {
    const mediaUris = collageEntries.map((e) => getEntryMediaUri(e)).filter((u): u is string => u != null);
    if (mediaUris.length >= 2) {
      slides.push({
        id: nextId(),
        type: 'collage',
        durationMs: COLLAGE_DURATION_MS,
        payload: {
          entryIds: collageEntries.map((e) => e.id),
          mediaUris,
          label: 'Your highlights',
        } as RecapSlideCollagePayload,
      });
    }
  }

  const outroDisplayName = truncateDisplayNameForOutro(candidate.displayName);
  slides.push({
    id: nextId(),
    type: 'outro',
    durationMs: OUTRO_DURATION_MS,
    payload: { message: `That's your ${outroDisplayName}.` } as RecapSlideOutroPayload,
  });

  return slides;
}
