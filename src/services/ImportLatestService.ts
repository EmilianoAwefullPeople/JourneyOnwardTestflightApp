// ImportLatestService
// Fetches device photos from last 72h, clusters by place+time, returns up to 12 suggested experiences.
// Resolves displayable URIs (localUri) for iOS ph:// assets so Image components can render thumbnails.

import * as MediaLibrary from 'expo-media-library';
import { logger } from '../utils/logger';
import { getDecimalCoordinatesFromExif, getAltitudeFromExif } from '../utils/exifGps';
import { normalizeExifForMetadata } from '../utils/exifUtils';
import { parseExifDateTimeToMs } from '../utils/exifTimestamp';
import type { MediaAsset, SuggestedExperience } from '../utils/importLatestClustering';
import {
  filterNonCaptures,
  collapseBursts,
  computeAdaptiveTimeWindow,
  clusterAssets,
  relaxGpsMissingOrphans,
  selectRepresentativeAssets,
  rankAndCapClusters,
  MAX_SUGGESTED_EXPERIENCES,
} from '../utils/importLatestClustering';
import {
  loadYearAvailabilityCache,
  saveYearAvailabilityCache,
  type ImportLatestYearAvailabilitySignature,
} from '../utils/importLatestYearCache';
import { mapWithConcurrency } from '../utils/concurrency';
const HOURS_72_MS = 72 * 60 * 60 * 1000;
const FETCH_PAGE_SIZE = 500;

/** Thrown when the user leaves the import screen and work should stop. */
export class ImportLatestAbortedError extends Error {
  constructor() {
    super('ImportLatestAborted');
    this.name = 'ImportLatestAbortedError';
  }
}

export function isImportLatestAbortedError(error: unknown): boolean {
  return error instanceof ImportLatestAbortedError;
}

const throwIfAborted = (signal: AbortSignal | undefined): void => {
  if (signal?.aborted) {
    throw new ImportLatestAbortedError();
  }
};

/** Parallel MediaLibrary reads (native I/O bound). */
const ASSET_INFO_CONCURRENCY = 8;

const YEAR_AVAILABILITY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_YEAR_RANGE_SPAN = 60;

export interface ImportLatestRange {
  createdAfter: number;
  createdBefore?: number;
}

/** Asset with optional displayUri (file URI) and exif for metadata (e.g. altitude). */
export type MediaAssetWithDisplayUri = MediaAsset & {
  displayUri?: string | null;
  exif?: object | null;
};

export type SuggestedExperienceWithDisplayUris = Omit<SuggestedExperience, 'assets'> & {
  assets: MediaAssetWithDisplayUri[];
};

export interface ImportLatestResult {
  suggestions: SuggestedExperienceWithDisplayUris[];
  error?: string;
}

export interface ImportLatestProgress {
  phase: 'fetch' | 'cluster' | 'finalize' | 'done';
  completed: number;
  total: number;
  percent: number;
  label: string;
}

export interface RunImportLatestOptions {
  range?: ImportLatestRange;
  onProgress?: (progress: ImportLatestProgress) => void;
  /** When aborted (e.g. user navigates away), long-running import steps stop cooperatively. */
  signal?: AbortSignal;
}

// Asset shape returned by expo-image-picker with exif: true
export interface PickedGalleryAsset {
  uri: string;
  width: number;
  height: number;
  assetId?: string | null;
  exif?: Record<string, unknown> | null;
  fileSize?: number;
}

export interface RunImportFromSelectionOptions {
  onProgress?: (progress: ImportLatestProgress) => void;
  signal?: AbortSignal;
  maxSuggestions?: number;
}

export interface AvailableGalleryYearsOptions {
  cacheTtlMs?: number;
  onProgress?: (completed: number, total: number) => void;
}

export async function getGalleryYearPickerOptions(): Promise<number[]> {
  const bounds = await getGalleryBounds();
  if (bounds.oldestCreationTimeMs == null) return [];
  const oldestYear = new Date(bounds.oldestCreationTimeMs).getFullYear();
  const currentYear = new Date().getFullYear();
  if (!Number.isFinite(oldestYear) || oldestYear > currentYear) return [];
  const years: number[] = [];
  for (let year = currentYear; year >= oldestYear; year--) {
    years.push(year);
  }
  return years;
}

