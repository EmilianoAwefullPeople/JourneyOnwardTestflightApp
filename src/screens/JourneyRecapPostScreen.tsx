import React, {
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, CommonActions } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { FONTS, FONT_WEIGHTS, SPACING } from '../config/constants';
import { useAppContext } from '../context/AppContext';
import { DEFAULT_POSTCARD_PHOTO_TRANSFORM } from '../models/Postcard';
import type { Entry } from '../models/Entry';
import { logger } from '../utils/logger';
import { Analytics } from '../services/AnalyticsService';
import { deriveDiptychLabels } from '../components/postcards/templates/diptychCaptionUtils';


const { width: SW } = Dimensions.get('window');

type Nav = NativeStackNavigationProp<RootStackParamList, 'JourneyRecapPost'>;
type Route = RouteProp<RootStackParamList, 'JourneyRecapPost'>;

// Ordered list of templates to show in the recap carousel.
// Each entry defines which template to use and how many photos it consumes.
// Templates are sorted by photo count (fewest first) so the carousel starts
// with single-photo cards and progresses to richer layouts.
// minPhotos: minimum distinct photos required to show the card (defaults to photosToUse).
const RECAP_TEMPLATE_SPECS: Array<{ id: string; photosToUse: number; minPhotos?: number }> = [
  { id: 'T-02', photosToUse: 1 }, // Camera Frame
  { id: 'T-03', photosToUse: 1 }, // Statement Card
  { id: 'T-11', photosToUse: 2 }, // Diptych (T-11 / T11DiptychTemplate)
  { id: 'T-05', photosToUse: 1 }, // iMessage Thread
  { id: 'T-06', photosToUse: 3 }, // Triptych Stamps
  { id: 'T-01', photosToUse: 4 }, // Quad Collage
];

interface RecapCardSpec {
  templateId: string;
  photos: string[];
  locations: string[];
  entries: Entry[];
}

function getPhotoUri(entry: { photoPaths?: string[]; mediaPaths?: string[] }): string | null {
  const paths = entry.photoPaths?.length
    ? entry.photoPaths
    : (entry.mediaPaths ?? []);
  return paths.find((p) => p && typeof p === 'string') ?? null;
}

function getLocation(entry: { city?: string; country?: string }): string {
  if (entry.city && entry.country) return `${entry.city}, ${entry.country}`;
  if (entry.city) return entry.city;
  return '';
}

/**
 * Build one card spec per eligible template. Photos are distributed across
 * cards with a cyclic offset so different templates show different photos.
 */
function buildRecapCards(
  photoEntries: Array<{ photoUri: string; location: string; entry: Entry }>
): RecapCardSpec[] {
  if (photoEntries.length === 0) return [];
  const result: RecapCardSpec[] = [];
  let offset = 0;
  for (const spec of RECAP_TEMPLATE_SPECS) {
    const { id, photosToUse } = spec;
    const minRequired = spec.minPhotos ?? photosToUse;
    if (photoEntries.length < minRequired) continue;
    const photos: string[] = [];
    const locations: string[] = [];
    const entries: Entry[] = [];
    for (let i = 0; i < photosToUse; i++) {
      const pe = photoEntries[(offset + i) % photoEntries.length];
      photos.push(pe.photoUri);
      locations.push(pe.location);
      entries.push(pe.entry);
    }
    result.push({ templateId: id, photos, locations, entries });
    offset = (offset + photosToUse) % photoEntries.length;
  }
  return result;
}

/** Lazy-load the component for a given template ID. */
function loadTemplateComponent(templateId: string): React.ComponentType<any> | null {
  try {
    switch (templateId) {
      case 'T-01':
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('../components/postcards/templates/T01QuadCollageTemplate').default;
      case 'T-02':
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('../components/postcards/templates/T02CameraViewfinderTemplate').default;
      case 'T-03':
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('../components/postcards/templates/T03StatementCardTemplate').default;
      case 'T-05':
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('../components/postcards/templates/T05iMessageTemplate').default;
      case 'T-06':
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('../components/postcards/templates/T06VerticalTriptychTemplate').default;
      case 'T-11':
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('../components/postcards/templates/T11DiptychTemplate').default;
      default:
        return null;
    }
  } catch (err) {
    logger.warn('JourneyRecapPostScreen: failed to load template', { templateId, err });
    return null;
  }
}

const NOOP = () => {};
const ASPECT_RATIO = 4 / 5;

