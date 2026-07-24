// Full-screen month list for dashboard country calendar (all memories; not trip-filtered).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import BackArrow from '../components/common/icons/BackArrow';
import DashboardDayFlagCalendar from '../components/review/DashboardDayFlagCalendar';
import CountryRangeAssignSheet from '../components/review/CountryRangeAssignSheet';
import { FONT_WEIGHTS, SPACING } from '../config/constants';
import { TEXT_STYLES } from '../config/typography';
import { useTheme } from '../context/ThemeContext';
import { useAppContext } from '../context/AppContext';
import type { RootStackParamList } from '../navigation/types';
import { getCountryFromCoordinates } from '../utils/dateUtils';
import { localDayKeyFromDate, localDayKeysInMonth } from '../utils/dayKeyUtils';
import { buildCaptureCountryByDayKey, buildMergedDayCountryDisplay } from '../utils/calendarDayCountryMap';
import { getDayCountrySnapshotsForDayKeys, setDayCountrySnapshotsBatch } from '../storage/dayCountrySnapshotStorage';
import {
  computeFullCalendarStartMonth,
  currentYearMonth,
  enumerateMonthsInclusive,
  getLatestMemoryYearMonth,
  getOrInitCalendarJoinMonth,
  type YearMonth,
} from '../storage/calendarJoinMonthStorage';

const FULL_CALENDAR_MAX_GEOCODE_COORDS = 120;

type Nav = NativeStackNavigationProp<RootStackParamList, 'FullCountryCalendar'>;

const FullCountryCalendarScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { entries, journals } = useAppContext();

  const [monthRange, setMonthRange] = useState<YearMonth[]>([]);
  const [calendarSnapshots, setCalendarSnapshots] = useState<Record<string, string>>({});
  const [countryByCoord, setCountryByCoord] = useState<Record<string, string>>({});

  const seededCountryByCoord = useMemo(() => {
    const m: Record<string, string> = {};
    for (const e of entries) {
      if (e.latitude != null && e.longitude != null && e.country?.trim()) {
        const ck = `${e.latitude.toFixed(2)},${e.longitude.toFixed(2)}`;
        if (!m[ck]) m[ck] = e.country.trim();
      }
    }
    return m;
  }, [entries]);

  const innerWidth = screenWidth - SPACING.md * 2 - SPACING.lg * 2;
  const todayDayKey = useMemo(() => localDayKeyFromDate(new Date()), []);

  // Default the scroll position to the current month (months render oldest -> newest).
  const scrollRef = useRef<ScrollView>(null);
  const monthLayoutYRef = useRef<Record<string, number>>({});
  const scrolledToCurrentRef = useRef(false);
  const currentMonthKey = useMemo(() => {
    const now = currentYearMonth();
    return `${now.year}-${now.monthIndex0}`;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const joinMonth = await getOrInitCalendarJoinMonth(entries, journals);
      const latestMemoryMonth = getLatestMemoryYearMonth(entries, journals);
      const start = computeFullCalendarStartMonth(joinMonth, latestMemoryMonth);
      const end = currentYearMonth();
      const months = enumerateMonthsInclusive(start, end);
      const allDayKeys = months.flatMap((m) => localDayKeysInMonth(m.year, m.monthIndex0));
      const snaps = await getDayCountrySnapshotsForDayKeys(allDayKeys);
      if (cancelled) return;
      setMonthRange(months);
      setCalendarSnapshots(snaps);
    })();
    return () => {
      cancelled = true;
    };
  }, [entries, journals]);

  useEffect(() => {
    let cancelled = false;
    const coordPairs = new Set<string>();
    [...entries, ...journals].forEach((item) => {
      if (item.latitude != null && item.longitude != null) {
        coordPairs.add(`${item.latitude.toFixed(2)},${item.longitude.toFixed(2)}`);
      }
    });
    const limitedCoords = Array.from(coordPairs).slice(0, FULL_CALENDAR_MAX_GEOCODE_COORDS);
    if (limitedCoords.length === 0) {
      setCountryByCoord({});
      return;
    }
    (async () => {
      const next: Record<string, string> = { ...seededCountryByCoord };
      for (const coord of limitedCoords) {
        if (next[coord]) continue;
        try {
          const [lat, lng] = coord.split(',').map(Number);
          const country = await getCountryFromCoordinates(lat, lng);
          if (country) next[coord] = country;
        } catch {
          /* soft-fail */
        }
      }
      if (!cancelled) setCountryByCoord(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [entries, journals, seededCountryByCoord]);

  const captureCountryByDay = useMemo(
    () => buildCaptureCountryByDayKey(entries, journals, countryByCoord),
    [entries, journals, countryByCoord]
  );

  /** Re-fetch snapshots when returning from DayDetail, in case a country was just recorded there. */
  useFocusEffect(
    useCallback(() => {
      if (monthRange.length === 0) return;
      const allDayKeys = monthRange.flatMap((m) => localDayKeysInMonth(m.year, m.monthIndex0));
      void getDayCountrySnapshotsForDayKeys(allDayKeys).then(setCalendarSnapshots);
    }, [monthRange])
  );

  const handleDayPress = useCallback(
    (dayKey: string) => {
      navigation.navigate('DayDetail', { dayKey });
    },
    [navigation]
  );

  const [rangeSelectDayKeys, setRangeSelectDayKeys] = useState<string[] | null>(null);
  const handleRangeSelectionEnd = useCallback((dayKeys: string[]) => {
    if (dayKeys.length < 2) return;
    setRangeSelectDayKeys(dayKeys);
  }, []);
  const handleRangeSelectSave = useCallback(
    async (country: string) => {
      const keys = rangeSelectDayKeys ?? [];
      setRangeSelectDayKeys(null);
      if (keys.length === 0 || monthRange.length === 0) return;
      await setDayCountrySnapshotsBatch(keys, country);
      const allDayKeys = monthRange.flatMap((m) => localDayKeysInMonth(m.year, m.monthIndex0));
      const snaps = await getDayCountrySnapshotsForDayKeys(allDayKeys);
      setCalendarSnapshots(snaps);
    },
    [rangeSelectDayKeys, monthRange]
  );

  const handleMonthLayout = useCallback(
    (monthKey: string) => (e: LayoutChangeEvent) => {
      const y = e.nativeEvent.layout.y;
      monthLayoutYRef.current[monthKey] = y;
      if (monthKey === currentMonthKey && !scrolledToCurrentRef.current) {
        scrolledToCurrentRef.current = true;
        scrollRef.current?.scrollTo({ y: Math.max(0, y - SPACING.md), animated: false });
      }
    },
    [currentMonthKey]
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={12}
        >
          <BackArrow width={22} height={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.35}>
          Calendar
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={{
          paddingHorizontal: SPACING.md,
          paddingBottom: insets.bottom + SPACING.xl,
          paddingTop: SPACING.md,
        }}
        showsVerticalScrollIndicator={false}
      >
        {monthRange.map((ym) => {
          const monthKey = `${ym.year}-${ym.monthIndex0}`;
          const keys = localDayKeysInMonth(ym.year, ym.monthIndex0);
          const merged = buildMergedDayCountryDisplay(keys, captureCountryByDay, calendarSnapshots);
          return (
            <View key={monthKey} style={{ marginBottom: SPACING.lg }} onLayout={handleMonthLayout(monthKey)}>
              <DashboardDayFlagCalendar
                width={innerWidth}
                year={ym.year}
                monthIndex0={ym.monthIndex0}
                displayByDay={merged}
                textPrimary={colors.textPrimary}
                textSecondary={colors.textSecondary}
                textTertiary={colors.textTertiary}
                todayDayKey={todayDayKey}
                todayPillBackground={colors.surfaceVariant}
                todayDayNumberColor={colors.textPrimary}
                onDayPress={handleDayPress}
                onRangeSelectionEnd={handleRangeSelectionEnd}
              />
            </View>
          );
        })}
      </ScrollView>

      <CountryRangeAssignSheet
        visible={rangeSelectDayKeys != null}
        dayCount={rangeSelectDayKeys?.length ?? 0}
        onCancel={() => setRangeSelectDayKeys(null)}
        onSave={handleRangeSelectSave}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    ...TEXT_STYLES.cardTitle,
    fontSize: 18,
    fontWeight: FONT_WEIGHTS.semibold,
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  scroll: {
    flex: 1,
  },
});

export default FullCountryCalendarScreen;
