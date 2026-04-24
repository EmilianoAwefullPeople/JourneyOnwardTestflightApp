// Stats filter utilities
// Time-scope filtering and trip summary helpers for Stats dashboard

import { Entry } from '../models/Entry';
import { Journal } from '../models/Journal';
import { TripAlbum } from '../models/TripAlbum';

export type StatsTimeScope = 'this_year' | 'all_time';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function getCurrentYearStartEnd(): { startMs: number; endMs: number } {
  const now = new Date();
  const y = now.getUTCFullYear();
  return {
    startMs: Date.UTC(y, 0, 1, 0, 0, 0, 0),
    endMs: Date.UTC(y, 11, 31, 23, 59, 59, 999),
  };
}

function timestampToMs(isoTimestamp: string): number {
  const d = new Date(isoTimestamp);
  return Number.isFinite(d.getTime()) ? d.getTime() : NaN;
}

/**
 * Filter entries to those within the given time scope (UTC).
 * this_year: timestamp in current calendar year; all_time: no filter.
 */
export function filterEntriesByScope(entries: Entry[], scope: StatsTimeScope): Entry[] {
  if (!Array.isArray(entries)) return [];
  if (scope === 'all_time') return entries;
  const { startMs, endMs } = getCurrentYearStartEnd();
  return entries.filter((e) => {
    const ms = timestampToMs(e.timestamp);
    return Number.isFinite(ms) && ms >= startMs && ms <= endMs;
  });
}

/**
 * Filter journals to those within the given time scope (UTC).
 */
export function filterJournalsByScope(journals: Journal[], scope: StatsTimeScope): Journal[] {
  if (!Array.isArray(journals)) return [];
  if (scope === 'all_time') return journals;
  const { startMs, endMs } = getCurrentYearStartEnd();
  return journals.filter((j) => {
    const ms = timestampToMs(j.timestamp);
    return Number.isFinite(ms) && ms >= startMs && ms <= endMs;
  });
}

/**
 * Filter trip albums to those that overlap the current year (startDate in current year).
 */
export function filterAlbumsByScope(tripAlbums: TripAlbum[], scope: StatsTimeScope): TripAlbum[] {
  if (!Array.isArray(tripAlbums)) return [];
  if (scope === 'all_time') return tripAlbums;
  const { startMs, endMs } = getCurrentYearStartEnd();
  return tripAlbums.filter((a) => {
    const start = timestampToMs(a.startDate);
    if (!Number.isFinite(start)) return false;
    return start <= endMs && (a.endDate == null || a.endDate.trim() === '' || timestampToMs(a.endDate) >= startMs);
  });
}

/**
 * Longest trip duration in days (floor) from albums with both startDate and endDate.
 * Returns null if no valid album has both dates.
 */
export function getLongestTripDays(tripAlbums: TripAlbum[]): number | null {
  if (!Array.isArray(tripAlbums) || tripAlbums.length === 0) return null;
  let maxDays = 0;
  for (const album of tripAlbums) {
    if (!album.startDate || !album.endDate || !album.endDate.trim()) continue;
    const start = timestampToMs(album.startDate);
    const end = timestampToMs(album.endDate);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) continue;
    const days = Math.floor((end - start) / MS_PER_DAY);
    if (days > maxDays) maxDays = days;
  }
  return maxDays > 0 ? maxDays : null;
}
