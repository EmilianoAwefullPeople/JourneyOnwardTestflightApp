// JourneyRecapPlayerScreen
// Full-screen story-style recap player: title, stats, highlights, collage, outro. Tap left/right to navigate.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { SPACING, FONTS } from '../config/constants';
import { useTheme } from '../context/ThemeContext';
import { useAppContext } from '../context/AppContext';
import { MeshGradientBackground } from '../components/common/MeshGradientBackground';
import BackArrow from '../components/common/icons/BackArrow';
import { getRecapCandidates } from '../utils/recapCandidates';
import { buildRecapSlides } from '../utils/recapBuilder';
import type {
  RecapSlide,
  RecapSlideTitlePayload,
  RecapSlideStatPayload,
  RecapSlideHighlightPayload,
  RecapSlideCollagePayload,
  RecapSlideOutroPayload,
} from '../models/Recap';
import TitleSlide from '../components/recap/TitleSlide';
import StatSlide from '../components/recap/StatSlide';
import HighlightSlide from '../components/recap/HighlightSlide';
import CollageSlide from '../components/recap/CollageSlide';
import OutroSlide from '../components/recap/OutroSlide';
import RecapProgressBar from '../components/recap/RecapProgressBar';
import { ANIMATION_CONFIG } from '../utils/animations';

type JourneyRecapPlayerNavigationProp = NativeStackNavigationProp<RootStackParamList, 'JourneyRecapPlayer'>;
type JourneyRecapPlayerRouteProp = RouteProp<RootStackParamList, 'JourneyRecapPlayer'>;

const JourneyRecapPlayerScreen: React.FC = () => {
  const navigation = useNavigation<JourneyRecapPlayerNavigationProp>();
  const route = useRoute<JourneyRecapPlayerRouteProp>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { entries, tripAlbums } = useAppContext();
  const albumId = route.params?.albumId;

  const { slides, error } = useMemo(() => {
    if (!albumId) {
      return { slides: [] as RecapSlide[], error: 'Missing trip.' };
    }
    try {
      const album = (tripAlbums ?? []).find((a) => a.id === albumId);
      const albumEntries = (entries ?? []).filter((e) => e.albumId === albumId && !e.isDraft);
      if (!album || albumEntries.length === 0) {
        return { slides: [] as RecapSlide[], error: 'Trip not found or has no experiences.' };
      }
      const candidates = getRecapCandidates(entries ?? [], tripAlbums ?? []);
      const candidate = candidates.find((c) => c.id === albumId);
      if (!candidate) {
        return { slides: [] as RecapSlide[], error: 'Could not build recap for this trip.' };
      }
      const built = buildRecapSlides(candidate, albumEntries);
      return { slides: built, error: null };
    } catch (e) {
      return { slides: [] as RecapSlide[], error: 'Something went wrong.' };
    }
  }, [albumId, entries, tripAlbums]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const slideOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    slideOpacity.setValue(0);
    const anim = Animated.timing(slideOpacity, {
      toValue: 1,
      duration: ANIMATION_CONFIG.durations.normal,
      easing: ANIMATION_CONFIG.easing.easeOut,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [currentIndex, slideOpacity]);

  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const renderCurrentSlide = useCallback((item: RecapSlide) => {
    switch (item.type) {
      case 'title':
        return <TitleSlide payload={item.payload as RecapSlideTitlePayload} />;
      case 'stat':
        return <StatSlide payload={item.payload as RecapSlideStatPayload} />;
      case 'highlight':
        return <HighlightSlide payload={item.payload as RecapSlideHighlightPayload} />;
      case 'collage':
        return <CollageSlide payload={item.payload as RecapSlideCollagePayload} />;
      case 'outro':
        return <OutroSlide payload={item.payload as RecapSlideOutroPayload} />;
      default:
        return null;
    }
  }, []);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        slideContainer: {
          position: 'absolute',
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
        },
        topBar: {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          paddingTop: insets.top,
        },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: SPACING.md,
          paddingTop: SPACING.xs,
          paddingBottom: SPACING.sm,
        },
        backButton: { marginRight: SPACING.sm },
        headerTitle: { fontSize: 18, color: colors.textPrimary, fontFamily: FONTS.inter },
        errorHeader: {
          paddingTop: insets.top + SPACING.sm,
        },
        tapLeft: {
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: '40%',
          zIndex: 5,
        },
        tapRight: {
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: '40%',
          zIndex: 5,
        },
        errorContainer: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: SPACING.xl,
        },
        errorText: { fontSize: 16, color: colors.textPrimary, textAlign: 'center', marginBottom: SPACING.lg },
      }),
    [colors, insets.top]
  );

  if (error || slides.length === 0) {
    return (
      <View style={styles.container}>
        <MeshGradientBackground baseColor={colors.background} lightMode={!isDark} />
        <View style={[styles.header, styles.errorHeader]}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Close recap">
            <BackArrow color={colors.textPrimary} width={24} height={24} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Back</Text>
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error ?? 'No slides to show.'}</Text>
          <TouchableOpacity onPress={handleBack} activeOpacity={0.7}>
            <Text style={{ color: colors.fern, fontSize: 16 }}>Go back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
    }
  }, [currentIndex]);

  const goNext = useCallback(() => {
    if (currentIndex < slides.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else if (albumId) {
      navigation.navigate('JourneyRecapPost', { albumId });
    } else {
      handleBack();
    }
  }, [currentIndex, slides.length, albumId, navigation, handleBack]);

  const currentSlide = slides[currentIndex];

  return (
    <View style={styles.container}>
      <MeshGradientBackground baseColor={colors.background} lightMode={!isDark} />
      <View style={styles.slideContainer}>
        <Animated.View style={[styles.slideContainer, { opacity: slideOpacity }]}>
          {currentSlide ? renderCurrentSlide(currentSlide) : null}
        </Animated.View>
      </View>
      <View style={styles.topBar}>
        <RecapProgressBar
          currentIndex={currentIndex}
          totalCount={slides.length}
          activeSegmentDurationMs={currentSlide.durationMs}
          onActiveSegmentComplete={goNext}
        />
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Close recap">
            <BackArrow color={colors.textPrimary} width={24} height={24} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Back</Text>
        </View>
      </View>
      <TouchableOpacity style={styles.tapLeft} onPress={goPrev} activeOpacity={1} accessibilityRole="button" accessibilityLabel="Previous slide" />
      <TouchableOpacity style={styles.tapRight} onPress={goNext} activeOpacity={1} accessibilityRole="button" accessibilityLabel="Next slide" />
    </View>
  );
};

export default JourneyRecapPlayerScreen;
