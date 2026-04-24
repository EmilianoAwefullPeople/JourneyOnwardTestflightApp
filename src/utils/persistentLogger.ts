// persistentLogger
// Writes error-level log lines to AsyncStorage so they survive app restarts and
// are readable in the Diagnostics panel on TestFlight builds.
// Keeps only the last MAX_ENTRIES lines (ring-buffer behaviour via simple trimming).

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@awefull_people:persistent_logs';
const MAX_ENTRIES = 100;

function formatLine(args: unknown[]): string {
  const ts = new Date().toISOString();
  const parts = args.map((a) => {
    if (typeof a === 'string') return a;
    try {
      return JSON.stringify(a);
    } catch {
      return String(a);
    }
  });
  return `${ts} ${parts.join(' ')}`;
}

async function append(line: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const existing: string[] = raw ? JSON.parse(raw) : [];
    const next = [...existing, line].slice(-MAX_ENTRIES);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Never throw — logging must not crash the app
  }
}

export async function getPersistentLogs(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function clearPersistentLogs(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Call this for log lines you want persisted across launches (errors, audit results).
 * Safe to call from any context — failures are silently swallowed.
 */
export function persistLog(...args: unknown[]): void {
  append(formatLine(args)).catch(() => {});
}
