// importLatestClustering
// Pure clustering and sampling for "Import Latest": place+time clusters, 2–3 photos per experience, cap 12.

export interface MediaAsset {
  id: string;
  uri: string;
  creationTime: number; // ms since epoch
  latitude?: number;
  longitude?: number;
  width?: number;
  height?: number;
}

export interface Cluster {
  assets: MediaAsset[];
}

export interface SuggestedExperience {
  id: string;
  assets: MediaAsset[];
  timestamp: string; // ISO
  latitude?: number;
  longitude?: number;
}

/** Time window for one "moment" in ms (30 min). */
export const TIME_WINDOW_MS = 30 * 60 * 1000;

/** Same-place threshold in meters. */
const PLACE_THRESHOLD_M = 150;

/** Max representative assets per cluster. */
const MAX_REPRESENTATIVE = 3;

/** Default max suggested experiences. */
export const MAX_SUGGESTED_EXPERIENCES = 12;
const LOCATION_DIVERSITY_THRESHOLD_M = 1200;

/**
 * Haversine distance between two points in meters.
 */
function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // Earth radius in m
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function hasLocation(a: MediaAsset): boolean {
  return (
    a.latitude != null &&
    a.longitude != null &&
    Number.isFinite(a.latitude) &&
    Number.isFinite(a.longitude)
  );
}

/**
 * Min distance from asset to any asset in the cluster that has location.
 */
function minDistanceToCluster(asset: MediaAsset, cluster: Cluster): number | null {
  if (!hasLocation(asset)) return null;
  let min = Infinity;
  for (const c of cluster.assets) {
    if (!hasLocation(c)) continue;
    const d = haversineMeters(
      asset.latitude!,
      asset.longitude!,
      c.latitude!,
      c.longitude!
    );
    if (d < min) min = d;
  }
  return min === Infinity ? null : min;
}

/**
 * Cluster span in ms (max - min creationTime).
 */
function clusterSpanMs(cluster: Cluster): number {
  if (cluster.assets.length === 0) return 0;
  const times = cluster.assets.map((a) => a.creationTime);
  return Math.max(...times) - Math.min(...times);
}

/**
 * Cluster assets by place + time. Same place = within PLACE_THRESHOLD_M; same time = span ≤ TIME_WINDOW_MS.
 * Input should be sorted by creationTime ascending.
 */
export function clusterAssets(assets: MediaAsset[]): Cluster[] {
  if (assets.length === 0) return [];

  const sorted = [...assets].sort((a, b) => a.creationTime - b.creationTime);
  const clusters: Cluster[] = [{ assets: [sorted[0]] }];

  for (let i = 1; i < sorted.length; i++) {
    const asset = sorted[i];
    let placed = false;

    for (let j = clusters.length - 1; j >= 0; j--) {
      const cluster = clusters[j];
      const span = clusterSpanMs(cluster);
      const lastInCluster = cluster.assets[cluster.assets.length - 1];
      const timeGap = asset.creationTime - lastInCluster.creationTime;
      const newSpan = span + timeGap;

      if (newSpan > TIME_WINDOW_MS) break; // later clusters only get older

      const sameTime = newSpan <= TIME_WINDOW_MS;
      let samePlace = true;
      if (hasLocation(asset) && cluster.assets.some(hasLocation)) {
        const d = minDistanceToCluster(asset, cluster);
        samePlace = d !== null && d <= PLACE_THRESHOLD_M;
      }
      if (asset.latitude == null && asset.longitude == null && cluster.assets.some(hasLocation)) {
        samePlace = false; // no-location asset doesn't merge into a located cluster
      }

      if (sameTime && samePlace) {
        cluster.assets.push(asset);
        placed = true;
        break;
      }
    }

    if (!placed) {
      clusters.push({ assets: [asset] });
    }
  }

  return clusters;
}

/**
 * Select up to 3 representative assets per cluster (spread in time: first, middle, last).
 */
export function selectRepresentativeAssets(cluster: Cluster): MediaAsset[] {
  const assets = [...cluster.assets].sort((a, b) => a.creationTime - b.creationTime);
  if (assets.length <= MAX_REPRESENTATIVE) return assets;

  const indices =
    assets.length === 4
      ? [0, 2, 3]
      : [0, Math.floor(assets.length / 2), assets.length - 1];
  return indices.map((i) => assets[i]);
}

/**
 * Rank clusters (with their selected assets) and return top `max` as SuggestedExperience[].
 * Score: recency (max creationTime) + cluster size + variety (distance from already selected).
 */