/** A single postcard card in the carousel, rendering the correct template. */
const RecapCard = React.forwardRef<
  View,
  { spec: RecapCardSpec }
>(({ spec }, ref) => {
  const { templateId, photos, locations, entries } = spec;
  const Component = useMemo(() => loadTemplateComponent(templateId), [templateId]);
  if (!Component) return null;

  const defaultTransform = { ...DEFAULT_POSTCARD_PHOTO_TRANSFORM };

  if (templateId === 'T-11') {
    const [topLabel, bottomLabel] = deriveDiptychLabels(entries[0], entries[1]);
    return (
      <Component
        ref={ref}
        topPhoto={photos[0] ?? null}
        bottomPhoto={photos[1] ?? null}
        topLabel={topLabel || locations[0] || ''}
        bottomLabel={bottomLabel || locations[1] || ''}
        topTransform={defaultTransform}
        bottomTransform={defaultTransform}
        onTopTransformChange={NOOP}
        onBottomTransformChange={NOOP}
        onSlotPress={NOOP}
        onLabelPress={NOOP}
        onResetSlotFraming={NOOP}
        previewMode
        editingChromeSuppressed
        aspectRatio={ASPECT_RATIO}
      />
    );
  }

  const slots = photos.map((photoUri, i) => ({
    photoUri,
    transform: { ...DEFAULT_POSTCARD_PHOTO_TRANSFORM },
    resetKey: 0,
    entry: entries[i] ?? null,
  }));

  return (
    <Component
      ref={ref}
      slots={slots}
      onSlotPress={NOOP}
      onTransformChange={NOOP}
      onResetSlotFraming={NOOP}
      templateData={{}}
      onTemplateDataChange={NOOP}
      aspectRatio={ASPECT_RATIO}
      editingChromeSuppressed
      previewMode
    />
  );
});

const JourneyRecapPostScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const { entries, tripAlbums } = useAppContext();
  const albumId = route.params?.albumId;

  const album = useMemo(
    () => (albumId && tripAlbums ? tripAlbums.find((a) => a.id === albumId) : null),
    [albumId, tripAlbums]
  );

  const photoEntries = useMemo(() => {
    if (!albumId) return [];
    const albumEntries = (entries ?? []).filter(
      (e) => e.albumId === albumId && !e.isDraft
    );
    const items = albumEntries
      .filter((e) => getPhotoUri(e) !== null)
      .map((e) => ({
        photoUri: getPhotoUri(e)!,
        location: getLocation(e),
        isBookmarked: e.isBookmarked === true,
        entry: e,
      }));
    const bookmarked = items.filter((p) => p.isBookmarked);
    const rest = items.filter((p) => !p.isBookmarked);
    return [...bookmarked, ...rest]
      .slice(0, 12)
      .map(({ photoUri, location, entry }) => ({ photoUri, location, entry }));
  }, [albumId, entries]);

  const cards = useMemo(() => buildRecapCards(photoEntries), [photoEntries]);

  const [currentCard, setCurrentCard] = useState(0);
  const [sharing, setSharing] = useState(false);
  const cardRefs = useRef<(View | null)[]>([]);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offset = e.nativeEvent.contentOffset.x;
      setCurrentCard(Math.round(offset / SW));
    },
    []
  );

  const handleShare = useCallback(async () => {
    const ref = cardRefs.current[currentCard];
    if (!ref) return;
    setSharing(true);
    try {
      const { captureRef } = require('react-native-view-shot');
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      );
      const uri = await captureRef(ref, {
        format: 'jpg',
        quality: 0.95,
        result: 'tmpfile',
      });

      if (Platform.OS === 'ios') {
        await Share.share({ url: uri });
      } else {
        const MediaLibrary = require('expo-media-library');
        const { status } = await MediaLibrary.requestPermissionsAsync(true);
        if (status === 'granted') {
          await MediaLibrary.saveToLibraryAsync(uri);
          Alert.alert('Saved', 'Postcard saved to your camera roll.');
        } else {
          Alert.alert('Permission needed', 'Allow access to save photos in Settings.');
        }
      }
      Analytics.onPostcardExported(albumId ?? null).catch(() => {});
    } catch (err) {
      logger.warn('JourneyRecapPostScreen: share failed', err);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setSharing(false);
    }
  }, [currentCard, albumId]);

  const handleReplay = useCallback(() => {
    if (!albumId) return;
    try {
      navigation.navigate('JourneyRecapPlayer', { albumId });
    } catch (err) {
      logger.warn('JourneyRecapPostScreen: navigate to player failed', err);
    }
  }, [navigation, albumId]);

  const handleBack = useCallback(() => {
    try {
      if (albumId) {
        navigation.dispatch(
          CommonActions.reset({
            index: 1,
            routes: [
              { name: 'MainTabs', params: { screen: 'Review' } },
              { name: 'TripAlbumDetail', params: { albumId } },
            ],
          })
        );
      } else {
        navigation.navigate('MainTabs', { screen: 'Home' });
      }
    } catch {
      navigation.goBack();
    }
  }, [navigation, albumId]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: '#141212',
        },
        topBar: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: SPACING.md,
          paddingTop: insets.top + 8,
          paddingBottom: SPACING.sm,
        },
        doneText: {
          fontFamily: FONTS.inter,
          fontSize: 15,
          fontWeight: FONT_WEIGHTS.semibold,
          color: 'rgba(255,255,255,0.7)',
        },
        title: {
          fontFamily: FONTS.inter,
          fontSize: 17,
          fontWeight: FONT_WEIGHTS.semibold,
          color: '#FFFFFF',
        },
        spacer: { width: 48 },
        carouselWrap: {
          flex: 1,
          justifyContent: 'center',
        },
        cardPage: {
          width: SW,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 28,
        },
        templateWrap: {
          width: SW - 56,
          aspectRatio: ASPECT_RATIO,
        },
        dotsRow: {
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 6,
          paddingVertical: 16,
        },
        dot: {
          width: 6,
          height: 6,
          borderRadius: 3,
        },
        bottomArea: {
          paddingHorizontal: SPACING.xl,
          paddingBottom: insets.bottom + 24,
          alignItems: 'center',
          gap: 14,
        },
        shareButton: {
          width: '100%',
          backgroundColor: '#FFFFFF',
          paddingVertical: 15,
          borderRadius: 32,
          alignItems: 'center',
          justifyContent: 'center',
        },
        shareButtonText: {
          fontFamily: FONTS.inter,
          fontSize: 16,
          fontWeight: FONT_WEIGHTS.semibold,
          color: '#141212',
        },
        replayText: {
          fontFamily: FONTS.inter,
          fontSize: 14,
          fontWeight: FONT_WEIGHTS.regular,
          color: 'rgba(255,255,255,0.45)',
        },
      }),
    [insets]
  );

  if (!album || cards.length === 0) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: 'rgba(255,255,255,0.5)', fontFamily: FONTS.inter, fontSize: 15 }}>
          No postcards to show.
        </Text>
        <TouchableOpacity onPress={handleBack} style={{ marginTop: 24 }} activeOpacity={0.7}>
          <Text style={{ color: 'rgba(255,255,255,0.4)', fontFamily: FONTS.inter, fontSize: 14 }}>
            Go to your trip
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={handleBack} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Done">
          <Text style={styles.doneText}>Done</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Your postcards</Text>
        <View style={styles.spacer} />
      </View>

      <View style={styles.carouselWrap}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScroll}
          scrollEventThrottle={16}
        >
          {cards.map((card, i) => (
            <View key={`${card.templateId}-${i}`} style={styles.cardPage}>
              <View style={styles.templateWrap}>
                <RecapCard
                  ref={(el) => {
                    cardRefs.current[i] = el;
                  }}
                  spec={card}
                />
              </View>
            </View>
          ))}
        </ScrollView>

        {cards.length > 1 && (
          <View style={styles.dotsRow}>
            {cards.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  {
                    backgroundColor:
                      i === currentCard
                        ? '#FFFFFF'
                        : 'rgba(255,255,255,0.25)',
                    transform: [{ scale: i === currentCard ? 1.2 : 1 }],
                  },
                ]}
              />
            ))}
          </View>
        )}
      </View>

      <View style={styles.bottomArea}>
        <TouchableOpacity
          style={styles.shareButton}
          onPress={handleShare}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Share postcard"
          disabled={sharing}
        >
          {sharing ? (
            <ActivityIndicator color="#141212" />
          ) : (
            <Text style={styles.shareButtonText}>Share</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleReplay}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Replay from beginning"
        >
          <Text style={styles.replayText}>Replay from beginning</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default JourneyRecapPostScreen;
