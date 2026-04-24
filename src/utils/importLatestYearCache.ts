import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from './logger';

const CACHE_KEY = '@awefull_people:import_latest_year_availability_v1';

export interface ImportLatestYearAvailabilitySignature {
  newestAssetId?: string;
  newestCreationTimeMs?: number;
  estimatedTotal?: number;
}

export interface ImportLatestYearAvailabilityCachePayload {
  version: 1;
  years: number[];
  computedAt: number;
  signature: ImportLatestYearAvailabilitySignature;
}

export async function loadYearAvailabilityCache(): Promise<ImportLatestYearAvailabilityCachePayload | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ImportLatestYearAvailabilityCachePayload>;
    if (
      parsed?.version !== 1 ||
      !Array.isArray(parsed.years) ||
      typeof parsed.computedAt !== 'number' ||
      !parsed.signature
    ) {
      return null;
    }
    const years = parsed.years.filter((year): year is number => Number.isInteger(year));
    return {
      version: 1,
      years,
      computedAt: parsed.computedAt,
      signature: parsed.signature,
    };
  } catch (error) {
    logger.warn('importLatestYearCache: load failed', error);
    return null;
  }
}

export async function saveYearAvailabilityCache(
  payload: ImportLatestYearAvailabilityCachePayload
): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch (error) {
    logger.warn('importLatestYearCache: save failed', error);
  }
}

export async function clearYearAvailabilityCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_KEY);
  } catch (error) {
    logger.warn('importLatestYearCache: clear failed', error);
  }
}

