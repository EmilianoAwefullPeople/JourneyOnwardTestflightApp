// ExperienceImportService
// Compatibility layer used by ImportLatestScreen.
// Bridges the older screen contract to ImportLatestService.

import type { Entry } from '../models/Entry';
import type { TripAlbum } from '../models/TripAlbum';
import { generateUUID } from '../utils/uuid';
import { findMatchingAlbumId } from '../utils/albumUtils';
import { getSeasonFromTimestamp } from '../utils/seasonUtils';
import { copyMediaToPersistentStorage } from '../storage/mediaStorage';
import { addImportedAssetIds, getImportedAssetIds } from '../utils/importLatestStorage';
import { mapWithConcurrency } from '../utils/concurrency';
import { logger } from '../utils/logger';
import {
  runImportLatest,
  runImportFromSelectedAssets,
  type ImportLatestRange,
  type ImportLatestResult,
  type RunImportLatestOptions,
  type RunImportFromSelectionOptions,
  type PickedGalleryAsset,
  type SuggestedExperienceWithDisplayUris,
} from './ImportLatestService';
import { runThumbnailBackfillForEntries } from './ThumbnailBackfillService';
import { runPhotoDimensionsBackfillForEntries } from './PhotoDimensionsBackfillService';
import { buildPhotoDimensionArrays } from '../utils/galleryAspectRatio';

type DiscoverLatestArgs = {
  kind: 'latest';
  options?: RunImportLatestOptions | ImportLatestRange;
};

type DiscoverSelectedArgs = {
  kind: 'selected';
  assets: PickedGalleryAsset[];
  options?: RunImportFromSelectionOptions;
};

export type DiscoverExperienceSuggestionsArgs = DiscoverLatestArgs | DiscoverSelectedArgs;

export async function discoverExperienceSuggestions(
  args: DiscoverExperienceSuggestionsArgs
): Promise<ImportLatestResult> {
  if (args.kind === 'latest') {
    return runImportLatest(args.options);
  }
  return runImportFromSelectedAssets(args.assets, args.options);
}

type PersistSelectedExperiencesArgs = {
  suggestions: SuggestedExperienceWithDisplayUris[];
  selectedIds: Set<string>;
  existingEntries: Entry[];
  tripAlbums: TripAlbum[];
  createEntry: (entry: Entry) => Promise<void>;
  refreshData?: () => Promise<void>;
  signal?: AbortSignal;
  /** When provided, skips date-range lookup and pins all entries to this album. */
  albumId?: string;
  /** Called after each successful entry save. */
  onProgress?: (completed: number, total: number) => void;
};

type PersistSelectedExperiencesResult = {
  added: number;
  failed: number;
  skippedDuplicates: number;
  entryIds: string[];
  schemaFailureNotice?: string;
};

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('PersistSelectedExperiencesAborted');
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.message === 'PersistSelectedExperiencesAborted';
}

function getSuggestionAssetIds(suggestion: SuggestedExperienceWithDisplayUris): string[] {
  return suggestion.assets
    .map((asset) => asset.id)
    .filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
}

function looksLikeSchemaError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return msg.includes('no such column') || msg.includes('has no column named') || msg.includes('table');
}

