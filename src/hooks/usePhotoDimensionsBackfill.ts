// usePhotoDimensionsBackfill
// Measures and persists photo pixel dimensions for existing entries missing them.
// Fires once per session after startup delay (local-only, no network).

import { useEffect, useRef } from 'react';
import { runPhotoDimensionsBackfill } from '../services/PhotoDimensionsBackfillService';

const INITIAL_DELAY_MS = 14000;

export function usePhotoDimensionsBackfill(onDone?: () => void): void {
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

      runPhotoDimensionsBackfill()
        .catch(() => {})
        .finally(() => {
          inProgressRef.current = false;
          onDoneRef.current?.();
        });
    }, INITIAL_DELAY_MS);

    return () => clearTimeout(timer);
  }, []);
}
