// EntryMediaRepairService
// One-time (versioned) repair: copy photo files from cache/tmp or resolve ph:// into documentDirectory/media
// so Image can load them after app updates.

import * as MediaLibrary from 'expo-media-library';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Directory, Paths } from 'expo-file-system';
import { Entry } from '../models/Entry';
import * as PersistenceManager from '../storage/PersistenceManager';
import { copyMediaSlotToPersistentStorage, MEDIA_DIR_NAME } from '../storage/mediaStorage';
import { logger } from '../utils/logger';
import { requestMediaLibraryPermission } from './ImportLatestService';

export const ENTRY_MEDIA_REPAIR_STORAGE_KEY = '@awefull_people:entry_media_repair_version';
/** Bump when repair logic changes so existing installs run again. */
export const ENTRY_MEDIA_REPAIR_VERSION = '4';

/** AsyncStorage key tracking which build number last ran repair. */
export const ENTRY_MEDIA_REPAIR_BUILD_KEY = '@awefull_people:entry_repair_build';

function getPersistentMediaRootUri(): string {
  const mediaDir = new Directory(Paths.document, 'media');
  const root = mediaDir.uri;
  return root.endsWith('/') ? root : `${root}/`;
}

/**
 * Derives the canonical persistent URI for a given entry + slot.
 * This is `{documentDirectory}/media/{entryId}_{slotIndex}{ext}`.
 * Used as a recovery fallback when the stored absolute path is stale.
 */
function buildCanonicalMediaUri(entryId: string, slotIndex: number, ext: string): string {
  const mediaDir = new Directory(Paths.document, 'media');
  return new File(mediaDir, `${entryId}_${slotIndex}${ext}`).uri;
}

export function isUnderPersistentMedia(uri: string): boolean {
  if (!uri.startsWith('file://')) return false;
  try {
    const root = getPersistentMediaRootUri();
    return uri.startsWith(root);
  } catch {
    return false;
  }
}

function pathsNeedLibraryAccess(paths: string[]): boolean {
  return paths.some(
    (p) =>
      p.startsWith('ph://') ||
      p.startsWith('PH://') ||
      p.startsWith('assets-library://') ||
      p.startsWith('photos-redirect://')
  );
}

/**
 * Resolve iOS Photos-style URIs to a temporary file:// localUri via MediaLibrary.
 */
