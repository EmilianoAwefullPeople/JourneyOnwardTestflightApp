// OnboardingQSGeneratingScreen — QS Step 4 of 6
// Creates the album and entries in the background while showing copy transitions.
// Gesture is disabled on this screen to prevent early navigation.

import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, CommonActions } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AppText from '../../../components/common/AppText';
import { MeshGradientBackground } from '../../../components/common/MeshGradientBackground';
import { useTheme } from '../../../context/ThemeContext';
import { useAppContext } from '../../../context/AppContext';
import { FONTS, FONT_WEIGHTS, SPACING } from '../../../config/constants';
import { RootStackParamList } from '../../../navigation/types';
import { TripAlbum } from '../../../models/TripAlbum';
import { generateUUID } from '../../../utils/uuid';
import { logger } from '../../../utils/logger';
import { persistSelectedExperiences } from '../../../services/ExperienceImportService';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'OnboardingQSGenerating'>;
type RoutePropT = RouteProp<RootStackParamList, 'OnboardingQSGenerating'>;

const COPY_STEPS = [
  'Turning your photos into a memory worth keeping.',
  'Building your album…',
  'Crafting your recap…',
  'Creating your postcards…',
];

const OnboardingQSGeneratingScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropT>();
  const { draft, country, selectedSuggestions, note } = route.params;
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { createTripAlbum, createEntry, entries, tripAlbums, refreshData } = useAppContext();

  const [copyIndex, setCopyIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let step = 0;
    const advance = () => {
      Animated.timing(fadeAnim, { toValue: 0, duration: 400, useNativeDriver: true }).start(() => {
        step = Math.min(step + 1, COPY_STEPS.length - 1);
        setCopyIndex(step);
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      });
    };

    const timer1 = setTimeout(advance, 1800);
    const timer2 = setTimeout(advance, 3600);
    const timer3 = setTimeout(advance, 5000);
    return () => { clearTimeout(timer1); clearTimeout(timer2); clearTimeout(timer3); };
  }, [fadeAnim]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const now = new Date().toISOString();
        const albumId = generateUUID();

        // Prefer imported suggestion timestamps so album range matches the selected memories.
        const suggestionTimestamps = selectedSuggestions
          .map((suggestion) => new Date(suggestion.timestamp).getTime())
          .filter((ts) => Number.isFinite(ts));
        const endDateObj = suggestionTimestamps.length > 0
          ? new Date(Math.max(...suggestionTimestamps))
          : new Date();
        const startDateObj = suggestionTimestamps.length > 0
          ? new Date(Math.min(...suggestionTimestamps))
          : new Date(endDateObj.getTime() - 30 * 24 * 60 * 60 * 1000);

        const album: TripAlbum = {
          id: albumId,
          name: country,
          startDate: startDateObj.toISOString().slice(0, 10),
          endDate: endDateObj.toISOString().slice(0, 10),
          locationName: country,
          description: note,
          plans: [],
          intentions: [],
          travelReasons: [],
          createdAt: now,
          updatedAt: now,
        };
        await createTripAlbum(album);

        if (cancelled) return;
        const persistResult = await persistSelectedExperiences({
          suggestions: selectedSuggestions,
          selectedIds: new Set(selectedSuggestions.map((suggestion) => suggestion.id)),
          existingEntries: entries,
          tripAlbums: [...tripAlbums, album],
          createEntry,
          refreshData,
        });
        logger.log('QSGenerating: persisted selected experiences', {
          added: persistResult.added,
          failed: persistResult.failed,
          skippedDuplicates: persistResult.skippedDuplicates,
          schemaFailureNotice: persistResult.schemaFailureNotice,
        });

        if (!cancelled) {
          // Wait a moment to show the last generation copy before proceeding
          setTimeout(() => {
            if (!cancelled) {
              navigation.dispatch(
                CommonActions.reset({
                  index: 1,
                  routes: [
                    { name: 'OnboardingGate' },
                    { name: 'OnboardingQSResults', params: { draft, albumId } },
                  ],
                })
              );
            }
          }, 1200);
        }
      } catch (e) {
        logger.error('QSGenerating: album/entry creation failed', e);
        if (!cancelled) {
          // Navigate to results anyway with a placeholder — user can still complete onboarding
          navigation.dispatch(
            CommonActions.reset({
              index: 1,
              routes: [
                { name: 'OnboardingGate' },
                { name: 'OnboardingQSResults', params: { draft, albumId: 'error' } },
              ],
            })
          );
        }
      }
    };

    // Small delay so the screen renders before heavy work starts
    const t = setTimeout(run, 300);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MeshGradientBackground baseColor={colors.background} lightMode={!isDark} />
      <View style={[styles.content, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.logoArea}>
          <AppText style={[styles.wordmark, { color: colors.textPrimary }]}>Journey Onward</AppText>
        </View>
        <View style={styles.spinnerRow}>
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: colors.textPrimary, opacity: 0.3 + 0.35 * ((copyIndex + i) % 3) },
              ]}
            />
          ))}
        </View>
        <Animated.View style={{ opacity: fadeAnim }}>
          <AppText style={[styles.copy, { color: colors.textPrimary }]}>
            {COPY_STEPS[copyIndex]}
          </AppText>
        </Animated.View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    gap: SPACING.xl,
  },
  logoArea: { alignItems: 'center' },
  wordmark: {
    fontFamily: FONTS.inter,
    fontSize: 22,
    fontWeight: FONT_WEIGHTS.bold,
    letterSpacing: 0.5,
  },
  spinnerRow: { flexDirection: 'row', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  copy: {
    fontFamily: FONTS.inter,
    fontSize: 18,
    lineHeight: 28,
    textAlign: 'center',
  },
});

export default OnboardingQSGeneratingScreen;
