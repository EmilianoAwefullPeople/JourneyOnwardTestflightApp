// OnboardingQSResultsScreen — QS Step 5 of 6
// Shows three artifact cards: Trip Album, Trip in Review, Postcards.
// Tracks which cards the user opens.

import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, CommonActions } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../../../components/common/AppText';
import { MeshGradientBackground } from '../../../components/common/MeshGradientBackground';
import { useTheme } from '../../../context/ThemeContext';
import { useAppContext } from '../../../context/AppContext';
import { FONTS, FONT_WEIGHTS, SPACING } from '../../../config/constants';
import { RootStackParamList } from '../../../navigation/types';
import { logger } from '../../../utils/logger';
import { enrichWeatherForEntries } from '../../../services/MetadataBackfillService';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'OnboardingQSResults'>;
type RoutePropT = RouteProp<RootStackParamList, 'OnboardingQSResults'>;

const OnboardingQSResultsScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropT>();
  const { draft, albumId } = route.params;
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { completeOnboarding, entries } = useAppContext();

  const [opened, setOpened] = useState<Set<string>>(new Set());
  const isError = albumId === 'error';

  useEffect(() => {
    if (isError) return;
    const targetEntryIds = entries
      .filter((entry) => entry.albumId === albumId)
      .map((entry) => entry.id);
    if (targetEntryIds.length === 0) return;
    enrichWeatherForEntries(targetEntryIds, { maxEntries: 24, delayMs: 250 }).catch((error) => {
      logger.warn('QSResults: targeted weather warmup failed', error);
    });
  }, [albumId, entries, isError]);

  const markOpened = (id: string) => setOpened((prev) => new Set([...prev, id]));

  const openAlbum = () => {
    if (isError) return;
    markOpened('album');
    navigation.navigate('TripAlbumDetail', { albumId });
  };

  const openRecap = () => {
    if (isError) return;
    markOpened('recap');
    navigation.navigate('JourneyRecapPlayer', { albumId });
  };

  const openPostcards = () => {
    markOpened('postcards');
    navigation.navigate('PostcardTemplates');
  };

  const enterApp = useCallback(async () => {
    try {
      await completeOnboarding('quick_start');
    } catch (e) {
      logger.error('QSResults: completeOnboarding failed', e);
    }
    navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'MainTabs' }] }));
  }, [completeOnboarding, navigation]);

  const artifacts: { id: string; icon: React.ComponentProps<typeof Ionicons>['name']; title: string; body: string; onPress: () => void; disabled: boolean }[] = [
    {
      id: 'album',
      icon: 'images',
      title: 'Trip Album',
      body: 'Your photos, organized into a trip.',
      onPress: openAlbum,
      disabled: isError,
    },
    {
      id: 'recap',
      icon: 'play-circle',
      title: 'Trip in Review',
      body: 'A video recap of your trip.',
      onPress: openRecap,
      disabled: isError,
    },
    {
      id: 'postcards',
      icon: 'mail',
      title: 'Postcards',
      body: 'Design memories you can share.',
      onPress: openPostcards,
      disabled: false,
    },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MeshGradientBackground baseColor={colors.background} lightMode={!isDark} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + SPACING.xl, paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        <AppText style={[styles.title, { color: colors.textPrimary }]}>Your trip, captured.</AppText>
        {isError && (
          <AppText style={[styles.errorNote, { color: colors.textSecondary }]}>
            There was an issue building your album. You can create one manually in the app.
          </AppText>
        )}

        <View style={styles.cards}>
          {artifacts.map((art) => {
            const isOpened = opened.has(art.id);
            return (
              <TouchableOpacity
                key={art.id}
                style={[
                  styles.artifactCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: isOpened ? colors.textPrimary : colors.border,
                    borderWidth: isOpened ? 2 : 1,
                    opacity: art.disabled ? 0.5 : 1,
                  },
                ]}
                onPress={art.onPress}
                disabled={art.disabled}
                activeOpacity={0.85}
                accessibilityRole="button"
              >
                <View style={[styles.iconWrap, { backgroundColor: colors.surfaceVariant }]}>
                  <Ionicons name={art.icon} size={28} color={colors.textPrimary} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText style={[styles.cardTitle, { color: colors.textPrimary }]}>{art.title}</AppText>
                  <AppText style={[styles.cardBody, { color: colors.textSecondary }]}>{art.body}</AppText>
                </View>
                {isOpened ? (
                  <Ionicons name="checkmark-circle" size={20} color={colors.textPrimary} />
                ) : (
                  <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, SPACING.md) + SPACING.md }]}>
        <TouchableOpacity
          style={[styles.cta, { backgroundColor: colors.textPrimary }]}
          onPress={() => navigation.navigate('OnboardingQSEmail', { draft, albumId })}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          <AppText style={[styles.ctaText, { color: colors.background }]}>Save your memories →</AppText>
        </TouchableOpacity>
        <TouchableOpacity onPress={enterApp} style={styles.skipLink}>
          <AppText style={[styles.skipText, { color: colors.textSecondary }]}>Enter the app</AppText>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: SPACING.lg, gap: SPACING.lg },
  title: { fontFamily: FONTS.inter, fontSize: 28, fontWeight: FONT_WEIGHTS.bold, lineHeight: 36 },
  errorNote: { fontFamily: FONTS.inter, fontSize: 14, lineHeight: 20 },
  cards: { gap: SPACING.sm },
  artifactCard: {
    borderRadius: 14,
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  iconWrap: { width: 52, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontFamily: FONTS.inter, fontSize: 16, fontWeight: FONT_WEIGHTS.semibold },
  cardBody: { fontFamily: FONTS.inter, fontSize: 13 },
  footer: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, gap: SPACING.sm },
  cta: {
    borderRadius: 14,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { color: '#fff', fontFamily: FONTS.inter, fontSize: 16, fontWeight: FONT_WEIGHTS.semibold },
  skipLink: { alignSelf: 'center' },
  skipText: { fontFamily: FONTS.inter, fontSize: 14 },
});

export default OnboardingQSResultsScreen;
