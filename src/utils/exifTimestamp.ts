// Parses EXIF datetime fields to Unix ms.
// Handles iOS '{Exif}' nested dict and flat top-level keys.
// EXIF datetime string format: "YYYY:MM:DD HH:MM:SS"

export function parseExifDateTimeToMs(exif: Record<string, unknown> | null | undefined): number | null {
  if (!exif || typeof exif !== 'object') return null;

  // iOS CIImage.properties nests EXIF data under '{Exif}'; flat layout is the Android/standard format.
  const iosExif = exif['{Exif}'];
  const inner = (iosExif != null && typeof iosExif === 'object')
    ? (iosExif as Record<string, unknown>)
    : exif;

  const value =
    inner['DateTimeOriginal'] ??
    inner['DateTimeDigitized'] ??
    inner['DateTime'] ??
    exif['DateTimeOriginal'] ??
    exif['DateTime'];

  if (typeof value !== 'string') return null;

  // Normalize "2023:07:14 15:32:11" → "2023-07-14T15:32:11"
  const trimmed = value.trim().substring(0, 19);
  if (trimmed.length < 19) return null;
  const normalized = trimmed.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');

  const ms = Date.parse(normalized);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}
