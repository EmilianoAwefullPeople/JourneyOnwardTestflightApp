// assetLocationCache
// Persists MediaLibrary asset ID → {lat, lng} mappings in AsyncStorage so
// getAssetInfoAsync is not called twice per asset across import sessions.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

const CACHE_KEY = 'asset_location_cache_v1';
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

type CacheEntry = { lat: number; lng: number; ts: number };
type CacheMap = Record<string, CacheEntry>;

let _inMemory: CacheMap | null = null;

async function loadCache(): Promise<CacheMap> {
  if (_inMemory) return _inMemory;
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    _inMemory = raw ? (JSON.parse(raw) as CacheMap) : {};
  } catch {
    _inMemory = {};
  }
  return _inMemory;
}

async function saveCache(map: CacheMap): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(map));
  } catch (e) {
    logger.warn('assetLocationCache: save failed', e);
  }
}

function evictExpired(map: CacheMap): void {
  const cutoff = Date.now() - TTL_MS;
  for (const key of Object.keys(map)) {
    if (map[key].ts < cutoff) delete map[key];
  }
}

/**
 * Batch-reads cached locations for an array of asset IDs.
 * Returns a Map of id → {lat, lng} for IDs that have a non-expired cache hit.
 */
export async function getAssetLocations(
  assetIds: string[]
): Promise<Map<string, { lat: number; lng: number }>> {
  const map = await loadCache();
  const result = new Map<string, { lat: number; lng: number }>();
  const now = Date.now();
  for (const id of assetIds) {
    const entry = map[id];
    if (entry && now - entry.ts < TTL_MS) {
      result.set(id, { lat: entry.lat, lng: entry.lng });
    }
  }
  return result;
}

/**
 * Batch-writes asset ID → location mappings and persists to AsyncStorage.
 * Evicts expired entries before writing.
 */
export async function setAssetLocations(
  entries: Array<{ id: string; lat: number; lng: number }>
): Promise<void> {
  if (entries.length === 0) return;
  const map = await loadCache();
  evictExpired(map);
  const ts = Date.now();
  for (const { id, lat, lng } of entries) {
    map[id] = { lat, lng, ts };
  }
  await saveCache(map);
}
