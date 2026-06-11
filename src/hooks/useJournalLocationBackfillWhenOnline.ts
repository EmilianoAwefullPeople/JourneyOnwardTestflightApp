// useJournalLocationBackfillWhenOnline
// Runs journal location backfill when online, staggered to reduce overlap.

import { useEffect, useRef } from 'react';
import { Journal } from '../models/Journal';
import { runJournalLocationBackfill } from '../services/JournalLocationBackfillService';

const DEBOUNCE_MS = 6500;
const INITIAL_RUN_DELAY_MS = 8500;

export type UpdateJournalFn = (journal: Journal) => Promise<void>;

/**
 * When connectivity is available, fills persisted city/country on journals missing it.
 * Debounced; avoids overlapping runs.
 */
export function useJournalLocationBackfillWhenOnline(updateJournal: UpdateJournalFn): void {
  const wasConnectedRef = useRef<boolean | null>(null);
  const inProgressRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateJournalRef = useRef(updateJournal);
  updateJournalRef.current = updateJournal;

  const runBackfill = () => {
    if (inProgressRef.current) return;
    inProgressRef.current = true;
    runJournalLocationBackfill(updateJournalRef.current)
      .catch(() => {})
      .finally(() => {
        inProgressRef.current = false;
      });
  };

  const scheduleBackfill = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      runBackfill();
    }, DEBOUNCE_MS);
  };

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const netInfoModule = require('@react-native-community/netinfo');
      const NetInfo = netInfoModule?.default ?? netInfoModule;
      if (typeof NetInfo?.addEventListener !== 'function') {
        return;
      }
      unsubscribe = NetInfo.addEventListener((state: { isConnected: boolean | null }) => {
        const isConnected = state.isConnected === true;

        if (wasConnectedRef.current === null) {
          wasConnectedRef.current = isConnected;
          if (isConnected) {
            setTimeout(runBackfill, INITIAL_RUN_DELAY_MS);
          }
          return;
        }

        if (!wasConnectedRef.current && isConnected) {
          wasConnectedRef.current = true;
          scheduleBackfill();
        } else if (!isConnected) {
          wasConnectedRef.current = false;
        }
      });
    } catch {
      unsubscribe = undefined;
    }

    return () => {
      unsubscribe?.();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, []);
}
