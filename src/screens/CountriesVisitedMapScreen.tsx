// Full-screen, pinch-to-zoom-and-pan version of the dashboard's countries-visited
// map. Also where users categorize each visited country as Home / Lived in /
// Visited / Layover — that's edited here only; the dashboard card just displays
// the result. Receives the visited country list as route params (computed once
// in DashboardSection), matching the CountryRankingFullList pattern, but reads
// categories directly from storage since editing happens on this screen.
//
// Layout: header stays fixed (matches every other full-screen sub-page in this
// app — DayDetail, FullCountryCalendar, CountryRankingFullList — so nav chrome
// stays consistent). Below it, a hero stat + filter chips, then the map in its
// own fixed-height region (kept OUT of a ScrollView on purpose: its pan gesture
// would otherwise fight a wrapping ScrollView's own pan responder), then the
// country list in a bounded scroll region. Map and list live inside cards using
// the same surface/border treatment as the dashboard's own DashboardCard, so
// this screen reads as part of the same design system rather than a one-off.

import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import BackArrow from '../components/common/icons/BackArrow';
import ZoomableWorldMap from '../components/review/ZoomableWorldMap';
import CountryCategoryList from '../components/review/CountryCategoryList';
import CategoryFilterChips from '../components/review/CategoryFilterChips';
import { FONT_WEIGHTS, SPACING } from '../config/constants';
import { TEXT_STYLES } from '../config/typography';
import { useTheme } from '../context/ThemeContext';
import type { RootStackParamList } from '../navigation/types';
import { getCountryCategories, setCountryCategory, type CountryVisitCategory } from '../storage/countryCategoryStorage';

type Nav = NativeStackNavigationProp<RootStackParamList, 'CountriesVisitedMapFull'>;
type Route = RouteProp<RootStackParamList, 'CountriesVisitedMapFull'>;

const CountriesVisitedMapScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const visitedIsoCodes = useMemo(
    () => route.params?.visitedIsoCodes ?? [],
    [route.params?.visitedIsoCodes]
  );
  const countryNames = route.params?.countryNames ?? [];

  const [categoryOverrides, setCategoryOverrides] = useState<Record<string, CountryVisitCategory>>({});
  const [filterCategory, setFilterCategory] = useState<CountryVisitCategory | null>(null);

  useFocusEffect(
    useCallback(() => {
      void getCountryCategories().then(setCategoryOverrides);
    }, [])
  );

  const categories = useMemo(() => {
    const map: Record<string, CountryVisitCategory> = {};
    visitedIsoCodes.forEach((iso) => {
      map[iso] = categoryOverrides[iso] ?? 'visited';
    });
    return map;
  }, [visitedIsoCodes, categoryOverrides]);

  const handleChangeCategory = useCallback((isoCode: string, category: CountryVisitCategory) => {
    setCategoryOverrides((prev) => ({ ...prev, [isoCode]: category }));
    void setCountryCategory(isoCode, category);
  }, []);

  const handleToggleFilter = useCallback((category: CountryVisitCategory) => {
    setFilterCategory((prev) => (prev === category ? null : category));
  }, []);

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
          Countries visited
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.topSection}>
        <Text style={[styles.heroStat, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.2}>
          {countryNames.length}
        </Text>
        <Text style={[styles.heroLabel, { color: colors.textSecondary }]}>
          {countryNames.length === 1 ? 'country' : 'countries'}
        </Text>
        <CategoryFilterChips selected={filterCategory} onToggle={handleToggleFilter} />
      </View>

      <View style={styles.mapArea}>
        <View
          style={[styles.mapCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          accessibilityLabel="Zoomable world map, pinch to zoom and drag to pan, double-tap to reset"
        >
          <ZoomableWorldMap categories={categories} colors={colors} highlightCategory={filterCategory} />
        </View>
      </View>

      <ScrollView
        style={styles.listSection}
        contentContainerStyle={{ paddingBottom: insets.bottom + SPACING.xl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.listCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.listCardTitle, { color: colors.textPrimary }]}>Tap a country to set its category</Text>
          <CountryCategoryList
            countryNames={countryNames}
            categories={categories}
            onChangeCategory={handleChangeCategory}
            filterCategory={filterCategory}
          />
        </View>
      </ScrollView>
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
  topSection: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  heroStat: {
    ...TEXT_STYLES.cardTitle,
    fontSize: 40,
    fontWeight: FONT_WEIGHTS.bold,
    lineHeight: 44,
  },
  heroLabel: {
    ...TEXT_STYLES.entryInput,
    fontSize: 14,
    marginTop: -2,
    marginBottom: SPACING.sm,
  },
  mapArea: {
    flex: 1,
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  mapCard: {
    flex: 1,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: SPACING.sm,
    overflow: 'hidden',
  },
  listSection: {
    maxHeight: 260,
  },
  listCard: {
    marginHorizontal: SPACING.md,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: SPACING.md,
  },
  listCardTitle: {
    ...TEXT_STYLES.entryInput,
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: SPACING.xs,
  },
});

export default CountriesVisitedMapScreen;
