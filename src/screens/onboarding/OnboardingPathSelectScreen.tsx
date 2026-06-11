// OnboardingPathSelectScreen
// Presented after Phase 0. User chooses Quick Start or Step-by-Step Tutorial.

import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AppText from '../../components/common/AppText';
import { MeshGradientBackground } from '../../components/common/MeshGradientBackground';
import { useTheme } from '../../context/ThemeContext';
import { FONTS, FONT_WEIGHTS, SPACING } from '../../config/constants';
import { RootStackParamList } from '../../navigation/types';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'OnboardingPathSelect'>;
type RoutePropT = RouteProp<RootStackParamList, 'OnboardingPathSelect'>;

const OnboardingPathSelectScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropT>();
  const { draft } = route.params;
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MeshGradientBackground baseColor={colors.background} lightMode={!isDark} />

      <View style={[styles.content, { paddingTop: insets.top + SPACING.xxl, paddingBottom: insets.bottom + SPACING.lg }]}>
        <AppText style={[styles.greeting, { color: colors.textSecondary }]}>
          Welcome, {draft.name}
        </AppText>
        <AppText style={[styles.title, { color: colors.textPrimary }]}>
          How do you want to start?
        </AppText>

        <View style={styles.cards}>
          {/* Quick Start */}
          <TouchableOpacity
            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => navigation.navigate('OnboardingQSCountry', { draft })}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Quick Start path"
          >
            <View style={[styles.cardBadge, { backgroundColor: colors.surfaceVariant, borderWidth: 1, borderColor: colors.textPrimary }]}>
              <AppText style={[styles.cardBadgeText, { color: colors.textPrimary }]}>Quick Start</AppText>
            </View>
            <AppText style={[styles.cardTitle, { color: colors.textPrimary }]}>
              See your memories come alive
            </AppText>
            <AppText style={[styles.cardBody, { color: colors.textSecondary }]}>
              Import photos from a past trip and watch Journey Onward turn them into something worth keeping. Takes about 3 minutes.
            </AppText>
            <View style={[styles.cardCta, { backgroundColor: colors.textPrimary }]}>
              <AppText style={[styles.cardCtaText, { color: colors.background }]}>Start →</AppText>
            </View>
          </TouchableOpacity>

          {/* Tutorial */}
          <TouchableOpacity
            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => navigation.navigate('OnboardingTutorial', { draft })}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Step-by-Step Tutorial path"
          >
            <View style={[styles.cardBadge, { backgroundColor: colors.surfaceVariant, borderWidth: 1, borderColor: colors.border }]}>
              <AppText style={[styles.cardBadgeText, { color: colors.textSecondary }]}>Tutorial</AppText>
            </View>
            <AppText style={[styles.cardTitle, { color: colors.textPrimary }]}>
              Learn the app, feature by feature
            </AppText>
            <AppText style={[styles.cardBody, { color: colors.textSecondary }]}>
              We'll walk you through everything Journey Onward can do.
            </AppText>
            <View style={[styles.cardCta, { backgroundColor: colors.surfaceVariant, borderWidth: 1, borderColor: colors.border }]}>
              <AppText style={[styles.cardCtaText, { color: colors.textPrimary }]}>Start →</AppText>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
    justifyContent: 'center',
  },
  greeting: {
    fontFamily: FONTS.inter,
    fontSize: 15,
    marginBottom: SPACING.xs,
  },
  title: {
    fontFamily: FONTS.inter,
    fontSize: 30,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING.xl,
    lineHeight: 38,
  },
  cards: { gap: SPACING.md },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  cardBadge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
  },
  cardBadgeText: {
    color: '#fff',
    fontFamily: FONTS.inter,
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  cardTitle: {
    fontFamily: FONTS.inter,
    fontSize: 18,
    fontWeight: FONT_WEIGHTS.bold,
    lineHeight: 24,
  },
  cardBody: {
    fontFamily: FONTS.inter,
    fontSize: 14,
    lineHeight: 20,
  },
  cardCta: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginTop: SPACING.xs,
  },
  cardCtaText: {
    color: '#fff',
    fontFamily: FONTS.inter,
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});

export default OnboardingPathSelectScreen;
