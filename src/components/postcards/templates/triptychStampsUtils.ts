import type { Entry } from '../../../models/Entry';
import {
  entryAltString,
  entryDestination,
  entrySeasonString,
  entryTempString,
  entryWeatherString,
} from './sharedTypes';

/**
 * Pure helpers shared between T06VerticalTriptychTemplate and PostcardEditorScreen's
 * data-category picker. Kept dependency-free of the template component so the editor
 * can import this at module scope without eagerly loading the template tree.
 */

export type TriptychDataCategory =
  | 'temperature'
  | 'altitude'
  | 'weather'
  | 'season'
  | 'location';

export const TRIPTYCH_DATA_CATEGORIES = [
  { key: 'temperature' as const, label: 'Temperature', icon: 'thermometer-outline' as const },
  { key: 'weather' as const, label: 'Weather', icon: 'partly-sunny-outline' as const },
  { key: 'season' as const, label: 'Season', icon: 'leaf-outline' as const },
  { key: 'altitude' as const, label: 'Altitude', icon: 'trending-up-outline' as const },
  { key: 'location' as const, label: 'Location', icon: 'location-outline' as const },
];

const VALID_CATEGORIES = new Set<string>(TRIPTYCH_DATA_CATEGORIES.map((c) => c.key));

export function parseDataCategory(
  templateData: Record<string, unknown> | undefined
): TriptychDataCategory {
  const raw = templateData?.dataCategory;
  if (typeof raw === 'string' && VALID_CATEGORIES.has(raw)) {
    return raw as TriptychDataCategory;
  }
  return 'temperature';
}

/** Value for the selected category only (no fallback to other categories). */
export function getStripTextForCategory(
  entry: Entry | null | undefined,
  category: TriptychDataCategory
): string {
  if (!entry) return '';
  switch (category) {
    case 'temperature':
      return entryTempString(entry) ?? '';
    case 'altitude':
      return entryAltString(entry) ?? '';
    case 'weather':
      return entryWeatherString(entry) ?? '';
    case 'season':
      return entrySeasonString(entry) ?? '';
    case 'location':
      return entryDestination(entry);
    default:
      return '';
  }
}
