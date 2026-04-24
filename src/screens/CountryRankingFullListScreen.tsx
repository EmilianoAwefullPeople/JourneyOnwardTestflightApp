// Full list of dashboard country ranking (same rows as passed from Review dashboard).

import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import BackArrow from '../components/common/icons/BackArrow';
import { FONT_WEIGHTS, SPACING } from '../config/constants';
import { TEXT_STYLES } from '../config/typography';
import { useTheme } from '../context/ThemeContext';
import type { RootStackParamList } from '../navigation/types';
import { getCountryFlagEmoji } from '../utils/countryUtils';

type Nav = NativeStackNavigationProp<RootStackParamList, 'CountryRankingFullList'>;
type Route = RouteProp<RootStackParamList, 'CountryRankingFullList'>;

const CountryRankingFullListScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const rows = route.params?.rows ?? [];

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
          Country ranking
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{
          paddingHorizontal: SPACING.md,
          paddingBottom: insets.bottom + SPACING.xl,
          paddingTop: SPACING.md,
        }}
        showsVerticalScrollIndicator={false}
      >
        {rows.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>No countries in this list.</Text>
        ) : (
          rows.map((row, index) => (
            <View key={row.country} style={[styles.listRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.listLabel, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.35}>
                {index + 1}. {getCountryFlagEmoji(row.country)} {row.country}
              </Text>
              <Text style={[styles.listMeta, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.35}>
                {row.memories} {row.memories === 1 ? 'memory' : 'memories'}
              </Text>
            </View>
          ))
        )}
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
  scroll: {
    flex: 1,
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
  empty: {
    ...TEXT_STYLES.entryInput,
    fontSize: 14,
  },
});

export default CountryRankingFullListScreen;
