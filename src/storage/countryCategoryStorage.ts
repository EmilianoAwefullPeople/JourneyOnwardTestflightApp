// Per-country visit category (Home / Lived in / Visited / Layover), keyed by
// ISO 3166-1 alpha-2 code. Optional — any visited country with no stored
// category defaults to 'visited'. Single AsyncStorage key since the value set
// is small (at most a few dozen countries).

import AsyncStorage from '@react-native-async-storage/async-storage';

export type CountryVisitCategory = 'home' | 'livedIn' | 'visited' | 'layover';

const STORAGE_KEY = 'country_visit_categories_v1';

export async function getCountryCategories(): Promise<Record<string, CountryVisitCategory>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, CountryVisitCategory>;
  } catch {
    return {};
  }
}

export async function setCountryCategory(isoCode: string, category: CountryVisitCategory): Promise<void> {
  const current = await getCountryCategories();
  const next = { ...current, [isoCode]: category };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

/** Removes the stored override so the country falls back to the default 'visited' category. */
export async function clearCountryCategory(isoCode: string): Promise<void> {
  const current = await getCountryCategories();
  if (!(isoCode in current)) return;
  const next = { ...current };
  delete next[isoCode];
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}
