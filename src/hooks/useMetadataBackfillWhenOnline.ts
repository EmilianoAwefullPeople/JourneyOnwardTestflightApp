// useMetadataBackfillWhenOnline
// Subscribes to NetInfo and runs metadata backfill when the app comes back online.
// Also runs once on mount if already online (e.g. app reopened while connected).

import { useEffect, useRef } from 'react';
import { runMetadataBackfill } from '../services/MetadataBackfillService';

const DEBOUNCE_MS = 3000;
const INITIAL_RUN_DELAY_MS = 2000;

/**
 * When connectivity becomes available, runs metadata backfill (weather for entries missing it).
 * Calls onDone() once after each successful batch so callers can refresh state.
 * Debounces "back online" events and avoids overlapping runs. Cleanup on unmount.
 */
export function useMetadataBackfillWhenOnline(onDone?: () => void): void {
  const wasConnectedRef = useRef<boolean | null>(null);
  const inProgressRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const runBackfill = () => {
    if (inProgressRef.current) return;
    inProgressRef.current = true;
    runMetadataBackfill()
      .catch(() => {
        // runMetadataBackfill never throws; ignore
      })
      .finally(() => {
        inProgressRef.current = false;
        onDoneRef.current?.();
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
    // Lazy-require NetInfo so the native module is never touched at startup
    // (AppContext imports this hook at the top level of App.tsx).
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
            // Already online on first check (e.g. app opened while connected)
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
      // NetInfo unavailable in current runtime/module state; skip background backfill.
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
