// useThumbnailBackfill
// Runs thumbnail generation for existing entries that don't have thumbnails yet.
// Fires once per session after a startup delay so it doesn't compete with data loading.
// Does not require network — all work is local.

import { useEffect, useRef } from 'react';
import { runThumbnailBackfill } from '../services/ThumbnailBackfillService';

const INITIAL_DELAY_MS = 12000; // 12 s: after WAL backfills and initial render settle

export function useThumbnailBackfill(onDone?: () => void): void {
  const hasRunRef = useRef(false);
  const inProgressRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (hasRunRef.current) return;

    const timer = setTimeout(() => {
      if (inProgressRef.current || hasRunRef.current) return;
      inProgressRef.current = true;
      hasRunRef.current = true;

      runThumbnailBackfill()
        .catch(() => {})
        .finally(() => {
          inProgressRef.current = false;
          onDoneRef.current?.();
        });
    }, INITIAL_DELAY_MS);

    return () => clearTimeout(timer);
  }, []);
}
