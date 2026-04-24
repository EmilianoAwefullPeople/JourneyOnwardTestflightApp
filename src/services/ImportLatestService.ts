// ImportLatestService
// Fetches device photos from last 72h, clusters by place+time, returns up to 12 suggested experiences.
// Resolves displayable URIs (localUri) for iOS ph:// assets so Image components can render thumbnails.

import * as MediaLibrary from 'expo-media-library';
import { logger } from '../utils/logger';
import { getDecimalCoordinatesFromExif } from '../utils/exifGps';
import { normalizeExifForMetadata } from '../utils/exifUtils';
import { getCountryFromCoordinates } from '../utils/dateUtils';
import {
  importLatestCoordBucketKey,
  readImportGeoCountryCache,
  writeImportGeoCountryCache,
} from '../storage/importLatestGeoCountryCache';
import type { MediaAsset, SuggestedExperience } from '../utils/importLatestClustering';
import {
  clusterAssets,
  selectRepresentativeAssets,
  rankAndCapClusters,
  MAX_SUGGESTED_EXPERIENCES,
} from '../utils/importLatestClustering';
import {
  loadYearAvailabilityCache,
  saveYearAvailabilityCache,
  type ImportLatestYearAvailabilitySignature,
} from '../utils/importLatestYearCache';

const HOURS_72_MS = 72 * 60 * 60 * 1000;
const FETCH_PAGE_SIZE = 200;

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
/** Reverse geocode concurrency (Apple CLGeocoder is sensitive to burst traffic). */
const GEOCODE_CONCURRENCY = 4;

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      throwIfAborted(signal);
      const i = nextIndex++;
      if (i >= items.length) break;
      results[i] = await mapper(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

type GalleryResolvedAssetInfo = {
  localUri: string | null;
  exif: object | null;
  latitude: number | null;
  longitude: number | null;
};

function parseLocationFromMediaAssetInfo(info: MediaLibrary.AssetInfo): GalleryResolvedAssetInfo {
  let latitude: number | null = null;
  let longitude: number | null = null;
  const loc = info.location;
  if (loc != null && typeof loc === 'object') {
    const rawLat = (loc as Record<string, unknown>).latitude;
    const rawLng = (loc as Record<string, unknown>).longitude;
    const parsedLat = parseFloat(String(rawLat));
    const parsedLng = parseFloat(String(rawLng));
    if (Number.isFinite(parsedLat)) latitude = parsedLat;
    if (Number.isFinite(parsedLng)) longitude = parsedLng;
  }
  if (latitude == null || longitude == null) {
    const normalizedExif = normalizeExifForMetadata(info.exif ?? null);
    const coords = normalizedExif ? getDecimalCoordinatesFromExif(normalizedExif) : null;
    if (coords) {
      latitude = coords.latitude;
      longitude = coords.longitude;
    }
  }
  return {
    localUri: info.localUri ?? null,
    exif: info.exif ?? null,
    latitude,
    longitude,
  };
}
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
  phase: 'fetch' | 'country' | 'cluster' | 'finalize' | 'done';
  completed: number;
  total: number;
  percent: number;
  label: string;
}

