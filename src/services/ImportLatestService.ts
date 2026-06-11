// ImportLatestService
// Fetches device photos from last 72h, clusters by place+time, returns up to 12 suggested experiences.
// Resolves displayable URIs (localUri) for iOS ph:// assets so Image components can render thumbnails.

import * as MediaLibrary from 'expo-media-library';
import { logger } from '../utils/logger';
import { getDecimalCoordinatesFromExif } from '../utils/exifGps';
import { normalizeExifForMetadata } from '../utils/exifUtils';
import { parseExifDateTimeToMs } from '../utils/exifTimestamp';
import { getIsoCodeForCountryName } from '../utils/countryUtils';
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
  TIME_WINDOW_MS,
} from '../utils/importLatestClustering';
import {
  loadYearAvailabilityCache,
  saveYearAvailabilityCache,
  type ImportLatestYearAvailabilitySignature,
} from '../utils/importLatestYearCache';

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
/** Reverse geocode concurrency (Apple CLGeocoder is sensitive to burst traffic). */
const GEOCODE_CONCURRENCY = 4;
/** Concurrent month-range pagination during year-based fetching. */
const MONTH_FETCH_CONCURRENCY = 4;

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

// Asset shape returned by expo-image-picker with exif: true
export interface PickedGalleryAsset {
  uri: string;
  width: number;
  height: number;
  assetId?: string | null;
  exif?: Record<string, unknown> | null;
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

/** Decompose selected years into individual calendar-month ranges for parallel fetching. */
function getMonthRangesForYears(years: number[]): ImportLatestRange[] {
  const ranges: ImportLatestRange[] = [];
  for (const year of years) {
    for (let month = 0; month < 12; month++) {
      const createdAfter = new Date(year, month, 1, 0, 0, 0, 0).getTime();
      // new Date(year, month+1, 0) = last calendar day of `month` (day-0 of next month)
      const createdBefore = new Date(year, month + 1, 0, 23, 59, 59, 999).getTime();
      ranges.push({ createdAfter, createdBefore });
    }
  }
  return ranges;
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

  const monthRanges = getMonthRangesForYears(uniqueYears);

  // Shared progress accumulators. Mutation is safe — JS event loop is single-threaded
  // so concurrent async callbacks never truly interleave within a synchronous statement.
  let globalFetched = 0;
  let globalTotal: number | null = null;
  // Per-month totals (filled once a month's first page lands) and previous cumulative counts
  // (used to convert fetchAssetsInRange's cumulative progress into per-page deltas).
  const monthTotals: (number | null)[] = new Array(monthRanges.length).fill(null);
  const monthPrev: number[] = new Array(monthRanges.length).fill(0);

  const emitGlobal = () => {
    onProgress?.({
      phase: 'fetch',
      completed: globalFetched,
      total: globalTotal ?? 0,
      percent:
        globalTotal != null && globalTotal > 0
          ? Math.min(40, (globalFetched / globalTotal) * 40)
          : 0,
      label:
        globalTotal != null
          ? `Scanning photos (${globalFetched} / ${globalTotal})`
          : `Scanning photos (${globalFetched})`,
    });
  };

  const allMonthAssets = await mapWithConcurrency(
    monthRanges,
    MONTH_FETCH_CONCURRENCY,
    async (monthRange, idx) =>
      fetchAssetsInRange(
        monthRange,
        (progress) => {
          // fetchAssetsInRange emits cumulative counts; take the delta since the last callback.
          const delta = progress.completed - monthPrev[idx];
          monthPrev[idx] = progress.completed;
          globalFetched += delta;

          // Register this month's expected total the first time it's known.
          if (progress.total > 0 && monthTotals[idx] == null) {
            monthTotals[idx] = progress.total;
          }
          // Sum of all known month totals; grows as months' first pages arrive.
          const knownSum = monthTotals.reduce<number>((s, t) => s + (t ?? 0), 0);
          if (knownSum > 0 && (globalTotal == null || knownSum > globalTotal)) {
            globalTotal = knownSum;
          }
          // Keep denominator ≥ numerator when any month underreports its total.
          if (globalTotal != null && globalFetched > globalTotal) {
            globalTotal = globalFetched;
          }

          emitGlobal();
        },
        signal
      ),
    signal
  );

  return allMonthAssets.flat();
}

async function enrichAndFilterAssetsByCountry(
  assets: MediaAsset[],
  targetIso: string,
  onProgress?: RunImportLatestOptions['onProgress'],
  signal?: AbortSignal
): Promise<{ filtered: MediaAsset[]; assetInfoById: Map<string, GalleryResolvedAssetInfo> }> {
  const assetInfoById = new Map<string, GalleryResolvedAssetInfo>();

  if (!targetIso) {
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
        const info = await MediaLibrary.getAssetInfoAsync(asset.id, { shouldDownloadFromNetwork: false });
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
  // Map stores ISO 3166-1 alpha-2 codes (or null for no-country / geocoding failure).
  const isoByCoordKey = new Map<string, string | null>();
  for (const k of uniqueKeys) {
    if (persisted.has(k)) {
      isoByCoordKey.set(k, persisted.get(k)!);
    }
  }

  const keysNeedingNetwork = uniqueKeys.filter((k) => !isoByCoordKey.has(k));
  const geoDenom = Math.max(1, keysNeedingNetwork.length);

  if (keysNeedingNetwork.length === 0) {
    emitCountry(readTotal, readTotal, 100);
  } else {
    const locationModule = await import('expo-location');
    const geoWrites: Array<{ key: string; isoCode: string | null }> = [];
    let geoDone = 0;

    await mapWithConcurrency(
      keysNeedingNetwork,
      GEOCODE_CONCURRENCY,
      async (key) => {
        throwIfAborted(signal);
        const rep = coordKeyToRep.get(key);
        let isoCode: string | null = null;
        if (rep) {
          try {
            const addresses = await locationModule.reverseGeocodeAsync({
              latitude: rep.lat,
              longitude: rep.lng,
            });
            // isoCountryCode ("IT", "FR", …) is locale-invariant; prefer over addresses[0].country
            // which is localized and would fail the comparison on non-English devices.
            isoCode = addresses[0]?.isoCountryCode?.toUpperCase() ?? null;
          } catch (err) {
            logger.warn('ImportLatest: reverseGeocode failed', { key, err });
          }
        }
        isoByCoordKey.set(key, isoCode);
        geoWrites.push({ key, isoCode });
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

  // Pass 1: GPS-tagged assets confirmed in the target country.
  const results: MediaAsset[] = [];
  for (const { asset, resolved } of rows) {
    const lat = resolved.latitude;
    const lng = resolved.longitude;
    if (lat == null || lng == null) continue;
    const ck = importLatestCoordBucketKey(lat, lng);
    const iso = isoByCoordKey.get(ck) ?? null;
    if (iso && iso === targetIso) {
      results.push({ ...asset, latitude: lat, longitude: lng });
    }
  }

  // Pass 2: assets without GPS that are temporally adjacent (≤ 30 min) to a confirmed GPS asset.
  // Captures indoor shots, burst sequences, and photos taken in airplane mode during the same
  // experience — they would otherwise be silently dropped.
  if (results.length > 0) {
    const matchedTimes = results.map((a) => a.creationTime);
    for (const { asset, resolved } of rows) {
      if (resolved.latitude != null && resolved.longitude != null) continue; // already handled in pass 1
      const nearestGap = matchedTimes.reduce(
        (min, t) => Math.min(min, Math.abs(asset.creationTime - t)),
        Infinity
      );
      if (nearestGap <= TIME_WINDOW_MS) {
        results.push(asset); // no lat/lng; clustering will group by time proximity only
      }
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
    const targetIso = isCountryFlow ? (getIsoCodeForCountryName(countryName!) ?? null) : null;
    if (isCountryFlow && !targetIso) {
      logger.warn('ImportLatest: could not resolve ISO code for country', { countryName });
      return { suggestions: [], error: 'Could not identify selected country.' };
    }
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
    if (isCountryFlow && targetIso) {
      const enriched = await enrichAndFilterAssetsByCountry(
        rawAssets,
        targetIso,
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
    // Run concurrently — the country flow already has results cached in galleryAssetInfoById;
    // the date flow benefits from parallel native I/O here.
    const allAssetIds = rawSuggestions.flatMap((s) => s.assets.map((a) => a.id));
    const assetInfos = await mapWithConcurrency(
      allAssetIds,
      ASSET_INFO_CONCURRENCY,
      async (id) => {
        throwIfAborted(normalizedOptions.signal);
        if (galleryAssetInfoById?.has(id)) {
          const cached = galleryAssetInfoById.get(id)!;
          if (cached.localUri != null) {
            // Fast path: localUri already resolved (asset was locally available during country filter).
            return {
              localUri: cached.localUri,
              exif: cached.exif,
              latitude: cached.latitude,
              longitude: cached.longitude,
            };
          }
          // localUri is null — the country filter used shouldDownloadFromNetwork:false and this
          // asset was iCloud-offloaded at the time. Fall through to fetch with network access.
        }
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
      // Use MediaLibrary assetId when available so duplicate detection by asset ID works.
      const id = picked.assetId ?? picked.uri;
      mediaAssets.push({
        id,
        uri: picked.uri,
        creationTime,
        width: picked.width,
        height: picked.height,
        ...(coords ? { latitude: coords.latitude, longitude: coords.longitude } : {}),
      });
    }

    throwIfAborted(signal);

    if (mediaAssets.length === 0) return { suggestions: [] };

    onProgress?.({ phase: 'cluster', completed: 1, total: 1, percent: 50, label: 'Grouping moments…' });

    const clusters = clusterAssets(mediaAssets);
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
