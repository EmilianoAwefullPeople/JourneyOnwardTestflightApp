// ExperienceImportService
// Compatibility layer used by ImportLatestScreen.
// Bridges the older screen contract to ImportLatestService.

import type { Entry } from '../models/Entry';
import type { TripAlbum } from '../models/TripAlbum';
import { generateUUID } from '../utils/uuid';
import { findMatchingAlbumId } from '../utils/albumUtils';
import { getSeasonFromTimestamp } from '../utils/seasonUtils';
import { copyMediaToPersistentStorage } from '../storage/mediaStorage';
import { attachCountryToEntryIfMissing } from '../utils/entryCountryResolve';
import { addImportedAssetIds, getImportedAssetIds } from '../utils/importLatestStorage';
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
};

type PersistSelectedExperiencesResult = {
  added: number;
  failed: number;
  skippedDuplicates: number;
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
  } = args;

  const selectedSuggestions = suggestions.filter((suggestion) => selectedIds.has(suggestion.id));
  if (selectedSuggestions.length === 0) {
    return { added: 0, failed: 0, skippedDuplicates: 0 };
  }

  const alreadyImported = await getImportedAssetIds();
  const existingMediaPaths = new Set(
    existingEntries.flatMap((entry) => entry.mediaPaths ?? entry.photoPaths ?? [])
  );

  let added = 0;
  let failed = 0;
  let skippedDuplicates = 0;
  let schemaFailureNotice: string | undefined;
  const newImportedAssetIds: string[] = [];

  for (const suggestion of selectedSuggestions) {
    throwIfAborted(signal);

    const suggestionAssetIds = getSuggestionAssetIds(suggestion);
    const alreadySavedByAssetId = suggestionAssetIds.some((assetId) => alreadyImported.has(assetId));
    const alreadySavedByPath = suggestion.assets.some((asset) => existingMediaPaths.has(asset.uri));
    if (alreadySavedByAssetId || alreadySavedByPath) {
      skippedDuplicates += 1;
      continue;
    }

    try {
      const entryId = generateUUID();
      const timestamp = suggestion.timestamp || new Date().toISOString();
      const sourceUris = suggestion.assets
        .map((asset) => asset.displayUri ?? asset.uri)
        .filter((uri): uri is string => typeof uri === 'string' && uri.trim().length > 0);

      if (sourceUris.length === 0) {
        failed += 1;
        continue;
      }

      const persistentPaths = await copyMediaToPersistentStorage(sourceUris, entryId);
      const entry: Entry = {
        id: entryId,
        type: 'experience',
        title: '',
        description: '',
        mediaType: 'photo',
        photoPaths: persistentPaths,
        mediaPaths: persistentPaths,
        storageUrls: [],
        timestamp,
        latitude: suggestion.latitude,
        longitude: suggestion.longitude,
        albumId: findMatchingAlbumId(timestamp, tripAlbums),
        season: getSeasonFromTimestamp(timestamp, suggestion.latitude),
        isDraft: false,
        isAwe: false,
      };

      const entryWithCountry = await attachCountryToEntryIfMissing(entry);
      await createEntry(entryWithCountry);

      suggestionAssetIds.forEach((assetId) => {
        alreadyImported.add(assetId);
        newImportedAssetIds.push(assetId);
      });
      entryWithCountry.mediaPaths.forEach((path) => existingMediaPaths.add(path));
      added += 1;
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      logger.error('ExperienceImportService: persistSelectedExperiences item failed', error);
      failed += 1;
      if (schemaFailureNotice == null && looksLikeSchemaError(error)) {
        schemaFailureNotice =
          'Some photos could not be saved due to a local data schema mismatch. Please restart the app and try again.';
      }
    }
  }

  if (newImportedAssetIds.length > 0) {
    await addImportedAssetIds(newImportedAssetIds);
  }
  if (typeof refreshData === 'function') {
    await refreshData();
  }

  return {
    added,
    failed,
    skippedDuplicates,
    schemaFailureNotice,
  };
}
