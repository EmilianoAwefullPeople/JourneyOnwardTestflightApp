import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppContext } from '../context/AppContext';
import { FONTS, SPACING } from '../config/constants';
import { getRecapCandidates } from '../utils/recapCandidates';
import { buildRecapSlides } from '../utils/recapBuilder';
import { Analytics } from '../services/AnalyticsService';

import {
  collectPreloadAssets,
  preloadAssets as preloadAssetsUtil,
  getCachedMapModule,
} from '../utils/recapPreloader';
import type {
  RecapSlide,
  OpeningScreenPayload,
  TitleCardPayload,
  OpeningStatsPayload,
  BeginningPhotosPayload,
  ActivityMultipleChoicePayload,
  ActivityDistributionPayload,
  ColorPalettePayload,
  ColorPalettePhotoPayload,
  EmotionDataPayload,
  JournalDataPayload,
  LocationDataPayload,
  GraphicLocationDataPayload,
  MiddlePhotosPayload,
  WeatherDataPayload,
  TemperatureDataPayload,
  AltitudeDataPayload,
  EndPhotosPayload,
} from '../models/Recap';

// Lightweight module-level imports only — all heavy slide/chart components are
// loaded via require() inside useMemo to prevent native module init crashes on
// Hermes at startup (same pattern as AppNavigator).

const { width: SW, height: SH } = Dimensions.get('window');
const OFFSCREEN_CARD_WIDTH = Math.round(SW * 0.72);
const MAP_HEIGHT = Math.round(SH * 0.46); // must match GraphicLocationDataSlide.MAP_HEIGHT

type PlayerNav = NativeStackNavigationProp<RootStackParamList, 'JourneyRecapPlayer'>;
type PlayerRoute = RouteProp<RootStackParamList, 'JourneyRecapPlayer'>;

