// useColorPaletteBackfill
// Runs color palette extraction for existing entries that don't have palettes yet.
// Fires once on mount with a short startup delay to avoid competing with initial data load.

import { useEffect, useRef } from 'react';
import { runColorPaletteBackfill } from '../services/ColorPaletteBackfillService';

const INITIAL_DELAY_MS = 5000; // wait for data load + navigation settle before starting

/**
 * Runs color palette backfill once on mount (after a short startup delay).
 * Calls onDone() after the batch completes so callers can refresh state.
 * Does not re-run on reconnect — palette extraction is local-only.
 */
export function useColorPaletteBackfill(onDone?: () => void): void {
  const inProgressRef = useRef(false);
  const hasRunRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (hasRunRef.current) return;

    const timer = setTimeout(() => {
      if (inProgressRef.current || hasRunRef.current) return;
      inProgressRef.current = true;
      hasRunRef.current = true;

      runColorPaletteBackfill()
        .catch(() => {
          // runColorPaletteBackfill never throws; ignore
        })
        .finally(() => {
          inProgressRef.current = false;
          onDoneRef.current?.();
        });
    }, INITIAL_DELAY_MS);

    return () => clearTimeout(timer);
  }, []);
}
