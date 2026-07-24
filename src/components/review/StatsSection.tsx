// StatsSection
// Statistics view: Overview, Experiences over time chart, Places, Countries/Cities list (Strava-inspired)

import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, Animated, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Defs, LinearGradient, Stop, Path, Line, Circle } from 'react-native-svg';
import { Entry } from '../../models/Entry';
import { Journal } from '../../models/Journal';
import { TripAlbum } from '../../models/TripAlbum';
import { COLORS, DIMENSIONS, SPACING, FONT_WEIGHTS } from '../../config/constants';
import { TEXT_STYLES } from '../../config/typography';
import { getCountryFromCoordinates, getCityCountryLabel } from '../../utils/dateUtils';
import { getCountryFlagEmoji } from '../../utils/countryUtils';
import GradientText from '../common/GradientText';
import { ANIMATION_CONFIG, createStaggeredDelay } from '../../utils/animations';
import { useTheme } from '../../context/ThemeContext';
import {
  type StatsTimeScope,
  filterEntriesByScope,
  filterJournalsByScope,
  filterAlbumsByScope,
  getLongestTripDays,
} from '../../utils/statsFilterUtils';
import { logger } from '../../utils/logger';
import { getEffectiveMainTabInset } from '../../navigation/mainTabBarMetrics';
import { STATS_TIME_SCOPE_KEY } from '../../utils/statsScopeStorage';
import LoadingSpinner from '../common/LoadingSpinner';
const MAX_COORDS_FOR_CITIES = 50;

interface StatsSectionProps {
  entries: Entry[];
  journals: Journal[];
  tripAlbums: TripAlbum[];
  /** Optional ref to scroll to top when Review tab is tapped */
  scrollRef?: React.RefObject<ScrollView | null>;
  onScrollReport?: (offsetY: number) => void;
  tabBarVisibilityProgress?: number;
  /** When true, shows "Showing trip stats" subtext */
  tripFilterActive?: boolean;
}

const CHART_HEIGHT = 140;
const CHART_PLOT_PADDING = { left: 4, right: 36, top: 8, bottom: 24 };
const LAST_N_MONTHS = 6;
const CHART_MIN_MONTHS_WITH_DATA = 2;
const CHART_MIN_ENTRIES_IN_RANGE = 3;
const LINE_CHART_STROKE_WIDTH = 2.5;
const ENDPOINT_CIRCLE_R = 5;
const GRADIENT_COLORS = [COLORS.babyBlue, COLORS.royalGold, COLORS.fern] as const;

// Stat card with optional emoji, gradient value, and subtitle
const StatCard: React.FC<{
  emoji: string;
  label: string;
  value: string | number;
  subtitle?: string;
  useGradient?: boolean;
  cardWidth: number;
  style?: object;
  animStyle?: object;
  colors?: { textPrimary: string; textSecondary: string; surface: string };
}> = ({ emoji, label, value, subtitle, useGradient, cardWidth, style, animStyle, colors: c }) => (
  <Animated.View style={[styles.statCard, { width: cardWidth, backgroundColor: c?.surface }, style, animStyle]}>
    <Text style={styles.statEmoji}>{emoji}</Text>
    {useGradient ? (
      <GradientText style={styles.statValue}>{String(value)}</GradientText>
    ) : (
      <Text style={[styles.statValue, c && { color: c.textPrimary }]}>{value}</Text>
    )}
    <Text style={[styles.statLabel, c && { color: c.textSecondary }]}>{label}</Text>
    {subtitle != null && subtitle !== '' && (
      <Text style={[styles.statSubtitle, c && { color: c.textSecondary }]}>{subtitle}</Text>
    )}
  </Animated.View>
);

