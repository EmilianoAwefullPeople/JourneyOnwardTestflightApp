// importLatestClustering
// Pure clustering and sampling for "Import Latest": place+time clusters, up to 3 photos per experience, cap 50.

export interface MediaAsset {
  id: string;
  uri: string;
  creationTime: number; // ms since epoch
  latitude?: number;
  longitude?: number;
  altitudeMeters?: number;
  width?: number;
  height?: number;
  fileSize?: number; // bytes; used for burst canonical selection and quality-based representative selection
}

export interface Cluster {
  assets: MediaAsset[]; // always sorted ascending by creationTime
  minTime: number;      // cached from first asset; O(1) span queries
  maxTime: number;      // cached, updated on every push
}

export interface SuggestedExperience {
  id: string;
  assets: MediaAsset[];
  timestamp: string; // ISO
  latitude?: number;
  longitude?: number;
  altitudeMeters?: number;
  /** Total photos in the cluster (assets holds only the ≤3 representatives). */
  totalPhotos: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Fallback time window for one "moment" in ms (30 min). Replaced at runtime by computeAdaptiveTimeWindow. */
export const TIME_WINDOW_MS = 30 * 60 * 1000;

/** Same-place threshold in meters. */
const PLACE_THRESHOLD_M = 150;

/** Max representative assets per cluster. */
const MAX_REPRESENTATIVE_ASSETS = 3;

/** Default max suggested experiences. */
export const MAX_SUGGESTED_EXPERIENCES = 50;

const LOCATION_DIVERSITY_THRESHOLD_M = 1200;

// Step 1 — filter
/** Files below this size (bytes) are considered accidental or corrupted captures. */
const MIN_MEMORY_CAPTURE_BYTES = 10_000;
/** Portrait screenshot aspect ratio (width / height) for standard iPhones (~9:19.5 ≈ 0.462). */
const SCREENSHOT_ASPECT_RATIO_PORTRAIT = 9 / 19.5;
/** Symmetric tolerance around the screenshot aspect ratio (±5%). */
const SCREENSHOT_ASPECT_TOLERANCE = 0.05;

// Step 2 — burst collapse
/** Max delta-t between consecutive photos (ms) to be treated as the same burst. */
const BURST_THRESHOLD_MS = 3_000;

// Step 3 — adaptive time window
const MIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_WINDOW_MS = 45 * 60 * 1000;
const LOW_DENSITY_THRESHOLD = 0.5;  // photos/min → use MAX_WINDOW_MS
const HIGH_DENSITY_THRESHOLD = 3.0; // photos/min → use MIN_WINDOW_MS

// Step 7 — ranking
const TIGHTNESS_WEIGHT = 0.3;

// ─── Utility ─────────────────────────────────────────────────────────────────

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
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

function minDistanceToCluster(asset: MediaAsset, cluster: Cluster): number | null {
  if (!hasLocation(asset)) return null;
  let min = Infinity;
  for (const c of cluster.assets) {
    if (!hasLocation(c)) continue;
    const d = haversineMeters(asset.latitude!, asset.longitude!, c.latitude!, c.longitude!);
    if (d < min) min = d;
  }
  return min === Infinity ? null : min;
}

// ─── Step 1: Filter unambiguous non-captures ─────────────────────────────────

/**
 * Remove screenshots (by aspect ratio) and sub-threshold file sizes before clustering.
 * Conservative — only removes what is unambiguously not a memory capture.
 */
export function filterNonCaptures(assets: MediaAsset[]): { kept: MediaAsset[]; filtered: MediaAsset[] } {
  const kept: MediaAsset[] = [];
  const filtered: MediaAsset[] = [];

  const portraitLow = SCREENSHOT_ASPECT_RATIO_PORTRAIT * (1 - SCREENSHOT_ASPECT_TOLERANCE);
  const portraitHigh = SCREENSHOT_ASPECT_RATIO_PORTRAIT * (1 + SCREENSHOT_ASPECT_TOLERANCE);
  const landscapeLow = (1 / SCREENSHOT_ASPECT_RATIO_PORTRAIT) * (1 - SCREENSHOT_ASPECT_TOLERANCE);
  const landscapeHigh = (1 / SCREENSHOT_ASPECT_RATIO_PORTRAIT) * (1 + SCREENSHOT_ASPECT_TOLERANCE);

  for (const asset of assets) {
    if (asset.fileSize != null && asset.fileSize < MIN_MEMORY_CAPTURE_BYTES) {
      filtered.push(asset);
      continue;
    }

    if (asset.width != null && asset.height != null && asset.width > 0 && asset.height > 0) {
      const ratio = asset.width / asset.height;
      if (
        (ratio >= portraitLow && ratio <= portraitHigh) ||
        (ratio >= landscapeLow && ratio <= landscapeHigh)
      ) {
        filtered.push(asset);
        continue;
      }
    }

    kept.push(asset);
  }

  return { kept, filtered };
}

// ─── Step 2: Burst collapse ───────────────────────────────────────────────────

/**
 * Collapse consecutive burst sequences (delta-t < BURST_THRESHOLD_MS) into one synthetic asset.
 * Canonical frame = largest fileSize; falls back to first photo if fileSize is unavailable.
 * Sorts input by creationTime before processing; output is guaranteed sorted ascending.
 */
export function collapseBursts(assets: MediaAsset[]): MediaAsset[] {
  if (assets.length === 0) return [];

  const sorted = [...assets].sort((a, b) => a.creationTime - b.creationTime);
  const result: MediaAsset[] = [];
  let burstStart = 0;

  for (let i = 1; i <= sorted.length; i++) {
    const endOfInput = i === sorted.length;
    const continuesBurst =
      !endOfInput &&
      sorted[i].creationTime - sorted[i - 1].creationTime < BURST_THRESHOLD_MS;

    if (continuesBurst) continue;

    const burst = sorted.slice(burstStart, i);

    if (burst.length === 1) {
      result.push(burst[0]);
    } else {
      let canonical = burst[0];
      for (let j = 1; j < burst.length; j++) {
        if ((burst[j].fileSize ?? 0) > (canonical.fileSize ?? 0)) {
          canonical = burst[j];
        }
      }

      let lat = canonical.latitude;
      let lng = canonical.longitude;
      if (lat == null || lng == null) {
        for (const b of burst) {
          if (hasLocation(b)) {
            lat = b.latitude;
            lng = b.longitude;
            break;
          }
        }
      }

      result.push({
        ...canonical,
        creationTime: burst[0].creationTime,
        latitude: lat,
        longitude: lng,
      });
    }

    burstStart = i;
  }

  return result;
}

// ─── Step 3: Adaptive time window ────────────────────────────────────────────

/**
 * Derive a clustering time window from photo density.
 * Dense input → tighter window (down to 15 min). Sparse input → wider window (up to 45 min).
 * Expects input sorted by creationTime ascending (output of collapseBursts).
 */
export function computeAdaptiveTimeWindow(assets: MediaAsset[]): number {
  if (assets.length <= 1) return TIME_WINDOW_MS;

  const totalSpanMs = assets[assets.length - 1].creationTime - assets[0].creationTime;
  if (totalSpanMs < 1000) return TIME_WINDOW_MS;

  const densityPerMinute = assets.length / (totalSpanMs / 60_000);

  if (densityPerMinute <= LOW_DENSITY_THRESHOLD) return MAX_WINDOW_MS;
  if (densityPerMinute >= HIGH_DENSITY_THRESHOLD) return MIN_WINDOW_MS;

  const t =
    (densityPerMinute - LOW_DENSITY_THRESHOLD) /
    (HIGH_DENSITY_THRESHOLD - LOW_DENSITY_THRESHOLD);
  return Math.round(MAX_WINDOW_MS + t * (MIN_WINDOW_MS - MAX_WINDOW_MS));
}

// ─── Step 4: Clustering ───────────────────────────────────────────────────────

/**
 * Cluster assets by place + time.
 * Requires input sorted by creationTime ascending (guaranteed by collapseBursts).
 * minTime/maxTime are cached on each Cluster for O(1) span queries downstream.
 */
export function clusterAssets(assets: MediaAsset[], timeWindowMs: number = TIME_WINDOW_MS): Cluster[] {
  if (assets.length === 0) return [];

  const first = assets[0];
  const clusters: Cluster[] = [{ assets: [first], minTime: first.creationTime, maxTime: first.creationTime }];

  for (let i = 1; i < assets.length; i++) {
    const asset = assets[i];
    let placed = false;

    for (let j = clusters.length - 1; j >= 0; j--) {
      const cluster = clusters[j];

      // Span check is now O(1): would adding this asset exceed the window?
      if (asset.creationTime - cluster.minTime > timeWindowMs) break;

      let samePlace = true;
      if (hasLocation(asset) && cluster.assets.some(hasLocation)) {
        const d = minDistanceToCluster(asset, cluster);
        samePlace = d !== null && d <= PLACE_THRESHOLD_M;
      }
      // GPS-missing assets are isolated here; Step 5 relaxes them afterward.
      if (asset.latitude == null && asset.longitude == null && cluster.assets.some(hasLocation)) {
        samePlace = false;
      }

      if (samePlace) {
        cluster.assets.push(asset);
        cluster.maxTime = asset.creationTime; // input is sorted so this always grows
        placed = true;
        break;
      }
    }

    if (!placed) {
      clusters.push({ assets: [asset], minTime: asset.creationTime, maxTime: asset.creationTime });
    }
  }

  return clusters;
}

// ─── Step 5: GPS-missing merge relaxation ────────────────────────────────────

/**
 * Merge single-photo GPS-missing clusters into their nearest time-adjacent cluster,
 * when the gap is within adaptiveWindow.
 */
export function relaxGpsMissingOrphans(clusters: Cluster[], adaptiveWindow: number): Cluster[] {
  if (clusters.length <= 1) return clusters;

  const isOrphan = (c: Cluster): boolean =>
    c.assets.length === 1 && !hasLocation(c.assets[0]);

  const n = clusters.length;

  // Two O(n) passes to find nearest non-orphan index on each side.
  const prevNonOrphan = new Array<number>(n).fill(-1);
  const nextNonOrphan = new Array<number>(n).fill(-1);

  let last = -1;
  for (let i = 0; i < n; i++) {
    if (!isOrphan(clusters[i])) last = i;
    prevNonOrphan[i] = last;
  }
  last = -1;
  for (let i = n - 1; i >= 0; i--) {
    if (!isOrphan(clusters[i])) last = i;
    nextNonOrphan[i] = last;
  }

  // Decide merge target for each orphan. Gap boundaries are O(1) via cached minTime/maxTime.
  const mergeTarget = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    if (!isOrphan(clusters[i])) continue;

    const orphanTime = clusters[i].assets[0].creationTime;
    const prev = prevNonOrphan[i];
    const next = nextNonOrphan[i];

    const gapToPrev = prev >= 0 ? orphanTime - clusters[prev].maxTime : Infinity;
    const gapToNext = next >= 0 ? clusters[next].minTime - orphanTime : Infinity;

    const bestGap = Math.min(gapToPrev, gapToNext);
    if (bestGap <= adaptiveWindow) {
      mergeTarget.set(i, gapToNext < gapToPrev ? next : prev);
    }
  }

