// mediaStorage
// Copies media files into the app's persistent document directory so they survive app updates.

import { File, Directory, Paths } from 'expo-file-system';
import { copyAsync } from 'expo-file-system/legacy';
import { logger } from '../utils/logger';

export const MEDIA_DIR_NAME = 'media';
const POSTCARD_THUMB_DIR_NAME = 'postcard_thumbs';

/**
 * Resolves a stored photo path to a fully-qualified `file://` URI suitable for
 * use in an Image component. Handles both legacy absolute URIs (stored before
 * relative path migration) and the current relative format (`media/{name}`).
 *
 * Pass-through for non-file URIs (ph://, assets-library://, http(s)://).
 */
export function resolveMediaPath(storedPath: string): string {
  if (!storedPath) return storedPath;
  // Already a fully-qualified URI (legacy absolute path or non-file URI)
  if (
    storedPath.startsWith('file://') ||
    storedPath.startsWith('ph://') ||
    storedPath.startsWith('PH://') ||
    storedPath.startsWith('assets-library://') ||
    storedPath.startsWith('http://') ||
    storedPath.startsWith('https://')
  ) {
    return storedPath;
  }
  // Relative path (e.g. "media/uuid_0.jpg") — expand to absolute
  return new File(Paths.document, storedPath).uri;
}

/**
 * Converts an absolute persistent-media file:// URI back to its relative form
 * (e.g. "media/uuid_0.jpg"). No-ops on already-relative paths, ph://, http(s)://,
 * or any path not under Documents/media/. Safe to call on already-relative paths.
 */
export function toRelativePath(p: string): string {
  if (!p || !p.startsWith('file://')) return p;
  try {
    const mediaDir = new Directory(Paths.document, MEDIA_DIR_NAME);
    const root = mediaDir.uri.endsWith('/') ? mediaDir.uri : `${mediaDir.uri}/`;
    if (p.startsWith(root)) {
      return `${MEDIA_DIR_NAME}/${p.slice(root.length)}`;
    }
  } catch {
    // File-system API unavailable — return original path unchanged
  }
  return p;
}

export function toRelativePathArray(paths: string[]): string[] {
  return paths.map(toRelativePath);
}

/**
 * Ensures the persistent media directory exists (documentDirectory/media/).
 * Idempotent; safe to call multiple times.
 */
function ensureMediaDirectory(): void {
  const mediaDir = new Directory(Paths.document, MEDIA_DIR_NAME);
  if (!mediaDir.exists) {
    mediaDir.create({ intermediates: true, idempotent: true });
  }
}

/**
 * Derives file extension from a URI (e.g. .jpg, .png). Defaults to '.jpg' if none found.
 */
function getExtensionFromUri(uri: string): string {
  const lastSlash = uri.lastIndexOf('/');
  const lastDot = uri.indexOf('.', lastSlash);
  if (lastDot !== -1 && lastDot < uri.length - 1) {
    return uri.slice(lastDot);
  }
  return '.jpg';
}

/**
 * Copies a list of source file URIs into the persistent media directory with stable names
 * so they survive app updates and cache clears.
 *
 * @param sourceUris - Array of file URIs (e.g. from takePictureAsync or ImagePicker).
 * @param entryId - Entry UUID; used to name files as {entryId}_0.{ext}, {entryId}_1.{ext}, etc.
 * @returns Array of persistent URIs in the same order as sourceUris.
 * @throws Error if any copy fails (e.g. source missing, disk full, permission).
 */
