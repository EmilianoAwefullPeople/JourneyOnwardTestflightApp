// OnboardingQSCountryScreen — QS Step 1 of 6
// User picks a country for the trip they're importing.

import React, { useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../../../components/common/AppText';
import { MeshGradientBackground } from '../../../components/common/MeshGradientBackground';
import { useTheme } from '../../../context/ThemeContext';
import { FONTS, FONT_WEIGHTS, SPACING } from '../../../config/constants';
import { RootStackParamList } from '../../../navigation/types';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'OnboardingQSCountry'>;
type RoutePropT = RouteProp<RootStackParamList, 'OnboardingQSCountry'>;

const COUNTRIES = [
  'Argentina', 'Australia', 'Austria', 'Belgium', 'Bolivia', 'Brazil', 'Canada',
  'Chile', 'China', 'Colombia', 'Costa Rica', 'Croatia', 'Cuba', 'Czech Republic',
  'Denmark', 'Dominican Republic', 'Ecuador', 'Egypt', 'Finland', 'France',
  'Germany', 'Greece', 'Guatemala', 'Honduras', 'Hungary', 'Iceland', 'India',
  'Indonesia', 'Ireland', 'Israel', 'Italy', 'Jamaica', 'Japan', 'Jordan',
  'Kenya', 'Malaysia', 'Mexico', 'Morocco', 'Nepal', 'Netherlands', 'New Zealand',
  'Nicaragua', 'Norway', 'Panama', 'Paraguay', 'Peru', 'Philippines', 'Poland',
  'Portugal', 'Romania', 'Singapore', 'South Africa', 'South Korea', 'Spain',
  'Sri Lanka', 'Sweden', 'Switzerland', 'Taiwan', 'Thailand', 'Turkey', 'Ukraine',
  'United Kingdom', 'United States', 'Uruguay', 'Vietnam',
].sort();

const OnboardingQSCountryScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropT>();
  const { draft } = route.params;
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const filtered = useMemo(
    () => COUNTRIES.filter((c) => c.toLowerCase().includes(search.toLowerCase())),
    [search]
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MeshGradientBackground baseColor={colors.background} lightMode={!isDark} />

      <View style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <AppText style={[styles.stepLabel, { color: colors.textSecondary }]}>Step 1 of 6</AppText>
      </View>

      <View style={styles.titleArea}>
        <AppText style={[styles.title, { color: colors.textPrimary }]}>
          Pick a trip you remember
        </AppText>
        <TextInput
          style={[styles.searchInput, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
          placeholder="Search countries…"
          placeholderTextColor={colors.textSecondary}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item}
        contentContainerStyle={{ paddingHorizontal: SPACING.lg, paddingBottom: 120 + insets.bottom }}
        renderItem={({ item }) => {
          const isSelected = selected === item;
          return (
            <TouchableOpacity
              style={[
                styles.countryRow,
                {
                  backgroundColor: isSelected ? colors.surfaceVariant : colors.surface,
                  borderColor: isSelected ? colors.textPrimary : colors.border,
                },
              ]}
              onPress={() => setSelected(item)}
              activeOpacity={0.8}
            >
              <AppText style={[styles.countryText, { color: colors.textPrimary }]}>
                {item}
              </AppText>
              {isSelected && <Ionicons name="checkmark-circle" size={18} color={colors.textPrimary} />}
            </TouchableOpacity>
          );
        }}
        ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
      />

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, SPACING.md) + SPACING.md }]}>
        <TouchableOpacity
          style={[styles.cta, { backgroundColor: colors.textPrimary, opacity: selected ? 1 : 0.4 }]}
          onPress={() => selected && navigation.navigate('OnboardingQSImport', { draft, country: selected })}
          disabled={!selected}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          <AppText style={[styles.ctaText, { color: colors.background }]}>
            {selected ? `Import memories from ${selected} →` : 'Select a country to continue'}
          </AppText>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.sm,
    gap: SPACING.sm,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabel: { fontFamily: FONTS.inter, fontSize: 13, fontWeight: FONT_WEIGHTS.semibold },
  titleArea: { paddingHorizontal: SPACING.lg, gap: SPACING.md, marginBottom: SPACING.md },
  title: { fontFamily: FONTS.inter, fontSize: 26, fontWeight: FONT_WEIGHTS.bold, lineHeight: 34 },
  searchInput: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: SPACING.md,
    fontFamily: FONTS.inter,
    fontSize: 15,
  },
  countryRow: {
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  countryText: { fontFamily: FONTS.inter, fontSize: 15 },
  footer: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm },
  cta: {
    borderRadius: 14,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
  },
  ctaText: { color: '#fff', fontFamily: FONTS.inter, fontSize: 15, fontWeight: FONT_WEIGHTS.semibold, textAlign: 'center' },
});

export default OnboardingQSCountryScreen;
