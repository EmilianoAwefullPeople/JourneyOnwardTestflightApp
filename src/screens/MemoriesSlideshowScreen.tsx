// MemoriesSlideshowScreen
// Instagram Stories-style viewer: one slide per memory (Entry with a photo) in a trip, in
// chronological order. Simpler sibling of JourneyRecapPlayerScreen — no generated data
// slides, no map/chart preloading, just the trip's photos with captions.

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppContext } from '../context/AppContext';
import { FONTS, FONT_WEIGHTS, SPACING } from '../config/constants';
import BackArrow from '../components/common/icons/BackArrow';
import RecapProgressBar from '../components/recap/RecapProgressBar';
import StoryPhoto from '../components/review/StoryPhoto';
import { Entry } from '../models/Entry';
import { DEFAULT_POSTCARD_PHOTO_TRANSFORM } from '../models/Postcard';
import type { TemplateSlot } from '../components/postcards/templates/sharedTypes';
import { loadTemplateComponent } from '../components/postcards/templates/templateLoader';

const SLIDE_DURATION_MS = 4500;
const { width: SW, height: SH } = Dimensions.get('window');
const SCREEN_ASPECT_RATIO = SW / SH;

interface CollageChoice {
  templateId: string;
  slotCount: number;
}

/**
 * Postcard collage layouts that exactly fill every cell (no empty "add photo" slots, no
 * repeated photos). Ordered largest→smallest so a trip with e.g. 5 photos gets the biggest
 * layout that still uses only real photos (4-up), rather than a 6-up with a gap.
 */
const EXACT_FIT_COLLAGES: CollageChoice[] = [
  { templateId: 'C-04', slotCount: 6 }, // 2×3 Grid
  { templateId: 'C-03', slotCount: 4 }, // 2×2 Grid
  { templateId: 'C-05', slotCount: 3 }, // One Above Two
  { templateId: 'C-01', slotCount: 2 }, // Two Rows
];

/** Largest collage layout whose slot count is fully covered by the available photos, or null below 2 photos. */
function pickCollageTemplate(photoCount: number): CollageChoice | null {
  return EXACT_FIT_COLLAGES.find((t) => photoCount >= t.slotCount) ?? null;
}

type SlideshowNav = NativeStackNavigationProp<RootStackParamList, 'MemoriesSlideshow'>;
type SlideshowRoute = RouteProp<RootStackParamList, 'MemoriesSlideshow'>;

interface MemorySlide {
  id: string;
  photoUris: string[];
  /** width / height of photoUris[0], from Entry.photoWidths/Heights; null if not yet known. */
  primaryAspectRatio: number | null;
  caption?: string;
  location?: string;
  dateLabel: string;
}

function getKnownAspectRatio(entry: Entry, photoIndex: number): number | null {
  const w = entry.photoWidths?.[photoIndex];
  const h = entry.photoHeights?.[photoIndex];
  if (typeof w === 'number' && typeof h === 'number' && w > 0 && h > 0) return w / h;
  return null;
}

