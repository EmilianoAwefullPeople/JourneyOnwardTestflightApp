// exifUtils
// Safe parsing of EXIF metadata for use in entries (e.g. altitude).
// normalizeExifForMetadata makes EXIF keys consistent across platforms (PascalCase vs lowercase, iOS nested vs flat).

/** Standard PascalCase GPS EXIF keys used internally throughout the app. */
const GPS_KEYS = [
  'GPSLatitude',
  'GPSLongitude',
  'GPSLatitudeRef',
  'GPSLongitudeRef',
  'GPSAltitude',
  'GPSAltitudeRef',
] as const;

/**
 * Maps iOS '{GPS}' sub-dict plain key names to standard PascalCase GPS EXIF key names.
 * iOS CIImage.properties stores GPS data under '{GPS}' with plain keys (Latitude, Longitude, etc.).
 */
const IOS_GPS_KEY_MAP: Record<string, string> = {
  Latitude: 'GPSLatitude',
  LatitudeRef: 'GPSLatitudeRef',
  Longitude: 'GPSLongitude',
  LongitudeRef: 'GPSLongitudeRef',
  Altitude: 'GPSAltitude',
  AltitudeRef: 'GPSAltitudeRef',
};

/**
 * Returns an EXIF-like object with standard PascalCase GPS keys, so parsers that expect
 * GPSLatitude / GPSAltitude etc. work across all platforms:
 *
 *  - iOS (CIImage.properties): GPS data nested under '{GPS}' sub-dict with plain keys
 *    e.g. exif['{GPS}'].Latitude → out.GPSLatitude
 *  - Android / standard EXIF: GPS keys at top level, possibly lowercase (gpsLatitude)
 *    e.g. exif.GPSLatitude or exif.gpsLatitude → out.GPSLatitude
 *
 * Returns null if exif is missing or no GPS data found.
 */
export function normalizeExifForMetadata(
  exif: object | null | undefined
): Record<string, unknown> | null {
  if (!exif || typeof exif !== 'object') return null;
  const raw = exif as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  let hasAny = false;

  // 1. iOS nested '{GPS}' sub-dict (highest priority — platform-native data)
  const iosGps = raw['{GPS}'];
  if (iosGps != null && typeof iosGps === 'object') {
    const g = iosGps as Record<string, unknown>;
    for (const [iosKey, standardKey] of Object.entries(IOS_GPS_KEY_MAP)) {
      const value = g[iosKey];
      if (value !== undefined && value !== null) {
        out[standardKey] = value;
        hasAny = true;
      }
    }
  }

  // 2. Standard top-level keys: try PascalCase (GPSLatitude) and fully-lowercase (gpslatitude)
  //    This covers Android and any platform that normalizes to flat EXIF before returning.
  for (const pascal of GPS_KEYS) {
    if (out[pascal] !== undefined) continue; // already populated from iOS sub-dict
    const fullyLower = pascal.toLowerCase(); // e.g. 'gpslatitude'
    const value = raw[pascal] ?? raw[fullyLower];
    if (value !== undefined && value !== null) {
      out[pascal] = value;
      hasAny = true;
    }
  }

  return hasAny ? out : null;
}

/**
 * Resolves the raw altitude value from a normalized or unnormalized EXIF record.
 * Checks both top-level GPSAltitude and iOS '{GPS}'.Altitude.
 */
function resolveRawAltitude(record: Record<string, unknown>): { raw: number; ref: unknown } | null {
  // Top-level (standard / already normalized)
  let alt = record.GPSAltitude;
  let ref = record.GPSAltitudeRef;

  // iOS nested fallback
  if (alt == null) {
    const iosGps = record['{GPS}'];
    if (iosGps != null && typeof iosGps === 'object') {
      const g = iosGps as Record<string, unknown>;
      alt = g.Altitude;
      ref = g.AltitudeRef;
    }
  }

  let raw: number | undefined;
  if (typeof alt === 'number' && Number.isFinite(alt)) {
    raw = alt;
  } else if (typeof alt === 'string') {
    const parsed = parseFloat(alt);
    if (Number.isFinite(parsed)) raw = parsed;
  } else if (alt != null && typeof alt === 'object') {
    const rational = alt as Record<string, unknown>;
    const num = Number(rational.Numerator ?? rational.numerator);
    const den = Number(rational.Denominator ?? rational.denominator);
    if (Number.isFinite(num) && Number.isFinite(den) && den !== 0) raw = num / den;
  }

  if (raw == null || !Number.isFinite(raw)) return null;
  return { raw, ref };
}

/**
 * Parses altitude in meters from EXIF object, if present.
 * Handles GPSAltitude (number, string, or rational) and GPSAltitudeRef (0 = above, 1 = below sea level).
 * Also handles iOS '{GPS}'.Altitude nested format.
 * Returns undefined if missing or malformed (no throw).
 */
export function getAltitudeMetersFromExif(exif?: object | null): number | undefined {
  if (!exif || typeof exif !== 'object') return undefined;
  const record = exif as Record<string, unknown>;
  const resolved = resolveRawAltitude(record);
  if (!resolved) return undefined;
  const { raw, ref } = resolved;
  const belowSea = ref === 1 || ref === '1' || ref === 3 || ref === '3';
  const meters = belowSea ? -Math.abs(raw) : Math.abs(raw);
  return Number.isFinite(meters) ? meters : undefined;
}
