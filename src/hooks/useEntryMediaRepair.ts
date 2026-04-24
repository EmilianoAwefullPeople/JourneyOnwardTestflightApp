import { useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';
import {
  ENTRY_MEDIA_REPAIR_STORAGE_KEY,
  ENTRY_MEDIA_REPAIR_BUILD_KEY,
  ENTRY_MEDIA_REPAIR_VERSION,
  markEntryMediaRepairComplete,
  runEntryMediaRepair,
  shouldRunEntryMediaRepair,
} from '../services/EntryMediaRepairService';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const CURRENT_BUILD: string = require('../../app.json').expo.ios.buildNumber ?? 'unknown';

/** Prevents duplicate concurrent runs (e.g. React Strict Mode double mount). */
let repairInFlight = false;

/**
 * After first successful load, runs a versioned one-time repair of entry photo paths
 * (cache/tmp → Documents/media, ph:// → local file copy). Then refreshes data if needed.
 */
export function useEntryMediaRepair(
  isLoading: boolean,
  refreshData: () => Promise<void>
): void {
  const refreshRef = useRef(refreshData);
  refreshRef.current = refreshData;

  useEffect(() => {
    if (isLoading || repairInFlight) return;

    let cancelled = false;
    repairInFlight = true;

    (async () => {
      try {
        // If this is a new build, invalidate the stored repair version so repair
        // always runs at least once per build number, regardless of version string.
        const storedBuild = await AsyncStorage.getItem(ENTRY_MEDIA_REPAIR_BUILD_KEY);
        if (storedBuild !== CURRENT_BUILD) {
          await AsyncStorage.removeItem(ENTRY_MEDIA_REPAIR_STORAGE_KEY);
          await AsyncStorage.setItem(ENTRY_MEDIA_REPAIR_BUILD_KEY, CURRENT_BUILD);
          logger.log(`useEntryMediaRepair: new build ${CURRENT_BUILD} (was ${storedBuild ?? 'none'}), repair invalidated`);
        }

        const should = await shouldRunEntryMediaRepair();
        if (cancelled || !should) return;

        const { updated, deferredLibrary } = await runEntryMediaRepair();
        if (cancelled) return;

        if (updated > 0) {
          await refreshRef.current();
        }
        if (!deferredLibrary) {
          await markEntryMediaRepairComplete();
        }
      } catch (e) {
        logger.error('useEntryMediaRepair failed', e);
        try {
          await AsyncStorage.removeItem(ENTRY_MEDIA_REPAIR_STORAGE_KEY);
        } catch {
          // ignore
        }
      } finally {
        repairInFlight = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoading]);
}

export { ENTRY_MEDIA_REPAIR_STORAGE_KEY, ENTRY_MEDIA_REPAIR_BUILD_KEY, ENTRY_MEDIA_REPAIR_VERSION };