export function rankAndCapClusters(
  clustersWithSamples: { cluster: Cluster; selected: MediaAsset[] }[],
  max: number
): SuggestedExperience[] {
  if (clustersWithSamples.length === 0) return [];
  if (clustersWithSamples.length <= max) {
    return clustersWithSamples.map(({ cluster, selected }) =>
      clusterToSuggestion(cluster, selected)
    );
  }

  const scored = clustersWithSamples.map(({ cluster, selected }) => {
    const minTime = Math.min(...cluster.assets.map((a) => a.creationTime));
    const maxTime = Math.max(...cluster.assets.map((a) => a.creationTime));
    const sizeScore = Math.min(cluster.assets.length, 20);
    const suggestion = clusterToSuggestion(cluster, selected);
    return { maxTime, minTime, sizeScore, suggestion };
  });

  const selectedIndices: number[] = [];
  const used = new Set<number>();

  const overallMin = Math.min(...scored.map((s) => s.minTime));
  const overallMax = Math.max(...scored.map((s) => s.maxTime));
  const span = Math.max(1, overallMax - overallMin);
  const targetCount = Math.min(max, scored.length);
  const bucketCount = targetCount;

  // Phase 1: ensure temporal coverage across the entire selected range.
  const buckets: number[][] = Array.from({ length: bucketCount }, () => []);
  for (let i = 0; i < scored.length; i++) {
    const normalized = (scored[i].maxTime - overallMin) / span;
    const bucketIdx = Math.min(bucketCount - 1, Math.max(0, Math.floor(normalized * bucketCount)));
    buckets[bucketIdx].push(i);
  }

  for (let b = 0; b < bucketCount && selectedIndices.length < targetCount; b++) {
    const candidates = buckets[b].filter((idx) => !used.has(idx));
    if (candidates.length === 0) continue;
    const bestInBucket = candidates.sort((a, c) => {
      // Prefer stronger clusters first, then more recent within this time bucket.
      if (scored[c].sizeScore !== scored[a].sizeScore) return scored[c].sizeScore - scored[a].sizeScore;
      return scored[c].maxTime - scored[a].maxTime;
    })[0];
    selectedIndices.push(bestInBucket);
    used.add(bestInBucket);
  }

  // Phase 2: fill remaining slots with place-diverse picks.
  while (selectedIndices.length < targetCount) {
    let bestIndex = -1;
    let bestScore = -Infinity;
    const chosenLocations = selectedIndices
      .map((idx) => scored[idx].suggestion)
      .filter((s) => s.latitude != null && s.longitude != null)
      .map((s) => ({ latitude: s.latitude as number, longitude: s.longitude as number }));

    for (let i = 0; i < scored.length; i++) {
      if (used.has(i)) continue;
      const recencyNormalized = (scored[i].maxTime - overallMin) / span;
      let score = scored[i].sizeScore + recencyNormalized * 0.25;
      const nearestLocationDistance = minDistanceToLocations(scored[i].suggestion, chosenLocations);
      if (nearestLocationDistance == null || nearestLocationDistance >= LOCATION_DIVERSITY_THRESHOLD_M) {
        score += 0.6;
      } else {
        score -= 0.4;
      }
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    if (bestIndex < 0) break;
    used.add(bestIndex);
    selectedIndices.push(bestIndex);
  }

  return selectedIndices.map((idx) => scored[idx].suggestion);
}

function minDistanceToLocations(
  suggestion: SuggestedExperience,
  selectedLocations: Array<{ latitude: number; longitude: number }>
): number | null {
  if (suggestion.latitude == null || suggestion.longitude == null) return null;
  if (selectedLocations.length === 0) return null;
  let min = Infinity;
  for (const loc of selectedLocations) {
    const d = haversineMeters(suggestion.latitude, suggestion.longitude, loc.latitude, loc.longitude);
    if (d < min) min = d;
  }
  return Number.isFinite(min) ? min : null;
}

function clusterToSuggestion(cluster: Cluster, selected: MediaAsset[]): SuggestedExperience {
  const first = selected[0] ?? cluster.assets[0];
  const timestamp = new Date(first.creationTime).toISOString();
  const withLoc = cluster.assets.filter(hasLocation);
  const lat =
    withLoc.length > 0
      ? withLoc.reduce((s, a) => s + a.latitude!, 0) / withLoc.length
      : undefined;
  const lng =
    withLoc.length > 0
      ? withLoc.reduce((s, a) => s + a.longitude!, 0) / withLoc.length
      : undefined;
  return {
    id: first.id,
    assets: selected,
    timestamp,
    latitude: lat,
    longitude: lng,
  };
}