const normalizeCreationTimeMs = (creationTime?: number): number => {
  if (typeof creationTime !== 'number') return Date.now();
  return creationTime < 1e12 ? creationTime * 1000 : creationTime;
};

/**
 * Request media library permission. Returns true if granted, false otherwise.
 */
export async function requestMediaLibraryPermission(): Promise<boolean> {
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync(false);
    return status === 'granted';
  } catch (e) {
    logger.error('ImportLatest: request permission failed', e);
    return false;
  }
}

export async function getOldestPhotoCreationYear(): Promise<number | null> {
  try {
    const page = await MediaLibrary.getAssetsAsync({
      first: 1,
      sortBy: [[MediaLibrary.SortBy.creationTime, true]],
      mediaType: MediaLibrary.MediaType.photo,
    });
    const asset = page.assets[0];
    if (!asset) return null;
    const ms = normalizeCreationTimeMs(asset.creationTime);
    const year = new Date(ms).getFullYear();
    return Number.isFinite(year) ? year : null;
  } catch (error) {
    logger.error('ImportLatest: failed to read oldest photo year', error);
    return null;
  }
}

const getGalleryBounds = async (): Promise<{
  oldestCreationTimeMs: number | null;
  newestCreationTimeMs: number | null;
  newestAssetId?: string;
  estimatedTotal?: number;
}> => {
  try {
    const [oldestPage, newestPage] = await Promise.all([
      MediaLibrary.getAssetsAsync({
        first: 1,
        sortBy: [[MediaLibrary.SortBy.creationTime, true]],
        mediaType: MediaLibrary.MediaType.photo,
      }),
      MediaLibrary.getAssetsAsync({
        first: 1,
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
        mediaType: MediaLibrary.MediaType.photo,
      }),
    ]);
    const oldestAsset = oldestPage.assets[0];
    const newestAsset = newestPage.assets[0];
    return {
      oldestCreationTimeMs: oldestAsset ? normalizeCreationTimeMs(oldestAsset.creationTime) : null,
      newestCreationTimeMs: newestAsset ? normalizeCreationTimeMs(newestAsset.creationTime) : null,
      newestAssetId: newestAsset?.id,
      estimatedTotal:
        typeof (newestPage as Record<string, unknown>).totalCount === 'number'
          ? ((newestPage as Record<string, unknown>).totalCount as number)
          : undefined,
    };
  } catch (error) {
    logger.warn('ImportLatest: getGalleryBounds failed', error);
    return {
      oldestCreationTimeMs: null,
      newestCreationTimeMs: null,
    };
  }
};

const signaturesEqual = (
  a?: ImportLatestYearAvailabilitySignature,
  b?: ImportLatestYearAvailabilitySignature
): boolean => {
  if (!a || !b) return false;
  return (
    a.newestAssetId === b.newestAssetId &&
    a.newestCreationTimeMs === b.newestCreationTimeMs &&
    a.estimatedTotal === b.estimatedTotal
  );
};

function normalizeRange(range?: ImportLatestRange): { createdAfter: number; createdBefore: number } | null {
  const now = Date.now();
  const createdAfterRaw = range?.createdAfter ?? now - HOURS_72_MS;
  const createdBeforeRaw = range?.createdBefore ?? now;

  if (!Number.isFinite(createdAfterRaw) || !Number.isFinite(createdBeforeRaw)) return null;

  const createdAfter = Math.max(0, Math.floor(createdAfterRaw));
  const createdBefore = Math.max(0, Math.floor(createdBeforeRaw));
  if (createdAfter > createdBefore) return null;

  return { createdAfter, createdBefore };
}


/**
 * Fetch photo assets for a creation-time range and map to MediaAsset[].
 * creationTime from expo-media-library is in seconds; we convert to ms.
 */
