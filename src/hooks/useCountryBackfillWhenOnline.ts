// useCountryBackfillWhenOnline
// Runs country backfill when online, staggered from weather backfill to reduce overlap.

import { useEffect, useRef } from 'react';
import { runCountryBackfill } from '../services/CountryBackfillService';

const DEBOUNCE_MS = 5500;
const INITIAL_RUN_DELAY_MS = 7500;

/**
 * When connectivity is available, fills persisted `country` on entries missing it.
 * Calls onDone() once after each successful batch so callers can refresh state.
 * Debounced; avoids overlapping runs.
 */
export function useCountryBackfillWhenOnline(onDone?: () => void): void {
  const wasConnectedRef = useRef<boolean | null>(null);
  const inProgressRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const runBackfill = () => {
    if (inProgressRef.current) return;
    inProgressRef.current = true;
    runCountryBackfill()
      .catch(() => {})
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
