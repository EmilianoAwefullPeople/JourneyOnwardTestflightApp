import { Entry } from '../models/Entry';
import { Journal } from '../models/Journal';
import { dayKeyFromTimestampIso } from './dayKeyUtils';

/** Rounded coord key; must match DashboardSection country geocode bucketing. */
export function calendarCoordKey(lat: number, lng: number): string {
  return `${lat.toFixed(2)},${lng.toFixed(2)}`;
}

/**
 * Per local calendar day, country from geo-tagged captures only.
 * When multiple items fall on the same day, the most recent by `timestamp` wins.
 */
export function buildCaptureCountryByDayKey(
  entries: Entry[],
  journals: Journal[],
  countryByCoord: Record<string, string>
): Record<string, string> {
  type Best = { country: string; time: number };
  const best = new Map<string, Best>();

  const consider = (timestamp: string, lat: number | null | undefined, lng: number | null | undefined) => {
    if (lat == null || lng == null) return;
    const dayKey = dayKeyFromTimestampIso(timestamp);
    if (!dayKey) return;
    const ck = calendarCoordKey(lat, lng);
    const country = countryByCoord[ck];
    if (!country?.trim()) return;
    const t = new Date(timestamp).getTime();
    if (Number.isNaN(t)) return;
    const prev = best.get(dayKey);
    if (!prev || t >= prev.time) {
      best.set(dayKey, { country: country.trim(), time: t });
    }
  };

  const considerEntry = (e: Entry) => {
    const persisted = e.country?.trim();
    if (persisted) {
      const dayKey = dayKeyFromTimestampIso(e.timestamp);
      if (!dayKey) return;
      const t = new Date(e.timestamp).getTime();
      if (Number.isNaN(t)) return;
      const prev = best.get(dayKey);
      if (!prev || t >= prev.time) {
        best.set(dayKey, { country: persisted, time: t });
      }
      return;
    }
    consider(e.timestamp, e.latitude, e.longitude);
  };

  entries.forEach((e) => considerEntry(e));
  journals.forEach((j) => consider(j.timestamp, j.latitude, j.longitude));

  const out: Record<string, string> = {};
  best.forEach((v, k) => {
    out[k] = v.country;
  });
  return out;
}

/** Captures override app-open snapshots; unknown cells use null (render as bullet). */
export function buildMergedDayCountryDisplay(
  dayKeysInRange: string[],
  captureByDay: Record<string, string>,
  snapshotByDay: Record<string, string>
): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const dk of dayKeysInRange) {
    if (captureByDay[dk]) out[dk] = captureByDay[dk];
    else if (snapshotByDay[dk]) out[dk] = snapshotByDay[dk];
    else out[dk] = null;
  }
  return out;
}