async function fetchAssetsInRange(
  range?: ImportLatestRange,
  onProgress?: RunImportLatestOptions['onProgress'],
  signal?: AbortSignal
): Promise<MediaAsset[]> {
  const normalizedRange = normalizeRange(range);
  if (!normalizedRange) {
    throw new Error('Invalid date range selected.');
  }
  const { createdAfter, createdBefore } = normalizedRange;
  const assets: MediaAsset[] = [];
  let after: string | undefined;
  let previousCursor: string | undefined;
  let knownTotal: number | null = null;

  const emitFetchProgress = (scanned: number, label: string) => {
    const totalKnown = knownTotal != null && knownTotal > 0;
    const percent = totalKnown
      ? Math.min(40, (scanned / (knownTotal as number)) * 40)
      : 0;
    onProgress?.({
      phase: 'fetch',
      completed: scanned,
      total: totalKnown ? (knownTotal as number) : 0,
      percent,
      label,
    });
  };

  while (true) {
    throwIfAborted(signal);
    const page = await MediaLibrary.getAssetsAsync({
      first: FETCH_PAGE_SIZE,
      after,
      sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      mediaType: MediaLibrary.MediaType.photo,
      createdAfter,
      createdBefore,
    });
    throwIfAborted(signal);

    const tc = (page as { totalCount?: number }).totalCount;
    if (typeof tc === 'number' && tc >= 0) {
      // Keep denominator monotonic upward if MediaLibrary revises totals across pages.
      knownTotal = knownTotal == null ? tc : Math.max(knownTotal, tc);
    }

    for (const a of page.assets) {
      const creationTimeMs = normalizeCreationTimeMs(a.creationTime);
      assets.push({
        id: a.id,
        uri: a.uri,
        creationTime: creationTimeMs,
        width: a.width,
        height: a.height,
        fileSize: (a as MediaLibrary.Asset & { fileSize?: number }).fileSize,
      });
    }

    const scanned = assets.length;
    if (knownTotal != null && scanned > knownTotal) {
      // Guard against underestimated totalCount values from MediaLibrary.
      knownTotal = scanned;
    }
    if (knownTotal == null && !page.hasNextPage) {
      knownTotal = scanned;
    }
    emitFetchProgress(
      scanned,
      knownTotal != null && knownTotal > 0
        ? `Scanning photos (${scanned} / ${knownTotal})`
        : `Scanning photos (${scanned})`
    );

    if (!page.hasNextPage || !page.endCursor) break;
    if (page.endCursor === previousCursor) {
      logger.warn('ImportLatest: cursor stalled during pagination', { cursor: page.endCursor });
      break;
    }

    previousCursor = page.endCursor;
    after = page.endCursor;
  }

  return assets.filter((a) => a.creationTime >= createdAfter && a.creationTime <= createdBefore);
}

const getYearRangeMs = (year: number): ImportLatestRange => {
  const createdAfter = new Date(year, 0, 1, 0, 0, 0, 0).getTime();
  const createdBefore = new Date(year, 11, 31, 23, 59, 59, 999).getTime();
  return { createdAfter, createdBefore };
};

const checkYearHasPhotos = async (year: number): Promise<boolean> => {
  try {
    const range = getYearRangeMs(year);
    const page = await MediaLibrary.getAssetsAsync({
      first: 1,
      mediaType: MediaLibrary.MediaType.photo,
      sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      createdAfter: range.createdAfter,
      createdBefore: range.createdBefore,
    });
    return page.assets.length > 0;
  } catch (error) {
    logger.warn('ImportLatest: year existence probe failed', { year, error });
    return false;
  }
};

const probeAvailableYears = async (
  candidateYears: number[],
  onProgress?: (completed: number, total: number) => void
): Promise<number[]> => {
  const years = [...candidateYears];
  const total = years.length;
  if (total === 0) return [];
  const found: number[] = [];
  const concurrency = 5;
  let cursor = 0;
  let completed = 0;
  const worker = async () => {
    while (cursor < total) {
      const idx = cursor++;
      const year = years[idx];
      const hasPhotos = await checkYearHasPhotos(year);
      if (hasPhotos) {
        found.push(year);
      }
      completed++;
      onProgress?.(completed, total);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, () => worker()));
  return found.sort((a, b) => b - a);
};

