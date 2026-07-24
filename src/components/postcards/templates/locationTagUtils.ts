import type { Entry } from '../../../models/Entry';

/**
 * Pure helpers shared between T04LocationTagTemplate and PostcardEditorScreen's
 * location/date tag picker. Kept dependency-free of the template component so the editor
 * can import this at module scope without eagerly loading the template tree.
 */

export type LocationTagMode = 'location' | 'date';
export type LocationGranularity = 'place' | 'country';

export const LOCATION_TAG_MODES: { key: LocationTagMode; label: string; icon: 'location-outline' | 'calendar-outline' }[] = [
  { key: 'location', label: 'Location', icon: 'location-outline' },
  { key: 'date', label: 'Date', icon: 'calendar-outline' },
];

export const LOCATION_GRANULARITIES: { key: LocationGranularity; label: string }[] = [
  { key: 'place', label: 'Place' },
  { key: 'country', label: 'Country' },
];

function hasLocationData(entry: Entry | null | undefined): boolean {
  return !!(entry?.city || entry?.country);
}

/** The user's explicit tag-mode choice from templateData, or undefined if never set. */
export function parseTagModeOverride(
  templateData: Record<string, unknown> | undefined
): LocationTagMode | undefined {
  const raw = templateData?.locationTagMode;
  return raw === 'location' || raw === 'date' ? raw : undefined;
}

/**
 * Effective tag mode to render: respects the user's explicit choice (defaulting to
 * 'location'), but falls back to 'date' whenever there's no place/country to show.
 */
export function resolveTagMode(
  entry: Entry | null | undefined,
  templateData: Record<string, unknown> | undefined
): LocationTagMode {
  const wantsLocation = (parseTagModeOverride(templateData) ?? 'location') === 'location';
  return wantsLocation && hasLocationData(entry) ? 'location' : 'date';
}

export function parseLocationGranularity(
  templateData: Record<string, unknown> | undefined
): LocationGranularity {
  return templateData?.locationGranularity === 'country' ? 'country' : 'place';
}

function placeText(entry: Entry): string {
  return entry.city || entry.country || '';
}

function countryText(entry: Entry): string {
  return entry.country || entry.city || '';
}

/** Format a timestamp as "May 14, 2025" */
export function formatTagDate(timestamp: string | undefined): string {
  if (!timestamp) return '';
  try {
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

export interface LocationTagContent {
  text: string;
  icon: 'location' | 'calendar-outline';
}

/** Resolves the full tag content (text + icon) to render on the card for a given entry. */
export function getLocationTagContent(
  entry: Entry | null | undefined,
  templateData: Record<string, unknown> | undefined
): LocationTagContent {
  if (resolveTagMode(entry, templateData) === 'location' && entry) {
    const granularity = parseLocationGranularity(templateData);
    return { text: granularity === 'country' ? countryText(entry) : placeText(entry), icon: 'location' };
  }
  return { text: formatTagDate(entry?.timestamp), icon: 'calendar-outline' };
}
