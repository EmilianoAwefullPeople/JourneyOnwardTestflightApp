// Album utilities
// Helpers for matching entries to trip albums by date

import { TripAlbum } from '../models/TripAlbum';

/**
 * Normalizes an ISO timestamp to the start of that day in LOCAL time (midnight local).
 * Uses local date parts because dates are selected via a local date picker and stored
 * via toISOString() — the local calendar date must be recovered with local getters.
 */
function toDayStart(isoTimestamp: string): number {
  const d = new Date(isoTimestamp);
  if (!Number.isFinite(d.getTime())) return NaN;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
}

/**
 * Normalizes an ISO timestamp to the end of that day in LOCAL time (23:59:59.999 local).
 * Uses local date parts for consistency with toDayStart.
 */
function toDayEnd(isoTimestamp: string): number {
  const d = new Date(isoTimestamp);
  if (!Number.isFinite(d.getTime())) return NaN;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
}

/**
 * Returns true if the given timestamp falls within an album's date range.
 * - If endDate is provided: timestamp must be >= startDate and <= endDate (inclusive, date-only).
 * - If endDate is missing/empty: timestamp must be >= startDate.
 */
export function isTimestampInAlbumRange(
  timestamp: string,
  startDate: string,
  endDate?: string | null
): boolean {
  if (!timestamp || !startDate) return false;
  const entryDayStart = toDayStart(timestamp);
  const start = toDayStart(startDate);
  if (!Number.isFinite(entryDayStart) || !Number.isFinite(start)) return false;
  if (entryDayStart < start) return false;
  if (endDate != null && endDate.trim() !== '') {
    const end = toDayEnd(endDate);
    if (!Number.isFinite(end) || entryDayStart > end) return false;
  }
  return true;
}

/**
 * Returns true only once a trip is fully in the past — it has an endDate, and today is after
 * it. Trips without an endDate are open-ended and are never "finished" until one is set.
 * Recaps (Journey Recap, and the Recap card in "Recaps & Stories") are gated on this: a recap
 * summarizes a trip, so it isn't offered until there's nothing left to summarize.
 */
export function isTripFinished(album: TripAlbum, nowTimestamp: string = new Date().toISOString()): boolean {
  if (!album.endDate || album.endDate.trim() === '') return false;
  const end = toDayEnd(album.endDate);
  const now = new Date(nowTimestamp).getTime();
  if (!Number.isFinite(end) || !Number.isFinite(now)) return false;
  return now > end;
}

/**
 * Returns the first trip album whose date range contains the entry timestamp.
 * - If album has endDate: entry date must be >= startDate and <= endDate (inclusive).
 * - If album has no endDate: entry date must be >= startDate.
 * Returns undefined if no album matches or inputs are invalid.
 */
export function findMatchingAlbumId(
  entryTimestamp: string,
  tripAlbums: TripAlbum[]
): string | undefined {
  if (!entryTimestamp || !Array.isArray(tripAlbums) || tripAlbums.length === 0) {
    return undefined;
  }

  const entryDayStart = toDayStart(entryTimestamp);
  if (!Number.isFinite(entryDayStart)) {
    return undefined;
  }

  for (const album of tripAlbums) {
    const start = toDayStart(album.startDate);
    if (!Number.isFinite(start)) continue;
    if (entryDayStart < start) continue;

    if (album.endDate != null && album.endDate.trim() !== '') {
      const end = toDayEnd(album.endDate);
      if (Number.isFinite(end) && entryDayStart > end) continue;
    }

    return album.id;
  }

  return undefined;
}
