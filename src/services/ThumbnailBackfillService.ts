// ThumbnailBackfillService
// Generates 400 px thumbnails for existing photo entries that don't have them yet.
// Processes in small batches to avoid blocking the JS thread for extended periods.

import { getEntriesMissingThumbs, getEntriesByIds, updateEntryThumbPaths } from '../storage/PersistenceManager';
import { generateAndSaveThumbnails } from '../storage/mediaStorage';
import { logger } from '../utils/logger';

const BATCH_SIZE = 5;

/**
 * Immediately generates thumbnails for a specific list of entry IDs.
 * Called right after import so thumbnails are ready without waiting for the next session's
 * 12-second startup backfill.
 */
export const runThumbnailBackfillForEntries = async (entryIds: string[]): Promise<void> => {
  if (entryIds.length === 0) return;
  try {
    const entries = await getEntriesByIds(entryIds);
    for (const entry of entries) {
      if (!entry.photoPaths?.length) continue;
      try {
        const thumbPaths = await generateAndSaveThumbnails(entry.photoPaths, entry.id);
        if (thumbPaths.some(Boolean)) {
          await updateEntryThumbPaths(entry.id, thumbPaths.filter(Boolean));
        }
      } catch (e) {
        logger.warn('ThumbnailBackfill: targeted backfill failed for entry', { entryId: entry.id, error: e });
      }
    }
  } catch (e) {
    logger.warn('ThumbnailBackfill: targeted backfill service error', e);
  }
};

export const runThumbnailBackfill = async (): Promise<void> => {
  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const batch = await getEntriesMissingThumbs(BATCH_SIZE);
      if (batch.length === 0) break;

      for (const entry of batch) {
        if (!entry.photoPaths?.length) continue;
        try {
          const thumbPaths = await generateAndSaveThumbnails(entry.photoPaths, entry.id);
          if (thumbPaths.some(Boolean)) {
            await updateEntryThumbPaths(entry.id, thumbPaths.filter(Boolean));
          }
        } catch (e) {
          logger.warn('ThumbnailBackfill: failed for entry', { entryId: entry.id, error: e });
        }
      }
    }
  } catch (e) {
    logger.warn('ThumbnailBackfill: service error', e);
  }
};
