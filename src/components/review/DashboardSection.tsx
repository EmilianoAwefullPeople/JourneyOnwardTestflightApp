import React, { useEffect, useId, useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppState, Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { DIMENSIONS, FONT_SIZES, FONT_WEIGHTS, SPACING } from '../../config/constants';
import type { ThemeColors } from '../../config/theme';
import { TEXT_STYLES } from '../../config/typography';
import { useTheme } from '../../context/ThemeContext';
import { Entry } from '../../models/Entry';
import { Journal } from '../../models/Journal';
import { TripAlbum } from '../../models/TripAlbum';
import { getCityCountryLabel, getCountryFromCoordinates } from '../../utils/dateUtils';
import { getContinentForCountryName, getCountryFlagEmoji } from '../../utils/countryUtils';
import { getEffectiveMainTabInset } from '../../navigation/mainTabBarMetrics';
import { pointsToSmoothAreaPath, pointsToSmoothCurvePath } from '../../utils/chartSmoothPath';
import { buildCaptureCountryByDayKey, buildMergedDayCountryDisplay } from '../../utils/calendarDayCountryMap';
import { localDayKeyFromDate, localDayKeysInMonth } from '../../utils/dayKeyUtils';
import { RootStackParamList } from '../../navigation/types';
import { getDayCountrySnapshotsForDayKeys } from '../../storage/dayCountrySnapshotStorage';
import DashboardDayFlagCalendar from './DashboardDayFlagCalendar';
import DashboardGeneralKpiStrip from './DashboardGeneralKpiStrip';
import { useDashboardColorPalette } from '../../hooks/useDashboardColorPalette';
import DashboardEmotionalDataSection from './DashboardEmotionalDataSection';

interface DashboardSectionProps {
  entries: Entry[];
  journals: Journal[];
  tripAlbums: TripAlbum[];
  tripFilterActive?: boolean;
  scrollRef?: React.RefObject<ScrollView | null>;
  onScrollReport?: (offsetY: number) => void;
  tabBarVisibilityProgress?: number;
}

const MONTHS_TO_SHOW = 6;
const CHART_HEIGHT = 148;
/** Left gutter for Y-axis tick labels (plot starts after this). */
const CHART_Y_LABEL_GUTTER = 34;
const CHART_PADDING = { left: 6 + CHART_Y_LABEL_GUTTER, right: 8, top: 10, bottom: 26 };
const MAX_COUNTRY_GEOCODE_COORDS = 40;
const WEATHER_COLUMNS_LIMIT = 6;
const JOURNALING_BAR_MIN_PCT = 12;

type WeatherIconName = React.ComponentProps<typeof Ionicons>['name'];
type JournalingColumnId = 'entries' | 'words' | 'avg';

function getJournalingIconName(id: JournalingColumnId): WeatherIconName {
  if (id === 'entries') return 'create-outline';
  if (id === 'words') return 'document-text-outline';
  return 'analytics-outline';
}

function toMonthKey(dateIso: string): string {
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
}

function niceYMax(max: number): number {
  if (max <= 1) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
  const normalized = max / magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

/** Nice step for axis ticks (similar spirit to niceYMax). */
function niceTickStep(rough: number): number {
  if (!Number.isFinite(rough) || rough <= 0) return 1;
  const pow10 = Math.pow(10, Math.floor(Math.log10(rough)));
  const n = rough / pow10;
  if (n <= 1) return pow10;
  if (n <= 2) return 2 * pow10;
  if (n <= 5) return 5 * pow10;
  return 10 * pow10;
}

type DashboardLineChartYTickFormat = 'integer' | 'meters';

/** Builds ~4–6 tick values from 0..yMax for chart grid + labels. */
function buildChartYTicks(yMax: number, format: DashboardLineChartYTickFormat): number[] {
  const max = Math.max(Number.isFinite(yMax) && yMax > 0 ? yMax : 1, 1);
  const roughStep = max / 4;
  const step =
    format === 'integer' && max <= 3 ? 1 : Math.max(format === 'integer' ? 1 : 0.0001, niceTickStep(roughStep));
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 1e-6; v += step) {
    const rounded = format === 'integer' ? Math.round(v) : Math.round(v * 10) / 10;
    if (rounded <= max + 1e-6) ticks.push(rounded);
    if (ticks.length > 10) break;
  }
  const last = ticks[ticks.length - 1];
  if (last === undefined || last < max - 1e-4) {
    const end = format === 'integer' ? Math.round(max) : Math.round(max * 10) / 10;
    if (ticks.length === 0 || ticks[ticks.length - 1] !== end) ticks.push(end);
  }
  return [...new Set(ticks)].sort((a, b) => a - b);
}

function formatYTickInteger(value: number): string {
  return String(Math.round(value));
}

function formatYTickMeters(value: number): string {
  const m = Math.round(value);
  if (!Number.isFinite(m)) return '';
  if (m >= 10_000) return `${Math.round(m / 1000)}km`;
  if (m >= 1000) {
    const km = m / 1000;
    const rounded = Math.abs(km - Math.round(km)) < 0.05 ? Math.round(km) : Math.round(km * 10) / 10;
    return `${rounded}km`;
  }
  return `${m}m`;
}

function getWeatherIconName(condition: string): WeatherIconName {
  const normalized = condition.trim().toLowerCase();
  if (normalized.includes('sun') || normalized.includes('clear')) return 'sunny-outline';
  if (normalized.includes('cloud') || normalized.includes('overcast')) return 'cloudy-outline';
  if (normalized.includes('rain') || normalized.includes('drizzle') || normalized.includes('shower')) return 'rainy-outline';
  if (normalized.includes('storm') || normalized.includes('thunder')) return 'thunderstorm-outline';
  if (normalized.includes('snow') || normalized.includes('sleet') || normalized.includes('hail')) return 'snow-outline';
  if (normalized.includes('fog') || normalized.includes('mist') || normalized.includes('haze')) return 'partly-sunny-outline';
  return 'partly-sunny-outline';
}

function formatCompactMetric(value: number): string {
  if (value >= 1000) {
    const abbreviated = Math.round((value / 1000) * 10) / 10;
    return `${abbreviated}k`;
  }
  return value.toLocaleString();
}

function getMonthBuckets(anchorDate: Date) {
  const base = Number.isFinite(anchorDate.getTime()) ? anchorDate : new Date();
  const rows: { key: string; label: string }[] = [];
  for (let i = MONTHS_TO_SHOW - 1; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    rows.push({
      key: `${d.getUTCFullYear()}-${d.getUTCMonth()}`,
      label: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    });
  }
  return rows;
}

const CONTINENT_DONUT_SIZE = 188;
const CONTINENT_RING_STROKE = 20;

function continentChartPalette(theme: ThemeColors): string[] {
  return [theme.babyBlue, theme.royalGold, theme.fern, theme.lime800, theme.stone500, theme.zinc300, theme.red600];
}

const ContinentDistributionDonut: React.FC<{
  rows: { continent: string; days: number; pct: number }[];
  themeColors: ThemeColors;
}> = ({ rows, themeColors }) => {
  const palette = useMemo(() => continentChartPalette(themeColors), [themeColors]);
  const cx = CONTINENT_DONUT_SIZE / 2;
  const cy = CONTINENT_DONUT_SIZE / 2;
  const pad = 2;
  const r = CONTINENT_DONUT_SIZE / 2 - pad - CONTINENT_RING_STROKE / 2;
  const circumference = 2 * Math.PI * r;
  const totalDays = rows.reduce((sum, row) => sum + row.days, 0);

  const ringSegments = useMemo(() => {
    if (rows.length === 0 || totalDays <= 0 || circumference <= 0) return [];
    const idealLengths = rows.map((row) => (row.days / totalDays) * circumference);
    if (rows.length === 1) {
      return [
        {
          length: circumference,
          gap: 0.0001,
          dashOffset: 0,
          stroke: palette[0]!,
        },
      ];
    }
    const adjusted = idealLengths.slice();
    const sumExceptLast = adjusted.slice(0, -1).reduce((a, b) => a + b, 0);
    adjusted[adjusted.length - 1] = Math.max(0, circumference - sumExceptLast);
    let cumulative = 0;
    return adjusted.map((length, i) => {
      const dashOffset = -cumulative;
      cumulative += length;
      const gap = Math.max(circumference - length, 0.0001);
      return { length, gap, dashOffset, stroke: palette[i % palette.length]! };
    });
  }, [rows, totalDays, circumference, palette]);

  const topContinent = rows[0]?.continent ?? '';

  return (
    <View style={styles.continentDonutBlock}>
      <View style={styles.continentDonutFrame}>
        <Svg width={CONTINENT_DONUT_SIZE} height={CONTINENT_DONUT_SIZE}>
          <G transform={`rotate(-90 ${cx} ${cy})`}>
            {ringSegments.map((seg, i) => (
              <Circle
                key={`${rows[i]?.continent ?? i}-${i}`}
                cx={cx}
                cy={cy}
                r={r}
                stroke={seg.stroke}
                strokeWidth={CONTINENT_RING_STROKE}
                fill="none"
                strokeLinecap="butt"
                strokeDasharray={`${seg.length} ${seg.gap}`}
                strokeDashoffset={seg.dashOffset}
              />
            ))}
          </G>
        </Svg>
        <View style={styles.continentDonutCenter} pointerEvents="none">
          <Text style={[styles.continentDonutCenterEyebrow, { color: themeColors.textSecondary }]}>TOP</Text>
          <Text
            style={[styles.continentDonutCenterTitle, { color: themeColors.textPrimary }]}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {topContinent.toUpperCase()}
          </Text>
        </View>
      </View>
      <Text style={[styles.continentDistributionLegendTitle, { color: themeColors.textSecondary }]}>
        CONTINENTS
      </Text>
      <View style={styles.continentLegendList}>
        {rows.map((row, i) => (
          <View key={row.continent} style={styles.continentLegendRow}>
            <View style={styles.continentLegendLeft}>
              <View style={[styles.continentSwatch, { backgroundColor: palette[i % palette.length] }]} />
              <Text style={[styles.continentLegendLabel, { color: themeColors.textPrimary }]}>{row.continent}</Text>
            </View>
            <Text style={[styles.continentLegendPct, { color: themeColors.textSecondary }]}>{row.pct}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const DashboardCard: React.FC<{
  title: string;
  subtitle?: string;
  subtitleItalic?: boolean;
  titleRight?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, subtitle, subtitleItalic, titleRight, children }) => {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.cardTitleRow}>
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={titleRight ? 1 : undefined}>
          {title}
        </Text>
        {titleRight}
      </View>
      {subtitle ? (
        <Text style={[styles.cardSubtitle, { color: colors.textSecondary }, subtitleItalic && { fontStyle: 'italic' }]}>
          {subtitle}
        </Text>
      ) : null}
      {children}
    </View>
  );
};

const DashboardSection: React.FC<DashboardSectionProps> = ({
  entries,
  journals,
  tripAlbums,
  tripFilterActive = false,
  scrollRef,
  onScrollReport,
  tabBarVisibilityProgress = 1,
}) => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const screenWidth = Dimensions.get('window').width;
  const chartWidth = screenWidth - SPACING.md * 2 - SPACING.lg * 2;
  const [latestLocation, setLatestLocation] = useState('Location unavailable');
  const [countryByCoord, setCountryByCoord] = useState<Record<string, string>>({});
  const [calendarSnapshots, setCalendarSnapshots] = useState<Record<string, string>>({});
  const calendarAnchor = useMemo(() => {
    const now = new Date();
    if (!tripFilterActive || tripAlbums.length === 0) {
      return { y: now.getFullYear(), m: now.getMonth() };
    }

    const album = tripAlbums[0];
    const albumStart = new Date(album.startDate);
    const albumEnd = album.endDate ? new Date(album.endDate) : null;
    const isAlbumActive =
      Number.isFinite(albumStart.getTime()) &&
      albumStart.getTime() <= now.getTime() &&
      (!albumEnd || albumEnd.getTime() >= now.getTime());

    const anchorDate = isAlbumActive || !Number.isFinite(albumStart.getTime()) ? now : albumStart;
    return { y: anchorDate.getFullYear(), m: anchorDate.getMonth() };
  }, [tripFilterActive, tripAlbums]);

  const hasNoData = entries.length === 0 && journals.length === 0;

  const todayDateLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const todayDayKey = useMemo(() => localDayKeyFromDate(new Date()), []);

  /** Countries already persisted on entries (skip reverse geocode for those coord buckets). */
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

  /** Hero location: current device position (not last entry). Refreshes when app becomes active. */
  useEffect(() => {
    if (tripFilterActive) return;
    let cancelled = false;

    const refreshUserLocation = async () => {
      try {
        const locationModule = await import('expo-location');
        const { status } = await locationModule.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (!cancelled) setLatestLocation('Location unavailable');
          return;
        }

        const locationPromise = locationModule.getCurrentPositionAsync({
          accuracy: locationModule.Accuracy.Balanced,
        });
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Location timeout')), 10000)
        );

        const location = (await Promise.race([locationPromise, timeoutPromise])) as {
          coords: { latitude: number; longitude: number };
        };
        const { latitude, longitude } = location.coords;

        const label = await getCityCountryLabel(latitude, longitude);
        if (!cancelled) {
          const trimmed = label?.trim();
          setLatestLocation(trimmed || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
        }
      } catch {
        if (!cancelled) setLatestLocation('Location unavailable');
      }
    };

    void refreshUserLocation();

    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void refreshUserLocation();
    });

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [tripFilterActive]);

  useEffect(() => {
    let cancelled = false;
    const coordPairs = new Set<string>();
    [...entries, ...journals].forEach((item) => {
      if (item.latitude != null && item.longitude != null) {
        coordPairs.add(`${item.latitude.toFixed(2)},${item.longitude.toFixed(2)}`);
      }
    });
    const limitedCoords = Array.from(coordPairs).slice(0, MAX_COUNTRY_GEOCODE_COORDS);
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
        } catch (_) {
          // Soft-fail this coord; keep resolving the rest.
        }
      }
      if (!cancelled) setCountryByCoord(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [entries, journals, seededCountryByCoord]);

  useEffect(() => {
    if (tripFilterActive) {
      setCalendarSnapshots({});
      return;
    }
    let cancelled = false;
    const keys = localDayKeysInMonth(calendarAnchor.y, calendarAnchor.m);
    (async () => {
      const snaps = await getDayCountrySnapshotsForDayKeys(keys);
      if (!cancelled) setCalendarSnapshots(snaps);
    })();
    return () => {
      cancelled = true;
    };
  }, [calendarAnchor.y, calendarAnchor.m]);

  useEffect(() => {
    if (tripFilterActive) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const keys = localDayKeysInMonth(calendarAnchor.y, calendarAnchor.m);
      void getDayCountrySnapshotsForDayKeys(keys).then(setCalendarSnapshots);
    });
    return () => sub.remove();
  }, [calendarAnchor.y, calendarAnchor.m]);

  const dashboardGeneralKpis = useMemo(() => {
    const uniqueCountries = new Set<string>(Object.values(countryByCoord));
    entries.forEach((e) => {
      if (e.country?.trim()) uniqueCountries.add(e.country.trim());
    });
    return {
      memories: entries.length,
      journalNotes: journals.length,
      countries: uniqueCountries.size,
      // Trip count is all albums (not scoped by Review "This Trip" filter).
      trips: tripAlbums.length,
    };
  }, [entries, journals.length, tripAlbums.length, countryByCoord]);

  const captureCountryByDay = useMemo(
    () => buildCaptureCountryByDayKey(entries, journals, countryByCoord),
    [entries, journals, countryByCoord]
  );

  const mergedDayDisplay = useMemo(() => {
    const keys = localDayKeysInMonth(calendarAnchor.y, calendarAnchor.m);
    if (tripFilterActive) {
      const fromTripCaptureOnly: Record<string, string> = {};
      for (const key of keys) {
        fromTripCaptureOnly[key] = captureCountryByDay[key] ?? '';
      }
      return fromTripCaptureOnly;
    }
    return buildMergedDayCountryDisplay(keys, captureCountryByDay, calendarSnapshots);
  }, [calendarAnchor.y, calendarAnchor.m, captureCountryByDay, calendarSnapshots, tripFilterActive]);

  const trendAnchorDate = useMemo(() => {
    const now = new Date();
    if (!tripFilterActive || tripAlbums.length === 0) return now;

    const album = tripAlbums[0];
    const start = new Date(album.startDate);
    const end = album.endDate ? new Date(album.endDate) : null;
    const hasValidStart = Number.isFinite(start.getTime());
    const hasValidEnd = end ? Number.isFinite(end.getTime()) : false;
    const isActive =
      hasValidStart &&
      start.getTime() <= now.getTime() &&
      (!end || (hasValidEnd && end.getTime() >= now.getTime()));

    if (isActive) return now;
    if (hasValidEnd && end) return end;
    if (hasValidStart) return start;
    return now;
  }, [tripFilterActive, tripAlbums]);

  const monthBuckets = useMemo(() => getMonthBuckets(trendAnchorDate), [trendAnchorDate]);

  const monthlyData = useMemo(() => {
    const buckets = monthBuckets.map((b) => ({ ...b, experiences: 0, notes: 0, altitudeTotal: 0, altitudeCount: 0 }));
    const byKey = new Map(buckets.map((row, index) => [row.key, index]));
    entries.forEach((entry) => {
      const idx = byKey.get(toMonthKey(entry.timestamp));
      if (idx == null) return;
      buckets[idx].experiences += 1;
      if (typeof entry.altitudeMeters === 'number') {
        buckets[idx].altitudeTotal += entry.altitudeMeters;
        buckets[idx].altitudeCount += 1;
      }
    });
    journals.forEach((journal) => {
      const idx = byKey.get(toMonthKey(journal.timestamp));
      if (idx == null) return;
      buckets[idx].notes += 1;
    });
    return buckets.map((row) => ({
      ...row,
      altitudeAverage: row.altitudeCount > 0 ? row.altitudeTotal / row.altitudeCount : 0,
    }));
  }, [entries, journals, monthBuckets]);

  const chartData = useMemo(() => {
    const experiences = monthlyData.map((row) => row.experiences);
    const notes = monthlyData.map((row) => row.notes);
    const combined = monthlyData.map((row) => row.experiences + row.notes);
    const altitude = monthlyData.map((row) => row.altitudeAverage);
    return { experiences, notes, combined, altitude, labels: monthlyData.map((row) => row.label) };
  }, [monthlyData]);

  const allCountryRanking = useMemo(() => {
    const perCountry = new Map<string, number>();
    entries.forEach((entry) => {
      if (entry.latitude == null || entry.longitude == null) return;
      const coordKey = `${entry.latitude.toFixed(2)},${entry.longitude.toFixed(2)}`;
      const country = entry.country?.trim() || countryByCoord[coordKey];
      if (!country) return;
      perCountry.set(country, (perCountry.get(country) ?? 0) + 1);
    });
    return Array.from(perCountry.entries())
      .map(([country, memories]) => ({ country, memories }))
      .sort((a, b) => b.memories - a.memories);
  }, [entries, countryByCoord]);

  const countryRanking = useMemo(() => allCountryRanking.slice(0, 5), [allCountryRanking]);

  const continentBreakdown = useMemo(() => {
    const continentWeights = new Map<string, number>();
    let attributed = 0;
    allCountryRanking.forEach((row) => {
      const continent = getContinentForCountryName(row.country);
      if (!continent) return;
      attributed += row.memories;
      continentWeights.set(continent, (continentWeights.get(continent) ?? 0) + row.memories);
    });
    const denom = Math.max(1, attributed);
    return Array.from(continentWeights.entries())
      .map(([continent, days]) => ({ continent, days, pct: Math.round((days / denom) * 100) }))
      .sort((a, b) => b.days - a.days);
  }, [allCountryRanking]);

  const weatherBreakdown = useMemo(() => {
    const normalized: Record<string, number> = {};
    entries.forEach((entry) => {
      const weather = (entry.weather ?? '').trim();
      if (!weather) return;
      const key = weather.toLowerCase();
      normalized[key] = (normalized[key] ?? 0) + 1;
    });
    const total = Object.values(normalized).reduce((acc, count) => acc + count, 0);
    return Object.entries(normalized)
      .map(([condition, count]) => ({
        condition: condition.charAt(0).toUpperCase() + condition.slice(1),
        count,
        pct: total > 0 ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }, [entries]);

  const weatherColumns = useMemo(() => {
    if (weatherBreakdown.length === 0) return [];
    const rows = weatherBreakdown.slice(0, WEATHER_COLUMNS_LIMIT);
    const maxCount = Math.max(1, ...rows.map((row) => row.count));
    return rows.map((row) => ({
      ...row,
      iconName: getWeatherIconName(row.condition),
      barHeightPct: Math.max(12, Math.round((row.count / maxCount) * 100)),
    }));
  }, [weatherBreakdown]);

  const journalStats = useMemo(() => {
    const totalWords = journals.reduce((acc, journal) => {
      const words = journal.content.trim().split(/\s+/).filter(Boolean);
      return acc + words.length;
    }, 0);
    const totalEntries = journals.length;
    const averageWords = totalEntries > 0 ? Math.round(totalWords / totalEntries) : 0;
    return { totalWords, totalEntries, averageWords };
  }, [journals]);

  const journalingColumns = useMemo(() => {
    if (journalStats.totalEntries <= 0) return [];
    const rows: { id: JournalingColumnId; label: string; value: number }[] = [
      { id: 'entries', label: 'Entries', value: journalStats.totalEntries },
      { id: 'words', label: 'Total words', value: journalStats.totalWords },
      { id: 'avg', label: 'Avg. words/entry', value: journalStats.averageWords },
    ];
    const maxValue = Math.max(1, ...rows.map((row) => row.value));
    return rows.map((row) => ({
      ...row,
      iconName: getJournalingIconName(row.id),
      displayValue: formatCompactMetric(row.value),
      barHeightPct: Math.max(JOURNALING_BAR_MIN_PCT, Math.round((row.value / maxValue) * 100)),
      accessibilityLabel: `${row.label}: ${row.value.toLocaleString()}`,
    }));
  }, [journalStats]);

  const paletteScope = useMemo(
    () => (!tripFilterActive ? 'all' : tripAlbums[0]?.id ?? entries.find(e => e.albumId)?.albumId ?? 'all'),
    [tripFilterActive, tripAlbums, entries]
  );
  const { colors: paletteColors, paletteState } = useDashboardColorPalette(entries, paletteScope);

  if (hasNoData) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.emptyState}>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Your dashboard will appear here</Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Capture experiences and notes to unlock your travel dashboard.
          </Text>
        </View>
      </View>
    );
  }

  const maxMemoriesJournalTrend = niceYMax(Math.max(1, ...chartData.combined));
  const maxAltitude = niceYMax(Math.max(1, ...chartData.altitude));
  const showTrendData = chartData.combined.some((value) => value > 0);
  const showAltitudeData = chartData.altitude.some((value) => value > 0);

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      contentContainerStyle={[
        styles.contentContainer,
        { paddingBottom: getEffectiveMainTabInset(insets.bottom, tabBarVisibilityProgress) + SPACING.md },
      ]}
      showsVerticalScrollIndicator={false}
      onScroll={(event) => onScrollReport?.(event.nativeEvent.contentOffset.y)}
      scrollEventThrottle={16}
    >
      {tripFilterActive ? (
        <Text style={[styles.scopeLabel, { color: colors.textSecondary }]}>Showing dashboard for this trip</Text>
      ) : null}

      <View style={styles.heroSummary}>
        {!tripFilterActive ? (
          <View style={styles.heroMeta}>
            <View style={styles.heroMetaRow}>
              <Ionicons name="calendar-outline" size={22} color={colors.textSecondary} />
              <Text style={[styles.heroMetaText, { color: colors.textSecondary }]}>{todayDateLabel}</Text>
            </View>
            <View style={styles.heroMetaRow}>
              <Ionicons name="location-outline" size={22} color={colors.textSecondary} />
              <Text style={[styles.heroMetaText, { color: colors.textSecondary }]}>{latestLocation}</Text>
            </View>
          </View>
        ) : null}

        <DashboardGeneralKpiStrip
          innerWidth={chartWidth}
          memories={dashboardGeneralKpis.memories}
          journalNotes={dashboardGeneralKpis.journalNotes}
          countries={dashboardGeneralKpis.countries}
          trips={dashboardGeneralKpis.trips}
          colors={colors}
        />
      </View>

      <DashboardCard title="Memories & journaling over time">
        {showTrendData ? (
          <SimpleLineChart
            width={chartWidth}
            height={CHART_HEIGHT}
            labels={chartData.labels}
            primary={chartData.combined}
            yMax={maxMemoriesJournalTrend}
            yTickFormat="integer"
            variant="smoothArea"
            pointMarkers
            colors={{
              primary: colors.babyBlue,
              secondary: colors.royalGold,
              tertiary: colors.fern,
              axis: colors.textTertiary,
              text: colors.textSecondary,
            }}
          />
        ) : (
          <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
            Add memories and journal entries to show trends.
          </Text>
        )}
      </DashboardCard>

      <DashboardCard
        title="Calendar"
        titleRight={
          <Pressable
            onPress={() => navigation.navigate('FullCountryCalendar')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Open full calendar"
          >
            <Text style={[styles.calendarOpenLink, { color: colors.textTertiary }]} maxFontSizeMultiplier={1.25}>
              Open full calendar
            </Text>
          </Pressable>
        }
      >
        <DashboardDayFlagCalendar
          width={chartWidth}
          year={calendarAnchor.y}
          monthIndex0={calendarAnchor.m}
          displayByDay={mergedDayDisplay}
          textPrimary={colors.textPrimary}
          textSecondary={colors.textSecondary}
          textTertiary={colors.textTertiary}
          todayDayKey={todayDayKey}
          todayPillBackground={colors.surfaceVariant}
          todayDayNumberColor={colors.textPrimary}
        />
      </DashboardCard>

      <DashboardCard title="Continents">
        {continentBreakdown.length > 0 ? (
          <ContinentDistributionDonut rows={continentBreakdown} themeColors={colors} />
        ) : (
          <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>Need more geocoded country data.</Text>
        )}
      </DashboardCard>

      <DashboardCard title="Country ranking">
        {countryRanking.length > 0 ? (
          <>
            {countryRanking.map((row, index) => (
              <View key={row.country} style={[styles.listRow, { borderBottomColor: colors.border }]}>
                <Text style={[styles.listLabel, { color: colors.textPrimary }]}>
                  {index + 1}. {getCountryFlagEmoji(row.country)} {row.country}
                </Text>
                <Text style={[styles.listMeta, { color: colors.textSecondary }]}>
                  {row.memories} {row.memories === 1 ? 'memory' : 'memories'}
                </Text>
              </View>
            ))}
            {allCountryRanking.length > 5 ? (
              <Pressable
                onPress={() => navigation.navigate('CountryRankingFullList', { rows: allCountryRanking })}
                accessibilityRole="link"
                accessibilityLabel="See full country ranking list"
                hitSlop={8}
                style={styles.countryRankingSeeAllWrap}
              >
                <Text style={[styles.countryRankingSeeAll, { color: colors.textTertiary }]} maxFontSizeMultiplier={1.3}>
                  See full list
                </Text>
              </Pressable>
            ) : null}
          </>
        ) : (
          <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>No ranked countries yet.</Text>
        )}
      </DashboardCard>

      <DashboardCard title="Journaling">
        {journalingColumns.length > 0 ? (
          <View style={styles.journalingColumnsWrap}>
            {journalingColumns.map((item) => (
              <View
                key={item.id}
                style={styles.journalingColumn}
                accessible
                accessibilityRole="text"
                accessibilityLabel={item.accessibilityLabel}
              >
                <Ionicons name={item.iconName} size={28} color={colors.textSecondary} />
                <Text style={[styles.journalingColumnValue, { color: colors.textPrimary }]}>{item.displayValue}</Text>
                <Text style={[styles.journalingColumnLabel, { color: colors.textSecondary }]} numberOfLines={2}>
                  {item.label}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
            Write journal entries to unlock journaling insights.
          </Text>
        )}
      </DashboardCard>

      <DashboardCard title="Emotional data">
        <DashboardEmotionalDataSection entries={entries} colors={colors} width={chartWidth} isDark={isDark} />
      </DashboardCard>

      <DashboardCard
        title="Your color palette"
        subtitle={
          tripFilterActive
            ? "The dominant colors extracted from this trip's photos"
            : 'The dominant colors extracted from all your photos'
        }
        subtitleItalic
      >
        {paletteState === 'no-photos' ? (
          <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
            Capture photos to see your travel color palette.
          </Text>
        ) : paletteState === 'processing' ? (
          <View style={styles.paletteRow}>
            {Array.from({ length: 8 }).map((_, i) => (
              <View key={i} style={[styles.paletteSwatch, { backgroundColor: colors.surfaceVariant }]} />
            ))}
          </View>
        ) : (
          <View style={styles.paletteRow}>
            {paletteColors.map((color, i) => (
              <View key={`${color}-${i}`} style={[styles.paletteSwatch, { flex: 10 - i, backgroundColor: color }]} />
            ))}
          </View>
        )}
      </DashboardCard>

      <DashboardCard title="Place type ranking" subtitle="Coming soon">
        <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
          Place categories: city, beach, forest, desert, etc.
        </Text>
      </DashboardCard>

      <DashboardCard title="Altitude over time">
        {showAltitudeData ? (
          <SimpleLineChart
            width={chartWidth}
            height={CHART_HEIGHT}
            labels={chartData.labels}
            primary={chartData.altitude}
            yMax={maxAltitude}
            yTickFormat="meters"
            variant="smoothArea"
            pointMarkers
            colors={{
              primary: colors.babyBlue,
              secondary: colors.royalGold,
              tertiary: colors.fern,
              axis: colors.textTertiary,
              text: colors.textSecondary,
            }}
          />
        ) : (
          <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>Not enough altitude data yet.</Text>
        )}
      </DashboardCard>

      <DashboardCard title="Weather">
        {weatherColumns.length > 0 ? (
          <View style={styles.weatherColumnsWrap}>
            {weatherColumns.map((item) => (
              <View key={item.condition} style={styles.weatherColumn}>
                <Ionicons name={item.iconName} size={22} color={colors.textSecondary} />
                <Text style={[styles.weatherColumnValue, { color: colors.textSecondary }]}>{item.pct}%</Text>
                <View style={[styles.weatherBarTrack, { backgroundColor: colors.surfaceVariant }]}>
                  <View
                    style={[
                      styles.weatherBarFill,
                      {
                        height: `${item.barHeightPct}%`,
                        backgroundColor: colors.babyBlue,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.weatherColumnLabel, { color: colors.textPrimary }]} numberOfLines={1}>
                  {item.condition}
                </Text>
                <Text style={[styles.weatherColumnCount, { color: colors.textSecondary }]}>{item.count}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>No weather data available.</Text>
        )}
      </DashboardCard>

    </ScrollView>
  );
};

type SimpleLineChartVariant = 'linear' | 'smoothArea';

const SimpleLineChart: React.FC<{
  width: number;
  height: number;
  labels: string[];
  primary: number[];
  secondary?: number[];
  yMax: number;
  yTickFormat?: DashboardLineChartYTickFormat;
  colors: { primary: string; secondary?: string; tertiary?: string; axis: string; text: string };
  variant?: SimpleLineChartVariant;
  pointMarkers?: boolean;
}> = ({
  width,
  height,
  labels,
  primary,
  secondary,
  yMax,
  yTickFormat = 'integer',
  colors,
  variant = 'linear',
  pointMarkers = false,
}) => {
  const fillGradientId = `chartFill_${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const strokeGradientId = `chartStroke_${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const plotWidth = width - CHART_PADDING.left - CHART_PADDING.right;
  const plotHeight = height - CHART_PADDING.top - CHART_PADDING.bottom;
  const bottomY = CHART_PADDING.top + plotHeight;
  const safeYMax = Number.isFinite(yMax) && yMax > 0 ? yMax : 1;

  const yTicks = useMemo(() => buildChartYTicks(safeYMax, yTickFormat), [safeYMax, yTickFormat]);
  const formatYTickLabel = yTickFormat === 'meters' ? formatYTickMeters : formatYTickInteger;

  const count = Math.min(primary.length, labels.length);
  if (__DEV__ && primary.length !== labels.length) {
    console.warn('[SimpleLineChart] primary and labels length mismatch; truncating to shorter series.');
  }
  const primarySeries = primary.slice(0, count);
  const labelRow = labels.slice(0, count);

  const toPoints = (series: number[]) =>
    series.map((value, idx) => {
      const x = CHART_PADDING.left + (idx / Math.max(series.length - 1, 1)) * plotWidth;
      const y = CHART_PADDING.top + (1 - value / safeYMax) * plotHeight;
      return { x, y };
    });

  const primaryPts = toPoints(primarySeries);
  const secondaryPts = secondary ? toPoints(secondary.slice(0, Math.min(secondary.length, primarySeries.length))) : [];

  const toLinearPath = (pts: { x: number; y: number }[]) =>
    pts.map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');

  const smoothStrokePath =
    variant === 'smoothArea' && primaryPts.length >= 2 ? pointsToSmoothCurvePath(primaryPts) : '';
  const smoothAreaPath =
    variant === 'smoothArea' && primaryPts.length >= 2 ? pointsToSmoothAreaPath(primaryPts, bottomY) : '';

  const primaryStrokeD =
    variant === 'smoothArea'
      ? primaryPts.length >= 2
        ? smoothStrokePath
        : primaryPts.length === 1
          ? `M ${primaryPts[0].x} ${primaryPts[0].y}`
          : ''
      : toLinearPath(primaryPts);

  const showAllPrimaryMarkers = variant === 'smoothArea' || pointMarkers;
  const showLastPrimaryMarkerOnly = variant === 'linear' && !pointMarkers && primaryPts.length > 0;

  /** Live Aura 3-accent treatment when tertiary is set (memories chart); secondary stays available for linear two-line mode. */
  const liveAura =
    variant === 'smoothArea' && colors.secondary && colors.tertiary
      ? { babyBlue: colors.primary, royalGold: colors.secondary, fern: colors.tertiary }
      : null;

  return (
    <View style={{ width }}>
      <View style={{ position: 'relative', width, height }}>
        <Svg width={width} height={height}>
          {yTicks.map((tick) => {
            const y = CHART_PADDING.top + (1 - tick / safeYMax) * plotHeight;
            return (
              <Line
                key={`ygrid-${tick}`}
                x1={CHART_PADDING.left}
                y1={y}
                x2={width - CHART_PADDING.right}
                y2={y}
                stroke={colors.axis}
                strokeWidth={0.8}
                opacity={0.35}
              />
            );
          })}
        {variant === 'smoothArea' && (smoothAreaPath || liveAura) ? (
          <Defs>
            {liveAura ? (
              <>
                {smoothAreaPath ? (
                  <LinearGradient
                    id={fillGradientId}
                    gradientUnits="userSpaceOnUse"
                    x1={CHART_PADDING.left}
                    y1={CHART_PADDING.top}
                    x2={CHART_PADDING.left}
                    y2={bottomY}
                  >
                    <Stop offset="0" stopColor={liveAura.babyBlue} stopOpacity={0.4} />
                    <Stop offset="0.5" stopColor={liveAura.royalGold} stopOpacity={0.22} />
                    <Stop offset="1" stopColor={liveAura.fern} stopOpacity={0.08} />
                  </LinearGradient>
                ) : null}
                <LinearGradient
                  id={strokeGradientId}
                  gradientUnits="userSpaceOnUse"
                  x1={CHART_PADDING.left}
                  y1={CHART_PADDING.top + plotHeight * 0.5}
                  x2={width - CHART_PADDING.right}
                  y2={CHART_PADDING.top + plotHeight * 0.5}
                >
                  <Stop offset="0" stopColor={liveAura.babyBlue} stopOpacity={1} />
                  <Stop offset="0.5" stopColor={liveAura.royalGold} stopOpacity={1} />
                  <Stop offset="1" stopColor={liveAura.fern} stopOpacity={1} />
                </LinearGradient>
              </>
            ) : smoothAreaPath ? (
              <LinearGradient id={fillGradientId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.primary} stopOpacity={0.32} />
                <Stop offset="1" stopColor={colors.primary} stopOpacity={0} />
              </LinearGradient>
            ) : null}
          </Defs>
        ) : null}
        {variant === 'smoothArea' && smoothAreaPath ? (
          <Path d={smoothAreaPath} fill={`url(#${fillGradientId})`} stroke="none" />
        ) : null}
        {primaryStrokeD ? (
          <Path
            d={primaryStrokeD}
            fill="none"
            stroke={liveAura ? `url(#${strokeGradientId})` : colors.primary}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
        {variant === 'linear' && secondaryPts.length > 0 ? (
          <Path d={toLinearPath(secondaryPts)} fill="none" stroke={colors.secondary ?? colors.primary} strokeWidth={2.2} />
        ) : null}
        {showAllPrimaryMarkers
          ? primaryPts.map((pt, idx) => {
              const nPts = primaryPts.length;
              const markerFill =
                liveAura && nPts > 1
                  ? (() => {
                      const t = idx / (nPts - 1);
                      if (t < 1 / 3) return liveAura.babyBlue;
                      if (t < 2 / 3) return liveAura.royalGold;
                      return liveAura.fern;
                    })()
                  : liveAura
                    ? liveAura.babyBlue
                    : colors.primary;
              return <Circle key={`pm-${idx}`} cx={pt.x} cy={pt.y} r={3.5} fill={markerFill} />;
            })
          : null}
        {showLastPrimaryMarkerOnly ? (
          <Circle cx={primaryPts[primaryPts.length - 1].x} cy={primaryPts[primaryPts.length - 1].y} r={4} fill={colors.primary} />
        ) : null}
        </Svg>
        <View pointerEvents="none" style={[styles.chartYAxisOverlay, { width, height }]}>
          {yTicks.map((tick) => {
            const y = CHART_PADDING.top + (1 - tick / safeYMax) * plotHeight;
            return (
              <Text
                key={`ylabel-${tick}`}
                style={[
                  styles.chartYTickText,
                  { color: colors.text, top: Math.max(0, y - 8), width: CHART_Y_LABEL_GUTTER },
                ]}
                numberOfLines={1}
                maxFontSizeMultiplier={1.2}
              >
                {formatYTickLabel(tick)}
              </Text>
            );
          })}
        </View>
      </View>
      <View style={styles.chartLabels}>
        {labelRow.map((label, idx) => (
          <Text key={`${label}-${idx}`} style={[styles.chartLabelText, { color: colors.text }]}>
            {label}
          </Text>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    gap: SPACING.sm,
  },
  scopeLabel: {
    ...TEXT_STYLES.entryInput,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: SPACING.xs,
  },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: SPACING.lg,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
    gap: SPACING.sm,
  },
  cardTitle: {
    ...TEXT_STYLES.entryInput,
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.semibold,
    flex: 1,
    flexShrink: 1,
  },
  calendarOpenLink: {
    ...TEXT_STYLES.entryInput,
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.regular,
  },
  cardSubtitle: {
    ...TEXT_STYLES.entryInput,
    fontSize: 12,
    marginBottom: SPACING.sm,
  },
  heroSummary: {
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
    marginBottom: SPACING.sm,
  },
  heroMeta: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
    gap: SPACING.xs,
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  heroMetaText: {
    ...TEXT_STYLES.entryInput,
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.regular,
  },
  placeholderText: {
    ...TEXT_STYLES.entryInput,
    fontSize: 13,
    lineHeight: 18,
  },
  continentBars: {
    gap: SPACING.xs,
  },
  continentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  continentDonutBlock: {
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  continentDonutFrame: {
    width: CONTINENT_DONUT_SIZE,
    height: CONTINENT_DONUT_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continentDonutCenter: {
    position: 'absolute',
    left: CONTINENT_RING_STROKE + 10,
    right: CONTINENT_RING_STROKE + 10,
    top: CONTINENT_RING_STROKE + 8,
    bottom: CONTINENT_RING_STROKE + 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  continentDonutCenterEyebrow: {
    ...TEXT_STYLES.entryInput,
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.semibold,
    letterSpacing: 1.4,
    marginBottom: 4,
    textAlign: 'center',
  },
  continentDonutCenterTitle: {
    ...TEXT_STYLES.entryInput,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    letterSpacing: 0.6,
    textAlign: 'center',
  },
  continentDistributionLegendTitle: {
    ...TEXT_STYLES.entryInput,
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.semibold,
    letterSpacing: 1.6,
    alignSelf: 'stretch',
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  continentLegendList: {
    alignSelf: 'stretch',
    gap: SPACING.xs,
  },
  continentLegendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  continentLegendLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flex: 1,
    paddingRight: SPACING.sm,
  },
  continentSwatch: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  continentLegendLabel: {
    ...TEXT_STYLES.entryInput,
    fontSize: 14,
    flexShrink: 1,
  },
  continentLegendPct: {
    ...TEXT_STYLES.entryInput,
    fontSize: 13,
  },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  listLabel: {
    ...TEXT_STYLES.entryInput,
    fontSize: 14,
    flex: 1,
    paddingRight: SPACING.sm,
  },
  listMeta: {
    ...TEXT_STYLES.entryInput,
    fontSize: 13,
  },
  weatherColumnsWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: SPACING.xs,
    paddingTop: SPACING.xs,
  },
  weatherColumn: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  weatherColumnValue: {
    ...TEXT_STYLES.entryInput,
    fontSize: 11,
    lineHeight: 14,
  },
  weatherBarTrack: {
    width: 20,
    height: 88,
    borderRadius: 10,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  weatherBarFill: {
    width: '100%',
    borderRadius: 10,
    minHeight: 8,
  },
  weatherColumnLabel: {
    ...TEXT_STYLES.entryInput,
    fontSize: 11,
    width: '100%',
    textAlign: 'center',
  },
  weatherColumnCount: {
    ...TEXT_STYLES.entryInput,
    fontSize: 10,
    lineHeight: 12,
  },
  countryRankingSeeAllWrap: {
    marginTop: SPACING.sm,
    alignSelf: 'flex-start',
  },
  countryRankingSeeAll: {
    ...TEXT_STYLES.entryInput,
    fontSize: 13,
    fontStyle: 'italic',
  },
  paletteRow: {
    flexDirection: 'row',
    gap: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  paletteSwatch: {
    flex: 1,
    height: 34,
    borderRadius: 8,
  },
  journalingColumnsWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: SPACING.md,
    paddingTop: SPACING.md,
  },
  journalingColumn: {
    flex: 1,
    alignItems: 'center',
    gap: 10,
  },
  journalingColumnValue: {
    ...TEXT_STYLES.entryInput,
    fontSize: 20,
    fontWeight: FONT_WEIGHTS.semibold,
    lineHeight: 24,
  },
  journalingColumnLabel: {
    ...TEXT_STYLES.entryInput,
    fontSize: 15,
    lineHeight: 19,
    width: '100%',
    textAlign: 'center',
  },
  chartLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.xs,
  },
  chartYAxisOverlay: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'none',
  },
  chartYTickText: {
    ...TEXT_STYLES.entryInput,
    position: 'absolute',
    left: 0,
    fontSize: 9,
    lineHeight: 11,
    textAlign: 'right',
    paddingRight: 2,
  },
  chartLabelText: {
    ...TEXT_STYLES.entryInput,
    fontSize: 10,
    flex: 1,
    textAlign: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  emptyTitle: {
    ...TEXT_STYLES.cardTitle,
    fontSize: 22,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  emptyText: {
    ...TEXT_STYLES.entryInput,
    fontSize: 14,
    textAlign: 'center',
  },
});

export default DashboardSection;
