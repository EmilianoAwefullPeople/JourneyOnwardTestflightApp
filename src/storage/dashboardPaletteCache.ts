// dashboardPaletteCache
// Persists computed dashboard color palettes to AsyncStorage keyed by scope.
// Scope is either 'all' (all-time) or a TripAlbum ID.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

export interface CachedDashboardPalette {
  colors: string[];       // 8–12 hex strings, most dominant first
  photoCount: number;     // number of photos that contributed
  entryCount: number;     // number of entries with palettes that contributed
  contentHash: string;    // djb2 fingerprint of all contributing entry IDs + palettes
  scope: string;          // 'all' or albumId
  computedAt: string;     // ISO timestamp
}

const KEY_PREFIX = '@awefull_people:dashboard_palette:';

function scopeKey(scope: string): string {
  return KEY_PREFIX + scope;
}

function isValidCached(obj: unknown): obj is CachedDashboardPalette {
  if (!obj || typeof obj !== 'object') return false;
  const c = obj as Record<string, unknown>;
  return (
    Array.isArray(c.colors) &&
    typeof c.contentHash === 'string' &&
    typeof c.scope === 'string' &&
    typeof c.computedAt === 'string'
  );
}

export async function loadCachedPalette(scope: string): Promise<CachedDashboardPalette | null> {
  try {
    const raw = await AsyncStorage.getItem(scopeKey(scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isValidCached(parsed) ? parsed : null;
  } catch (err) {
    logger.warn('dashboardPaletteCache: load failed', err);
    return null;
  }
}

export async function saveCachedPalette(scope: string, data: CachedDashboardPalette): Promise<void> {
  try {
    await AsyncStorage.setItem(scopeKey(scope), JSON.stringify(data));
  } catch (err) {
    logger.warn('dashboardPaletteCache: save failed', err);
  }
}

export async function clearCachedPalette(scope: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(scopeKey(scope));
  } catch (err) {
    logger.warn('dashboardPaletteCache: clear failed', err);
  }
}

/** Clears all dashboard palette cache entries. Call from resetApp. */
export async function clearAllCachedPalettes(): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const paletteKeys = allKeys.filter(k => k.startsWith(KEY_PREFIX));
    if (paletteKeys.length > 0) {
      await AsyncStorage.multiRemove(paletteKeys);
    }
  } catch (err) {
    logger.warn('dashboardPaletteCache: clearAll failed', err);
  }
}
