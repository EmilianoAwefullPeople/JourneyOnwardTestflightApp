import { Entry } from '../../../models/Entry';
import { PostcardPhotoTransform } from '../../../models/Postcard';

export interface TemplateSlot {
  photoUri: string | null;
  transform: PostcardPhotoTransform;
  resetKey: number;
  entry: Entry | null;
}

export interface TemplateBaseProps {
  slots: TemplateSlot[];
  onSlotPress?: (slotIndex: number) => void;
  onTransformChange?: (slotIndex: number, t: PostcardPhotoTransform) => void;
  onResetSlotFraming?: (slotIndex: number) => void;
  templateData?: Record<string, unknown>;
  onTemplateDataChange?: (data: Record<string, unknown>) => void;
  aspectRatio?: number;
  editingChromeSuppressed?: boolean;
  previewMode?: boolean;
  /** Scales fixed internal dimensions (padding, fonts, borders) for thumbnail rendering. */
  scale?: number;
  /** Full in-memory entries list, for templates that need more than just their own slots
   *  (e.g. the Month Calendar template building a day-by-day country map for a chosen month). */
  allEntries?: Entry[];
}

// ---------------------------------------------------------------------------
// Date / text helpers
// ---------------------------------------------------------------------------

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

/** Format a timestamp as "Sunday, March 22nd" */
export function formatLongDate(timestamp: string | undefined): string {
  if (!timestamp) return '';
  try {
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return '';
    const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
    const monthName = d.toLocaleDateString('en-US', { month: 'long' });
    const day = d.getDate();
    return `${dayName}, ${monthName} ${ordinal(day)}`;
  } catch {
    return '';
  }
}

/** Format a timestamp as "DD MM YYYY" (camera-style) */
export function formatCameraDate(timestamp: string | undefined): string {
  if (!timestamp) return '';
  try {
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = String(d.getFullYear());
    return `${dd} ${mm} ${yyyy}`;
  } catch {
    return '';
  }
}

/** Format a timestamp as "M/D/YY, h:mm AM/PM" (Notes-style) */
export function formatNotesDate(timestamp: string | undefined): string {
  if (!timestamp) return '';
  try {
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '';
  }
}

/** Format a timestamp as "H:mm AM/PM" */
export function formatTime(timestamp: string | undefined): string {
  if (!timestamp) return '';
  try {
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '';
  }
}

/** Format a timestamp as "May '26" */
export function formatShortMonthYear(timestamp: string | undefined): string {
  if (!timestamp) return '';
  try {
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return '';
    const month = d.toLocaleDateString('en-US', { month: 'short' });
    const year = String(d.getFullYear()).slice(2);
    return `${month} '${year}`;
  } catch {
    return '';
  }
}

/** Get the best destination string from an entry (city || country || '') */
export function entryDestination(entry: Entry | null | undefined): string {
  if (!entry) return '';
  return entry.city || entry.country || '';
}

/** Get temperature string from entry, e.g. "18°C" */
export function entryTempString(entry: Entry | null | undefined): string | null {
  if (!entry || entry.temperatureCelsius == null) return null;
  return `${Math.round(entry.temperatureCelsius)}°C`;
}

/** Get altitude string from entry, e.g. "1,840m" */
export function entryAltString(entry: Entry | null | undefined): string | null {
  if (!entry || entry.altitudeMeters == null) return null;
  return `${Math.round(entry.altitudeMeters).toLocaleString()}m`;
}

/** Get weather string from entry (capitalized) */
export function entryWeatherString(entry: Entry | null | undefined): string | null {
  if (!entry || !entry.weather) return null;
  const w = entry.weather.trim();
  if (!w) return null;
  return w.charAt(0).toUpperCase() + w.slice(1);
}

/** Get season string from entry (capitalized) */
export function entrySeasonString(entry: Entry | null | undefined): string | null {
  if (!entry || !entry.season) return null;
  return entry.season.charAt(0).toUpperCase() + entry.season.slice(1);
}