export interface RunImportLatestOptions {
  range?: ImportLatestRange;
  countryName?: string;
  selectedYears?: number[];
  onProgress?: (progress: ImportLatestProgress) => void;
  /** When aborted (e.g. user navigates away), long-running import steps stop cooperatively. */
  signal?: AbortSignal;
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

const getGallerySignature = async (): Promise<ImportLatestYearAvailabilitySignature> => {
  const bounds = await getGalleryBounds();
  return {
    newestAssetId: bounds.newestAssetId,
    newestCreationTimeMs: bounds.newestCreationTimeMs ?? undefined,
    estimatedTotal: bounds.estimatedTotal,
  };
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

/** Total photos matching the query (MediaLibrary `totalCount` on first page). */
async function getPhotoCountForQuery(createdAfter: number, createdBefore: number): Promise<number | null> {
  try {
    const page = await MediaLibrary.getAssetsAsync({
      first: 1,
      sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      mediaType: MediaLibrary.MediaType.photo,
      createdAfter,
      createdBefore,
    });
    const tc = (page as { totalCount?: number }).totalCount;
    if (typeof tc === 'number' && tc >= 0) return tc;
    return null;
  } catch (error) {
    logger.warn('ImportLatest: getPhotoCountForQuery failed', error);
    return null;
  }
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
  const cached = await loadYearAvailabilityCache();
  const currentSignature = await getGallerySignature();
  if (
    cached &&
    now - cached.computedAt <= ttl &&
    signaturesEqual(cached.signature, currentSignature)
  ) {
    return cached.years;
  }

  const bounds = await getGalleryBounds();
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

async function fetchAssetsForYears(
  years: number[],
  onProgress?: RunImportLatestOptions['onProgress'],
  signal?: AbortSignal
): Promise<MediaAsset[]> {
  const uniqueYears = Array.from(new Set(years))
    .filter((year) => Number.isInteger(year) && year >= 1970)
    .sort((a, b) => a - b);
  if (uniqueYears.length === 0) return [];

  const deduped = new Map<string, MediaAsset>();
  const totalYears = uniqueYears.length;

  const normalizedRanges = uniqueYears
    .map((y) => normalizeRange(getYearRangeMs(y)))
    .filter((r): r is { createdAfter: number; createdBefore: number } => r != null);
  throwIfAborted(signal);
  const yearTotals = await Promise.all(
    normalizedRanges.map((r) => getPhotoCountForQuery(r.createdAfter, r.createdBefore))
  );
  throwIfAborted(signal);
  let grandTotal = (() => {
    let sum = 0;
    for (const t of yearTotals) {
      if (typeof t !== 'number' || t < 0) return null;
      sum += t;
    }
    return sum;
  })();

  let cumulativeFetched = 0;

  for (let i = 0; i < totalYears; i++) {
    throwIfAborted(signal);
    const year = uniqueYears[i];
    const range = getYearRangeMs(year);
    const assets = await fetchAssetsInRange(range, (progress) => {
      const globalDone = cumulativeFetched + progress.completed;
      if (grandTotal != null && grandTotal > 0) {
        if (globalDone > grandTotal) {
          // Prefetched yearly totals can undercount; keep denominator monotonic.
          grandTotal = globalDone;
        }
        onProgress?.({
          phase: 'fetch',
          completed: globalDone,
          total: grandTotal,
          percent: Math.min(40, (globalDone / grandTotal) * 40),
          label: `Scanning year ${year}`,
        });
        return;
      }
      const segmentStart = (i / totalYears) * 40;
      const segmentSpan = 40 / totalYears;
      const globalPercent = Math.min(
        40,
        segmentStart + (Math.min(40, progress.percent) / 40) * segmentSpan
      );
      onProgress?.({
        phase: 'fetch',
        completed: globalDone,
        total: grandTotal ?? 0,
        percent: globalPercent,
        label: `Scanning year ${year}`,
      });
    }, signal);
    cumulativeFetched += assets.length;
    for (const asset of assets) {
      if (!deduped.has(asset.id)) {
        deduped.set(asset.id, asset);
      }
    }
  }
  return Array.from(deduped.values());
}

async function enrichAndFilterAssetsByCountry(
  assets: MediaAsset[],
  targetCountryName: string,
  onProgress?: RunImportLatestOptions['onProgress'],
  signal?: AbortSignal
): Promise<{ filtered: MediaAsset[]; assetInfoById: Map<string, GalleryResolvedAssetInfo> }> {
  const normalizedTarget = targetCountryName.trim().toLowerCase();
  const assetInfoById = new Map<string, GalleryResolvedAssetInfo>();

  if (!normalizedTarget) {
    return { filtered: assets, assetInfoById };
  }

  if (assets.length === 0) {
    return { filtered: [], assetInfoById };
  }

  const readTotal = assets.length;

  const emitCountry = (completed: number, total: number, percent: number) => {
    const safeTotal = Math.max(1, total);
    onProgress?.({
      phase: 'country',
      completed: Math.min(completed, safeTotal),
      total: safeTotal,
      percent: Math.min(100, percent),
      label: 'Matching country',
    });
  };

  let readDone = 0;
  const rows = await mapWithConcurrency(
    assets,
    ASSET_INFO_CONCURRENCY,
    async (asset) => {
      throwIfAborted(signal);
      let resolved: GalleryResolvedAssetInfo = {
        localUri: null,
        exif: null,
        latitude: null,
        longitude: null,
      };
      try {
        const info = await MediaLibrary.getAssetInfoAsync(asset.id);
        resolved = parseLocationFromMediaAssetInfo(info);
      } catch (err) {
        logger.warn('ImportLatest: getAssetInfoAsync failed during country filter', { id: asset.id, err });
      }
      assetInfoById.set(asset.id, resolved);
      readDone++;
      emitCountry(readDone, readTotal, (readDone / readTotal) * 50);
      return { asset, resolved };
    },
    signal
  );

  const coordKeyToRep = new Map<string, { lat: number; lng: number }>();
  for (const { resolved } of rows) {
    const lat = resolved.latitude;
    const lng = resolved.longitude;
    if (lat != null && lng != null) {
      const ck = importLatestCoordBucketKey(lat, lng);
      if (!coordKeyToRep.has(ck)) {
        coordKeyToRep.set(ck, { lat, lng });
      }
    }
  }

  const uniqueKeys = Array.from(coordKeyToRep.keys());
  const persisted = await readImportGeoCountryCache(uniqueKeys);
  const countryByCoordKey = new Map<string, string | null>();
  for (const k of uniqueKeys) {
    if (persisted.has(k)) {
      countryByCoordKey.set(k, persisted.get(k)!);
    }
  }

  const keysNeedingNetwork = uniqueKeys.filter((k) => !countryByCoordKey.has(k));
  const geoDenom = Math.max(1, keysNeedingNetwork.length);

  if (keysNeedingNetwork.length === 0) {
    emitCountry(readTotal, readTotal, 100);
  } else {
    const locationModule = await import('expo-location');
    const geoWrites: Array<{ key: string; country: string | null }> = [];
    let geoDone = 0;

    await mapWithConcurrency(
      keysNeedingNetwork,
      GEOCODE_CONCURRENCY,
      async (key) => {
        throwIfAborted(signal);
        const rep = coordKeyToRep.get(key);
        let country: string | null = null;
        if (rep) {
          country = await getCountryFromCoordinates(rep.lat, rep.lng, { locationModule });
        }
        countryByCoordKey.set(key, country);
        geoWrites.push({ key, country });
        geoDone++;
        const combinedDone = readTotal + geoDone;
        const combinedTotal = readTotal + keysNeedingNetwork.length;
        const pct = 50 + (geoDone / geoDenom) * 50;
        emitCountry(combinedDone, combinedTotal, pct);
        return null;
      },
      signal
    );

    if (geoWrites.length > 0) {
      await writeImportGeoCountryCache(geoWrites);
    }
  }

  const results: MediaAsset[] = [];
  for (const { asset, resolved } of rows) {
    const lat = resolved.latitude;
    const lng = resolved.longitude;
    if (lat == null || lng == null) continue;
    const ck = importLatestCoordBucketKey(lat, lng);
    const country = countryByCoordKey.get(ck) ?? null;
    if (country && country.trim().toLowerCase() === normalizedTarget) {
      results.push({ ...asset, latitude: lat, longitude: lng });
    }
  }

  return { filtered: results, assetInfoById };
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

    const countryName = normalizedOptions.countryName?.trim();
    const selectedYears = normalizedOptions.selectedYears;
    const useYearFilteredFetch =
      !!countryName && Array.isArray(selectedYears) && selectedYears.length > 0;

    const isCountryFlow = !!countryName && countryName.length > 0;
    if (isCountryFlow) {
      normalizedOptions.onProgress?.({
        phase: 'fetch',
        completed: 0,
        total: 0,
        percent: 0,
        label: 'Loading photos to match',
      });
    }
    const rawAssets = useYearFilteredFetch
      ? await fetchAssetsForYears(
          selectedYears ?? [],
          isCountryFlow ? undefined : normalizedOptions.onProgress,
          normalizedOptions.signal
        )
      : await fetchAssetsInRange(
          normalizedOptions.range,
          isCountryFlow ? undefined : normalizedOptions.onProgress,
          normalizedOptions.signal
        );
    throwIfAborted(normalizedOptions.signal);
    if (rawAssets.length === 0) {
      return { suggestions: [] };
    }

    let galleryAssetInfoById: Map<string, GalleryResolvedAssetInfo> | undefined;
    let assetsForClustering: MediaAsset[];
    if (countryName && countryName.length > 0) {
      const enriched = await enrichAndFilterAssetsByCountry(
        rawAssets,
        countryName,
        normalizedOptions.onProgress,
        normalizedOptions.signal
      );
      assetsForClustering = enriched.filtered;
      galleryAssetInfoById = enriched.assetInfoById;
    } else {
      assetsForClustering = rawAssets;
    }
    throwIfAborted(normalizedOptions.signal);

    if (assetsForClustering.length === 0) {
      normalizedOptions.onProgress?.({
        phase: 'done',
        completed: 1,
        total: 1,
        percent: 100,
        label: 'No photos matched your filter',
      });
      return { suggestions: [] };
    }

    normalizedOptions.onProgress?.({
      phase: 'cluster',
      completed: 1,
      total: 1,
      percent: isCountryFlow ? 100 : 78,
      label: 'Grouping moments',
    });

    const clusters = clusterAssets(assetsForClustering);
    const withSamples = clusters.map((cluster) => ({
      cluster,
      selected: selectRepresentativeAssets(cluster),
    }));
    const rawSuggestions = rankAndCapClusters(withSamples, MAX_SUGGESTED_EXPERIENCES);
    normalizedOptions.onProgress?.({
      phase: 'finalize',
      completed: 1,
      total: 1,
      percent: isCountryFlow ? 100 : 85,
      label: 'Preparing suggestions',
    });

    // Resolve displayable URIs for each asset (iOS returns ph:// which Image cannot load).
    const allAssetIds = rawSuggestions.flatMap((s) => s.assets.map((a) => a.id));
    const assetInfos: Array<{
      localUri: string | null;
      exif: object | null;
      latitude: number | null;
      longitude: number | null;
    }> = [];
    for (const id of allAssetIds) {
      throwIfAborted(normalizedOptions.signal);
      if (galleryAssetInfoById?.has(id)) {
        const cached = galleryAssetInfoById.get(id)!;
        assetInfos.push({
          localUri: cached.localUri,
          exif: cached.exif,
          latitude: cached.latitude,
          longitude: cached.longitude,
        });
        continue;
      }
      try {
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
        assetInfos.push({
          localUri: info.localUri ?? null,
          exif: info.exif ?? null,
          latitude: lat,
          longitude: lng,
        });
      } catch (err) {
        logger.warn('ImportLatest: getAssetInfoAsync failed', { id, err });
        assetInfos.push({ localUri: null, exif: null, latitude: null, longitude: null });
      }
    }

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