// Strava-like line chart: experiences per month (scope: this_year = 12 months, all_time = last 6 months)
function niceYMax(max: number): number {
  if (max <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
  const normalized = max / magnitude;
  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

const ExperiencesOverTimeChart: React.FC<{
  entries: Entry[];
  chartWidth: number;
  scope: StatsTimeScope;
  showBars: boolean;
  animStyle?: object;
  colors?: { surface: string; textSecondary: string; babyBlue?: string; royalGold?: string; fern?: string };
}> = ({ entries, chartWidth, scope, showBars, animStyle, colors: c }) => {
  const gradientColors = [c?.babyBlue ?? COLORS.babyBlue, c?.royalGold ?? COLORS.royalGold, c?.fern ?? COLORS.fern];

  const byMonth = useMemo(() => {
    const now = new Date();
    const counts: { year: number; month: number; label: string; count: number }[] = [];
    if (scope === 'this_year') {
      const y = now.getUTCFullYear();
      for (let m = 0; m < 12; m++) {
        counts.push({
          year: y,
          month: m,
          label: new Date(Date.UTC(y, m, 1)).toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
          count: 0,
        });
      }
    } else {
      for (let i = LAST_N_MONTHS - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        counts.push({
          year: d.getUTCFullYear(),
          month: d.getUTCMonth(),
          label: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
          count: 0,
        });
      }
    }
    const key = (y: number, m: number) => `${y}-${m}`;
    const map = new Map<string, number>();
    counts.forEach((row) => map.set(key(row.year, row.month), 0));
    entries.forEach((e) => {
      const t = new Date(e.timestamp);
      const k = key(t.getUTCFullYear(), t.getUTCMonth());
      if (map.has(k)) map.set(k, (map.get(k) ?? 0) + 1);
    });
    return counts.map((row) => ({ ...row, count: map.get(key(row.year, row.month)) ?? 0 }));
  }, [entries, scope]);

  const maxCount = Math.max(1, ...byMonth.map((m) => m.count));
  const yMax = useMemo(() => niceYMax(maxCount), [maxCount]);
  const plotLeft = CHART_PLOT_PADDING.left;
  const plotRight = chartWidth - CHART_PLOT_PADDING.right;
  const plotTop = CHART_PLOT_PADDING.top;
  const plotBottom = CHART_HEIGHT - CHART_PLOT_PADDING.bottom;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;

  const points = useMemo(() => {
    const n = byMonth.length;
    if (n === 0) return [];
    return byMonth.map((m, i) => {
      const x = plotLeft + (i / Math.max(1, n - 1)) * plotWidth;
      const y = plotBottom - (yMax > 0 ? (m.count / yMax) * plotHeight : 0);
      return { x, y, count: m.count };
    });
  }, [byMonth, plotLeft, plotRight, plotBottom, plotWidth, plotHeight, yMax]);

  const pathD = useMemo(() => {
    if (points.length === 0) return '';
    const first = points[0];
    let d = `M ${first.x} ${first.y}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L ${points[i].x} ${points[i].y}`;
    }
    return d;
  }, [points]);

  const yTicks = useMemo(() => {
    const ticks: number[] = [];
    const step = yMax <= 3 ? 1 : yMax <= 10 ? Math.ceil(yMax / 4) : Math.ceil(yMax / 4);
    for (let v = 0; v <= yMax; v += step) {
      ticks.push(v);
    }
    if (ticks.length > 0 && ticks[ticks.length - 1] < yMax) ticks.push(yMax);
    return ticks;
  }, [yMax]);

  const lastPoint = points.length > 0 ? points[points.length - 1] : null;

  return (
    <Animated.View
      style={[styles.chartCard, c && { backgroundColor: c.surface }, animStyle]}
      accessibilityLabel={showBars ? `Experiences per month, ${scope === 'this_year' ? 'this year' : 'last 6 months'}` : 'Experiences over time, add more to see activity'}
    >
      <Text style={[styles.sectionLabel, c && { color: c.textSecondary }]}>Experiences over time</Text>
      {showBars ? (
        <View style={[styles.chartContainer, { height: CHART_HEIGHT, width: chartWidth }]}>
          <Svg width={chartWidth} height={CHART_HEIGHT}>
            <Defs>
              <LinearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <Stop offset="0%" stopColor={gradientColors[0]} />
                <Stop offset="50%" stopColor={gradientColors[1]} />
                <Stop offset="100%" stopColor={gradientColors[2]} />
              </LinearGradient>
            </Defs>
            {/* Horizontal grid lines */}
            {yTicks.map((tick) => {
              const y = plotBottom - (yMax > 0 ? (tick / yMax) * plotHeight : 0);
              return (
                <Line
                  key={tick}
                  x1={plotLeft}
                  y1={y}
                  x2={plotRight}
                  y2={y}
                  stroke={c?.textSecondary ?? COLORS.neutral400}
                  strokeWidth={StyleSheet.hairlineWidth}
                  opacity={0.4}
                />
              );
            })}
            {/* Data line with gradient */}
            {pathD ? (
              <Path
                d={pathD}
                fill="none"
                stroke="url(#lineGradient)"
                strokeWidth={LINE_CHART_STROKE_WIDTH}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}
            {/* Endpoint: vertical line from last point to top */}
            {lastPoint && (
              <>
                <Line
                  x1={lastPoint.x}
                  y1={lastPoint.y}
                  x2={lastPoint.x}
                  y2={plotTop}
                  stroke={gradientColors[2]}
                  strokeWidth={1}
                  opacity={0.6}
                />
                <Circle
                  cx={lastPoint.x}
                  cy={lastPoint.y}
                  r={ENDPOINT_CIRCLE_R}
                  fill={gradientColors[2]}
                  stroke={gradientColors[2]}
                  strokeWidth={2}
                  opacity={0.9}
                />
              </>
            )}
          </Svg>
          {/* Y-axis labels overlaid on right of chart */}
          <View pointerEvents="none" style={[styles.chartYAxisOverlay, { width: chartWidth, height: CHART_HEIGHT }]}>
            {yTicks.map((tick) => {
              const y = plotBottom - (yMax > 0 ? (tick / yMax) * plotHeight : 0);
              return (
                <Text
                  key={tick}
                  style={[
                    styles.chartYLabel,
                    c && { color: c.textSecondary },
                    { position: 'absolute', right: 4, top: y - 8 },
                  ]}
                  numberOfLines={1}
                >
                  {tick}
                </Text>
              );
            })}
          </View>
          <View style={[styles.chartLabels, { width: chartWidth, marginTop: SPACING.xs }]}>
            {byMonth.map((m) => (
              <Text key={`${m.year}-${m.month}`} style={[styles.chartLabel, c && { color: c.textSecondary }]} numberOfLines={1}>
                {m.label}
              </Text>
            ))}
          </View>
        </View>
      ) : (
        <Text style={[styles.chartEmptyText, c && { color: c.textSecondary }]}>Add more experiences to see your activity over time</Text>
      )}
    </Animated.View>
  );
};

const StatsSection: React.FC<StatsSectionProps> = ({
  entries,
  journals,
  tripAlbums,
  scrollRef,
  onScrollReport,
  tabBarVisibilityProgress = 1,
  tripFilterActive,
}) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const screenWidth = Dimensions.get('window').width;
  const cardWidth = (screenWidth - SPACING.md * 3) / 2;
  const chartWidth = screenWidth - SPACING.md * 2;

  const [timeScope, setTimeScope] = useState<StatsTimeScope>('all_time');
  const [scopeHydrated, setScopeHydrated] = useState(false);
  const [countriesCount, setCountriesCount] = useState<number | null>(null);
  const [countriesList, setCountriesList] = useState<string[]>([]);
  const [countriesLoading, setCountriesLoading] = useState(false);
  const [citiesCount, setCitiesCount] = useState<number | null>(null);
  const [citiesList, setCitiesList] = useState<string[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);

  const effectiveScope = scopeHydrated ? timeScope : 'all_time';

  const filteredEntries = useMemo(() => filterEntriesByScope(entries ?? [], effectiveScope), [entries, effectiveScope]);
  const filteredJournals = useMemo(() => filterJournalsByScope(journals ?? [], effectiveScope), [journals, effectiveScope]);
  const filteredAlbums = useMemo(() => filterAlbumsByScope(tripAlbums ?? [], effectiveScope), [tripAlbums, effectiveScope]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STATS_TIME_SCOPE_KEY);
        if (cancelled) return;
        if (stored === 'this_year' || stored === 'all_time') {
          setTimeScope(stored);
        }
      } catch (_err) {
        // keep default all_time
      } finally {
        if (!cancelled) setScopeHydrated(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const setTimeScopeAndPersist = useCallback((scope: StatsTimeScope) => {
    setTimeScope(scope);
    AsyncStorage.setItem(STATS_TIME_SCOPE_KEY, scope).catch(() => {});
  }, []);

  const longestTripDays = useMemo(() => getLongestTripDays(tripAlbums ?? []), [tripAlbums]);

  const cardAnimations = useRef(
    Array.from({ length: 10 }, () => new Animated.Value(0))
  ).current;

  // Calculate statistics (sync) from filtered data
  const stats = useMemo(() => {
    const eList = filteredEntries;
    const jList = filteredJournals;
    const aList = filteredAlbums;
    const uniqueLocations = new Set<string>();
    eList.forEach((e) => {
      if (e.latitude !== undefined && e.longitude !== undefined) {
        uniqueLocations.add(`${e.latitude.toFixed(2)},${e.longitude.toFixed(2)}`);
      }
    });
    jList.forEach((j) => {
      if (j.latitude !== undefined && j.longitude !== undefined) {
        uniqueLocations.add(`${j.latitude.toFixed(2)},${j.longitude.toFixed(2)}`);
      }
    });
    const bookmarkCount = eList.filter((e) => e.isBookmarked === true).length;
    return {
      totalEntries: eList.length,
      totalJournals: jList.length,
      totalAlbums: aList.length,
      locationsCount: uniqueLocations.size,
      bookmarkCount,
    };
  }, [filteredEntries, filteredJournals, filteredAlbums]);

  const mediaMix = useMemo(() => {
    const eList = filteredEntries;
    if (eList.length === 0) return null;
    const photo = eList.filter((e) => e.mediaType === 'photo').length;
    const audio = eList.filter((e) => e.mediaType === 'audio').length;
    const video = eList.filter((e) => e.mediaType === 'video').length;
    const total = eList.length;
    return {
      photo: Math.round((photo / total) * 100),
      audio: Math.round((audio / total) * 100),
      video: Math.round((video / total) * 100),
      total,
    };
  }, [filteredEntries]);

  // Unique countries (count + list) from filtered entries/journals
  useEffect(() => {
    const coords: { lat: number; lng: number }[] = [];
    filteredEntries.forEach((e) => {
      if (e.latitude !== undefined && e.longitude !== undefined) {
        coords.push({ lat: e.latitude, lng: e.longitude });
      }
    });
    filteredJournals.forEach((j) => {
      if (j.latitude !== undefined && j.longitude !== undefined) {
        coords.push({ lat: j.latitude, lng: j.longitude });
      }
    });
    const uniqueKeys = new Set(coords.map((c) => `${c.lat.toFixed(2)},${c.lng.toFixed(2)}`));
    const toGeocode = Array.from(uniqueKeys).map((key) => {
      const [lat, lng] = key.split(',').map(Number);
      return { lat, lng };
    });

    const countrySet = new Set<string>();
    filteredEntries.forEach((e) => {
      if (e.country?.trim()) countrySet.add(e.country.trim());
    });
    const keyToCountryFromEntry = new Map<string, string>();
    filteredEntries.forEach((e) => {
      if (e.latitude != null && e.longitude != null && e.country?.trim()) {
        const key = `${e.latitude.toFixed(2)},${e.longitude.toFixed(2)}`;
        if (!keyToCountryFromEntry.has(key)) keyToCountryFromEntry.set(key, e.country.trim());
      }
    });

    if (toGeocode.length === 0) {
      setCountriesCount(countrySet.size);
      setCountriesList(Array.from(countrySet).sort());
      setCountriesLoading(false);
      return;
    }

    setCountriesLoading(true);
    let cancelled = false;

    (async () => {
      try {
        for (const { lat, lng } of toGeocode) {
          if (cancelled) return;
          const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
          const fromEntry = keyToCountryFromEntry.get(key);
          if (fromEntry) {
            countrySet.add(fromEntry);
            continue;
          }
          const country = await getCountryFromCoordinates(lat, lng);
          if (country) countrySet.add(country);
        }
        if (!cancelled) {
          setCountriesCount(countrySet.size);
          setCountriesList(Array.from(countrySet).sort());
        }
      } catch (err) {
        if (!cancelled) {
          logger.error('Stats: countries geocoding failed', err);
          setCountriesCount(0);
          setCountriesList([]);
        }
      } finally {
        if (!cancelled) setCountriesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [filteredEntries, filteredJournals]);

  // Unique cities (count + list) from filtered entries/journals
  useEffect(() => {
    const coords: { lat: number; lng: number }[] = [];
    filteredEntries.forEach((e) => {
      if (e.latitude !== undefined && e.longitude !== undefined) {
        coords.push({ lat: e.latitude, lng: e.longitude });
      }
    });
    filteredJournals.forEach((j) => {
      if (j.latitude !== undefined && j.longitude !== undefined) {
        coords.push({ lat: j.latitude, lng: j.longitude });
      }
    });
    const uniqueKeys = Array.from(new Set(coords.map((c) => `${c.lat.toFixed(2)},${c.lng.toFixed(2)}`)));
    const toGeocode = uniqueKeys
      .slice(0, MAX_COORDS_FOR_CITIES)
      .map((key) => {
        const [lat, lng] = key.split(',').map(Number);
        return { lat, lng };
      });

    const citySet = new Set<string>();
    const keyToCityFromEntry = new Map<string, string>();
    filteredEntries.forEach((e) => {
      const city = e.city?.trim();
      const country = e.country?.trim();
      const label = [city, country].filter(Boolean).join(', ');
      if (label) citySet.add(label);
      if (e.latitude != null && e.longitude != null && label) {
        const key = `${e.latitude.toFixed(2)},${e.longitude.toFixed(2)}`;
        if (!keyToCityFromEntry.has(key)) keyToCityFromEntry.set(key, label);
      }
    });

    if (toGeocode.length === 0) {
      setCitiesCount(citySet.size);
      setCitiesList(Array.from(citySet).sort());
      setCitiesLoading(false);
      return;
    }

    setCitiesLoading(true);
    let cancelled = false;

    (async () => {
      try {
        for (const { lat, lng } of toGeocode) {
          if (cancelled) return;
          const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
          const persistedLabel = keyToCityFromEntry.get(key);
          if (persistedLabel) {
            citySet.add(persistedLabel);
            continue;
          }
          const label = await getCityCountryLabel(lat, lng);
          if (label && label.trim()) citySet.add(label.trim());
        }
        if (!cancelled) {
          setCitiesCount(citySet.size);
          setCitiesList(Array.from(citySet).sort());
        }
      } catch (err) {
        if (!cancelled) {
          logger.error('Stats: cities geocoding failed', err);
          setCitiesCount(0);
          setCitiesList([]);
        }
      } finally {
        if (!cancelled) setCitiesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [filteredEntries, filteredJournals]);

  const overviewCards = useMemo(() => {
    const albumsSubtitle = longestTripDays != null && longestTripDays > 0 ? `Longest ${longestTripDays} days` : undefined;
    return [
      { emoji: '📷', label: 'Experiences', value: stats.totalEntries, useGradient: true, subtitle: undefined },
      { emoji: '📔', label: 'Journals', value: stats.totalJournals, useGradient: false, subtitle: undefined },
      { emoji: '🗂', label: 'Albums', value: stats.totalAlbums, useGradient: false, subtitle: albumsSubtitle },
      { emoji: '🔖', label: 'Bookmarks', value: stats.bookmarkCount, useGradient: true, subtitle: undefined },
    ];
  }, [stats.totalEntries, stats.totalJournals, stats.totalAlbums, stats.bookmarkCount, longestTripDays]);

  const placesCards = useMemo(() => [
    { emoji: '📍', label: 'Locations', value: stats.locationsCount, useGradient: false },
    { emoji: '🌍', label: 'Countries', value: countriesLoading ? '…' : (countriesCount ?? '—'), useGradient: false },
    { emoji: '🏙', label: 'Cities', value: citiesLoading ? '…' : (citiesCount ?? '—'), useGradient: false },
  ], [stats.locationsCount, countriesCount, countriesLoading, citiesCount, citiesLoading]);

  const chartShouldShow = useMemo(() => {
    const eList = filteredEntries;
    if (eList.length < CHART_MIN_ENTRIES_IN_RANGE) return false;
    const byMonth = new Set<string>();
    eList.forEach((e) => {
      const t = new Date(e.timestamp);
      byMonth.add(`${t.getUTCFullYear()}-${t.getUTCMonth()}`);
    });
    return byMonth.size >= CHART_MIN_MONTHS_WITH_DATA;
  }, [filteredEntries]);

  useEffect(() => {
    if (!scopeHydrated) return;
    const anims = cardAnimations;
    const indices = 10;
    for (let i = 0; i < indices; i++) {
      anims[i].setValue(0);
      Animated.timing(anims[i], {
        toValue: 1,
        duration: ANIMATION_CONFIG.durations.slow,
        delay: createStaggeredDelay(i, 50),
        easing: ANIMATION_CONFIG.easing.easeOut,
        useNativeDriver: true,
      }).start();
    }
  }, [scopeHydrated]);

  const hasNoData = (entries ?? []).length === 0 && (journals ?? []).length === 0;

  if (hasNoData) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]} accessibilityLabel="Stats view, no experiences yet">
        <View style={styles.emptyState}>
          <Text style={[styles.emptyStateTitle, { color: colors.textPrimary }]}>No experiences yet</Text>
          <Text style={[styles.emptyStateSubtext, { color: colors.textSecondary }]}>Capture your first moment to see your stats here</Text>
        </View>
      </View>
    );
  }

  const scopeLabel = effectiveScope === 'this_year' ? 'This year' : 'All time';

  return (
    <ScrollView
      ref={scrollRef}
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.scrollContent,
        {
          paddingBottom: getEffectiveMainTabInset(insets.bottom, tabBarVisibilityProgress) + SPACING.md,
        },
      ]}
      showsVerticalScrollIndicator={false}
      accessibilityLabel="Stats view"
      onScroll={(e) => onScrollReport?.(e.nativeEvent.contentOffset.y)}
      scrollEventThrottle={16}
    >
      {tripFilterActive && (
        <Text style={[styles.tripFilterLabel, { color: colors.textSecondary }]}>Showing trip stats</Text>
      )}
      <View style={styles.heroBlock}>
        <GradientText style={styles.heroValue}>{stats.totalEntries}</GradientText>
        <Text style={[styles.heroSubtext, { color: colors.textSecondary }]}>
          experiences captured · {scopeLabel}
        </Text>
      </View>

      <View style={styles.timeScopeRow}>
        <TouchableOpacity
          style={[
            styles.timeScopeSegment,
            effectiveScope === 'this_year' && styles.timeScopeSegmentActive,
            effectiveScope === 'this_year' && { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
          onPress={() => setTimeScopeAndPersist('this_year')}
          accessibilityRole="button"
          accessibilityLabel="This year"
          accessibilityState={{ selected: effectiveScope === 'this_year' }}
        >
          <Text style={[styles.timeScopeText, { color: effectiveScope === 'this_year' ? colors.textPrimary : colors.textSecondary }]}>
            This year
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.timeScopeSegment,
            effectiveScope === 'all_time' && styles.timeScopeSegmentActive,
            effectiveScope === 'all_time' && { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
          onPress={() => setTimeScopeAndPersist('all_time')}
          accessibilityRole="button"
          accessibilityLabel="All time"
          accessibilityState={{ selected: effectiveScope === 'all_time' }}
        >
          <Text style={[styles.timeScopeText, { color: effectiveScope === 'all_time' ? colors.textPrimary : colors.textSecondary }]}>
            All time
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.sectionLabel, styles.sectionLabelFirst]} accessibilityLabel="Overview section">Overview</Text>
      <View style={styles.grid}>
        {overviewCards.map((stat, index) => (
          <StatCard
            key={stat.label}
            emoji={stat.emoji}
            label={stat.label}
            value={stat.value}
            subtitle={stat.subtitle}
            useGradient={stat.useGradient}
            cardWidth={cardWidth}
            colors={colors}
            animStyle={{
              opacity: cardAnimations[index],
              transform: [{ translateY: cardAnimations[index].interpolate({ inputRange: [0, 1], outputRange: [15, 0] }) }],
            }}
          />
        ))}
      </View>

      {mediaMix != null && mediaMix.total > 0 && (
        <Animated.View
          style={[
            styles.mediaMixCard,
            { backgroundColor: colors.surface },
            {
              opacity: cardAnimations[4],
              transform: [{ translateY: cardAnimations[4].interpolate({ inputRange: [0, 1], outputRange: [15, 0] }) }],
            },
          ]}
          accessibilityLabel={`Capture mix: ${mediaMix.photo}% photos, ${mediaMix.audio}% audio, ${mediaMix.video}% video`}
        >
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Capture mix</Text>
          <View style={styles.mediaMixBarRow}>
            {mediaMix.photo > 0 && (
              <View style={[styles.mediaMixSegment, { flex: mediaMix.photo, backgroundColor: colors.fern }]} />
            )}
            {mediaMix.audio > 0 && (
              <View style={[styles.mediaMixSegment, { flex: mediaMix.audio, backgroundColor: colors.babyBlue }]} />
            )}
            {mediaMix.video > 0 && (
              <View style={[styles.mediaMixSegment, { flex: mediaMix.video, backgroundColor: colors.royalGold }]} />
            )}
          </View>
          <Text style={[styles.mediaMixLegend, { color: colors.textSecondary }]}>
            Photos {mediaMix.photo}% · Audio {mediaMix.audio}% · Video {mediaMix.video}%
          </Text>
        </Animated.View>
      )}

      <ExperiencesOverTimeChart
        entries={filteredEntries}
        chartWidth={chartWidth}
        scope={effectiveScope}
        showBars={chartShouldShow}
        colors={colors}
        animStyle={{
          opacity: cardAnimations[5],
          transform: [{ translateY: cardAnimations[5].interpolate({ inputRange: [0, 1], outputRange: [15, 0] }) }],
        }}
      />

      <Text style={[styles.sectionLabel, { marginTop: SPACING.lg }]} accessibilityLabel="Places section">Places</Text>
      <View style={styles.grid}>
        {placesCards.map((stat, index) => (
          <StatCard
            key={stat.label}
            emoji={stat.emoji}
            label={stat.label}
            value={stat.value}
            useGradient={stat.useGradient}
            cardWidth={cardWidth}
            colors={colors}
            animStyle={{
              opacity: cardAnimations[6 + index],
              transform: [{ translateY: cardAnimations[6 + index].interpolate({ inputRange: [0, 1], outputRange: [15, 0] }) }],
            }}
          />
        ))}
      </View>

      <View style={[styles.countriesCard, { backgroundColor: colors.surface }]} accessibilityLabel="Countries visited">
        <Text style={[styles.countriesListTitle, { color: colors.textPrimary }]}>
          Countries visited{countriesList.length > 0 ? ` (${countriesList.length})` : ''}
        </Text>
        {countriesLoading ? (
          <View style={styles.listLoading}>
            <LoadingSpinner size="small" color={colors.textSecondary} />
            <Text style={[styles.listLoadingText, { color: colors.textSecondary }]}>Loading…</Text>
          </View>
        ) : countriesList.length === 0 ? (
          <Text style={[styles.inlineEmptyText, { color: colors.textSecondary }]}>
            No countries yet — add locations to your experiences
          </Text>
        ) : (
          countriesList.map((country) => (
            <View key={country} style={[styles.countryRow, { borderBottomColor: colors.border }]}>
              <Text style={styles.countryFlag}>{getCountryFlagEmoji(country)}</Text>
              <Text style={[styles.countryName, { color: colors.textPrimary }]}>{country}</Text>
            </View>
          ))
        )}
      </View>

      <View style={[styles.countriesCard, { backgroundColor: colors.surface, marginTop: SPACING.sm }]} accessibilityLabel="Cities visited">
        <Text style={[styles.countriesListTitle, { color: colors.textPrimary }]}>
          Cities visited{citiesList.length > 0 ? ` (${citiesList.length})` : ''}
        </Text>
        {citiesLoading ? (
          <View style={styles.listLoading}>
            <LoadingSpinner size="small" color={colors.textSecondary} />
            <Text style={[styles.listLoadingText, { color: colors.textSecondary }]}>Loading…</Text>
          </View>
        ) : citiesList.length === 0 ? (
          <Text style={[styles.inlineEmptyText, { color: colors.textSecondary }]}>
            No cities yet — add locations to your experiences
          </Text>
        ) : (
          citiesList.map((city) => (
            <View key={city} style={[styles.countryRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.countryName, { color: colors.textPrimary }]}>{city}</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
  },
  tripFilterLabel: {
    ...TEXT_STYLES.entryInput,
    fontSize: 12,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  heroBlock: {
    marginBottom: SPACING.lg,
    alignItems: 'center',
  },
  heroValue: {
    ...TEXT_STYLES.cardTitle,
    fontSize: 40,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.xs,
  },
  heroSubtext: {
    ...TEXT_STYLES.entryInput,
    fontSize: 14,
  },
  timeScopeRow: {
    flexDirection: 'row',
    marginBottom: SPACING.lg,
    gap: SPACING.sm,
  },
  timeScopeSegment: {
    flex: 1,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeScopeSegmentActive: {
    borderWidth: 1,
  },
  timeScopeText: {
    ...TEXT_STYLES.entryInput,
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  sectionLabelFirst: {
    marginTop: 0,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  statCard: {
    borderRadius: DIMENSIONS.cardBorderRadius,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 100,
  },
  statValue: {
    ...TEXT_STYLES.cardTitle,
    fontSize: 32,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.xs,
  },
  statLabel: {
    ...TEXT_STYLES.entryInput,
    fontSize: 14,
    textAlign: 'center',
  },
  statSubtitle: {
    ...TEXT_STYLES.entryInput,
    fontSize: 12,
    textAlign: 'center',
    marginTop: SPACING.xs,
  },
  statEmoji: {
    fontSize: 24,
    marginBottom: SPACING.xs,
  },
  sectionLabel: {
    ...TEXT_STYLES.entryInput,
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chartCard: {
    borderRadius: DIMENSIONS.cardBorderRadius,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  chartContainer: {
    alignSelf: 'center',
    position: 'relative',
  },
  chartLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 0,
  },
  chartLabel: {
    ...TEXT_STYLES.entryInput,
    fontSize: 11,
    flex: 1,
    textAlign: 'center',
  },
  chartYAxisOverlay: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  chartYLabel: {
    ...TEXT_STYLES.entryInput,
    fontSize: 10,
    textAlign: 'right',
  },
  chartEmptyText: {
    ...TEXT_STYLES.entryInput,
    fontSize: 14,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  mediaMixCard: {
    borderRadius: DIMENSIONS.cardBorderRadius,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  mediaMixBarRow: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: SPACING.xs,
  },
  mediaMixSegment: {
    minWidth: 4,
  },
  mediaMixLegend: {
    ...TEXT_STYLES.entryInput,
    fontSize: 12,
    marginTop: SPACING.xs,
    textAlign: 'center',
  },
  listLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.lg,
    gap: SPACING.sm,
  },
  listLoadingText: {
    ...TEXT_STYLES.entryInput,
    fontSize: 14,
  },
  inlineEmptyText: {
    ...TEXT_STYLES.entryInput,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: SPACING.lg,
  },
  countriesCard: {
    borderRadius: DIMENSIONS.cardBorderRadius,
    padding: SPACING.lg,
    marginTop: SPACING.sm,
    marginBottom: SPACING.md,
  },
  countriesListTitle: {
    ...TEXT_STYLES.entryInput,
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: SPACING.sm,
  },
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  countryFlag: {
    fontSize: 20,
    marginRight: SPACING.sm,
  },
  countryName: {
    ...TEXT_STYLES.entryInput,
    fontSize: 14,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xxl,
  },
  emptyStateTitle: {
    ...TEXT_STYLES.cardTitle,
    fontSize: 20,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  emptyStateSubtext: {
    ...TEXT_STYLES.entryInput,
    fontSize: 14,
    textAlign: 'center',
  },
});

export default StatsSection;
