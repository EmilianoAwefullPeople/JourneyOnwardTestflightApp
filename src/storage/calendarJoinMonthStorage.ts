import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Entry } from '../models/Entry';
import type { Journal } from '../models/Journal';

const STORAGE_KEY = '@awefull_people:calendar_join_month_v1';

export type YearMonth = { year: number; monthIndex0: number };

function toIndex(ym: YearMonth): number {
  return ym.year * 12 + ym.monthIndex0;
}

export function minYearMonth(a: YearMonth, b: YearMonth): YearMonth {
  return toIndex(a) <= toIndex(b) ? a : b;
}

export function currentYearMonth(): YearMonth {
  const n = new Date();
  return { year: n.getFullYear(), monthIndex0: n.getMonth() };
}

export function yearMonthFromTimestamp(iso: string): YearMonth | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return { year: d.getFullYear(), monthIndex0: d.getMonth() };
}

export function getLatestMemoryYearMonth(entries: Entry[], journals: Journal[]): YearMonth | null {
  let maxTs = -Infinity;
  let bestIso: string | null = null;
  for (const it of [...entries, ...journals]) {
    const t = new Date(it.timestamp).getTime();
    if (!Number.isNaN(t) && t > maxTs) {
      maxTs = t;
      bestIso = it.timestamp;
    }
  }
  return bestIso ? yearMonthFromTimestamp(bestIso) : null;
}

export function getEarliestDataYearMonth(entries: Entry[], journals: Journal[]): YearMonth | null {
  let minTs = Infinity;
  let bestIso: string | null = null;
  for (const it of [...entries, ...journals]) {
    const t = new Date(it.timestamp).getTime();
    if (!Number.isNaN(t) && t < minTs) {
      minTs = t;
      bestIso = it.timestamp;
    }
  }
  return bestIso ? yearMonthFromTimestamp(bestIso) : null;
}

/**
 * Persist first-seen join month once. If missing, seed from earliest capture month or current month.
 */
export async function getOrInitCalendarJoinMonth(entries: Entry[], journals: Journal[]): Promise<YearMonth> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as YearMonth;
      if (
        typeof parsed?.year === 'number' &&
        typeof parsed?.monthIndex0 === 'number' &&
        parsed.monthIndex0 >= 0 &&
        parsed.monthIndex0 <= 11
      ) {
        return parsed;
      }
    }
  } catch {
    /* fall through to init */
  }
  const initial = getEarliestDataYearMonth(entries, journals) ?? currentYearMonth();
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
  } catch {
    /* still return initial */
  }
  return initial;
}

/** Inclusive list from start through end (chronological). If start after end, returns [end]. */
export function enumerateMonthsInclusive(start: YearMonth, end: YearMonth): YearMonth[] {
  if (toIndex(start) > toIndex(end)) {
    return [{ ...end }];
  }
  const out: YearMonth[] = [];
  let y = start.year;
  let m = start.monthIndex0;
  const endIdx = toIndex(end);
  while (toIndex({ year: y, monthIndex0: m }) <= endIdx) {
    out.push({ year: y, monthIndex0: m });
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return out;
}

/** Full calendar scroll start: older of persisted join month vs latest memory month. */
export function computeFullCalendarStartMonth(
  joinMonth: YearMonth,
  latestMemoryMonth: YearMonth | null
): YearMonth {
  if (!latestMemoryMonth) return joinMonth;
  return minYearMonth(joinMonth, latestMemoryMonth);
}
