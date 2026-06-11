// OnboardingTutorialScreen
// Manages the full step-by-step tutorial: 7 stops (+ Review sweep tooltips).
// Each stop is a self-contained component. Stop order is computed from user intents.
// Partial progress is persisted to AsyncStorage so the user can resume after force-quit.

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
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
import { orderTutorialStops, TutorialStopId } from '../../../utils/tutorialOrder';
import { getRecapCandidates } from '../../../utils/recapCandidates';
import { logger } from '../../../utils/logger';

import TravelModeStop from './stops/TravelModeStop';
import JournalEntryBarStop from './stops/JournalEntryBarStop';
import GallerySyncStop from './stops/GallerySyncStop';
import TripAlbumStop from './stops/TripAlbumStop';
import JourneyRecapStop from './stops/JourneyRecapStop';
import PostcardsStop from './stops/PostcardsStop';
import ReviewSweepStop from './stops/ReviewSweepStop';

type NavProp = NativeStackNavigationProp<RootStackParamList, 'OnboardingTutorial'>;
type RoutePropT = RouteProp<RootStackParamList, 'OnboardingTutorial'>;

// Total "numbered" stops (review sweep counts as one for the progress indicator)
const TOTAL_STOPS = 7;

const OnboardingTutorialScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropT>();
  const { draft, resumeStep } = route.params;
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const {
    tripAlbums,
    entries,
    setOnboardingResumeStep,
    recordTutorialTry,
  } = useAppContext();

  const [stopIndex, setStopIndex] = useState(resumeStep ?? 0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Compute stop order from user's selected intents
  const orderedStops = useMemo(
    () => orderTutorialStops(draft.intent ?? []),
    [draft.intent]
  );

  const currentStopId: TutorialStopId = orderedStops[stopIndex]?.id ?? 'review_sweep';

  // Check if user has a recap-eligible album
  const hasEligibleAlbum = useMemo(() => {
    const candidates = getRecapCandidates(entries, tripAlbums);
    return candidates.length > 0;
  }, [entries, tripAlbums]);

  // Persist resume state whenever stop changes
  useEffect(() => {
    setOnboardingResumeStep('tutorial', stopIndex).catch((e) =>
      logger.error('TutorialScreen: failed to save resume step', e)
    );
  }, [stopIndex, setOnboardingResumeStep]);

  const animateToNext = useCallback((nextIndex: number) => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      setStopIndex(nextIndex);
      Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    });
  }, [fadeAnim]);

  const handleNext = useCallback(() => {
    const nextIndex = stopIndex + 1;
    if (nextIndex >= TOTAL_STOPS) {
      // All stops complete — proceed to exit screen
      navigation.navigate('OnboardingTutorialExit');
    } else {
      animateToNext(nextIndex);
    }
  }, [stopIndex, animateToNext, navigation]);

  const handleReviewSweepComplete = useCallback(() => {
    navigation.navigate('OnboardingTutorialExit');
  }, [navigation]);

  // Try handlers — record interaction + navigate to relevant feature
  const handleTryTravelMode = useCallback(async () => {
    await recordTutorialTry('triedTravelMode');
    navigation.navigate('TripAlbumCreate');
  }, [recordTutorialTry, navigation]);

  const handleTryJournalEntry = useCallback(async () => {
    await recordTutorialTry('triedJournalEntry');
    navigation.navigate('NotesEditor', {});
  }, [recordTutorialTry, navigation]);

  const handleTryGallerySync = useCallback(async () => {
    await recordTutorialTry('triedGallerySync');
    navigation.navigate('ImportLatest');
  }, [recordTutorialTry, navigation]);

  const handleTryTripAlbum = useCallback(async () => {
    await recordTutorialTry('triedTripAlbum');
    navigation.navigate('TripAlbumCreate');
  }, [recordTutorialTry, navigation]);

  const handleTryJourneyRecap = useCallback(async () => {
    await recordTutorialTry('triedJourneyRecap');
    navigation.navigate('JourneyRecapCandidates');
  }, [recordTutorialTry, navigation]);

  const handleTryPostcards = useCallback(async () => {
    await recordTutorialTry('triedPostcards');
    navigation.navigate('PostcardTemplates');
  }, [recordTutorialTry, navigation]);

  const renderStop = () => {
    switch (currentStopId) {
      case 'travel_mode':
        return <TravelModeStop onNext={handleNext} onTry={handleTryTravelMode} />;
      case 'journal_entry_bar':
        return <JournalEntryBarStop onNext={handleNext} onTry={handleTryJournalEntry} />;
      case 'gallery_sync':
        return <GallerySyncStop onNext={handleNext} onTry={handleTryGallerySync} />;
      case 'trip_album':
        return <TripAlbumStop onNext={handleNext} onTry={handleTryTripAlbum} />;
      case 'journey_recap':
        return (
          <JourneyRecapStop
            onNext={handleNext}
            onTry={hasEligibleAlbum ? handleTryJourneyRecap : undefined}
            hasEligibleAlbum={hasEligibleAlbum}
          />
        );
      case 'postcards':
        return <PostcardsStop onNext={handleNext} onTry={handleTryPostcards} />;
      case 'review_sweep':
        return <ReviewSweepStop onComplete={handleReviewSweepComplete} />;
      default:
        return null;
    }
  };

  const displayStop = Math.min(stopIndex + 1, TOTAL_STOPS);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MeshGradientBackground baseColor={colors.background} lightMode={!isDark} />

      <View style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}>
        <AppText style={[styles.progressText, { color: colors.textSecondary }]}>
          {displayStop} of {TOTAL_STOPS}
        </AppText>
        <View style={styles.progressTrack}>
          {Array.from({ length: TOTAL_STOPS }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.progressSegment,
                {
                  backgroundColor: i < stopIndex
                    ? '#6EAF5F'
                    : i === stopIndex
                      ? '#6EAF5F'
                      : colors.border,
                  flex: 1,
                  height: i === stopIndex ? 4 : 2,
                },
              ]}
            />
          ))}
        </View>
      </View>

      <Animated.View style={[styles.stopContainer, { opacity: fadeAnim }]}>
        {renderStop()}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    gap: SPACING.sm,
  },
  progressText: { fontFamily: FONTS.inter, fontSize: 13, fontWeight: FONT_WEIGHTS.semibold },
  progressTrack: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  progressSegment: { borderRadius: 2 },
  stopContainer: { flex: 1 },
});

export default OnboardingTutorialScreen;
