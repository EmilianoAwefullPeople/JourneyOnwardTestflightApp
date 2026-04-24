import React, { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { getCountryFromCoordinates } from '../utils/dateUtils';
import { localDayKeyFromDate } from '../utils/dayKeyUtils';
import {
  getDayCountrySnapshot,
  pruneDayCountrySnapshotsOlderThan,
  setDayCountrySnapshot,
} from '../storage/dayCountrySnapshotStorage';

/**
 * On first app foreground each local day, reverse-geocode current position and persist country
 * for the dashboard calendar. Before local noon, a second foreground may replace with a new country.
 */
const DailyAppOpenCountryCapture: React.FC = () => {
  const inFlightRef = useRef(false);

  const captureIfNeeded = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const dayKey = localDayKeyFromDate(new Date());
      const existing = await getDayCountrySnapshot(dayKey);

      const locationModule = await import('expo-location');
      let perm = await locationModule.getForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        perm = await locationModule.requestForegroundPermissionsAsync();
      }
      if (perm.status !== 'granted') return;

      const position = await locationModule.getCurrentPositionAsync({
        accuracy: locationModule.Accuracy.Balanced,
      });
      const country = await getCountryFromCoordinates(
        position.coords.latitude,
        position.coords.longitude
      );
      const trimmed = country?.trim();
      if (!trimmed) return;

      if (!existing) {
        await setDayCountrySnapshot(dayKey, trimmed);
        void pruneDayCountrySnapshotsOlderThan(24);
        return;
      }

      const hour = new Date().getHours();
      if (hour < 12 && existing.country.trim() !== trimmed) {
        await setDayCountrySnapshot(dayKey, trimmed);
      }
    } catch {
      /* soft-fail: no snapshot on denied / network errors */
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void captureIfNeeded();
    });
    void captureIfNeeded();
    return () => sub.remove();
  }, [captureIfNeeded]);

  return null;
};

export default DailyAppOpenCountryCapture;
