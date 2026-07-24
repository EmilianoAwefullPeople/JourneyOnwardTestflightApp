import { enumerateMonthsInclusive, type YearMonth } from '../../../storage/calendarJoinMonthStorage';

/**
 * Pure helpers shared between T07MonthCalendarTemplate and PostcardEditorScreen's date-range
 * picker. Kept dependency-free (no gesture-handler/photo-slot imports) so PostcardEditorScreen
 * can import this at module scope without eagerly loading the template component tree — every
 * template component is otherwise lazy-`require()`d on purpose.
 */

export const RANGE_MIN_DAYS = 7;
export const RANGE_MAX_DAYS = 40;

export interface DateRange {
  /** Local date-only ISO strings ("YYYY-MM-DD"), inclusive on both ends. */
  start: string;
  end: string;
}

export function toDateOnlyIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDateOnlyIso(s: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!match) return null;
  const dt = new Date(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function daysBetweenInclusive(start: Date, end: Date): number {
  const ms = startOfDay(end).getTime() - startOfDay(start).getTime();
  return Math.round(ms / 86400000) + 1;
}

export function defaultDateRange(): DateRange {
  const today = startOfDay(new Date());
  return { start: toDateOnlyIso(today), end: toDateOnlyIso(addDays(today, RANGE_MIN_DAYS - 1)) };
}

/** Reads templateData's saved range, falling back to a default 7-day range starting today
 *  when unset or invalid (wrong shape, end before start, or outside the 7-40 day bounds). */
export function parseSelectedRange(templateData: Record<string, unknown> | undefined): DateRange {
  const rawStart = templateData?.rangeStart;
  const rawEnd = templateData?.rangeEnd;
  if (typeof rawStart === 'string' && typeof rawEnd === 'string') {
    const s = parseDateOnlyIso(rawStart);
    const e = parseDateOnlyIso(rawEnd);
    if (s && e && e >= s) {
      const len = daysBetweenInclusive(s, e);
      if (len >= RANGE_MIN_DAYS && len <= RANGE_MAX_DAYS) {
        return { start: rawStart, end: rawEnd };
      }
    }
  }
  return defaultDateRange();
}

export function buildRangeTemplateData(
  prev: Record<string, unknown> | undefined,
  start: Date,
  end: Date
): Record<string, unknown> {
  return { ...prev, rangeStart: toDateOnlyIso(start), rangeEnd: toDateOnlyIso(end) };
}

/** Keeps `end` within [start + 6 days, start + 39 days] (7-40 day range, inclusive). */
export function clampEndToRange(start: Date, end: Date): Date {
  const minEnd = addDays(start, RANGE_MIN_DAYS - 1);
  const maxEnd = addDays(start, RANGE_MAX_DAYS - 1);
  if (end < minEnd) return minEnd;
  if (end > maxEnd) return maxEnd;
  return end;
}

/** Every calendar month the range touches, in chronological order. */
export function monthsTouchedByRange(range: DateRange): YearMonth[] {
  const start = parseDateOnlyIso(range.start) ?? new Date();
  const end = parseDateOnlyIso(range.end) ?? start;
  return enumerateMonthsInclusive(
    { year: start.getFullYear(), monthIndex0: start.getMonth() },
    { year: end.getFullYear(), monthIndex0: end.getMonth() }
  );
}

/** Format like "May 1 – May 7, 2026" (or "May 28 – Jun 5, 2026" across months). */
export function formatDateRangeLabel(range: DateRange): string {
  const start = parseDateOnlyIso(range.start);
  const end = parseDateOnlyIso(range.end);
  if (!start || !end) return '';
  const startLabel = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const endLabel = end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return `${startLabel} – ${endLabel}`;
}
