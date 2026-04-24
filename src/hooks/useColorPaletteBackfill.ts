// useColorPaletteBackfill
// Runs color palette extraction for existing entries that don't have palettes yet.
// Fires once on mount with a short startup delay to avoid competing with initial data load.

import { useEffect, useRef } from 'react';
import { Entry } from '../models/Entry';
import { runColorPaletteBackfill } from '../services/ColorPaletteBackfillService';

const INITIAL_DELAY_MS = 5000; // wait for data load + navigation settle before starting

export type UpdateEntryFn = (entry: Entry) => Promise<void>;

/**
 * Runs color palette backfill once on mount (after a short startup delay).
 * Does not re-run on reconnect — palette extraction is local-only.
 */
export function useColorPaletteBackfill(updateEntry: UpdateEntryFn): void {
  const inProgressRef = useRef(false);
  const hasRunRef = useRef(false);
  const updateEntryRef = useRef(updateEntry);
  updateEntryRef.current = updateEntry;

  useEffect(() => {
    if (hasRunRef.current) return;

    const timer = setTimeout(() => {
      if (inProgressRef.current || hasRunRef.current) return;
      inProgressRef.current = true;
      hasRunRef.current = true;

      runColorPaletteBackfill(updateEntryRef.current)
        .catch(() => {
          // runColorPaletteBackfill never throws; ignore
        })
        .finally(() => {
          inProgressRef.current = false;
        });
    }, INITIAL_DELAY_MS);

    return () => clearTimeout(timer);
  }, []);
}
