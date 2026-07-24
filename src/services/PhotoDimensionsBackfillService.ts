// PhotoDimensionsBackfillService
// Measures first photo per entry and persists width/height for gallery aspect ratios.

import {
  getEntriesByIds,
  getEntriesMissingPhotoDimensions,
  updateEntryPhotoDimensions,
} from '../storage/PersistenceManager';
import { resolveMediaPath } from '../storage/mediaStorage';
import { buildPhotoDimensionArrays, measurePhotoDimensionsFromUri } from '../utils/galleryAspectRatio';
import { logger } from '../utils/logger';

const BATCH_SIZE = 8;

async function backfillDimensionsForEntry(entryId: string, photoPaths: string[]): Promise<boolean> {
  if (photoPaths.length === 0) return false;

  const resolved = photoPaths.map(resolveMediaPath);
  const measured = await Promise.all(resolved.map((uri) => measurePhotoDimensionsFromUri(uri)));
  const { photoWidths, photoHeights } = buildPhotoDimensionArrays(
    photoPaths.length,
    measured.map((m) => (m ? { width: m.width, height: m.height } : null))
  );

  if (!photoWidths?.length || !photoHeights?.length) return false;

  await updateEntryPhotoDimensions(entryId, photoWidths, photoHeights);
  return true;
}

export const runPhotoDimensionsBackfillForEntries = async (entryIds: string[]): Promise<void> => {
  if (entryIds.length === 0) return;
  try {
    const entries = await getEntriesByIds(entryIds);
    for (const entry of entries) {
      if (!entry.photoPaths?.length) continue;
      if (entry.photoWidths?.some((w) => w > 0)) continue;
      try {
        await backfillDimensionsForEntry(entry.id, entry.photoPaths);
      } catch (e) {
        logger.warn('PhotoDimensionsBackfill: targeted backfill failed for entry', { entryId: entry.id, error: e });
      }
    }
  } catch (e) {
    logger.warn('PhotoDimensionsBackfill: targeted backfill service error', e);
  }
};

export const runPhotoDimensionsBackfill = async (): Promise<void> => {
  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const batch = await getEntriesMissingPhotoDimensions(BATCH_SIZE);
      if (batch.length === 0) break;

      for (const entry of batch) {
        if (!entry.photoPaths?.length) continue;
        try {
          await backfillDimensionsForEntry(entry.id, entry.photoPaths);
        } catch (e) {
          logger.warn('PhotoDimensionsBackfill: failed for entry', { entryId: entry.id, error: e });
        }
      }
    }
  } catch (e) {
    logger.warn('PhotoDimensionsBackfill: service error', e);
  }
};
