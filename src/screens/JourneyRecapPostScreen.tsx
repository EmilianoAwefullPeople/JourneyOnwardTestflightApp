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
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { FONTS, FONT_WEIGHTS, SPACING } from '../config/constants';
import { useAppContext } from '../context/AppContext';
import { DEFAULT_POSTCARD_PHOTO_TRANSFORM } from '../models/Postcard';
import { logger } from '../utils/logger';

const { width: SW } = Dimensions.get('window');

type Nav = NativeStackNavigationProp<RootStackParamList, 'JourneyRecapPost'>;
type Route = RouteProp<RootStackParamList, 'JourneyRecapPost'>;

function getPhotoUri(entry: { photoPaths?: string[]; mediaPaths?: string[]; storageUrls?: string[] }): string | null {
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

interface PostcardData {
  topPhoto: string;
  bottomPhoto: string;
  topLabel: string;
  bottomLabel: string;
}

function buildPostcards(
  photoEntries: Array<{ photoUri: string; location: string }>
): PostcardData[] {
  const n = Math.min(6, Math.max(2, Math.ceil(photoEntries.length / 2)));
  return Array.from({ length: n }, (_, i) => {
    const top = photoEntries[i * 2] ?? photoEntries[0];
    const bottom = photoEntries[i * 2 + 1] ?? photoEntries[0];
    return {
      topPhoto: top.photoUri,
      bottomPhoto: bottom.photoUri,
      topLabel: top.location,
      bottomLabel: bottom.location,
    };
  });
}

const NOOP = () => {};

const JourneyRecapPostScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const { entries, tripAlbums } = useAppContext();
  const albumId = route.params?.albumId;

  // Lazy-load heavy deps (view-shot, sharing, template) following the app's pattern
  const C = useMemo(
    () => ({
      Template: require('../components/postcards/templates/TwoPhotoStackTemplate').default,
    }),
    []
  );

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
        isAwe: e.isAwe === true,
      }));
    const awe = items.filter((p) => p.isAwe);
    const rest = items.filter((p) => !p.isAwe);
    return [...awe, ...rest]
      .slice(0, 12)
      .map(({ photoUri, location }) => ({ photoUri, location }));
  }, [albumId, entries]);

  const postcards = useMemo(() => buildPostcards(photoEntries), [photoEntries]);

  const [currentCard, setCurrentCard] = useState(0);
  const [sharing, setSharing] = useState(false);
  const templateRefs = useRef<(View | null)[]>([]);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offset = e.nativeEvent.contentOffset.x;
      setCurrentCard(Math.round(offset / SW));
    },
    []
  );

  const handleShare = useCallback(async () => {
    const ref = templateRefs.current[currentCard];
    if (!ref) return;
    setSharing(true);
    try {
      const { captureRef } = require('react-native-view-shot');
      // Allow layout to settle before capture
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      );
      const uri = await captureRef(ref, {
        format: 'jpg',
        quality: 0.95,
        result: 'tmpfile',
      });

      if (Platform.OS === 'ios') {
        // iOS Share sheet accepts file URIs directly
        await Share.share({ url: uri });
      } else {
        // Android: save to camera roll as fallback
        const MediaLibrary = require('expo-media-library');
        const { status } = await MediaLibrary.requestPermissionsAsync(true);
        if (status === 'granted') {
          await MediaLibrary.saveToLibraryAsync(uri);
          Alert.alert('Saved', 'Postcard saved to your camera roll.');
        } else {
          Alert.alert('Permission needed', 'Allow access to save photos in Settings.');
        }
      }
    } catch (err) {
      logger.warn('JourneyRecapPostScreen: share failed', err);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setSharing(false);
    }
  }, [currentCard]);

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
      navigation.navigate('MainTabs', { screen: 'Home' });
    } catch {
      navigation.goBack();
    }
  }, [navigation]);

  const { Template } = C;

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
          aspectRatio: 4 / 5,
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

  if (!album || postcards.length === 0) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: 'rgba(255,255,255,0.5)', fontFamily: FONTS.inter, fontSize: 15 }}>
          No postcards to show.
        </Text>
        <TouchableOpacity onPress={handleBack} style={{ marginTop: 24 }} activeOpacity={0.7}>
          <Text style={{ color: 'rgba(255,255,255,0.4)', fontFamily: FONTS.inter, fontSize: 14 }}>
            Back to home
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={handleBack} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Done">
          <Text style={styles.doneText}>Done</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Your postcards</Text>
        <View style={styles.spacer} />
      </View>

      {/* Postcard carousel */}
      <View style={styles.carouselWrap}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScroll}
          scrollEventThrottle={16}
        >
          {postcards.map((card, i) => (
            <View key={i} style={styles.cardPage}>
              <View style={styles.templateWrap}>
                <Template
                  ref={(el: View | null) => {
                    templateRefs.current[i] = el;
                  }}
                  topPhoto={card.topPhoto}
                  bottomPhoto={card.bottomPhoto}
                  topLabel={card.topLabel}
                  bottomLabel={card.bottomLabel}
                  topTransform={DEFAULT_POSTCARD_PHOTO_TRANSFORM}
                  bottomTransform={DEFAULT_POSTCARD_PHOTO_TRANSFORM}
                  onTopTransformChange={NOOP}
                  onBottomTransformChange={NOOP}
                  onSlotPress={NOOP}
                  onLabelPress={NOOP}
                  onResetSlotFraming={NOOP}
                  previewMode
                  editingChromeSuppressed
                  hideFooter={false}
                  aspectRatio={4 / 5}
                />
              </View>
            </View>
          ))}
        </ScrollView>

        {/* Page dots */}
        {postcards.length > 1 && (
          <View style={styles.dotsRow}>
            {postcards.map((_, i) => (
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

      {/* Bottom actions */}
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