async function resolveLibraryUriToLocalFile(uri: string): Promise<string | null> {
  const raw = uri
    .replace(/^ph:\/\//i, '')
    .replace(/^assets-library:\/\//i, '')
    .replace(/^photos-redirect:\/\//i, '')
    .replace(/^\/+/, '');

  const candidates = new Set<string>();
  const firstSeg = raw.split('/')[0];
  if (firstSeg) {
    candidates.add(firstSeg);
    candidates.add(decodeURIComponent(firstSeg));
  }
  if (raw) {
    candidates.add(raw);
    candidates.add(decodeURIComponent(raw));
  }

  for (const id of candidates) {
    if (!id) continue;
    try {
      const info = await MediaLibrary.getAssetInfoAsync(id);
      const local = info.localUri;
      if (local && local.startsWith('file://')) {
        const f = new File(local);
        if (f.exists) return local;
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

function pathsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

/**
 * Returns an updated entry if photo paths were fixed, otherwise null.
 */
export async function repairEntryMediaIfNeeded(entry: Entry): Promise<Entry | null> {
  if (entry.mediaType !== 'photo' || !entry.photoPaths?.length) {
    return null;
  }

  const original = entry.photoPaths;
  const resolved: string[] = [];

  for (const uri of original) {
    if (pathsNeedLibraryAccess([uri])) {
      const local = await resolveLibraryUriToLocalFile(uri);
      resolved.push(local ?? uri);
    } else {
      resolved.push(uri);
    }
  }

  const finalPaths: string[] = [];
  let changed = false;

  for (let i = 0; i < resolved.length; i++) {
    let uri = resolved[i];

    if (!uri.startsWith('file://')) {
      finalPaths.push(uri);
      if (uri !== original[i]) changed = true;
      continue;
    }

    const f = new File(uri);
    if (!f.exists) {
      // Attempt recovery: reconstruct the canonical persistent path from entry ID + slot index.
      // Files are always named {entryId}_{slotIndex}{ext} under Documents/media/, so even if
      // the stored absolute path is stale (SDK upgrade, Expo path format change, etc.) the
      // file is still findable by name.
      const ext = uri.includes('.') ? uri.slice(uri.lastIndexOf('.')) : '.jpg';
      const canonical = buildCanonicalMediaUri(entry.id, i, ext);
      const canonicalFile = new File(canonical);
      if (canonicalFile.exists) {
        logger.log('EntryMediaRepair: recovered stale path via canonical name', {
          entryId: entry.id,
          i,
          oldUri: uri,
          canonical,
        });
        finalPaths.push(canonical);
        changed = true;
      } else {
        // File is truly missing — keep original path (so entry record is unchanged) but log it.
        logger.error('EntryMediaRepair: file missing, no recovery possible', {
          entryId: entry.id,
          i,
          uri,
          canonical,
        });
        finalPaths.push(original[i]);
      }
      continue;
    }

    if (isUnderPersistentMedia(uri)) {
      finalPaths.push(uri);
      if (uri !== original[i]) changed = true;
      continue;
    }

    try {
      const persisted = await copyMediaSlotToPersistentStorage(uri, entry.id, i);
      finalPaths.push(persisted);
      changed = true;
    } catch (e) {
      logger.warn('EntryMediaRepair: slot copy failed, keeping URI', { entryId: entry.id, i, uri, e });
      finalPaths.push(uri);
      if (uri !== original[i]) changed = true;
    }
  }

  if (!changed && pathsEqual(finalPaths, original)) {
    return null;
  }

  return {
    ...entry,
    photoPaths: finalPaths,
    mediaPaths: entry.mediaType === 'photo' ? finalPaths : entry.mediaPaths,
  };
}

export type EntryMediaRepairResult = {
  updated: number;
  /** True when ph:// (etc.) paths exist but library permission was denied — do not mark repair version complete. */
  deferredLibrary: boolean;
};

/**
 * Runs repair for all entries. Persists updates via PersistenceManager.
 */
export async function runEntryMediaRepair(): Promise<EntryMediaRepairResult> {
  let entries: Entry[];
  try {
    entries = await PersistenceManager.getEntries();
  } catch (e) {
    logger.error('EntryMediaRepair: getEntries failed', e);
    return { updated: 0, deferredLibrary: false };
  }

  const photoEntries = entries.filter(
    (e) => e.mediaType === 'photo' && e.photoPaths && e.photoPaths.length > 0
  );
  if (photoEntries.length === 0) {
    return { updated: 0, deferredLibrary: false };
  }

  const anyLibrary = photoEntries.some((e) => pathsNeedLibraryAccess(e.photoPaths ?? []));
  let libraryOk = true;
  if (anyLibrary) {
    libraryOk = await requestMediaLibraryPermission();
    if (!libraryOk) {
      logger.warn('EntryMediaRepair: media library permission denied; skipping ph:// resolution');
    }
  }

  let updated = 0;
  for (const entry of photoEntries) {
    try {
      const next = await repairEntryMediaIfNeeded(entry);
      if (next) {
        await PersistenceManager.updateEntry(next);
        updated++;
      }
    } catch (e) {
      logger.error('EntryMediaRepair: entry failed', { entryId: entry.id, e });
    }
  }

  // One-time migration: convert absolute persistent paths to relative paths.
  // Re-fetch entries so we work on the post-repair state (resolved absolute URIs
  // from PersistenceManager). Any path that is already under the persistent media
  // root gets converted to its relative form so it survives future container changes.
  const persistentRoot = getPersistentMediaRootUri();
  let migratedToRelative = 0;
  // Use the latest entry list (post-repair) for the migration pass
  let latestEntries: Entry[] = [];
  try {
    latestEntries = await PersistenceManager.getEntries();
  } catch {
    latestEntries = [];
  }
  for (const entry of latestEntries) {
    if (entry.mediaType !== 'photo' || !entry.photoPaths?.length) continue;
    let anyConverted = false;
    const newPaths = (entry.photoPaths ?? []).map((p) => {
      if (p.startsWith('file://') && p.startsWith(persistentRoot)) {
        const relative = `${MEDIA_DIR_NAME}/${p.slice(persistentRoot.length)}`;
        anyConverted = true;
        return relative;
      }
      return p;
    });
    if (anyConverted) {
      try {
        await PersistenceManager.updateEntry({
          ...entry,
          photoPaths: newPaths,
          mediaPaths: entry.mediaType === 'photo' ? newPaths : entry.mediaPaths,
        });
        migratedToRelative++;
      } catch (e) {
        logger.error('EntryMediaRepair: relative path migration failed', { entryId: entry.id, e });
      }
    }
  }

  if (migratedToRelative > 0) {
    logger.log(`EntryMediaRepair: migrated ${migratedToRelative} entries to relative paths`);
    updated += migratedToRelative;
  }

  const deferredLibrary = anyLibrary && !libraryOk;

  if (updated > 0) {
    logger.log(`EntryMediaRepair: updated ${updated} entries total`);
  }
  return { updated, deferredLibrary };
}

export async function shouldRunEntryMediaRepair(): Promise<boolean> {
  const v = await AsyncStorage.getItem(ENTRY_MEDIA_REPAIR_STORAGE_KEY);
  return v !== ENTRY_MEDIA_REPAIR_VERSION;
}

export async function markEntryMediaRepairComplete(): Promise<void> {
  await AsyncStorage.setItem(ENTRY_MEDIA_REPAIR_STORAGE_KEY, ENTRY_MEDIA_REPAIR_VERSION);
}
