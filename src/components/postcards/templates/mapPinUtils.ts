/**
 * Pure helpers for T12MapPinTemplate's interactive map: reading/writing the user's chosen
 * map region to/from templateData, and the geo math for keeping the (fixed-center) pin within
 * a safe distance of the entry's real coordinate as the user freely pans/zooms the native map.
 */

export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export interface PxOffset {
  x: number;
  y: number;
}

// Matches the "whole world" default used by recapPreloader.computeMapRegion / T5MapSnapshot.
export const WORLD_REGION: MapRegion = { latitude: 20, longitude: 0, latitudeDelta: 60, longitudeDelta: 60 };
// Regional/island-level zoom default once a located photo is pinned (per the Mallorca mockup).
export const LOCAL_DELTA = { latitudeDelta: 0.45, longitudeDelta: 0.45 };
// How far the entry's real coordinate may drift from screen-center (fraction of container
// width/height) before a pan/zoom gesture gets gently snapped back into bounds.
export const SAFE_FRACTION = 0.18;

export function clamp(v: number, max: number): number {
  return Math.min(max, Math.max(-max, v));
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && isFinite(v);
}

/** The user's saved map region, or null if never set / malformed. */
export function parseMapRegion(templateData: Record<string, unknown> | undefined): MapRegion | null {
  const raw = templateData?.mapRegion as Partial<MapRegion> | undefined;
  if (
    !raw ||
    !isFiniteNumber(raw.latitude) ||
    !isFiniteNumber(raw.longitude) ||
    !isFiniteNumber(raw.latitudeDelta) ||
    !isFiniteNumber(raw.longitudeDelta) ||
    raw.latitudeDelta <= 0 ||
    raw.longitudeDelta <= 0
  ) {
    return null;
  }
  return { latitude: raw.latitude, longitude: raw.longitude, latitudeDelta: raw.latitudeDelta, longitudeDelta: raw.longitudeDelta };
}

/**
 * The map region whose center makes (entryLat, entryLng) render at (offsetPxX, offsetPxY)
 * pixels from the container's center. Used to build a corrected region when the entry's
 * coordinate has drifted outside the safe zone after a user pan/zoom.
 */
export function regionForPinOffset(
  entryLat: number,
  entryLng: number,
  offsetPxX: number,
  offsetPxY: number,
  containerW: number,
  containerH: number,
  latitudeDelta: number,
  longitudeDelta: number
): MapRegion {
  if (containerW <= 0 || containerH <= 0) {
    return { latitude: entryLat, longitude: entryLng, latitudeDelta, longitudeDelta };
  }
  const latFrac = offsetPxY / containerH;
  const lngFrac = offsetPxX / containerW;
  return {
    latitude: entryLat + latFrac * latitudeDelta,
    longitude: entryLng - lngFrac * longitudeDelta,
    latitudeDelta,
    longitudeDelta,
  };
}

/** Inverse of regionForPinOffset: how far off-center (in px) the entry's coordinate currently sits, given a region. */
export function pinOffsetForRegion(
  entryLat: number,
  entryLng: number,
  region: MapRegion,
  containerW: number,
  containerH: number
): PxOffset {
  return {
    x: ((entryLng - region.longitude) / region.longitudeDelta) * containerW,
    y: ((region.latitude - entryLat) / region.latitudeDelta) * containerH,
  };
}