export async function getAvailableGalleryYears(
  options?: AvailableGalleryYearsOptions
): Promise<number[]> {
  const ttl = options?.cacheTtlMs ?? YEAR_AVAILABILITY_CACHE_TTL_MS;
  const now = Date.now();
  // Load cache and gallery bounds in parallel — AsyncStorage + MediaLibrary are independent.
  const [cached, bounds] = await Promise.all([loadYearAvailabilityCache(), getGalleryBounds()]);
  const currentSignature: ImportLatestYearAvailabilitySignature = {
    newestAssetId: bounds.newestAssetId,
    newestCreationTimeMs: bounds.newestCreationTimeMs ?? undefined,
    estimatedTotal: bounds.estimatedTotal,
  };
  if (
    cached &&
    now - cached.computedAt <= ttl &&
    signaturesEqual(cached.signature, currentSignature)
  ) {
    return cached.years;
  }

  if (bounds.oldestCreationTimeMs == null || bounds.newestCreationTimeMs == null) {
    await saveYearAvailabilityCache({
      version: 1,
      years: [],
      computedAt: now,
      signature: currentSignature,
    });
    return [];
  }

  const oldestYear = new Date(bounds.oldestCreationTimeMs).getFullYear();
  const newestYear = new Date(bounds.newestCreationTimeMs).getFullYear();
  if (!Number.isFinite(oldestYear) || !Number.isFinite(newestYear) || oldestYear > newestYear) {
    return [];
  }

  const span = newestYear - oldestYear + 1;
  const safeOldestYear = span > MAX_YEAR_RANGE_SPAN ? newestYear - MAX_YEAR_RANGE_SPAN + 1 : oldestYear;
  const candidates: number[] = [];
  for (let y = newestYear; y >= safeOldestYear; y--) {
    candidates.push(y);
  }
  const years = await probeAvailableYears(candidates, options?.onProgress);
  await saveYearAvailabilityCache({
    version: 1,
    years,
    computedAt: now,
    signature: currentSignature,
  });
  return years;
}

/**
 * Run the full import-latest pipeline: fetch assets in range, cluster, sample 2–3 per cluster, cap 12.
 */
