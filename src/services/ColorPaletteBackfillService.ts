// ColorPaletteBackfillService
// Extracts and saves color palettes for existing photo entries that don't have them yet.
// Best-effort only; never throws. Invoked from AppContext on mount.

import * as PersistenceManager from '../storage/PersistenceManager';
import { extractColorPalettesForEntry } from './ColorExtractionService';
import { logger } from '../utils/logger';

const DELAY_BETWEEN_ENTRIES_MS = 300;
const MAX_ENTRIES_PER_RUN = 20;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface ColorPaletteBackfillOptions {
  onProgress?: (filled: number) => void;
  maxEntries?: number;
  delayMs?: number;
}

/**
 * Finds photo entries without color palettes and extracts them sequentially.
 * Persists results via a scoped DB update that never touches photo paths.
 * Best-effort: logs and continues on per-entry failures; never throws.
 */
export async function runColorPaletteBackfill(
  options?: ColorPaletteBackfillOptions
): Promise<void> {
  const maxEntries = options?.maxEntries ?? MAX_ENTRIES_PER_RUN;
  const delayMs = options?.delayMs ?? DELAY_BETWEEN_ENTRIES_MS;

  let entries;
  try {
    entries = await PersistenceManager.getEntriesMissingColorPalettes(maxEntries);
  } catch (error) {
    logger.error('ColorPaletteBackfill: getEntriesMissingColorPalettes failed', error);
    return;
  }

  if (entries.length === 0) return;

  logger.log('ColorPaletteBackfill: processing', entries.length, 'entries missing palettes');
  let filled = 0;

  for (const entry of entries) {
    // photoPaths are already resolved to absolute file:// by getEntriesMissingColorPalettes
    if (!entry.photoPaths || entry.photoPaths.length === 0) continue;

    try {
      const palettes = await extractColorPalettesForEntry(entry.photoPaths);

      if (palettes.every((p) => p === null)) {
        logger.warn('ColorPaletteBackfill: no palette extracted for entry', entry.id);
        await delay(delayMs);
        continue;
      }

      await PersistenceManager.updateEntryColorPalettes(entry.id, palettes as string[][]);
      filled++;
      options?.onProgress?.(filled);
    } catch (error) {
      logger.warn('ColorPaletteBackfill: failed to process entry', entry.id, error);
    }

    await delay(delayMs);
  }

  if (filled > 0) {
    logger.log('ColorPaletteBackfill: filled palettes for', filled, 'entries');
  }
}
