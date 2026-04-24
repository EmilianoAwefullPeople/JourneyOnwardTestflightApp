// importLatestStorage
// Persists media library asset IDs that have already been imported so we can filter duplicates.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from './logger';

export const IMPORT_LATEST_IMPORTED_IDS_KEY = '@awefull_people:import_latest_imported_asset_ids';

const MAX_STORED_IDS = 1000;

/**
 * Returns the set of asset IDs that have already been used in an imported entry.
 */
export async function getImportedAssetIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(IMPORT_LATEST_IMPORTED_IDS_KEY);
    if (raw == null || raw === '') return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string'));
  } catch (e) {
    logger.warn('importLatestStorage: getImportedAssetIds failed', e);
    return new Set();
  }
}

/**
 * Appends the given asset IDs to the stored list and persists.
 * Evicts oldest entries if over MAX_STORED_IDS.
 */
export async function addImportedAssetIds(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const existing = await getImportedAssetIds();
    ids.forEach((id) => existing.add(id));
    const arr = Array.from(existing);
    const toStore = arr.length > MAX_STORED_IDS ? arr.slice(-MAX_STORED_IDS) : arr;
    await AsyncStorage.setItem(IMPORT_LATEST_IMPORTED_IDS_KEY, JSON.stringify(toStore));
  } catch (e) {
    logger.warn('importLatestStorage: addImportedAssetIds failed', e);
  }
}