export async function runImportLatest(options?: ImportLatestRange | RunImportLatestOptions): Promise<ImportLatestResult> {
  const normalizedOptions: RunImportLatestOptions =
    options && ('createdAfter' in options || 'createdBefore' in options)
      ? { range: options as ImportLatestRange }
      : ((options as RunImportLatestOptions | undefined) ?? {});

  try {
    const granted = await requestMediaLibraryPermission();
    if (!granted) {
      return {
        suggestions: [],
        error: 'Photo library access is needed to find recent moments.',
      };
    }
    throwIfAborted(normalizedOptions.signal);

    const rawAssets = await fetchAssetsInRange(
      normalizedOptions.range,
      normalizedOptions.onProgress,
      normalizedOptions.signal
    );
    throwIfAborted(normalizedOptions.signal);
    if (rawAssets.length === 0) {
      return { suggestions: [] };
    }

    normalizedOptions.onProgress?.({
      phase: 'cluster',
      completed: 1,
      total: 1,
      percent: 78,
      label: 'Grouping moments',
    });

    const { kept } = filterNonCaptures(rawAssets);
    const collapsed = collapseBursts(kept);
    const adaptiveWindow = computeAdaptiveTimeWindow(collapsed);
    const rawClusters = clusterAssets(collapsed, adaptiveWindow);
    const clusters = relaxGpsMissingOrphans(rawClusters, adaptiveWindow);
    const withSamples = clusters.map((cluster) => ({
      cluster,
      selected: selectRepresentativeAssets(cluster),
    }));
    const rawSuggestions = rankAndCapClusters(withSamples, MAX_SUGGESTED_EXPERIENCES);
    normalizedOptions.onProgress?.({
      phase: 'finalize',
      completed: 1,
      total: 1,
      percent: 85,
      label: 'Preparing suggestions',
    });

    // Resolve displayable URIs for each asset (iOS returns ph:// which Image cannot load).
    const allAssetIds = rawSuggestions.flatMap((s) => s.assets.map((a) => a.id));
    const assetInfos = await mapWithConcurrency(
      allAssetIds,
      ASSET_INFO_CONCURRENCY,
      async (id) => {
        throwIfAborted(normalizedOptions.signal);
        try {
          // No shouldDownloadFromNetwork:false here — localUri requires the asset to be locally
          // available, and iCloud photos must be downloaded to produce a renderable file URI.
          const info = await MediaLibrary.getAssetInfoAsync(id);
          const loc = info.location;
          // iOS native returns latitude/longitude as strings despite the TypeScript type saying number.
          // Use parseFloat(String()) to handle both string and number values safely.
          let lat: number | null = null;
          let lng: number | null = null;
          if (loc != null && typeof loc === 'object') {
            const rawLat = (loc as Record<string, unknown>).latitude;
            const rawLng = (loc as Record<string, unknown>).longitude;
            const parsedLat = parseFloat(String(rawLat));
            const parsedLng = parseFloat(String(rawLng));
            if (Number.isFinite(parsedLat)) lat = parsedLat;
            if (Number.isFinite(parsedLng)) lng = parsedLng;
          }
          return {
            localUri: info.localUri ?? null,
            exif: info.exif ?? null,
            latitude: lat,
            longitude: lng,
          };
        } catch (err) {
          logger.warn('ImportLatest: getAssetInfoAsync failed', { id, err });
          return { localUri: null, exif: null, latitude: null, longitude: null };
        }
      },
      normalizedOptions.signal
    );

    let idx = 0;
    const suggestions: SuggestedExperienceWithDisplayUris[] = rawSuggestions.map((s) => ({
      ...s,
      assets: s.assets.map((a) => {
        const inf = assetInfos[idx++] ?? { localUri: null, exif: null, latitude: null, longitude: null };
        const { localUri: displayUri, exif, latitude: locLat, longitude: locLng } = inf;
        return {
          ...a,
          displayUri,
          exif,
          ...(locLat != null && locLng != null ? { latitude: locLat, longitude: locLng } : {}),
        };
      }),
    }));

    // Enrich suggestions with location: try every asset in the cluster (not just first),
    // preferring the native info.location value first, then falling back to normalized EXIF.
    for (const s of suggestions) {
      throwIfAborted(normalizedOptions.signal);
      if (s.latitude != null && s.longitude != null) continue;
      let resolved = false;
      for (const asset of s.assets) {
        // Primary: native location from getAssetInfoAsync (already parsed as number via parseFloat)
        if (asset.latitude != null && asset.longitude != null) {
          s.latitude = asset.latitude;
          s.longitude = asset.longitude;
          resolved = true;
          break;
        }
      }
      if (resolved) continue;
      // Secondary: EXIF fallback — try all assets, stop at first success
      for (const asset of s.assets) {
        const normalizedExif = normalizeExifForMetadata(asset.exif);
        if (normalizedExif) {
          const coords = getDecimalCoordinatesFromExif(normalizedExif);
          if (coords) {
            s.latitude = coords.latitude;
            s.longitude = coords.longitude;
            break;
          }
        }
      }
    }

    normalizedOptions.onProgress?.({
      phase: 'done',
      completed: 1,
      total: 1,
      percent: 100,
      label: 'Suggestions ready',
    });

    return { suggestions };
  } catch (e) {
    if (isImportLatestAbortedError(e)) {
      logger.log('ImportLatest: run cancelled by user');
      return { suggestions: [] };
    }
    logger.error('ImportLatest: run failed', e);
    return {
      suggestions: [],
      error: e instanceof Error ? e.message : 'Could not load recent photos.',
    };
  }
}

/**
 * Run the import pipeline on a pre-selected set of photos from expo-image-picker.
 * Bypasses all MediaLibrary fetching — goes straight to cluster → rank → suggest.
 */
