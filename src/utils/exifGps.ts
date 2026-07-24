// exifGps
// Converts EXIF GPS fields (DMS or decimal) to decimal degrees for accurate location from photo metadata.

const LAT_MIN = -90;
const LAT_MAX = 90;
const LNG_MIN = -180;
const LNG_MAX = 180;

type Rational = { numerator?: number; denominator?: number };

/**
 * Converts a single DMS component to a number. Handles plain numbers or rationals { numerator, denominator }.
 */
function parseDmsComponent(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'object' && 'numerator' in value && 'denominator' in value) {
    const r = value as Rational;
    const num = Number(r.numerator);
    const den = Number(r.denominator);
    if (Number.isFinite(num) && Number.isFinite(den) && den !== 0) return num / den;
    return null;
  }
  if (typeof value === 'string') {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Converts degrees, minutes, seconds to decimal degrees.
 * decimal = degrees + minutes/60 + seconds/3600
 */
function dmsToDecimal(degrees: number, minutes: number, seconds: number): number {
  return degrees + minutes / 60 + seconds / 3600;
}

/**
 * Applies EXIF latitude/longitude reference: South => negate lat, West => negate lng.
 */
function applyRef(coord: number, ref: unknown): number {
  if (coord === 0) return 0;
  const refStr = typeof ref === 'string' ? ref.trim().toUpperCase() : '';
  if (refStr === 'S' || refStr === 'W') return -coord;
  return coord;
}

/**
 * Parses EXIF GPS value that may be decimal or DMS (array of 3 components).
 * Returns a single decimal number or null.
 */
function parseGpsCoordinate(
  value: unknown,
  ref: unknown
): number | null {
  if (value == null) return null;

  // Already decimal
  if (typeof value === 'number' && Number.isFinite(value)) {
    const applied = applyRef(value, ref);
    return applied;
  }

  // DMS: array of [degrees, minutes, seconds] (each may be number or rational)
  if (Array.isArray(value) && value.length >= 3) {
    const d = parseDmsComponent(value[0]);
    const m = parseDmsComponent(value[1]);
    const s = parseDmsComponent(value[2]);
    if (d == null || m == null || s == null) return null;
    const decimal = dmsToDecimal(d, m, s);
    return applyRef(decimal, ref);
  }

  // String that might be "deg, min, sec" or single number
  if (typeof value === 'string') {
    const parts = value.split(',').map((p) => parseFloat(p.trim())).filter(Number.isFinite);
    if (parts.length >= 3) {
      const decimal = dmsToDecimal(parts[0], parts[1], parts[2]);
      return applyRef(decimal, ref);
    }
    const single = parseFloat(value);
    if (Number.isFinite(single)) return applyRef(single, ref);
  }

  return null;
}

function isValidLatitude(lat: number): boolean {
  return Number.isFinite(lat) && lat >= LAT_MIN && lat <= LAT_MAX;
}

function isValidLongitude(lng: number): boolean {
  return Number.isFinite(lng) && lng >= LNG_MIN && lng <= LNG_MAX;
}

/**
 * Normalizes EXIF GPS data from either iOS nested format or standard flat format into a consistent
 * flat record with GPSLatitude / GPSLongitude / GPSLatitudeRef / GPSLongitudeRef keys.
 *
 * iOS format (CIImage.properties): GPS data lives under a '{GPS}' sub-dictionary with plain keys
 *   e.g. { '{GPS}': { Latitude: 37.77, LatitudeRef: 'N', Longitude: -122.4, LongitudeRef: 'W' } }
 * Android / standard EXIF format: GPS keys are at the top level
 *   e.g. { GPSLatitude: 37.77, GPSLatitudeRef: 'N', ... }
 */
function resolveGpsDict(exif: Record<string, unknown>): Record<string, unknown> {
  const iosGps = exif['{GPS}'];
  if (iosGps != null && typeof iosGps === 'object') {
    const g = iosGps as Record<string, unknown>;
    // Merge iOS GPS sub-dict (remapped to standard keys) on top of any existing top-level keys.
    return {
      ...exif,
      GPSLatitude: g.Latitude ?? exif.GPSLatitude,
      GPSLatitudeRef: g.LatitudeRef ?? exif.GPSLatitudeRef,
      GPSLongitude: g.Longitude ?? exif.GPSLongitude,
      GPSLongitudeRef: g.LongitudeRef ?? exif.GPSLongitudeRef,
      GPSAltitude: g.Altitude ?? exif.GPSAltitude,
      GPSAltitudeRef: g.AltitudeRef ?? exif.GPSAltitudeRef,
    };
  }
  return exif;
}

/**
 * Extracts altitude in meters above sea level from EXIF object.
 * Handles iOS nested '{GPS}' format and standard flat GPSAltitude key.
 * Returns null if data is missing, malformed, or not finite.
 */
export function getAltitudeFromExif(
  exif: Record<string, unknown> | null | undefined
): number | null {
  try {
    if (!exif || typeof exif !== 'object') return null;
    const resolved = resolveGpsDict(exif);
    const raw = resolved.GPSAltitude;
    if (raw == null) return null;
    let alt: number | null = null;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      alt = raw;
    } else if (typeof raw === 'object' && 'numerator' in raw && 'denominator' in raw) {
      const r = raw as { numerator: number; denominator: number };
      if (Number(r.denominator) !== 0) alt = Number(r.numerator) / Number(r.denominator);
    } else if (typeof raw === 'string') {
      const n = parseFloat(raw);
      if (Number.isFinite(n)) alt = n;
    }
    if (alt == null || !Number.isFinite(alt)) return null;
    // GPSAltitudeRef: 0 = above sea level (default), 1 = below sea level
    const ref = resolved.GPSAltitudeRef;
    if (ref === 1 || ref === '1') alt = -alt;
    return alt;
  } catch {
    return null;
  }
}

/**
 * Extracts decimal latitude and longitude from EXIF object.
 * Handles DMS (degrees/minutes/seconds) and rational formats; applies GPSLatitudeRef / GPSLongitudeRef.
 * Supports both iOS nested '{GPS}' format and standard flat GPSLatitude/GPSLongitude keys.
 * Returns null if exif is missing, GPS keys are missing, conversion fails, or coordinates are out of range.
 */
export function getDecimalCoordinatesFromExif(
  exif: Record<string, unknown> | null | undefined
): { latitude: number; longitude: number } | null {
  try {
    if (!exif || typeof exif !== 'object') return null;

    const resolved = resolveGpsDict(exif);

    const latRaw = resolved.GPSLatitude;
    const lngRaw = resolved.GPSLongitude;
    if (latRaw == null || lngRaw == null) return null;

    const latRef = resolved.GPSLatitudeRef;
    const lngRef = resolved.GPSLongitudeRef;

    const latitude = parseGpsCoordinate(latRaw, latRef);
    const longitude = parseGpsCoordinate(lngRaw, lngRef);

    if (latitude == null || longitude == null) return null;
    if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) return null;

    return { latitude, longitude };
  } catch {
    return null;
  }
}