  const extraAssets = new Map<number, MediaAsset[]>();
  for (const [orphanIdx, targetIdx] of mergeTarget) {
    const list = extraAssets.get(targetIdx) ?? [];
    list.push(clusters[orphanIdx].assets[0]);
    extraAssets.set(targetIdx, list);
  }

  const absorbed = new Set(mergeTarget.keys());
  const result: Cluster[] = [];

  for (let i = 0; i < n; i++) {
    if (absorbed.has(i)) continue;
    const extra = extraAssets.get(i);
    if (!extra || extra.length === 0) {
      result.push(clusters[i]);
    } else {
      const mergedAssets = [...clusters[i].assets, ...extra].sort(
        (a, b) => a.creationTime - b.creationTime
      );
      let newMin = clusters[i].minTime;
      let newMax = clusters[i].maxTime;
      for (const a of extra) {
        if (a.creationTime < newMin) newMin = a.creationTime;
        if (a.creationTime > newMax) newMax = a.creationTime;
      }
      result.push({ assets: mergedAssets, minTime: newMin, maxTime: newMax });
    }
  }

  return result;
}

// ─── Step 6: Representative selection ────────────────────────────────────────

/**
 * Select up to MAX_REPRESENTATIVE_ASSETS per cluster by fileSize descending (quality proxy),
 * then re-sort selected assets by creationTime for temporal display order.
 * cluster.assets is assumed sorted ascending by creationTime (pipeline invariant).
 */
