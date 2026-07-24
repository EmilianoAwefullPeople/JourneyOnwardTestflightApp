// CaptureReviewView
// Inline review component rendered inside CaptureScreen when phase === 'review'.
// Receives photos as props (temp URIs in memory — no navigation params needed).
// Handles per-photo deletion, save, and calls callbacks to the parent.

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Alert,
  FlatList,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BackArrow from '../common/icons/BackArrow';
import { useAppContext } from '../../context/AppContext';
import { FONTS, FONT_WEIGHTS, SPACING } from '../../config/constants';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../config/theme';
import { generateUUID } from '../../utils/uuid';
import { getSeasonFromTimestamp } from '../../utils/seasonUtils';
import { getWeatherAtLocation } from '../../services/WeatherService';
import { Entry } from '../../models/Entry';
import { attachCountryToEntryIfMissing } from '../../utils/entryCountryResolve';
import { copyMediaToPersistentStorage, resolveMediaPath, generateAndSaveThumbnails } from '../../storage/mediaStorage';
import { extractColorPalettesForEntry } from '../../services/ColorExtractionService';
import * as PersistenceManager from '../../storage/PersistenceManager';
import { findMatchingAlbumId } from '../../utils/albumUtils';
import { logger } from '../../utils/logger';
import { measurePhotoDimensionsFromUris } from '../../utils/galleryAspectRatio';

type Props = {
  photos: string[];
  onBack: (remainingPhotos: string[]) => void;
  /** Second arg is resolved file:// URI for instant preview on CaptureSaved before context settles. */
  onSaved: (entryId: string, previewFirstPhotoUri?: string) => void;
  /** When provided (past experiences), skip live location fetch and use these values instead. */
  exifTimestamp?: string;
  exifLocation?: { latitude: number; longitude: number };
  exifAltitude?: number;
};