export async function runImportFromSelectedAssets(
  pickedAssets: PickedGalleryAsset[],
  options?: RunImportFromSelectionOptions
): Promise<ImportLatestResult> {
  const { onProgress, signal, maxSuggestions = MAX_SUGGESTED_EXPERIENCES } = options ?? {};

  try {
    throwIfAborted(signal);

    if (pickedAssets.length === 0) return { suggestions: [] };

    onProgress?.({
      phase: 'fetch',
      completed: 0,
      total: pickedAssets.length,
      percent: 0,
      label: 'Preparing photos…',
    });

    // Convert picker assets to MediaAsset[], extracting timestamp and GPS from EXIF.
    const mediaAssets: MediaAsset[] = [];
    for (const picked of pickedAssets) {
      if (!picked.uri) continue;
      const exif = picked.exif ?? null;
      const creationTime = parseExifDateTimeToMs(exif) ?? Date.now();
      const normalizedExif = normalizeExifForMetadata(exif);
      const coords = normalizedExif ? getDecimalCoordinatesFromExif(normalizedExif) : null;
      const altitude = normalizedExif ? getAltitudeFromExif(normalizedExif) : null;
      // Use MediaLibrary assetId when available so duplicate detection by asset ID works.
      const id = picked.assetId ?? picked.uri;
      mediaAssets.push({
        id,
        uri: picked.uri,
        creationTime,
        width: picked.width,
        height: picked.height,
        fileSize: picked.fileSize,
        ...(coords ? { latitude: coords.latitude, longitude: coords.longitude } : {}),
        ...(altitude != null ? { altitudeMeters: altitude } : {}),
      });
    }

    throwIfAborted(signal);

    if (mediaAssets.length === 0) return { suggestions: [] };

    onProgress?.({ phase: 'cluster', completed: 1, total: 1, percent: 50, label: 'Grouping moments…' });

    const { kept } = filterNonCaptures(mediaAssets);
    const collapsed = collapseBursts(kept);
    const adaptiveWindow = computeAdaptiveTimeWindow(collapsed);
    const rawClusters = clusterAssets(collapsed, adaptiveWindow);
    const clusters = relaxGpsMissingOrphans(rawClusters, adaptiveWindow);
    const withSamples = clusters.map((cluster) => ({
      cluster,
      selected: selectRepresentativeAssets(cluster),
    }));
    const rawSuggestions = rankAndCapClusters(withSamples, maxSuggestions);

    throwIfAborted(signal);
    onProgress?.({ phase: 'finalize', completed: 1, total: 1, percent: 85, label: 'Preparing suggestions…' });

    // Picker assets already have file:// URIs — no localUri resolution needed.
    const suggestions: SuggestedExperienceWithDisplayUris[] = rawSuggestions.map((s) => ({
      ...s,
      assets: s.assets.map((a) => {
        const original = pickedAssets.find((p) => (p.assetId ?? p.uri) === a.id);
        return { ...a, displayUri: a.uri, exif: original?.exif ?? null };
      }),
    }));

    // Enrich suggestion-level location: prefer asset.latitude/longitude, fall back to EXIF.
    for (const s of suggestions) {
      throwIfAborted(signal);
      if (s.latitude != null && s.longitude != null) continue;
      for (const asset of s.assets) {
        if (asset.latitude != null && asset.longitude != null) {
          s.latitude = asset.latitude;
          s.longitude = asset.longitude;
          break;
        }
      }
      if (s.latitude != null) continue;
      for (const asset of s.assets) {
        const normalizedExif = normalizeExifForMetadata(asset.exif);
        if (normalizedExif) {
          const coords = getDecimalCoordinatesFromExif(normalizedExif);
          if (coords) {
            s.latitude = coords.latitude;
            s.longitude = coords.longitude;
            break;
          }
        }
      }
    }

    onProgress?.({ phase: 'done', completed: 1, total: 1, percent: 100, label: 'Suggestions ready' });
    return { suggestions };
  } catch (e) {
    if (isImportLatestAbortedError(e)) return { suggestions: [] };
    logger.error('ImportLatest: runImportFromSelectedAssets failed', e);
    return {
      suggestions: [],
      error: e instanceof Error ? e.message : 'Could not process selected photos.',
    };
  }
}