export async function copyMediaToPersistentStorage(
  sourceUris: string[],
  entryId: string
): Promise<string[]> {
  if (sourceUris.length === 0) return [];

  ensureMediaDirectory();
  const mediaDir = new Directory(Paths.document, MEDIA_DIR_NAME);

  // Validate all sources exist before starting any copy.
  for (const uri of sourceUris) {
    if (!new File(uri).exists) {
      throw new Error(`Source file does not exist: ${uri}`);
    }
  }

  // copyAsync runs on the native background thread, so all copies run in parallel
  // without blocking the JS thread. Order is preserved via index mapping.
  const relativePaths = await Promise.all(
    sourceUris.map(async (sourceUri, i) => {
      const ext = getExtensionFromUri(sourceUri);
      const destFileName = `${entryId}_${i}${ext}`;
      const destFile = new File(mediaDir, destFileName);
      try {
        await copyAsync({ from: sourceUri, to: destFile.uri });
        return `${MEDIA_DIR_NAME}/${destFileName}`;
      } catch (error) {
        logger.error('mediaStorage: copy failed', { sourceUri, destFileName, entryId, error });
        throw error;
      }
    })
  );

  logger.log(`mediaStorage: copied ${relativePaths.length} file(s) for entry ${entryId}`);
  return relativePaths;
}

/**
 * Copies a single file into documentDirectory/media as `{entryId}_{slotIndex}{ext}`.
 * Used when repairing entries so each photo slot keeps a stable name without re-copying sibling slots.
 */
export async function copyMediaSlotToPersistentStorage(
  sourceUri: string,
  entryId: string,
  slotIndex: number
): Promise<string> {
  ensureMediaDirectory();
  const mediaDir = new Directory(Paths.document, MEDIA_DIR_NAME);
  const ext = getExtensionFromUri(sourceUri);
  const destFileName = `${entryId}_${slotIndex}${ext}`;
  const destFile = new File(mediaDir, destFileName);

  try {
    const sourceFile = new File(sourceUri);
    if (!sourceFile.exists) {
      throw new Error(`Source file does not exist: ${sourceUri}`);
    }
    await copyAsync({ from: sourceUri, to: destFile.uri });
    logger.log(`mediaStorage: copied slot ${slotIndex} for entry ${entryId}`);
    return `${MEDIA_DIR_NAME}/${destFileName}`;
  } catch (error) {
    logger.error('mediaStorage: slot copy failed', { sourceUri, destFileName, entryId, slotIndex, error });
    throw error;
  }
}

/**
 * Deletes files in documentDirectory/media named `{entryId}_*`. Best-effort after DB row removal.
 */
/** Removes documentDirectory/media (all entry media) and cached postcard thumbnails. Used with full DB reset. */
export function deleteAllPersistentMedia(): void {
  try {
    const mediaDir = new Directory(Paths.document, MEDIA_DIR_NAME);
    if (mediaDir.exists) {
      mediaDir.delete();
    }
  } catch (e) {
    logger.warn('mediaStorage: deleteAllPersistentMedia failed', e);
  }
  try {
    const thumbDir = new Directory(Paths.document, POSTCARD_THUMB_DIR_NAME);
    if (thumbDir.exists) {
      thumbDir.delete();
    }
  } catch (e) {
    logger.warn('mediaStorage: deleteAllPersistentMedia (postcard thumbs) failed', e);
  }
}

export function deletePersistentMediaForEntry(entryId: string): void {
  try {
    const mediaDir = new Directory(Paths.document, MEDIA_DIR_NAME);
    if (!mediaDir.exists) return;
    const prefix = `${entryId}_`;
    for (const item of mediaDir.list()) {
      if (!(item instanceof File)) continue;
      if (!item.name.startsWith(prefix)) continue;
      if (!item.exists) continue;
      try {
        item.delete();
      } catch (err) {
        logger.warn('mediaStorage: delete file failed', { name: item.name, entryId, err });
      }
    }
  } catch (e) {
    logger.warn('mediaStorage: deletePersistentMediaForEntry failed', { entryId, e });
  }
}

/**
 * Generates 600 px-wide JPEG thumbnails for each resolved photo URI and saves them
 * into the same persistent media directory as `{entryId}_{index}_thumb2.jpg`.
 *
 * Skips photos whose thumbnail already exists on disk. Returns an array of relative
 * paths in the same slot order as resolvedPhotoPaths; empty strings for any slot
 * that failed so callers can safely fall back to photoPaths[i].
 *
 * @param resolvedPhotoPaths - Fully-qualified file:// URIs (already resolved from DB).
 * @param entryId - Entry UUID used to name the thumbnail files.
 */