const CaptureReviewView: React.FC<Props> = ({ photos, onBack, onSaved, exifTimestamp, exifLocation, exifAltitude }) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { createEntry, activeTripAlbum, tripAlbums } = useAppContext();

  const isPastExperience = exifTimestamp !== undefined;

  const [localPhotos, setLocalPhotos] = useState<string[]>(photos);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [currentAltitude, setCurrentAltitude] = useState<number | null>(null);

  const flatListRef = useRef<FlatList<string>>(null);

  const styles = useMemo(() => createStyles(colors), [colors]);
  const { width: windowWidth } = useWindowDimensions();
  const scaleFactor = Math.min(Math.max(windowWidth, 320), 430) / 390;
  const safeTop = Number.isFinite(insets.top) ? insets.top : 0;
  const safeBottom = Number.isFinite(insets.bottom) ? insets.bottom : 0;

  const CARD_HORIZONTAL_INSET = 24 * scaleFactor;
  const cardWidth = windowWidth - CARD_HORIZONTAL_INSET * 2;
  const cardHeight = cardWidth * (4 / 3);

  // Fetch live location on mount — skip for past experiences (use EXIF GPS instead)
  useEffect(() => {
    if (isPastExperience) return;
    const fetchLocation = async () => {
      try {
        const locationModule = await import('expo-location');
        const { status } = await locationModule.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await locationModule.getCurrentPositionAsync({});
          setCurrentLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
          const alt = loc.coords.altitude;
          if (typeof alt === 'number' && !Number.isNaN(alt)) setCurrentAltitude(alt);
        }
      } catch (_) {
        // Non-blocking — entry saves without location
      }
    };
    fetchLocation();
  }, [isPastExperience]);

  // ─── Delete photo ──────────────────────────────────────────────────────────

  const handleDeletePhoto = useCallback((index: number) => {
    Alert.alert(
      'Delete photo?',
      'Are you sure you want to delete this photo?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const next = localPhotos.filter((_, i) => i !== index);
            if (next.length === 0) {
              onBack([]);
              return;
            }
            setLocalPhotos(next);
            const nextIndex = Math.min(index, next.length - 1);
            setActiveIndex(nextIndex);
            setTimeout(() => {
              flatListRef.current?.scrollToIndex({ index: nextIndex, animated: false });
            }, 50);
          },
        },
      ]
    );
  }, [localPhotos, onBack]);

  // ─── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (isSaving || localPhotos.length === 0) return;
    setIsSaving(true);

    try {
      const entryId = generateUUID();

      let persistentPaths: string[];
      try {
        persistentPaths = await copyMediaToPersistentStorage(localPhotos, entryId);
      } catch (copyError) {
        logger.error('Error copying photos to persistent storage:', copyError);
        Alert.alert('Error', 'Could not save photos. Please try again.');
        setIsSaving(false);
        return;
      }

      // Generate thumbnails immediately so gallery cards load fast from first view.
      // Fire-and-forget after save if generation is slow; backfill will catch any failures.
      const resolvedForThumb = persistentPaths.map(resolveMediaPath);
      let thumbPaths: string[] = [];
      try {
        thumbPaths = await generateAndSaveThumbnails(resolvedForThumb, entryId);
      } catch (_) {
        // Non-fatal: backfill service will generate thumbnails on next app session.
      }

      const dimensionArrays = await measurePhotoDimensionsFromUris(resolvedForThumb);

      const timestamp = isPastExperience
        ? (exifTimestamp ?? new Date().toISOString())
        : new Date().toISOString();

      const resolvedLocation = isPastExperience
        ? (exifLocation ?? null)
        : currentLocation;
      const resolvedAltitude = isPastExperience
        ? (typeof exifAltitude === 'number' && Number.isFinite(exifAltitude) ? exifAltitude : null)
        : currentAltitude;

      const albumId = isPastExperience
        ? findMatchingAlbumId(timestamp, tripAlbums ?? [])
        : activeTripAlbum?.id;

      const entry: Entry = {
        id: entryId,
        type: 'experience',
        title: '',
        description: '',
        mediaType: 'photo',
        mediaPaths: persistentPaths,
        photoPaths: persistentPaths,
        thumbPaths,
        ...dimensionArrays,
        timestamp,
        latitude: resolvedLocation?.latitude,
        longitude: resolvedLocation?.longitude,
        albumId,
        season: getSeasonFromTimestamp(timestamp, resolvedLocation?.latitude),
        ...(typeof resolvedAltitude === 'number' && resolvedAltitude !== null
          ? { altitudeMeters: resolvedAltitude }
          : {}),
        isDraft: false,
        isBookmarked: false,
      };

      if (resolvedLocation) {
        try {
          const weather = await getWeatherAtLocation(resolvedLocation.latitude, resolvedLocation.longitude);
          if (weather) {
            entry.weather = weather.condition;
            entry.temperatureCelsius = weather.temperatureCelsius;
          }
        } catch (_) {}
      }

      const entryToSave = await attachCountryToEntryIfMissing(entry);
      await createEntry(entryToSave);

      if (entryToSave.photoPaths.length > 0) {
        const resolvedPaths = entryToSave.photoPaths.map(resolveMediaPath);
        extractColorPalettesForEntry(resolvedPaths)
          .then(palettes => {
            if (palettes.some(p => p !== null)) {
              return PersistenceManager.updateEntry({
                ...entryToSave,
                colorPalettes: palettes as string[][],
              });
            }
          })
          .catch(() => {});
      }

      const previewFirstPhotoUri =
        entryToSave.photoPaths.length > 0 ? resolveMediaPath(entryToSave.photoPaths[0]) : undefined;
      onSaved(entryId, previewFirstPhotoUri);
    } catch (error) {
      logger.error('Error saving entry:', error);
      Alert.alert('Error', 'Failed to save. Please try again.');
      setIsSaving(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  const renderPhoto = useCallback(({ item, index }: { item: string; index: number }) => (
    <View style={[styles.slide, { width: windowWidth }]}>
      <View style={[styles.photoCard, { width: cardWidth, height: cardHeight }]}>
        <Image
          source={{ uri: item }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDeletePhoto(index)}
          accessibilityRole="button"
          accessibilityLabel="Delete photo"
          activeOpacity={0.8}
        >
          <Text style={styles.deleteButtonText}>×</Text>
        </TouchableOpacity>
      </View>
    </View>
  ), [windowWidth, cardWidth, cardHeight, handleDeletePhoto]);

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) setActiveIndex(viewableItems[0].index ?? 0);
  });

  return (
    <View style={[styles.container, { paddingTop: safeTop }]}>

      {/* Back arrow */}
      <TouchableOpacity
        style={[styles.backButton, { top: safeTop + SPACING.sm }]}
        onPress={() => onBack(localPhotos)}
        accessibilityRole="button"
        accessibilityLabel="Back to camera"
      >
        <BackArrow width={23.75 * scaleFactor} height={26.25 * scaleFactor} color={colors.textPrimary} />
      </TouchableOpacity>

      {/* Photo carousel — fixed height + top-aligned slides (no flex:1 centering) */}
      <View
        style={[
          styles.carouselWrapper,
          {
            // Tight to back arrow with a hair more breathing room below it
            marginTop: SPACING.sm + 45 * scaleFactor,
            height: cardHeight,
          },
        ]}
      >
        <FlatList
          ref={flatListRef}
          data={localPhotos}
          keyExtractor={(_, i) => `photo-${i}`}
          renderItem={renderPhoto}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged.current}
          viewabilityConfig={{ viewAreaCoveragePercentThreshold: 50 }}
          scrollEnabled={localPhotos.length > 1}
          getItemLayout={(_, index) => ({ length: windowWidth, offset: windowWidth * index, index })}
          style={{ height: cardHeight }}
        />
      </View>

      {/* Pagination dots */}
      {localPhotos.length > 1 ? (
        <View style={styles.dotsRow}>
          {localPhotos.map((_, i) => (
            <View key={i} style={[styles.dot, i === activeIndex ? styles.dotActive : styles.dotInactive]} />
          ))}
        </View>
      ) : (
        <View style={styles.dotsSpacer} />
      )}

      {/* SAVE button */}
      <TouchableOpacity
        style={[styles.saveButton, { marginBottom: safeBottom + SPACING.lg }]}
        onPress={handleSave}
        disabled={isSaving}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Save experience"
      >
        {isSaving ? (
          <ActivityIndicator color={colors.textPrimary} />
        ) : (
          <Text style={[styles.saveButtonText, { fontSize: 28 * scaleFactor, color: colors.textPrimary }]}>
            SAVE
          </Text>
        )}
      </TouchableOpacity>

    </View>
  );
};

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    backButton: {
      position: 'absolute',
      left: 18,
      zIndex: 100,
      justifyContent: 'center',
      alignItems: 'center',
    },
    carouselWrapper: {
      alignSelf: 'stretch',
      alignItems: 'center',
    },
    slide: { justifyContent: 'flex-start', alignItems: 'center' },
    photoCard: {
      borderRadius: 16,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.borderLight,
      backgroundColor: colors.stone600,
    },
    deleteButton: {
      position: 'absolute',
      top: 10,
      right: 10,
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    deleteButtonText: {
      color: '#FFFFFF',
      fontSize: 22,
      lineHeight: 26,
      fontWeight: FONT_WEIGHTS.bold,
      fontFamily: FONTS.inter,
    },
    dotsRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 6,
      paddingVertical: SPACING.md,
    },
    dotsSpacer: { height: 12 + SPACING.md * 2 },
    dot: { width: 7, height: 7, borderRadius: 3.5 },
    dotActive: { backgroundColor: colors.textPrimary },
    dotInactive: { backgroundColor: colors.borderLight },
    saveButton: { alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 8 },
    saveButtonText: { fontFamily: FONTS.inter, fontWeight: FONT_WEIGHTS.black, textAlign: 'center' },
  });
}

export default CaptureReviewView;
