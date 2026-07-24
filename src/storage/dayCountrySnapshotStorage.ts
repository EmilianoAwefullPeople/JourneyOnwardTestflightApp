import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_PREFIX = 'dashboard_day_country_v1:';

export interface DayCountrySnapshot {
  country: string;
  savedAt: string;
}

function storageKey(dayKey: string): string {
  return `${KEY_PREFIX}${dayKey}`;
}

export async function getDayCountrySnapshot(dayKey: string): Promise<DayCountrySnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(dayKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DayCountrySnapshot;
    if (typeof parsed?.country !== 'string' || typeof parsed?.savedAt !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function setDayCountrySnapshot(dayKey: string, country: string): Promise<void> {
  const payload: DayCountrySnapshot = {
    country,
    savedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(storageKey(dayKey), JSON.stringify(payload));
}

/** Assign the same country to multiple days in one write (e.g. drag range-select). */
export async function setDayCountrySnapshotsBatch(dayKeys: string[], country: string): Promise<void> {
  if (dayKeys.length === 0) return;
  const savedAt = new Date().toISOString();
  const payload = JSON.stringify({ country, savedAt } satisfies DayCountrySnapshot);
  await AsyncStorage.multiSet(dayKeys.map((dayKey) => [storageKey(dayKey), payload]));
}

/** Load snapshots for inclusive dayKey range (lexicographic works for Y-M-D with fixed-width... our keys are not zero-padded - careful). */
export async function getDayCountrySnapshotsForDayKeys(dayKeys: string[]): Promise<Record<string, string>> {
  if (dayKeys.length === 0) return {};
  try {
    const keys = dayKeys.map(storageKey);
    const pairs = await AsyncStorage.multiGet(keys);
    const out: Record<string, string> = {};
    pairs.forEach(([storageK, value]) => {
      if (!value || !storageK.startsWith(KEY_PREFIX)) return;
      const dayKey = storageK.slice(KEY_PREFIX.length);
      try {
        const parsed = JSON.parse(value) as DayCountrySnapshot;
        if (typeof parsed?.country === 'string' && parsed.country.trim()) {
          out[dayKey] = parsed.country.trim();
        }
      } catch {
        /* skip */
      }
    });
    return out;
  } catch {
    return {};
  }
}

/**
 * Remove snapshot keys older than `monthsBack` months from today (local), to cap storage growth.
 */
export async function pruneDayCountrySnapshotsOlderThan(monthsBack: number): Promise<void> {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - monthsBack);
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const toRemove: string[] = [];
    for (const k of allKeys) {
      if (!k.startsWith(KEY_PREFIX)) continue;
      const dayKey = k.slice(KEY_PREFIX.length);
      const parts = dayKey.split('-').map(Number);
      if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) continue;
      const [y, m0, d] = parts;
      const dt = new Date(y, m0, d);
      if (Number.isNaN(dt.getTime())) continue;
      if (dt < cutoff) toRemove.push(k);
    }
    if (toRemove.length > 0) {
      await AsyncStorage.multiRemove(toRemove);
    }
  } catch {
    /* soft-fail */
  }
}