export async function generateAndSaveThumbnails(
  resolvedPhotoPaths: string[],
  entryId: string,
): Promise<string[]> {
  if (resolvedPhotoPaths.length === 0) return [];

  // Dynamic import so expo-image-manipulator isn't in the initial module chain.
  const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator');

  ensureMediaDirectory();
  const mediaDir = new Directory(Paths.document, MEDIA_DIR_NAME);
  const result: string[] = [];

  for (let i = 0; i < resolvedPhotoPaths.length; i++) {
    const sourcePath = resolvedPhotoPaths[i];
    if (!sourcePath) { result.push(''); continue; }

    const thumbFileName = `${entryId}_${i}_thumb2.jpg`;
    const thumbRelativePath = `${MEDIA_DIR_NAME}/${thumbFileName}`;
    const thumbFile = new File(mediaDir, thumbFileName);

    if (thumbFile.exists) {
      result.push(thumbRelativePath);
      continue;
    }

    try {
      const thumb = await manipulateAsync(
        sourcePath,
        [{ resize: { width: 600 } }],
        { compress: 0.82, format: SaveFormat.JPEG },
      );
      await copyAsync({ from: thumb.uri, to: thumbFile.uri });
      result.push(thumbRelativePath);
    } catch (e) {
      logger.warn('mediaStorage: thumbnail generation failed', { entryId, index: i, error: e });
      result.push('');
    }
  }

  return result;
}

const POSTCARD_THUMB_WIDTH = 600;

function ensurePostcardThumbDirectory(): Directory {
  const dir = new Directory(Paths.document, POSTCARD_THUMB_DIR_NAME);
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
  return dir;
}

/**
 * Generates (and caches on disk) a 600px-wide JPEG copy of each postcard photo slot, so
 * gallery/list thumbnails don't decode full-resolution originals — postcard photos are
 * referenced by their original source URI (entry photo or camera-roll asset), which can be
 * several megabytes each. Skips slots that already have a cached copy; falls back to the
 * original URI for any slot that fails to resize (e.g. unsupported `ph://` variant).
 *
 * @param postcardId - Postcard UUID used to name/cache the thumbnail files.
 * @param sourcePaths - Slot photo URIs in slot order; nulls pass through unchanged.
 */
export async function getOrCreatePostcardPhotoThumbnails(
  postcardId: string,
  sourcePaths: (string | null)[],
): Promise<(string | null)[]> {
  if (sourcePaths.every((p) => !p)) return sourcePaths;

  // Dynamic import so expo-image-manipulator isn't in the initial module chain.
  const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator');

  const thumbDir = ensurePostcardThumbDirectory();

  return Promise.all(
    sourcePaths.map(async (sourcePath, i) => {
      if (!sourcePath) return null;

      const thumbFile = new File(thumbDir, `${postcardId}_${i}_thumb.jpg`);
      if (thumbFile.exists) return thumbFile.uri;

      try {
        const thumb = await manipulateAsync(
          sourcePath,
          [{ resize: { width: POSTCARD_THUMB_WIDTH } }],
          { compress: 0.82, format: SaveFormat.JPEG },
        );
        await copyAsync({ from: thumb.uri, to: thumbFile.uri });
        return thumbFile.uri;
      } catch (e) {
        logger.warn('mediaStorage: postcard thumbnail generation failed', { postcardId, index: i, error: e });
        return sourcePath;
      }
    })
  );
}

/** Deletes cached postcard thumbnail files for a postcard. Best-effort after DB row removal. */
export function deletePostcardPhotoThumbnails(postcardId: string): void {
  try {
    const thumbDir = new Directory(Paths.document, POSTCARD_THUMB_DIR_NAME);
    if (!thumbDir.exists) return;
    const prefix = `${postcardId}_`;
    for (const item of thumbDir.list()) {
      if (!(item instanceof File)) continue;
      if (!item.name.startsWith(prefix)) continue;
      try {
        item.delete();
      } catch (err) {
        logger.warn('mediaStorage: delete postcard thumbnail failed', { name: item.name, postcardId, err });
      }
    }
  } catch (e) {
    logger.warn('mediaStorage: deletePostcardPhotoThumbnails failed', { postcardId, e });
  }
}