export async function persistSelectedExperiences(
  args: PersistSelectedExperiencesArgs
): Promise<PersistSelectedExperiencesResult> {
  const {
    suggestions,
    selectedIds,
    existingEntries,
    tripAlbums,
    createEntry,
    refreshData,
    signal,
    albumId: pinnedAlbumId,
    onProgress,
  } = args;

  const selectedSuggestions = suggestions.filter((suggestion) => selectedIds.has(suggestion.id));
  if (selectedSuggestions.length === 0) {
    return { added: 0, failed: 0, skippedDuplicates: 0, entryIds: [] };
  }

  const alreadyImported = await getImportedAssetIds();
  const existingMediaPaths = new Set(
    existingEntries.flatMap((entry) => entry.mediaPaths ?? entry.photoPaths ?? [])
  );

  // Deduplicate geocode calls by coordinate bucket before the save loop.
  // Apple CLGeocoder allows ~4 concurrent; batch all unique coords upfront
  // so each bucket is resolved once regardless of how many entries share it.
  type GeoResult = { country?: string; city?: string };
  const coordToGeo = new Map<string, GeoResult>();
  const coordsToResolve: Array<{ key: string; lat: number; lng: number }> = [];

  for (const suggestion of selectedSuggestions) {
    if (suggestion.latitude != null && suggestion.longitude != null) {
      const key = `${suggestion.latitude.toFixed(2)},${suggestion.longitude.toFixed(2)}`;
      if (!coordToGeo.has(key)) {
        coordToGeo.set(key, {});
        coordsToResolve.push({ key, lat: suggestion.latitude, lng: suggestion.longitude });
      }
    }
  }

  if (coordsToResolve.length > 0) {
    const locationModule = await import('expo-location');
    await mapWithConcurrency(coordsToResolve, 4, async ({ key, lat, lng }) => {
      throwIfAborted(signal);
      try {
        const addresses = await locationModule.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        const first = addresses?.[0] as
          | { country?: string; city?: string; locality?: string; subAdministrativeArea?: string }
          | undefined;
        if (first) {
          coordToGeo.set(key, {
            country: first.country?.trim() || undefined,
            city: (first.city || first.locality || first.subAdministrativeArea)?.trim() || undefined,
          });
        }
      } catch {
        // Soft-fail; entry will save without country/city for this coord bucket.
      }
    });
  }

  // Separate duplicate-check pass (synchronous) so the parallel workers start clean.
  const eligibleSuggestions = selectedSuggestions.filter((suggestion) => {
    const assetIds = getSuggestionAssetIds(suggestion);
    if (assetIds.some((id) => alreadyImported.has(id))) return false;
    if (suggestion.assets.some((asset) => existingMediaPaths.has(asset.uri))) return false;
    return true;
  });
  const skippedDuplicates = selectedSuggestions.length - eligibleSuggestions.length;
  const total = eligibleSuggestions.length;

  let added = 0;
  let failed = 0;
  let schemaFailureNotice: string | undefined;
  const entryIds: string[] = [];
  const newImportedAssetIds: string[] = [];

  await mapWithConcurrency(eligibleSuggestions, 3, async (suggestion) => {
    throwIfAborted(signal);

    try {
      const entryId = generateUUID();
      const timestamp = suggestion.timestamp || new Date().toISOString();
      const sourceUris = suggestion.assets
        .map((asset) => asset.displayUri ?? asset.uri)
        .filter((uri): uri is string => typeof uri === 'string' && uri.trim().length > 0);

      if (sourceUris.length === 0) {
        failed += 1;
        return;
      }

      const persistentPaths = await copyMediaToPersistentStorage(sourceUris, entryId);

      const dimensionArrays = buildPhotoDimensionArrays(
        persistentPaths.length,
        suggestion.assets.slice(0, persistentPaths.length)
      );

      // Resolve country/city from the pre-built geocode map (no extra API call per entry).
      let country: string | undefined;
      let city: string | undefined;
      if (suggestion.latitude != null && suggestion.longitude != null) {
        const key = `${suggestion.latitude.toFixed(2)},${suggestion.longitude.toFixed(2)}`;
        const geo = coordToGeo.get(key);
        if (geo) { country = geo.country; city = geo.city; }
      }

      const entry: Entry = {
        id: entryId,
        type: 'experience',
        title: '',
        description: '',
        mediaType: 'photo',
        photoPaths: persistentPaths,
        mediaPaths: persistentPaths,
        ...dimensionArrays,
        timestamp,
        latitude: suggestion.latitude,
        longitude: suggestion.longitude,
        ...(suggestion.altitudeMeters != null ? { altitudeMeters: suggestion.altitudeMeters } : {}),
        country,
        city,
        albumId: pinnedAlbumId ?? findMatchingAlbumId(timestamp, tripAlbums),
        season: getSeasonFromTimestamp(timestamp, suggestion.latitude),
        isDraft: false,
        isBookmarked: false,
      };

      await createEntry(entry);

      const assetIds = getSuggestionAssetIds(suggestion);
      assetIds.forEach((id) => { alreadyImported.add(id); newImportedAssetIds.push(id); });
      entry.mediaPaths.forEach((path) => existingMediaPaths.add(path));
      entryIds.push(entryId);
      added += 1;
      onProgress?.(added, total);
    } catch (error) {
      if (isAbortError(error)) throw error;
      logger.error('ExperienceImportService: persistSelectedExperiences item failed', error);
      failed += 1;
      if (schemaFailureNotice == null && looksLikeSchemaError(error)) {
        schemaFailureNotice =
          'Some photos could not be saved due to a local data schema mismatch. Please restart the app and try again.';
      }
    }
  }, signal);

  if (newImportedAssetIds.length > 0) {
    await addImportedAssetIds(newImportedAssetIds);
  }
  if (typeof refreshData === 'function') {
    await refreshData();
  }

  // Fire-and-forget: generate thumbnails for newly saved entries immediately
  // rather than waiting for the next session's 12-second startup backfill.
  if (entryIds.length > 0) {
    void runThumbnailBackfillForEntries(entryIds);
    void runPhotoDimensionsBackfillForEntries(entryIds);
  }

  return { added, failed, skippedDuplicates, entryIds, schemaFailureNotice };
}