const JourneyRecapPlayerScreen: React.FC = () => {
  const navigation = useNavigation<PlayerNav>();
  const route = useRoute<PlayerRoute>();
  const insets = useSafeAreaInsets();
  const { entries, tripAlbums, journals } = useAppContext();
  const albumId = route.params?.albumId;

  const C = useMemo(
    () => ({
      BackArrow: require('../components/common/icons/BackArrow').default,
      RecapProgressBar: require('../components/recap/RecapProgressBar').default,
      OpeningScreen: require('../components/recap/slides/OpeningScreenSlide').default,
      TitleCard: require('../components/recap/slides/TitleCardSlide').default,
      OpeningStats: require('../components/recap/slides/OpeningStatsSlide').default,
      BeginningPhotos: require('../components/recap/slides/BeginningPhotosSlide').default,
      ActivityMultipleChoice: require('../components/recap/slides/ActivityMultipleChoiceSlide').default,
      ActivityDistribution: require('../components/recap/slides/ActivityDistributionGraphSlide').default,
      ColorPalette: require('../components/recap/templates/T7ColorPalette').default,
      ColorPalettePhoto: require('../components/recap/slides/ColorPalettePhotoSlide').default,
      EmotionData: require('../components/recap/slides/EmotionDataSlide').default,
      JournalData: require('../components/recap/slides/JournalDataSlide').default,
      LocationData: require('../components/recap/slides/LocationDataSlide').default,
      GraphicLocation: require('../components/recap/slides/GraphicLocationDataSlide').default,
      MiddlePhotos: require('../components/recap/slides/MiddlePhotosSlide').default,
      WeatherData: require('../components/recap/slides/WeatherDataSlide').default,
      TemperatureData: require('../components/recap/slides/TemperatureDataSlide').default,
      AltitudeData: require('../components/recap/slides/AltitudeDataSlide').default,
      EndOfTrip: require('../components/recap/slides/EndOfTripPhotosSlide').default,
      RecapPostcard: require('../components/recap/RecapPostcard').default,
    }),
    []
  );

  const { slides, error } = useMemo(() => {
    if (!albumId) return { slides: [] as RecapSlide[], error: 'Missing trip.' };
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
      const built = buildRecapSlides(candidate, albumEntries, journals ?? []);
      return { slides: built, error: null };
    } catch {
      return { slides: [] as RecapSlide[], error: 'Something went wrong.' };
    }
  }, [albumId, entries, tripAlbums, journals]);

  const preloadData = useMemo(
    () => (slides.length > 0 ? collectPreloadAssets(slides) : null),
    [slides]
  );

  const [preloadPhase, setPreloadPhase] = useState<'loading' | 'ready'>('loading');
  const loadingOpacity = useRef(new Animated.Value(1)).current;

  // Ref-based counter — avoids a re-render per image load event
  const totalImagesRef = useRef(0);
  const loadedCountRef = useRef(0);
  const preloadDoneRef = useRef(false);

  const fadeAndComplete = useCallback(() => {
    if (preloadDoneRef.current) return;
    preloadDoneRef.current = true;
    Animated.timing(loadingOpacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setPreloadPhase('ready'));
  }, [loadingOpacity]);

  // Count every image load or error toward completion
  const handleImageLoad = useCallback(() => {
    loadedCountRef.current += 1;
    if (loadedCountRef.current >= totalImagesRef.current) {
      fadeAndComplete();
    }
  }, [fadeAndComplete]);

  useEffect(() => {
    if (error || !preloadData) {
      fadeAndComplete();
      return;
    }

    const total = preloadData.postcardItems.length + preloadData.imageUris.length;
    totalImagesRef.current = total;
    loadedCountRef.current = 0;
    preloadDoneRef.current = false;

    // expo-image prefetch populates Nuke's memory+disk cache for all URIs.
    // This is the primary completion signal — resolves once images are cached.
    preloadAssetsUtil(preloadData, { timeoutMs: 5000 }).then(fadeAndComplete);

    // onLoad callbacks on off-screen components (handleImageLoad) act as a
    // parallel confirmation path. Whichever fires first (prefetch or onLoad
    // counter) calls fadeAndComplete — the preloadDoneRef guard prevents double-firing.

    // Hard ceiling in case both paths stall
    const timer = setTimeout(fadeAndComplete, 6000);
    return () => clearTimeout(timer);
  }, [error, preloadData, fadeAndComplete]);

  // Single MapView instance — loaded after preloadMap() resolves, then kept alive for the
  // full recap lifetime. Repositioned between off-screen and on-screen rather than remounted.
  const [mapComponents, setMapComponents] = useState<{
    MapView: React.ComponentType<any>;
    Marker: React.ComponentType<any>;
  } | null>(null);

  useEffect(() => {
    if (!preloadData?.needsMap || mapComponents) return;
    const cached = getCachedMapModule();
    if (cached) {
      setMapComponents({ MapView: cached.default, Marker: cached.Marker });
      return;
    }
    // Fallback: module not cached yet — import directly
    import('react-native-maps')
      .then((mod) => setMapComponents({ MapView: mod.default, Marker: mod.Marker }))
      .catch(() => {});
  }, [preloadPhase, preloadData, mapComponents]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const slideOpacity = useRef(new Animated.Value(1)).current;
  const viewStartTime = useRef(Date.now());

  const animateIn = useCallback(() => {
    slideOpacity.setValue(0);
    Animated.timing(slideOpacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [slideOpacity]);

  const handleBack = useCallback(() => {
    if (albumId && slides.length > 0) {
      const pct = currentIndex / slides.length;
      Analytics.onRecapViewed(albumId, pct, false).catch(() => {});
    }
    navigation.goBack();
  }, [navigation, albumId, currentIndex, slides.length]);

  const goNext = useCallback(() => {
    if (!albumId) return;
    if (currentIndex < slides.length - 1) {
      setCurrentIndex((i) => i + 1);
      animateIn();
    } else {
      if (albumId) Analytics.onRecapViewed(albumId, 1.0, true).catch(() => {});
      navigation.navigate('JourneyRecapPost', { albumId });
    }
  }, [currentIndex, slides.length, albumId, navigation, animateIn]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      animateIn();
    }
  }, [currentIndex, animateIn]);

  const renderSlide = useCallback(
    (slide: RecapSlide) => {
      const {
        OpeningScreen, TitleCard, OpeningStats, BeginningPhotos,
        ActivityMultipleChoice, ActivityDistribution, ColorPalette,
        ColorPalettePhoto, EmotionData, JournalData, LocationData,
        GraphicLocation, MiddlePhotos, WeatherData, TemperatureData, AltitudeData,
      } = C;

      switch (slide.type) {
        case 'opening_screen': {
          const p = slide.payload as OpeningScreenPayload;
          return <OpeningScreen postcards={p.postcards} />;
        }
        case 'title_card': {
          const p = slide.payload as TitleCardPayload;
          return (
            <TitleCard
              tripName={p.tripName}
              dateRange={p.dateRange}
              backgroundPhotoUri={p.backgroundPhotoUri}
              onStart={goNext}
            />
          );
        }
        case 'opening_stats': {
          const p = slide.payload as OpeningStatsPayload;
          return (
            <OpeningStats
              tripDays={p.tripDays}
              memoriesCount={p.memoriesCount}
              photosCount={p.photosCount}
              journalCount={p.journalCount}
            />
          );
        }
        case 'beginning_of_trip_photos': {
          const p = slide.payload as BeginningPhotosPayload;
          return <BeginningPhotos bgPhotoUri={p.bgPhotoUri} postcards={p.postcards} />;
        }
        case 'activity_multiple_choice': {
          const p = slide.payload as ActivityMultipleChoicePayload;
          return (
            <ActivityMultipleChoice
              peakDay={p.peakDay}
              choices={p.choices}
              onComplete={goNext}
            />
          );
        }
        case 'activity_distribution_graph': {
          const p = slide.payload as ActivityDistributionPayload;
          return <ActivityDistribution data={p.data} xAxisMode={p.xAxisMode} />;
        }
        case 'color_palette': {
          const p = slide.payload as ColorPalettePayload;
          return <ColorPalette colors={p.colors} tripLabel={p.tripLabel} />;
        }
        case 'color_palette_photo': {
          const p = slide.payload as ColorPalettePhotoPayload;
          return <ColorPalettePhoto colors={p.colors} photoUri={p.photoUri} />;
        }
        case 'emotion_data': {
          const p = slide.payload as EmotionDataPayload;
          return <EmotionData emotions={p.emotions} />;
        }
        case 'journal_data': {
          const p = slide.payload as JournalDataPayload;
          return (
            <JournalData words={p.words} sentences={p.sentences} chapters={p.chapters} />
          );
        }
        case 'location_data': {
          const p = slide.payload as LocationDataPayload;
          return <LocationData totalPlaces={p.totalPlaces} topPlaces={p.topPlaces} />;
        }
        case 'graphic_location_data': {
          const p = slide.payload as GraphicLocationDataPayload;
          return (
            <GraphicLocation
              locations={p.locations}
              cityList={p.cityList}
              postcard={p.postcard}
            />
          );
        }
        case 'middle_of_trip_photos': {
          const p = slide.payload as MiddlePhotosPayload;
          return <MiddlePhotos photoUris={p.photoUris} />;
        }
        case 'weather_data': {
          const p = slide.payload as WeatherDataPayload;
          return <WeatherData conditions={p.conditions} photoUri={p.photoUri} />;
        }
        case 'temperature_data': {
          const p = slide.payload as TemperatureDataPayload;
          return (
            <TemperatureData
              averageCelsius={p.averageCelsius}
              lowestCelsius={p.lowestCelsius}
              highestCelsius={p.highestCelsius}
              photoUri={p.photoUri}
            />
          );
        }
        case 'altitude_data': {
          const p = slide.payload as AltitudeDataPayload;
          return <AltitudeData lowest={p.lowest} highest={p.highest} />;
        }
        case 'end_of_trip_photos': {
          const p = slide.payload as EndPhotosPayload;
          return <C.EndOfTrip postcards={p.postcards} />;
        }
        default:
          return null;
      }
    },
    [C, goNext]
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: '#141212' },
        fill: { ...StyleSheet.absoluteFillObject },
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
        errorWrap: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: SPACING.xl,
          paddingTop: insets.top + 60,
        },
        errorText: {
          fontFamily: FONTS.inter,
          fontSize: 16,
          color: 'rgba(255,255,255,0.8)',
          textAlign: 'center',
          marginBottom: SPACING.lg,
        },
        errorBack: {
          fontFamily: FONTS.inter,
          fontSize: 16,
          color: 'rgba(255,255,255,0.5)',
        },
        offScreen: {
          position: 'absolute',
          left: -2000,
          top: 0,
          opacity: 0,
        },
        mapOverlay: {
          position: 'absolute',
          top: 0,
        },
        offScreenImage: {
          width: SW,
          height: SW,
        },
        loadingOverlay: {
          backgroundColor: '#141212',
          alignItems: 'center',
          justifyContent: 'center',
        },
      }),
    [insets.top]
  );

  if (error || slides.length === 0) {
    const { BackArrow } = C;
    return (
      <View style={styles.container}>
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>{error ?? 'No slides to show.'}</Text>
          <TouchableOpacity onPress={handleBack} activeOpacity={0.7}>
            <Text style={styles.errorBack}>Go back</Text>
          </TouchableOpacity>
        </View>
        <View style={[styles.topBar, { paddingTop: insets.top }]}>
          <View style={styles.header}>
            <TouchableOpacity onPress={handleBack} style={styles.backButton} activeOpacity={0.7}>
              <BackArrow color="#FFFFFF" width={24} height={24} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  const { BackArrow, RecapProgressBar, RecapPostcard } = C;
  const currentSlide = slides[currentIndex];
  const isInteractive = currentSlide?.interactive === true;

  return (
    <View style={styles.container}>
      {/* Slide content — rendered underneath loading overlay so components warm up early */}
      <Animated.View style={[styles.fill, { opacity: slideOpacity }]} key={currentSlide.id}>
        {renderSlide(currentSlide)}
      </Animated.View>

      {/* Off-screen layer — always mounted to hold decoded UIImage and MKMapView refs in native memory.
          onLoad/onError callbacks drive the preload counter; recap starts only when all fire. */}
      {preloadData && (
        <View style={styles.offScreen} pointerEvents="none">
          {preloadData.postcardItems.map((item) => (
            <RecapPostcard
              key={item.photoUri}
              photoUri={item.photoUri}
              location={item.location}
              tiltDeg={0}
              width={OFFSCREEN_CARD_WIDTH}
              onLoad={handleImageLoad}
              onError={handleImageLoad}
            />
          ))}
          {preloadData.imageUris.map((uri) => (
            <ExpoImage
              key={uri}
              source={{ uri }}
              style={styles.offScreenImage}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={0}
              onLoad={handleImageLoad}
              onError={handleImageLoad}
            />
          ))}
        </View>
      )}

      {/* Single MapView instance — repositioned on/off screen rather than remounted.
          Tiles loaded during preloading are preserved. Fades with slideOpacity when active. */}
      {preloadData?.mapProps && mapComponents && (() => {
        const { MapView: MV, Marker: MK } = mapComponents;
        const isMapSlide = currentSlide?.type === 'graphic_location_data';
        return (
          <Animated.View
            style={[
              styles.mapOverlay,
              {
                left: isMapSlide ? 0 : -SW * 2,
                opacity: isMapSlide ? slideOpacity : 0,
              },
            ]}
            pointerEvents="none"
          >
            <MV
              style={{ width: SW, height: MAP_HEIGHT }}
              initialRegion={preloadData.mapProps.region}
              scrollEnabled={false}
              zoomEnabled={false}
              rotateEnabled={false}
              pitchEnabled={false}
              pointerEvents="none"
            >
              {preloadData.mapProps.locations.map((loc, i) => (
                <MK
                  key={i}
                  coordinate={{ latitude: loc.latitude, longitude: loc.longitude }}
                  title={loc.label}
                  pinColor="#fed86d"
                />
              ))}
            </MV>
          </Animated.View>
        );
      })()}

      {/* Top bar — always rendered so back button works during loading */}
      <View style={styles.topBar} pointerEvents="box-none">
        {preloadPhase === 'ready' && (
          <RecapProgressBar
            currentIndex={currentIndex}
            totalCount={slides.length}
            activeSegmentDurationMs={currentSlide.durationMs}
            onActiveSegmentComplete={isInteractive ? undefined : goNext}
            paused={isInteractive}
          />
        )}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={handleBack}
            style={styles.backButton}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Close recap"
          >
            <BackArrow color="#FFFFFF" width={24} height={24} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Tap zones — only active once recap is playing */}
      {preloadPhase === 'ready' && !isInteractive && (
        <>
          <TouchableOpacity
            style={styles.tapLeft}
            onPress={goPrev}
            activeOpacity={1}
            accessibilityRole="button"
            accessibilityLabel="Previous slide"
          />
          <TouchableOpacity
            style={styles.tapRight}
            onPress={goNext}
            activeOpacity={1}
            accessibilityRole="button"
            accessibilityLabel="Next slide"
          />
        </>
      )}

      {/* Loading overlay — fades out when all assets are ready */}
      {preloadPhase === 'loading' && (
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.loadingOverlay, { opacity: loadingOpacity }]}
          pointerEvents="auto"
        >
          <ActivityIndicator color="rgba(255,255,255,0.35)" size="large" />
        </Animated.View>
      )}
    </View>
  );
};

export default JourneyRecapPlayerScreen;
