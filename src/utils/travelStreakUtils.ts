// Travel Streak Utils
// Computes journal/entry streak (consecutive days with activity) within a trip date range.
// Uses LOCAL date boundaries consistent with albumUtils.

import { Entry } from '../models/Entry';
import { Journal } from '../models/Journal';
import { isTimestampInAlbumRange } from './albumUtils';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Normalizes an ISO timestamp to the start of that day in LOCAL time.
 * Mirrors albumUtils day boundaries so streak is consistent with album range checks.
 */
function toDayStartMs(isoTimestamp: string): number {
  const d = new Date(isoTimestamp);
  if (!Number.isFinite(d.getTime())) return NaN;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
}

/**
 * Returns the current journal streak for a trip: number of consecutive calendar days
 * (within the trip date range, ending at today) where the user added at least one
 * entry or journal. Counts backward from today; stops at the first day with no activity.
 *
 * @param startDate - Trip start (ISO date string)
 * @param endDate - Optional trip end (ISO date string); if missing, "today" is the end
 * @param entries - All entries (filtered by timestamp in range internally)
 * @param journals - All journals (filtered by timestamp in range internally)
 * @returns Streak count (0 if today has no activity or on any error)
 */
export function getJournalStreakForTrip(
  startDate: string,
  endDate: string | null | undefined,
  entries: Entry[],
  journals: Journal[]
): number {
  try {
    if (!startDate || typeof startDate !== 'string') return 0;
    const entryList = Array.isArray(entries) ? entries : [];
    const journalList = Array.isArray(journals) ? journals : [];

    const todayMs = toDayStartMs(new Date().toISOString());
    if (!Number.isFinite(todayMs)) return 0;

    const startMs = toDayStartMs(startDate);
    if (!Number.isFinite(startMs)) return 0;
    if (todayMs < startMs) return 0;

    const activeDays = new Set<number>();

    const addIfInRange = (timestamp: string) => {
      if (!timestamp) return;
      if (!isTimestampInAlbumRange(timestamp, startDate, endDate)) return;
      const dayMs = toDayStartMs(timestamp);
      if (Number.isFinite(dayMs)) activeDays.add(dayMs);
    };

    entryList.forEach((e) => addIfInRange(e.timestamp));
    journalList.forEach((j) => addIfInRange(j.timestamp));

    if (!activeDays.has(todayMs)) return 0;

    let streak = 0;
    let cursor = todayMs;
    while (cursor >= startMs && activeDays.has(cursor)) {
      streak += 1;
      cursor -= MS_PER_DAY;
    }
    return streak;
  } catch {
    return 0;
  }
}