export function selectRepresentativeAssets(cluster: Cluster): MediaAsset[] {
  if (cluster.assets.length <= MAX_REPRESENTATIVE_ASSETS) {
    return [...cluster.assets]; // already sorted ascending (pipeline invariant)
  }

  // Sort by quality, take top N, re-sort for display. One sort instead of two.
  const byQuality = [...cluster.assets].sort((a, b) => (b.fileSize ?? 0) - (a.fileSize ?? 0));
  const selected = byQuality.slice(0, MAX_REPRESENTATIVE_ASSETS);
  return selected.sort((a, b) => a.creationTime - b.creationTime);
}

// ─── Step 7: Ranking ─────────────────────────────────────────────────────────

/**
 * Rank clusters (with their selected assets) and return top `max` as SuggestedExperience[].
 * Score: cluster size + tightness (concentration signal) + recency + location variety.
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
    // minTime/maxTime are O(1) — no asset scan needed.
    const { minTime, maxTime } = cluster;
    const durationMinutes = (maxTime - minTime) / 60_000;
    const tightness = cluster.assets.length / Math.max(durationMinutes, 1);
    const sizeScore = Math.min(cluster.assets.length, 20) + tightness * TIGHTNESS_WEIGHT;
    const suggestion = clusterToSuggestion(cluster, selected);
    return { maxTime, minTime, sizeScore, suggestion };
  });

  const selectedIndices: number[] = [];
  const used = new Set<number>();

  const overallMin = scored.reduce((m, s) => Math.min(m, s.minTime), Infinity);
  const overallMax = scored.reduce((m, s) => Math.max(m, s.maxTime), -Infinity);
  const span = Math.max(1, overallMax - overallMin);
  const targetCount = Math.min(max, scored.length);

  // Phase 1: temporal coverage — one best cluster per time bucket.
  const buckets: number[][] = Array.from({ length: targetCount }, () => []);
  for (let i = 0; i < scored.length; i++) {
    const normalized = (scored[i].maxTime - overallMin) / span;
    const bucketIdx = Math.min(targetCount - 1, Math.max(0, Math.floor(normalized * targetCount)));
    buckets[bucketIdx].push(i);
  }

  for (let b = 0; b < targetCount && selectedIndices.length < targetCount; b++) {
    const candidates = buckets[b].filter((idx) => !used.has(idx));
    if (candidates.length === 0) continue;
    const best = candidates.sort((a, c) => {
      if (scored[c].sizeScore !== scored[a].sizeScore) return scored[c].sizeScore - scored[a].sizeScore;
      return scored[c].maxTime - scored[a].maxTime;
    })[0];
    selectedIndices.push(best);
    used.add(best);
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
      const nearestDist = minDistanceToLocations(scored[i].suggestion, chosenLocations);
      if (nearestDist == null || nearestDist >= LOCATION_DIVERSITY_THRESHOLD_M) {
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

// ─── Internal helpers ─────────────────────────────────────────────────────────

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
  const withAlt = cluster.assets.filter((a) => a.altitudeMeters != null);
  const alt =
    withAlt.length > 0
      ? withAlt.reduce((s, a) => s + a.altitudeMeters!, 0) / withAlt.length
      : undefined;
  return {
    id: first.id,
    assets: selected,
    timestamp,
    latitude: lat,
    longitude: lng,
    altitudeMeters: alt,
    totalPhotos: cluster.assets.length,
  };
}
