// mediaStorage
// Copies media files into the app's persistent document directory so they survive app updates.

import { File, Directory, Paths } from 'expo-file-system';
import { logger } from '../utils/logger';

export const MEDIA_DIR_NAME = 'media';

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
  if (sourceUris.length === 0) {
    return [];
  }

  ensureMediaDirectory();
  const mediaDir = new Directory(Paths.document, MEDIA_DIR_NAME);
  const resultUris: string[] = [];

  for (let i = 0; i < sourceUris.length; i++) {
    const sourceUri = sourceUris[i];
    const ext = getExtensionFromUri(sourceUri);
    const destFileName = `${entryId}_${i}${ext}`;
    const destFile = new File(mediaDir, destFileName);

    try {
      const sourceFile = new File(sourceUri);
      if (!sourceFile.exists) {
        throw new Error(`Source file does not exist: ${sourceUri}`);
      }
      sourceFile.copy(destFile);
      // Store relative path so the URI stays valid regardless of container path changes
      resultUris.push(`${MEDIA_DIR_NAME}/${destFileName}`);
    } catch (error) {
      logger.error('mediaStorage: copy failed', { sourceUri, destFileName, entryId, error });
      throw error;
    }
  }

  logger.log(`mediaStorage: copied ${resultUris.length} file(s) for entry ${entryId}`);
  return resultUris;
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
    sourceFile.copy(destFile);
    logger.log(`mediaStorage: copied slot ${slotIndex} for entry ${entryId}`);
    // Return relative path for stable storage
    return `${MEDIA_DIR_NAME}/${destFileName}`;
  } catch (error) {
    logger.error('mediaStorage: slot copy failed', { sourceUri, destFileName, entryId, slotIndex, error });
    throw error;
  }
}

/**
 * Deletes files in documentDirectory/media named `{entryId}_*`. Best-effort after DB row removal.
 */
/** Removes documentDirectory/media (all entry media). Used with full DB reset. */
export function deleteAllPersistentMedia(): void {
  try {
    const mediaDir = new Directory(Paths.document, MEDIA_DIR_NAME);
    if (mediaDir.exists) {
      mediaDir.delete();
    }
  } catch (e) {
    logger.warn('mediaStorage: deleteAllPersistentMedia failed', e);
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
      // Copy from manipulator's temp output to persistent media directory.
      const tempFile = new File(thumb.uri);
      tempFile.copy(thumbFile);
      result.push(thumbRelativePath);
    } catch (e) {
      logger.warn('mediaStorage: thumbnail generation failed', { entryId, index: i, error: e });
      result.push('');
    }
  }

  return result;
}