function formatDateLabel(timestamp: string): string {
  try {
    const d = new Date(timestamp);
    if (!Number.isFinite(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  } catch {
    return '';
  }
}

function buildSlides(entries: Entry[]): MemorySlide[] {
  const withPhotos = entries.filter(
    (e) => !e.isDraft && e.mediaType === 'photo' && e.photoPaths && e.photoPaths.length > 0
  );
  const sorted = [...withPhotos].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  return sorted.map((entry) => ({
    id: entry.id,
    photoUris: entry.photoPaths.filter(Boolean),
    primaryAspectRatio: getKnownAspectRatio(entry, 0),
    caption: entry.title?.trim() || entry.description?.trim() || undefined,
    location: [entry.city, entry.country].filter(Boolean).join(', ') || undefined,
    dateLabel: formatDateLabel(entry.timestamp),
  }));
}

const MemoriesSlideshowScreen: React.FC = () => {
  const navigation = useNavigation<SlideshowNav>();
  const route = useRoute<SlideshowRoute>();
  const insets = useSafeAreaInsets();
  const { entries, tripAlbums } = useAppContext();
  const albumId = route.params?.albumId;

  const { slides, error } = useMemo(() => {
    if (!albumId) return { slides: [] as MemorySlide[], error: 'Missing trip.' };
    const album = (tripAlbums ?? []).find((a) => a.id === albumId);
    if (!album) return { slides: [] as MemorySlide[], error: 'Trip not found.' };
    const albumEntries = (entries ?? []).filter((e) => e.albumId === albumId);
    const built = buildSlides(albumEntries);
    if (built.length === 0) {
      return { slides: [] as MemorySlide[], error: 'No photo memories in this trip yet.' };
    }
    return { slides: built, error: null };
  }, [albumId, entries, tripAlbums]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const slideOpacity = useRef(new Animated.Value(1)).current;

  const animateIn = useCallback(() => {
    slideOpacity.setValue(0);
    Animated.timing(slideOpacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [slideOpacity]);

  const handleClose = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const goNext = useCallback(() => {
    setCurrentIndex((i) => {
      if (i < slides.length - 1) {
        animateIn();
        return i + 1;
      }
      navigation.goBack();
      return i;
    });
  }, [slides.length, animateIn, navigation]);

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => {
      if (i <= 0) return i;
      animateIn();
      return i - 1;
    });
  }, [animateIn]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: '#141212' },
        fill: { ...StyleSheet.absoluteFillObject },
        collageWrap: { width: SW },
        bottomScrim: {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 180,
        },
        captionWrap: {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: insets.bottom + SPACING.lg,
          paddingHorizontal: SPACING.lg,
        },
        dateLabel: {
          fontFamily: FONTS.inter,
          fontSize: 13,
          fontWeight: FONT_WEIGHTS.semibold,
          color: 'rgba(255,255,255,0.75)',
          marginBottom: 4,
        },
        caption: {
          fontFamily: FONTS.inter,
          fontSize: 17,
          fontWeight: FONT_WEIGHTS.semibold,
          color: '#FFFFFF',
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
      }),
    [insets.top, insets.bottom]
  );

  if (error || slides.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>{error ?? 'No slides to show.'}</Text>
          <TouchableOpacity onPress={handleClose} activeOpacity={0.7}>
            <Text style={styles.errorBack}>Go back</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.topBar}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={handleClose}
              style={styles.backButton}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <BackArrow color="#FFFFFF" width={24} height={24} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  const currentSlide = slides[currentIndex];
  const isCollage = currentSlide.photoUris.length > 1;

  const collage = useMemo(() => {
    if (!isCollage) return null;
    const template = pickCollageTemplate(currentSlide.photoUris.length);
    if (!template) return null;
    const CollageTemplate = loadTemplateComponent(template.templateId);
    if (!CollageTemplate) return null;
    const slots: TemplateSlot[] = currentSlide.photoUris.slice(0, template.slotCount).map((uri) => ({
      photoUri: uri,
      transform: DEFAULT_POSTCARD_PHOTO_TRANSFORM,
      resetKey: 0,
      entry: null,
    }));
    return { CollageTemplate, slots };
  }, [isCollage, currentSlide.photoUris]);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.fill, { opacity: slideOpacity }]} key={currentSlide.id}>
        {collage ? (
          <View style={styles.collageWrap}>
            <collage.CollageTemplate
              slots={collage.slots}
              aspectRatio={SCREEN_ASPECT_RATIO}
              previewMode
            />
          </View>
        ) : (
          <StoryPhoto
            uri={currentSlide.photoUris[0]}
            width={SW}
            height={SH}
            knownAspectRatio={currentSlide.primaryAspectRatio}
          />
        )}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.75)']}
          style={styles.bottomScrim}
          pointerEvents="none"
        />
        {(currentSlide.caption || currentSlide.location || currentSlide.dateLabel) && (
          <View style={styles.captionWrap} pointerEvents="none">
            {(currentSlide.dateLabel || currentSlide.location) && (
              <Text style={styles.dateLabel} numberOfLines={1}>
                {[currentSlide.dateLabel, currentSlide.location].filter(Boolean).join(' · ')}
              </Text>
            )}
            {currentSlide.caption && (
              <Text style={styles.caption} numberOfLines={3}>
                {currentSlide.caption}
              </Text>
            )}
          </View>
        )}
      </Animated.View>

      <View style={styles.topBar} pointerEvents="box-none">
        <RecapProgressBar
          currentIndex={currentIndex}
          totalCount={slides.length}
          activeSegmentDurationMs={SLIDE_DURATION_MS}
          onActiveSegmentComplete={goNext}
        />
        <View style={styles.header}>
          <TouchableOpacity
            onPress={handleClose}
            style={styles.backButton}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Close slideshow"
          >
            <BackArrow color="#FFFFFF" width={24} height={24} />
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity
        style={styles.tapLeft}
        onPress={goPrev}
        activeOpacity={1}
        accessibilityRole="button"
        accessibilityLabel="Previous memory"
      />
      <TouchableOpacity
        style={styles.tapRight}
        onPress={goNext}
        activeOpacity={1}
        accessibilityRole="button"
        accessibilityLabel="Next memory"
      />
    </View>
  );
};

export default MemoriesSlideshowScreen;
