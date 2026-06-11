// HomeScreen
// Main feed screen with text note capture and interactive map

import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  ScrollView,
  Dimensions,
  Animated,
  Easing,
  InteractionManager,
  Alert,
  Switch,
  Platform,
  type LayoutChangeEvent,
  type ViewToken,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppContext } from '../context/AppContext';
import { COLORS, DIMENSIONS, SPACING, FONT_WEIGHTS, FONTS } from '../config/constants';
import { TEXT_STYLES } from '../config/typography';
import { Journal } from '../models/Journal';
import { Entry } from '../models/Entry';
import InteractiveMap from '../components/feed/InteractiveMap';
import CameraIcon from '../components/common/icons/CameraIcon';
import PenIcon from '../components/common/icons/PenIcon';
import GridIcon from '../components/common/icons/GridIcon';
import FeedIcon from '../components/common/icons/FeedIcon';
import { formatEntryDate } from '../utils/dateUtils';
import { loadEntryLocationCache, geocodeAndCacheEntries, type EntryLocationData } from '../utils/entryLocationCache';
import { LinearGradient } from 'expo-linear-gradient';
import { logger } from '../utils/logger';
import { ANIMATION_CONFIG, createStaggeredDelay } from '../utils/animations';
import { SunsetCache } from '../utils/sunCalc';
import { BlurView } from 'expo-blur';
import { getEffectiveMainTabInset } from '../navigation/mainTabBarMetrics';
import { useMainTabBarVisibility } from '../navigation/mainTabBarVisibility';
import MoreIcon from '../components/common/icons/MoreIcon';
import TrashIcon from '../components/common/icons/TrashIcon';
import { Ionicons } from '@expo/vector-icons';
import GradientText from '../components/common/GradientText';
import { useTheme } from '../context/ThemeContext';
import { EntryPhotoImage } from '../components/common/EntryPhotoImage';
import type { ThemeColors } from '../config/theme';
import { buildOrderedFeedItems, type HomeFeedTopRef } from '../utils/homeFeedOrder';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { FeedCardPoster } from '../components/feed/FeedCardPoster';
import { useFeedMediaPriority } from '../hooks/useFeedMediaPriority';
import { FlashList, FlashListRef } from '@shopify/flash-list';

type HomeScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;

type FeedItem =
  | { type: 'entry'; data: Entry }
  | { type: 'journal'; data: Journal };

/** Pill height fallback until onLayout; keep in sync with notes transition start height. */
const HOME_CAPTURE_PILL_FALLBACK_HEIGHT = 64;
const HOME_CAPTURE_PILL_RADIUS = 26;
const HOME_CAPTURE_FLOAT_GAP = SPACING.sm;
const HOME_CAPTURE_PILL_HORIZONTAL_INSET = SPACING.md;
const HOME_CAPTURE_BAR_ZINDEX = 500;
const HOME_CAPTURE_HIDDEN_SAFE_OFFSET = 6;
const HOME_CAPTURE_HIDDEN_EXTRA_DROP_SCREEN_FACTOR = 0.06;
const HOME_CAPTURE_COMPACT_WIDTH = 120;
const HOME_PULL_INDICATOR_MIN_TOP_SAFE_SPACE = 20;
const HOME_PULL_INDICATOR_CONTENT_OFFSET = SPACING.xs;
const HOME_PULL_INDICATOR_SIZE = 40;
const HOME_PULL_INDICATOR_SAFE_GAP = 8;
const HOME_PULL_INDICATOR_CONTENT_GAP = 8;
const HOME_CAPTURE_ROTATING_PROMPTS = [
  'Capture a thought...',
  'Reflect. Write it down.',
  'Journal here...',
  'Something to remember...',
  'Jot it down...',
] as const;
const HOME_CAPTURE_PROMPT_ROTATE_MS = 30000;

// ---------------------------------------------------------------------------
// Module-level pure helpers (no component scope deps)
// ---------------------------------------------------------------------------

const FEED_CARD_MARGIN_BOTTOM = 60;
const FEED_JOURNAL_CARD_HEIGHT = 300;

function formatFeedCardDate(timestamp: string): string {
  try {
    const d = new Date(timestamp);
    const month = d.toLocaleDateString('en-US', { month: 'short' });
    return `${month} ${d.getDate()} ${d.getFullYear()}`;
  } catch {
    return '';
  }
}

function getAspectRatio(entry: Entry, sessionSeed: string): number {
  const combinedSeed = `${entry.id}-${sessionSeed}`;
  const seed = combinedSeed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const randomFactor = (seed % 100) / 100;
  let aspect: number;
  if (randomFactor < 0.75) {
    const r = randomFactor / 0.75;
    aspect = 0.9 + r * (1.6 - 0.9);
  } else {
    const r = (randomFactor - 0.75) / 0.25;
    aspect = 0.7 + r * (0.95 - 0.7);
  }
  const val = Math.min(Math.max(aspect, 0.7), 1.6);
  return Number.isFinite(val) && val > 0 ? val : 1;
}

function getFeedAspectRatio(entry: Entry, sessionSeed: string): number {
  const combinedSeed = `${entry.id}-${sessionSeed}`;
  const seed = combinedSeed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const r = (seed % 100) / 100;
  const val = 1.0 + r * 0.25;
  return Number.isFinite(val) && val > 0 ? val : 1;
}

function getFeedCardHeight(item: FeedItem, sessionSeed: string, mapWidth: number): number {
  if (item.type === 'journal') {
    return FEED_JOURNAL_CARD_HEIGHT + FEED_CARD_MARGIN_BOTTOM;
  }
  const aspect = getFeedAspectRatio(item.data as Entry, sessionSeed);
  const imgH = mapWidth / (aspect || 1);
  return Number.isFinite(imgH) && imgH > 0 ? imgH + FEED_CARD_MARGIN_BOTTOM : FEED_JOURNAL_CARD_HEIGHT + FEED_CARD_MARGIN_BOTTOM;
}

function distributeItemsIntoColumns(items: FeedItem[], cardWidth: number, sessionSeed: string) {
  const leftColumn: FeedItem[] = [];
  const rightColumn: FeedItem[] = [];
  let leftHeight = 0;
  let rightHeight = 0;

  items.forEach((item) => {
    const aspectRatio = item.type === 'journal'
      ? 1.5
      : getAspectRatio(item.data as Entry, sessionSeed);
    const estimatedHeight = cardWidth / aspectRatio;

    if (leftHeight <= rightHeight) {
      leftColumn.push(item);
      leftHeight += estimatedHeight + 8;
    } else {
      rightColumn.push(item);
      rightHeight += estimatedHeight + 8;
    }
  });

  return { leftColumn, rightColumn };
}

const HomeScreen: React.FC = () => {
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const { userName, entries, journals, createJournal, deleteEntry, travelModeEnabled, activeTripAlbums, setTravelMode, showHomeMap } = useAppContext();
  const { colors, isDark } = useTheme();
  const { hidden, visibilityProgress, reportScrollOffset } = useMainTabBarVisibility();
  const insets = useSafeAreaInsets();
  const [mapCollapsed, setMapCollapsed] = useState(true);
  const [feedViewMode, setFeedViewMode] = useState<'gallery' | 'feed'>('feed');
  // Reset to trip-filtered on every mount when travel mode is active
  const [showAllMemories, setShowAllMemories] = useState(false);
  useEffect(() => {
    if (travelModeEnabled) setShowAllMemories(false);
  }, [travelModeEnabled]);

  // Long-press on entry card: overlay + actions (delete, edit, create journal)
  type CardLayout = { x: number; y: number; width: number; height: number };
  const [longPressActiveEntryId, setLongPressActiveEntryId] = useState<string | null>(null);
  const [longPressCardLayout, setLongPressCardLayout] = useState<CardLayout | null>(null);
  const [longPressColumn, setLongPressColumn] = useState<'left' | 'right' | null>(null);
  const entryCardLayoutRefs = useRef<Map<string, View>>(new Map());
  const longPressHandledRef = useRef(false);
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  // Location and sunset state
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [entryLocations, setEntryLocations] = useState<Record<string, EntryLocationData>>({});
  const sunsetCache = useRef(new SunsetCache()).current;

  // Animation refs for cards
  const cardAnimations = useRef<Map<string, { opacity: Animated.Value; translateY: Animated.Value; scale: Animated.Value }>>(new Map());
  const previousEntriesLengthRef = useRef(0);

  // Session seed for card layout randomization (aspect ratios, etc.); bump on pull-to-refresh.
  const [sessionSeed, setSessionSeed] = useState<string>(
    () => `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
  );
  /** Comma-separated visible row indices for media priority / prefetch (empty → seed 0,1,2 in hook). */
  const [feedVisibleKey, setFeedVisibleKey] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const feedCardBorderStyle = useMemo(
    () => ({
      borderWidth: isDark ? 0 : StyleSheet.hairlineWidth,
      borderColor: colors.border,
    }),
    [colors.border, isDark]
  );

  /** First card in the feed (for “don’t repeat top on next refresh”). */
  const displayedFirstRef = useRef<HomeFeedTopRef>(null);
  /** Set in handleRefresh, consumed once when rebuilding order for the new sessionSeed. */
  const pendingAvoidTopRef = useRef<HomeFeedTopRef>(null);

  // Opacity for the cards section — fades to 0 while reordering then back to 1,
  // giving a clear "content changed" signal like Instagram's feed refresh.
  // Starts at 0 — fades to 1 once on first data arrival (see feedInitialFadeRef effect below).
  const feedOpacity = useRef(new Animated.Value(0)).current;
  const feedInitialFadeRef = useRef(false);
  // Flips to true after 1200ms — switches spinner to empty-state text for accounts with no entries.
  const [loadTimedOut, setLoadTimedOut] = useState(false);

  // Custom pull-to-refresh indicator animation.
  // refreshRevealAnim: 0-1, fades the spinner pill in/out when isRefreshing changes.
  const PULL_THRESHOLD = 64;
  const refreshRevealAnim = useRef(new Animated.Value(0)).current;

  // Camera button animation
  const cameraButtonScale = useRef(new Animated.Value(1)).current;
  const cameraButtonOpacity = useRef(new Animated.Value(1)).current;

  // Notes editor transition animation
  const [isTransitioningToNotes, setIsTransitioningToNotes] = useState<boolean>(false);
  const notesTransitionProgress = useRef(new Animated.Value(0)).current;
  const [capturePromptIndex, setCapturePromptIndex] = useState(0);
  const capturePromptOpacity = useRef(new Animated.Value(1)).current;
  const initialHomeCaptureShownBottom =
    getEffectiveMainTabInset(insets.bottom, 1) + HOME_CAPTURE_FLOAT_GAP;
  const homeCaptureBottomAnim = useRef(new Animated.Value(initialHomeCaptureShownBottom)).current;
  const captureMorphProgress = useRef(new Animated.Value(hidden ? 1 : 0)).current;

  // Scroll refs — ScrollView for gallery mode, FlashList for feed mode
  const scrollViewRef = useRef<ScrollView>(null);
  const flashListRef = useRef<FlashListRef<FeedItem> | null>(null);
  const feedViewabilityConfig = useRef({ itemVisiblePercentThreshold: 1 });
  const feedVisibleKeyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onFeedViewableItemsChanged = useRef(
    (info: { viewableItems: ViewToken<FeedItem>[]; changed: ViewToken<FeedItem>[] }) => {
      const indices = info.viewableItems
        .filter((v) => v.isViewable && typeof v.index === 'number' && (v.index as number) >= 0)
        .map((v) => v.index as number)
        .sort((a, b) => a - b);
      if (indices.length === 0) return;
      const key = indices.join(',');
      if (feedVisibleKeyTimerRef.current) clearTimeout(feedVisibleKeyTimerRef.current);
      feedVisibleKeyTimerRef.current = setTimeout(() => {
        setFeedVisibleKey(key);
      }, 150);
    },
  );
  // Stable ref to the current scroll-to-top function so tab-press listener never goes stale
  const scrollToTopRef = useRef<(animated?: boolean) => void>(() => {});
  // Scroll offset for gating long-press until first card reaches top (feed view)
  const scrollOffsetYRef = useRef<number>(0);
  // Header height for feed-mode snap offsets
  const [headerHeight, setHeaderHeight] = useState<number>(0);
  // Height of content above "Your Memories" (top controls + map) for first snap point
  const [heightAboveMemories, setHeightAboveMemories] = useState<number>(0);

  /** Measured floating pill height — drives notes transition start and scroll bottom inset. */
  const [homeCapturePillHeight, setHomeCapturePillHeight] = useState(HOME_CAPTURE_PILL_FALLBACK_HEIGHT);
  const onHomeCapturePillLayout = (e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    if (h > 0) setHomeCapturePillHeight(prev => (Math.abs(prev - h) > 1 ? h : prev));
  };
  const homeCaptureTransitionStart = Math.max(homeCapturePillHeight, HOME_CAPTURE_PILL_FALLBACK_HEIGHT);
  const homeCaptureBottomShown =
    getEffectiveMainTabInset(insets.bottom, 1) + HOME_CAPTURE_FLOAT_GAP;
  const homeCaptureBottomHidden = Math.max(
    insets.bottom + 2,
    insets.bottom +
      HOME_CAPTURE_HIDDEN_SAFE_OFFSET -
      Dimensions.get('window').height * HOME_CAPTURE_HIDDEN_EXTRA_DROP_SCREEN_FACTOR
  );

  // Responsive dimensions
  const screenWidth = Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height;
  // Map dimensions - match InteractiveMap calculations
  const headerPaddingLeft = screenWidth * 0.0324;
  const headerPaddingRight = screenWidth * 0.0324;
  const feedContentPadding = 16; // SPACING.md value
  const feedMapLeft = Math.max(headerPaddingLeft - feedContentPadding, 0);
  const availableWidth = screenWidth - (headerPaddingLeft + headerPaddingRight);
  const mapWidth = availableWidth;
  // Top padding reserves a dedicated lane for pull-to-refresh spinner above Travel Mode card.
  const safeTopInset = Number.isFinite(insets.top) ? insets.top : 0;
  const headerPaddingTop = safeTopInset + SPACING.md + HOME_PULL_INDICATOR_SIZE + HOME_PULL_INDICATOR_CONTENT_GAP;

  // Get user's location for sunset calculation
  useEffect(() => {
    let isMounted = true;

    const getUserLocation = async () => {
      try {
        // Dynamic import to avoid loading location module unless needed
        const locationModule = await import('expo-location');

        // Check permissions
        const { status } = await locationModule.getForegroundPermissionsAsync();

        if (status === 'granted') {
          // Get last known position (faster, cached)
          const location = await locationModule.getLastKnownPositionAsync({});

          if (location && isMounted) {
            setUserLocation({
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            });
          }
        }
        // If no permission, silently fall back to time-based greeting
      } catch (error) {
        // Silently fail - will use fallback time-based greeting
        logger.log('Could not get location for sunset calculation:', error);
      }
    };

    getUserLocation();

    return () => {
      isMounted = false;
    };
  }, []);

  // Stable string key encoding entry IDs — prevents geocoding from re-firing on
  // every refreshData() that returns a new array ref with identical content.
  const entryIdsKey = useMemo(
    () => (entries ?? []).map((e) => e.id).join(','),
    [entries]
  );

  // Load country+city for feed cards: read cache immediately (offline-safe), then geocode missing entries.
  // Keyed on entryIdsKey (not entries array ref) so a refreshData() that returns identical IDs
  // does not re-trigger geocoding — only actual additions/removals do.
  useEffect(() => {
    if (feedViewMode !== 'feed') return;
    const allEntries = entries ?? [];
    let cancelled = false;
    const load = async () => {
      const cached = await loadEntryLocationCache();
      if (cancelled) return;
      setEntryLocations(cached);
      const updated = await geocodeAndCacheEntries(allEntries, cached);
      if (cancelled) return;
      setEntryLocations(updated);
    };
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedViewMode, entryIdsKey]);

  // Scroll to top when user taps Home tab while on Home (like Instagram/Twitter)
  useEffect(() => {
    const unsubscribe = (navigation as any).addListener('tabPress', () => {
      scrollToTopRef.current();
    });
    return unsubscribe;
  }, [navigation]);

  // Reset entry section immediately when returning from NotesEditor
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      // If returning from notes editor, reset immediately (no animation)
      if (isTransitioningToNotes) {
        setIsTransitioningToNotes(false);
        notesTransitionProgress.setValue(0);
      }
    });

    return unsubscribe;
  }, [navigation, isTransitioningToNotes, notesTransitionProgress]);

  useEffect(() => {
    const targetBottom = hidden ? homeCaptureBottomHidden : homeCaptureBottomShown;
    homeCaptureBottomAnim.stopAnimation();
    captureMorphProgress.stopAnimation();
    Animated.parallel([
      Animated.timing(homeCaptureBottomAnim, {
        toValue: targetBottom,
        duration: hidden ? 240 : 260,
        easing: hidden
          ? Easing.out(Easing.cubic)
          : Easing.bezier(0.22, 1, 0.36, 1),
        useNativeDriver: false,
      }),
      Animated.timing(captureMorphProgress, {
        toValue: hidden ? 1 : 0,
        duration: hidden ? 230 : 250,
        easing: hidden
          ? Easing.out(Easing.cubic)
          : Easing.bezier(0.22, 1, 0.36, 1),
        useNativeDriver: false,
      }),
    ]).start();
  }, [
    hidden,
    homeCaptureBottomAnim,
    homeCaptureBottomHidden,
    homeCaptureBottomShown,
    captureMorphProgress,
  ]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      Animated.sequence([
        Animated.timing(capturePromptOpacity, {
          toValue: 0,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(capturePromptOpacity, {
          toValue: 1,
          duration: 240,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
      // Deterministic ordered rotation so every prompt is shown in sequence.
      setCapturePromptIndex((prev) => (prev + 1) % HOME_CAPTURE_ROTATING_PROMPTS.length);
    }, HOME_CAPTURE_PROMPT_ROTATE_MS);

    return () => {
      clearInterval(intervalId);
      capturePromptOpacity.stopAnimation();
      capturePromptOpacity.setValue(1);
    };
  }, [capturePromptOpacity]);

  // Clear long-press overlay if the active entry was deleted (e.g. from another screen)
  useEffect(() => {
    if (longPressActiveEntryId && entries) {
      const exists = entries.some((e) => e.id === longPressActiveEntryId);
      if (!exists) {
        setLongPressActiveEntryId(null);
        setLongPressCardLayout(null);
        setLongPressColumn(null);
        longPressHandledRef.current = false;
      }
    }
  }, [longPressActiveEntryId, entries]);

  // Travel Mode — whether to show Trip Header and filter the feed
  const tripActive = travelModeEnabled && activeTripAlbums.length > 0;

  // Trip Header computed values
  const tripHeaderData = useMemo(() => {
    if (!tripActive) return null;
    // Normalize a date string to local midnight so time-of-day doesn't affect day arithmetic.
    // Must use local date getters because dates are picked in local time and stored via toISOString().
    const toLocalDayStart = (dateStr: string) => {
      const d = new Date(dateStr);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    };
    // Album with furthest end date drives Day X of Y
    const primaryAlbum = activeTripAlbums.reduce((a, b) => {
      const aEnd = a.endDate ? toLocalDayStart(a.endDate) : 0;
      const bEnd = b.endDate ? toLocalDayStart(b.endDate) : 0;
      return bEnd > aEnd ? b : a;
    });
    const msPerDay = 1000 * 60 * 60 * 24;
    const todayLocal = toLocalDayStart(new Date().toISOString());
    const startLocal = toLocalDayStart(primaryAlbum.startDate);
    const dayNumber = Math.floor((todayLocal - startLocal) / msPerDay) + 1;
    const totalDays = primaryAlbum.endDate
      ? Math.floor((toLocalDayStart(primaryAlbum.endDate) - startLocal) / msPerDay) + 1
      : null;
    const tripNames = activeTripAlbums.map(a => a.name).join(' · ');
    return { tripNames, dayNumber, totalDays };
  }, [tripActive, activeTripAlbums]);

  // Combine entries and journals into unified feed (optionally filtered by active trip albums)
  const feedItems = useMemo<FeedItem[]>(() => {
    const activeAlbumIds = new Set(activeTripAlbums.map(a => a.id));
    const filterByTrip = tripActive && !showAllMemories;

    const entryItems: FeedItem[] = (entries ?? [])
      .filter(entry => !filterByTrip || (entry.albumId && activeAlbumIds.has(entry.albumId)))
      .map(entry => ({ type: 'entry' as const, data: entry }));

    const journalItems: FeedItem[] = (journals ?? [])
      .filter(journal => !filterByTrip || (journal.albumId && activeAlbumIds.has(journal.albumId)))
      .map(journal => ({ type: 'journal' as const, data: journal }));

    return [...entryItems, ...journalItems];
  }, [entries, journals, tripActive, showAllMemories, activeTripAlbums]);

  const entriesById = useMemo(
    () => new Map((entries ?? []).map(e => [e.id, e])),
    [entries]
  );

  const formattedDateByEntryId = useMemo(
    () => new Map((entries ?? []).map(e => [e.id, formatFeedCardDate(e.timestamp)])),
    [entries]
  );

  // Scroll home to top so experience cards are not visible behind capture modals
  const scrollToTopThen = (callback: () => void) => {
    scrollToTopRef.current();
    const delay = 80; // Let scroll start before modal opens
    setTimeout(callback, delay);
  };

  // Notes editor handler - animate and navigate to NotesEditor screen
  const handleNotePlaceholderPress = () => {
    scrollToTopThen(() => {
      navigation.navigate('NotesEditor', {
        journalPlaceholder: HOME_CAPTURE_ROTATING_PROMPTS[capturePromptIndex],
      });
      setIsTransitioningToNotes(true);
      Animated.timing(notesTransitionProgress, {
        toValue: 1,
        duration: 550,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        useNativeDriver: false,
      }).start();
    });
  };

  const handleCameraPress = () => {
    scrollToTopThen(() => {
      navigation.navigate('Capture');
    });
  };

  const handleTravelModeToggle = (nextValue: boolean) => {
    const turningOn = nextValue && !travelModeEnabled;
    const title = turningOn ? 'Turn on Travel Mode?' : 'Turn off Travel Mode?';
    const confirmLabel = turningOn ? 'Turn On' : 'Turn Off';

    Alert.alert(
      title,
      'Are you sure you want to change Travel Mode?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: confirmLabel,
          onPress: async () => {
            try {
              if (turningOn) {
                await setTravelMode(true);
              } else {
                await setTravelMode(false, true);
              }
            } catch (error) {
              logger.error('HomeScreen: travel mode toggle failed', error);
              Alert.alert('Error', 'Could not update Travel Mode. Please try again.');
            }
          },
        },
      ]
    );
  };

  // Reshuffle feed on pull-to-refresh.
  // Sequence: spinner appears (native) → cards fade out → seed changes (reorder is invisible)
  // → cards fade back in → spinner dismissed.
  const handleRefresh = () => {
    setIsRefreshing(true);
    // Step 1: fade cards out
    Animated.timing(feedOpacity, {
      toValue: 0,
      duration: 220,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => {
      // Step 2: change seed while cards are invisible (reorder happens here)
      pendingAvoidTopRef.current = displayedFirstRef.current;
      resetPrefetch();
      setFeedVisibleKey('');
      setSessionSeed(`${Date.now()}-${Math.random().toString(36).substring(2, 11)}`);
      // Reset scroll while cards are invisible so the new shuffle always shows from top
      scrollToTopRef.current(false);
      // Step 3: fade cards back in with a slight spring feel
      Animated.timing(feedOpacity, {
        toValue: 1,
        duration: 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      // Step 4: dismiss spinner after cards are visible again
      setTimeout(() => setIsRefreshing(false), 420);
    });
  };

  // Drive the refresh-phase indicator visibility while refresh is active.
  useEffect(() => {
    if (isRefreshing) {
      Animated.timing(refreshRevealAnim, {
        toValue: 1,
        duration: 120,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(refreshRevealAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [isRefreshing]);

  useLayoutEffect(() => {
    pendingAvoidTopRef.current = null;
    // Scroll to top synchronously after the new shuffle renders so FlashList's
    // reconciliation pass can't pull a swapped item back into view.
    scrollToTopRef.current(false);
  }, [sessionSeed]);

  // Initialize animations for existing items on mount
  useEffect(() => {
    feedItems.forEach((item) => {
      const id = item.type === 'entry' ? item.data.id : item.data.id;
      if (!cardAnimations.current.has(id)) {
        const opacity = new Animated.Value(1); // Start visible for existing items
        const translateY = new Animated.Value(0);
        const scale = new Animated.Value(1);
        cardAnimations.current.set(id, { opacity, translateY, scale });
      }
    });
  }, []); // Only run on mount

  // Animate new items when array changes — useLayoutEffect so cardAnimations is
  // populated before the next render reads it, preventing mid-render Animated.Value creation.
  useLayoutEffect(() => {
    const items = feedItems ?? [];
    const currentLength = items.length;
    const previousLength = previousEntriesLengthRef.current;

    if (currentLength > previousLength) {
      if (previousLength === 0) {
        // Initial SQLite load arriving after mount — not new captures.
        // The render function already set opacity=1 defaults for rendered items;
        // just pre-populate the map for any not-yet-rendered ones so they don't blink.
        items.forEach(item => {
          const id = item.data.id;
          if (!cardAnimations.current.has(id)) {
            cardAnimations.current.set(id, {
              opacity: new Animated.Value(1),
              translateY: new Animated.Value(0),
              scale: new Animated.Value(1),
            });
          }
        });
      } else {
        // Genuine new items added mid-session (e.g. new capture) — stagger in from opacity 0.
        const newItems = items.slice(previousLength);
        newItems.forEach((item, index) => {
          const id = item.data.id;
          const globalIndex = previousLength + index;
          const opacity = new Animated.Value(0);
          const translateY = new Animated.Value(15);
          const scale = new Animated.Value(1);
          cardAnimations.current.set(id, { opacity, translateY, scale });

          const delay = createStaggeredDelay(globalIndex, 50);
          Animated.parallel([
            Animated.timing(opacity, {
              toValue: 1,
              duration: ANIMATION_CONFIG.durations.slow,
              delay,
              easing: ANIMATION_CONFIG.easing.easeOut,
              useNativeDriver: true,
            }),
            Animated.timing(translateY, {
              toValue: 0,
              duration: ANIMATION_CONFIG.durations.slow,
              delay,
              easing: ANIMATION_CONFIG.easing.easeOut,
              useNativeDriver: true,
            }),
          ]).start();
        });
      }
    }

    previousEntriesLengthRef.current = currentLength;

    // Prune animation values for items no longer in the feed (e.g. deleted entries).
    const currentIds = new Set(items.map(item => item.data.id));
    for (const key of cardAnimations.current.keys()) {
      if (!currentIds.has(key)) cardAnimations.current.delete(key);
    }
  }, [feedItems]);

  // Dismiss long-press overlay and animate card scale back to 1
  const dismissLongPress = () => {
    const entryId = longPressActiveEntryId;
    setLongPressActiveEntryId(null);
    setLongPressCardLayout(null);
    setLongPressColumn(null);
    longPressHandledRef.current = false;
    if (entryId) {
      const anim = cardAnimations.current.get(entryId);
      if (anim) {
        Animated.timing(anim.scale, {
          toValue: 1,
          duration: 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      }
    }
    Animated.timing(overlayOpacity, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start();
  };

  // Card press feedback handlers
  const handleCardPressIn = (entryId: string) => {
    const anim = cardAnimations.current.get(entryId);
    if (anim) {
      Animated.timing(anim.scale, {
        toValue: 0.97,
        duration: 150,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    }
  };

  const handleCardPressOut = (entryId: string) => {
    // Don't reset scale if this card is the long-press active one (long-press state owns it)
    if (entryId === longPressActiveEntryId) return;
    const anim = cardAnimations.current.get(entryId);
    if (anim) {
      Animated.timing(anim.scale, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  };

  // Camera button press feedback handlers
  const handleCameraPressIn = () => {
    Animated.parallel([
      Animated.timing(cameraButtonScale, {
        toValue: 0.95,
        duration: 100,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(cameraButtonOpacity, {
        toValue: 0.8,
        duration: 100,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleCameraPressOut = () => {
    Animated.parallel([
      Animated.timing(cameraButtonScale, {
        toValue: 1,
        duration: 150,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(cameraButtonOpacity, {
        toValue: 1,
        duration: 150,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleEntryPress = (entry: Entry) => {
    InteractionManager.runAfterInteractions(() => {
      try {
        navigation.navigate('EntryDetail', { entryId: entry.id });
      } catch (error) {
        logger.warn('EntryDetail navigation failed:', error);
      }
    });
  };

  // Calculate card width: full width for feed mode, half for gallery
  const cardWidth = feedViewMode === 'feed' ? mapWidth : (mapWidth - 16) / 2;

  // Feed order: seeded-deterministic merge + journal spacing; pull-to-refresh passes “avoid previous top” via ref.
  // Using sessionSeed as the PRNG seed ensures the same order survives AppContext refreshes
  // (e.g. metadata backfill) — the feed only reshuffles when sessionSeed changes.
  const shuffledItems = useMemo((): FeedItem[] => {
    const items = feedItems ?? [];
    if (items.length === 0) return items;
    return buildOrderedFeedItems(items, pendingAvoidTopRef.current, sessionSeed);
  }, [feedItems, sessionSeed]);

  const feedUris = useMemo(
    () =>
      (shuffledItems ?? []).map((item) => {
        if (item.type !== 'entry') return null;
        const e = item.data;
        if (e.mediaType === 'photo' && e.photoPaths && e.photoPaths.length > 0) {
          return e.photoPaths[0];
        }
        return null;
      }),
    [shuffledItems],
  );

  const { priorityByUri, resetPrefetch } = useFeedMediaPriority(feedUris, feedVisibleKey);

  const feedListExtraData = useMemo(
    () => ({ feedVisibleKey, sessionSeed }),
    [feedVisibleKey, sessionSeed],
  );

  useEffect(() => {
    const first = shuffledItems[0];
    if (first) {
      displayedFirstRef.current = { type: first.type, id: first.data.id };
    } else {
      displayedFirstRef.current = null;
    }
  }, [shuffledItems]);

  // One-shot fade-in: reveal the feed the first time data arrives.
  // feedOpacity starts at 0; subsequent refreshes manage it via handleRefresh.
  useEffect(() => {
    if (!feedInitialFadeRef.current && shuffledItems.length > 0) {
      feedInitialFadeRef.current = true;
      Animated.timing(feedOpacity, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [shuffledItems.length]);

  // Fallback: after 1200ms flip loadTimedOut so the spinner becomes the empty-state text.
  // State update only — no animation here, to avoid the race where feedOpacity starts
  // rising before React commits the loadTimedOut=true render (which would show both
  // the spinner and the feed content simultaneously).
  useEffect(() => {
    const timer = setTimeout(() => setLoadTimedOut(true), 1200);
    return () => clearTimeout(timer);
  }, []);

  // Start the fallback fade-in only AFTER loadTimedOut=true is committed to the render tree.
  // This guarantees the spinner is gone (paint complete) before feedOpacity begins rising.
  useEffect(() => {
    if (loadTimedOut && !feedInitialFadeRef.current) {
      feedInitialFadeRef.current = true;
      Animated.timing(feedOpacity, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [loadTimedOut]);

  // Pre-computed card heights keyed by item ID — avoids repeating the string-hash
  // work inside feedSnapOffsets / feedCardScrollOffsets on every layout event.
  const cardHeightMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of shuffledItems) {
      const key = item.type === 'entry' ? item.data.id : `j:${item.data.id}`;
      map.set(key, getFeedCardHeight(item, sessionSeed, mapWidth));
    }
    return map;
  }, [shuffledItems, sessionSeed, mapWidth]);

  // Two-column distribution for gallery mode — only recomputed when inputs change.
  const galleryColumns = useMemo(() => {
    if (feedViewMode !== 'gallery') return null;
    const galleryCardWidth = (mapWidth - 16) / 2;
    return distributeItemsIntoColumns(shuffledItems, galleryCardWidth, sessionSeed);
  }, [feedViewMode, shuffledItems, mapWidth, sessionSeed]);

  // Snap offsets for feed mode: card tops align at 17% of viewport height from top
  // Must account for contentContainerStyle paddingTop so offsets match actual content positions
  const feedSnapOffsets = useMemo(() => {
    const items = shuffledItems ?? [];
    if (feedViewMode !== 'feed' || headerHeight <= 0 || heightAboveMemories <= 0 || items.length === 0) return undefined;
    try {
      const targetY = screenHeight * 0.17;
      const contentPaddingTop = headerPaddingTop;
      const offsets: number[] = [0];

      const memoriesTop = contentPaddingTop + heightAboveMemories;
      const offMemories = Math.max(0, memoriesTop - targetY);
      if (Number.isFinite(offMemories) && offMemories > 10) offsets.push(offMemories);

      let cumulative = contentPaddingTop + headerHeight;
      for (let i = 0; i < items.length; i++) {
        const key = items[i].type === 'entry' ? items[i].data.id : `j:${items[i].data.id}`;
        const cardH = cardHeightMap.get(key) ?? (FEED_JOURNAL_CARD_HEIGHT + FEED_CARD_MARGIN_BOTTOM);
        if (!Number.isFinite(cardH)) break;
        cumulative += cardH;
        const off = Math.max(0, cumulative - targetY);
        if (Number.isFinite(off) && off > (offsets[offsets.length - 1] ?? 0) + 10) offsets.push(off);
      }
      const valid = offsets.filter((o) => Number.isFinite(o) && o >= 0);
      return valid.length > 1 ? valid : undefined;
    } catch {
      return undefined;
    }
  }, [feedViewMode, headerHeight, heightAboveMemories, headerPaddingTop, shuffledItems, cardHeightMap, screenHeight]);

  // Scroll offset per card index to put that card's top at targetY (for long-press scroll-then-show)
  const feedCardScrollOffsets = useMemo(() => {
    const items = shuffledItems ?? [];
    if (feedViewMode !== 'feed' || headerHeight <= 0 || heightAboveMemories <= 0 || items.length === 0) return undefined;
    try {
      const targetY = screenHeight * 0.17;
      const contentPaddingTop = headerPaddingTop;
      const offsets: number[] = [];
      let cumulative = contentPaddingTop + headerHeight;
      for (let i = 0; i < items.length; i++) {
        offsets.push(Math.max(0, cumulative - targetY));
        const key = items[i].type === 'entry' ? items[i].data.id : `j:${items[i].data.id}`;
        const cardH = cardHeightMap.get(key) ?? (FEED_JOURNAL_CARD_HEIGHT + FEED_CARD_MARGIN_BOTTOM);
        if (!Number.isFinite(cardH)) break;
        cumulative += cardH;
      }
      return offsets.length > 0 ? offsets : undefined;
    } catch {
      return undefined;
    }
  }, [feedViewMode, headerHeight, heightAboveMemories, headerPaddingTop, shuffledItems, cardHeightMap, screenHeight]);

  // Render card function - handles both entries and journals; column only used for gallery entry cards
  const renderCard = (item: FeedItem, sessionSeed: string, column?: 'left' | 'right') => {
    if (item.type === 'entry') {
      return renderEntryCard(item.data, sessionSeed, column);
    } else {
      return renderJournalCard(item.data, sessionSeed);
    }
  };

  // Render entry card; column only used for gallery long-press icon placement
  const renderEntryCard = (entry: Entry, sessionSeed: string, column?: 'left' | 'right') => {
    const isFeed = feedViewMode === 'feed';
    const aspectRatio = isFeed
      ? getFeedAspectRatio(entry, sessionSeed)
      : getAspectRatio(entry, sessionSeed);

    let anim = cardAnimations.current.get(entry.id);
    if (!anim) {
      anim = {
        opacity: new Animated.Value(1),
        translateY: new Animated.Value(0),
        scale: new Animated.Value(1),
      };
      cardAnimations.current.set(entry.id, anim);
    }

    const animatedStyles = {
      opacity: anim.opacity,
      transform: [{ translateY: anim.translateY }, { scale: anim.scale }],
    };

    const showLongPress = () => {
      const node = entryCardLayoutRefs.current.get(entry.id);
      if (!node || typeof (node as any).measureInWindow !== 'function') return;
      (node as any).measureInWindow((x: number, y: number, width: number, height: number) => {
        if (width <= 0 || height <= 0) return;
        overlayOpacity.setValue(0);
        setLongPressCardLayout({ x, y, width, height });
        setLongPressActiveEntryId(entry.id);
        setLongPressColumn(feedViewMode === 'gallery' && column != null ? column : null);
        longPressHandledRef.current = true;
        const animVal = cardAnimations.current.get(entry.id);
        if (animVal) {
          Animated.timing(animVal.scale, {
            toValue: 1.05, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true,
          }).start();
        }
        Animated.timing(overlayOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      });
    };

    const handleLongPress = () => {
      if (feedViewMode === 'feed') {
        const idx = (shuffledItems ?? []).findIndex(
          (item) => item.type === 'entry' && item.data.id === entry.id
        );
        const targetY = feedCardScrollOffsets?.[idx];
        if (flashListRef.current && targetY != null && Number.isFinite(targetY)) {
          flashListRef.current.scrollToOffset({ offset: targetY, animated: true });
          setTimeout(showLongPress, 350);
        } else {
          showLongPress();
        }
      } else {
        showLongPress();
      }
    };

    // ── Feed mode: full-bleed image with overlaid text ──────────────────────
    if (isFeed) {
      const loc = entryLocations[entry.id];
      const country = (entry.country?.trim() || loc?.country || '').trim();
      const city = loc?.city ?? '';
      const hasPhoto = entry.mediaType === 'photo' && entry.photoPaths && entry.photoPaths.length > 0;
      const photoUri = hasPhoto ? (entry.thumbPaths?.[0] || entry.photoPaths[0]) : '';
      const imgPriority = hasPhoto && photoUri ? (priorityByUri.get(entry.photoPaths[0]) ?? 'normal') : 'normal';

      return (
        <Animated.View
          key={entry.id}
          style={[
            { width: cardWidth, marginBottom: FEED_CARD_MARGIN_BOTTOM, borderRadius: 16, overflow: 'hidden', aspectRatio },
            feedCardBorderStyle,
            animatedStyles,
          ]}
        >
          <View
            ref={(el) => { if (el) entryCardLayoutRefs.current.set(entry.id, el); }}
            collapsable={false}
            style={{ flex: 1 }}
          >
            <TouchableOpacity
              style={{ flex: 1 }}
              onPress={() => {
                if (longPressHandledRef.current) { longPressHandledRef.current = false; return; }
                handleEntryPress(entry);
              }}
              onLongPress={handleLongPress}
              delayLongPress={450}
              onPressIn={() => handleCardPressIn(entry.id)}
              onPressOut={() => handleCardPressOut(entry.id)}
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel={entry.title ? `Experience, ${entry.title}` : 'Experience'}
              accessibilityHint="Double tap to open. Long press for options."
            >
              {hasPhoto ? (
                <EntryPhotoImage
                  uri={photoUri}
                  style={styles.feedCardFullImage}
                  resizeMode="cover"
                  fallbackBackgroundColor={colors.stone600}
                  priority={imgPriority}
                />
              ) : (
                <FeedCardPoster mediaType={entry.mediaType} isDark={isDark} />
              )}

              <LinearGradient
                colors={['rgba(0,0,0,0.55)', 'transparent']}
                style={styles.feedCardTopGradient}
                pointerEvents="none"
              />
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.62)']}
                style={styles.feedCardBottomGradient}
                pointerEvents="none"
              />

              {country.length > 0 && (
                <Text style={styles.feedCardCountry} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                  {country}
                </Text>
              )}

              <View style={styles.feedCardTopRight} pointerEvents="none">
                <Text style={styles.feedCardTopRightText} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                  {formattedDateByEntryId.get(entry.id) ?? ''}
                </Text>
                {city.length > 0 && (
                  <Text style={styles.feedCardTopRightText} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                    {city}
                  </Text>
                )}
              </View>

              {entry.title ? (
                entry.isAwe ? (
                  <GradientText style={styles.feedCardTitle}>{entry.title}</GradientText>
                ) : (
                  <Text style={styles.feedCardTitle} numberOfLines={2} maxFontSizeMultiplier={1.2}>
                    {entry.title}
                  </Text>
                )
              ) : null}
            </TouchableOpacity>
          </View>
        </Animated.View>
      );
    }

    // ── Gallery mode: image + title below ─────────────────────────────────
    const galleryTitle = entry.title
      ? entry.isAwe ? (
          <GradientText style={[styles.pinterestTitle, { fontSize: 12, fontWeight: '600', padding: 0, marginTop: 6, marginLeft: 4 }]}>
            {entry.title}
          </GradientText>
        ) : (
          <Text
            style={[styles.pinterestTitle, { fontSize: 12, fontWeight: '600', padding: 0, marginTop: 6, marginLeft: 4 }]}
            numberOfLines={2}
            maxFontSizeMultiplier={1.35}
          >
            {entry.title}
          </Text>
        )
      : null;

    return (
      <Animated.View
        key={entry.id}
        style={[{ width: cardWidth, marginHorizontal: 4, marginBottom: 12 }, animatedStyles]}
      >
        <View
          ref={(el) => { if (el) entryCardLayoutRefs.current.set(entry.id, el); }}
          collapsable={false}
        >
          <TouchableOpacity
            style={styles.pinterestCard}
            onPress={() => {
              if (longPressHandledRef.current) { longPressHandledRef.current = false; return; }
              handleEntryPress(entry);
            }}
            onLongPress={handleLongPress}
            delayLongPress={450}
            onPressIn={() => handleCardPressIn(entry.id)}
            onPressOut={() => handleCardPressOut(entry.id)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={entry.title ? `Experience, ${entry.title}` : 'Experience'}
            accessibilityHint="Double tap to open. Long press for options."
          >
            <View style={[styles.pinterestMediaContainer, { aspectRatio, borderRadius: 16 }]}>
              {entry.mediaType === 'photo' && entry.photoPaths && entry.photoPaths.length > 0 ? (
                <EntryPhotoImage
                  uri={entry.thumbPaths?.[0] || entry.photoPaths[0]}
                  style={[styles.pinterestImage, { borderRadius: 16 }]}
                  resizeMode="cover"
                  fallbackBackgroundColor={colors.stone600}
                  priority={priorityByUri.get(entry.photoPaths[0]) ?? 'normal'}
                />
              ) : entry.mediaType === 'video' ? (
                <View style={styles.pinterestVideoPlaceholder}>
                  <Text style={styles.pinterestMediaIcon} maxFontSizeMultiplier={1.25}>🎥</Text>
                  <Text style={styles.pinterestMediaLabel} maxFontSizeMultiplier={1.25}>Video</Text>
                </View>
              ) : entry.mediaType === 'audio' ? (
                <View style={styles.pinterestAudioPlaceholder}>
                  <Text style={styles.pinterestMediaIcon} maxFontSizeMultiplier={1.25}>🎵</Text>
                  <Text style={styles.pinterestMediaLabel} maxFontSizeMultiplier={1.25}>Audio</Text>
                </View>
              ) : (
                <View style={styles.pinterestPlaceholder}>
                  <Text style={styles.pinterestMediaIcon} maxFontSizeMultiplier={1.25}>📷</Text>
                </View>
              )}
            </View>
            {galleryTitle}
          </TouchableOpacity>
        </View>
      </Animated.View>
    );
  };

  // Render journal card
  const renderJournalCard = (journal: Journal, _sessionSeed: string) => {
    const isFeed = feedViewMode === 'feed';

    let anim = cardAnimations.current.get(journal.id);
    if (!anim) {
      anim = {
        opacity: new Animated.Value(1),
        translateY: new Animated.Value(0),
        scale: new Animated.Value(1),
      };
      cardAnimations.current.set(journal.id, anim);
    }

    const formattedDate = new Date(journal.timestamp).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    });
    const linkedEntry = journal.linkedEntryId ? entriesById.get(journal.linkedEntryId) : undefined;
    const linkedLocation = journal.linkedEntryId ? entryLocations[journal.linkedEntryId] : undefined;
    const city = (journal.city?.trim() || linkedEntry?.city?.trim() || linkedLocation?.city?.trim() || '').trim();
    const country = (journal.country?.trim() || linkedEntry?.country?.trim() || linkedLocation?.country?.trim() || '').trim();
    const locationLabel = city && country
      ? `${city}, ${country}`
      : city || country || '';

    return (
      <Animated.View
        key={journal.id}
        style={[
          { width: cardWidth, marginHorizontal: isFeed ? 0 : 4, marginBottom: isFeed ? FEED_CARD_MARGIN_BOTTOM : 12 },
          { opacity: anim.opacity, transform: [{ translateY: anim.translateY }, { scale: anim.scale }] },
        ]}
      >
        <TouchableOpacity
          style={[styles.journalCard, isFeed && { height: FEED_JOURNAL_CARD_HEIGHT }, isFeed && feedCardBorderStyle]}
          onPress={() => {
            InteractionManager.runAfterInteractions(() => {
              try {
                navigation.navigate('JournalDetail', { journalId: journal.id });
              } catch (error) {
                logger.warn('JournalDetail navigation failed:', error);
              }
            });
          }}
          onPressIn={() => handleCardPressIn(journal.id)}
          onPressOut={() => handleCardPressOut(journal.id)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={journal.title ? `Journal, ${journal.title}` : 'Journal entry'}
          accessibilityHint="Double tap to open."
        >
          <Text style={styles.journalDate} maxFontSizeMultiplier={1.2}>{formattedDate}</Text>
          {locationLabel.length > 0 && (
            <Text style={styles.journalMeta} numberOfLines={1} maxFontSizeMultiplier={1.2}>
              {locationLabel}
            </Text>
          )}
          <Text style={styles.journalText} numberOfLines={isFeed ? 6 : 4} maxFontSizeMultiplier={1.2}>
            {journal.content ?? ''}
          </Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const styles = useMemo(
    () => HomeScreenStyles(screenWidth, screenHeight, feedMapLeft, headerPaddingTop, mapWidth, colors),
    [screenWidth, screenHeight, feedMapLeft, headerPaddingTop, mapWidth, colors]
  );
  const captureTextZoneOpacity = captureMorphProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const captureTextZoneTranslateX = captureMorphProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 8],
  });
  const captureTextZoneMaxWidth = captureMorphProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [screenWidth, 0],
  });
  const captureTextZoneMarginRight = captureMorphProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [4, 0],
  });
  const capturePenOpacity = captureMorphProgress.interpolate({
    inputRange: [0, 0.6, 1],
    outputRange: [0, 0.3, 1],
  });
  const capturePenScale = captureMorphProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.92, 1],
  });
  const capturePenTranslateX = captureMorphProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [6, 0],
  });
  const capturePenWidth = captureMorphProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 44],
  });
  const capturePenSpacing = captureMorphProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 8],
  });
  const homeCaptureExpandedWidth = Math.max(
    HOME_CAPTURE_COMPACT_WIDTH,
    screenWidth - (HOME_CAPTURE_PILL_HORIZONTAL_INSET * 2)
  );
  const homeCaptureContainerWidth = captureMorphProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [homeCaptureExpandedWidth, HOME_CAPTURE_COMPACT_WIDTH],
  });

  // Assign scrollToTopRef on every render so the tab-press listener never holds a stale closure.
  scrollToTopRef.current = (animated = true) => {
    if (feedViewMode === 'feed') {
      flashListRef.current?.scrollToOffset({ offset: 0, animated });
    } else {
      scrollViewRef.current?.scrollTo({ y: 0, animated });
    }
  };

  // visibilityProgress is always hidden ? 0 : 1 — use `hidden` to avoid recomputing
  // this style on every scroll-driven frame where only intermediate values change.
  const homeFeedContentContainerStyle = useMemo(
    () => [
      styles.feedContent,
      {
        paddingBottom:
          getEffectiveMainTabInset(insets.bottom, hidden ? 0 : 1) +
          SPACING.md +
          homeCapturePillHeight +
          HOME_CAPTURE_FLOAT_GAP,
      },
    ],
    [styles.feedContent, insets.bottom, homeCapturePillHeight, hidden]
  );
  const pullIndicatorTop = Math.max(
    safeTopInset + HOME_PULL_INDICATOR_SAFE_GAP,
    safeTopInset + HOME_PULL_INDICATOR_MIN_TOP_SAFE_SPACE - HOME_PULL_INDICATOR_CONTENT_OFFSET
  );

  // Pre-computed outside the conditional render so TypeScript doesn't narrow feedViewMode
  // inside each branch, causing always-false comparison warnings.
  const feedModeSelected = feedViewMode === 'feed';
  const galleryModeSelected = feedViewMode === 'gallery';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {feedViewMode === 'feed' ? (
        /* ── Feed mode: FlashList virtualises cards; header is non-virtual ListHeaderComponent ── */
        <>
          {shuffledItems.length === 0 && (
            <View
              style={{ ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', paddingHorizontal: SPACING.xxl }}
              pointerEvents="none"
            >
              {!loadTimedOut ? (
                <>
                  <LoadingSpinner size="small" />
                  <Text
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.3}
                    style={{ fontSize: 13, fontStyle: 'italic', fontWeight: '400', color: colors.textPrimary, opacity: 0.55, marginTop: SPACING.sm }}
                  >
                    Preparing your memories...
                  </Text>
                </>
              ) : (
                <Text style={[styles.placeholderText, { marginTop: 0 }]} maxFontSizeMultiplier={1.3}>
                  {tripActive && !showAllMemories
                    ? 'Capture Travel Memories To See Them Here!'
                    : 'Your Photos And Experiences Will Be Shown Here!'}
                </Text>
              )}
            </View>
          )}
          <Animated.View style={[styles.feed, { opacity: feedOpacity }]}>
          {/* FlashList v2 auto-measures items; no estimatedItemSize (v1-only). */}
          <FlashList
            ref={flashListRef}
            data={shuffledItems}
            extraData={feedListExtraData}
            keyExtractor={(item) =>
              item.type === 'entry' ? `entry-${item.data.id}` : `journal-${item.data.id}`
            }
            getItemType={(item) => item.type}
            drawDistance={screenHeight * 2}
            viewabilityConfig={feedViewabilityConfig.current}
            onViewableItemsChanged={onFeedViewableItemsChanged.current}
            renderItem={({ item }) => renderCard(item, sessionSeed)}
            ListHeaderComponent={
              <View
                onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
                collapsable={false}
              >
                {/* Content above "Your Memories" - measured for first snap point */}
                <View onLayout={(e) => setHeightAboveMemories(e.nativeEvent.layout.height)} collapsable={false}>
                  {!tripHeaderData && (
                    <View
                      style={[
                        styles.travelModeGlassCard,
                        { borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(20,18,18,0.1)' },
                        Platform.OS === 'ios'
                          ? {
                            shadowColor: '#000',
                            shadowOffset: { width: 0, height: 4 },
                            shadowOpacity: isDark ? 0.32 : 0.1,
                            shadowRadius: 10,
                          }
                          : { elevation: 7 },
                      ]}
                    >
                      {Platform.OS === 'ios' ? (
                        <BlurView
                          intensity={isDark ? 48 : 62}
                          tint={isDark ? 'dark' : 'light'}
                          style={StyleSheet.absoluteFillObject}
                        />
                      ) : (
                        <View
                          style={[
                            StyleSheet.absoluteFillObject,
                            { backgroundColor: isDark ? 'rgba(32,30,30,0.94)' : 'rgba(248,248,248,0.97)' },
                          ]}
                        />
                      )}
                      <View
                        style={[
                          styles.travelModeGlassTintOverlay,
                          { backgroundColor: isDark ? 'rgba(12,10,10,0.28)' : 'rgba(255,255,255,0.42)' },
                        ]}
                        pointerEvents="none"
                      />
                      <View style={[styles.travelModeGlassRow]}>
                        <View style={styles.travelModeGlassTextBlock}>
                          <Text
                            style={[styles.travelModeGlassTitle, { color: colors.textPrimary }]}
                            maxFontSizeMultiplier={1.3}
                          >
                            Travel Mode
                          </Text>
                          <Text
                            style={[styles.travelModeGlassState, { color: colors.textSecondary }]}
                            maxFontSizeMultiplier={1.3}
                          >
                            {travelModeEnabled ? 'On' : 'Off'}
                          </Text>
                        </View>
                        <Switch
                          value={travelModeEnabled}
                          onValueChange={handleTravelModeToggle}
                          trackColor={{ false: isDark ? 'rgba(255,255,255,0.24)' : '#D1D5DB', true: '#34C759' }}
                          thumbColor={colors.white}
                          style={styles.travelModeGlassSwitch}
                          accessibilityLabel={travelModeEnabled ? 'Travel Mode on' : 'Travel Mode off'}
                          accessibilityState={{ checked: travelModeEnabled }}
                        />
                      </View>
                    </View>
                  )}
                  {tripHeaderData ? (
                    <>
                      <View
                        style={[
                          styles.tripHeaderCard,
                          {
                            backgroundColor: isDark ? '#D9D9DE' : 'rgba(248,248,248,0.97)',
                            borderColor: isDark ? 'rgba(20,18,18,0.18)' : 'rgba(20,18,18,0.1)',
                          },
                        ]}
                      >
                        <View style={styles.tripHeaderTopRow}>
                          <View style={styles.tripHeaderTopTextBlock}>
                            <Text style={[styles.travelModeGlassTitle, { color: isDark ? '#111111' : colors.textPrimary }]} maxFontSizeMultiplier={1.3}>
                              Travel Mode
                            </Text>
                            <Text style={[styles.tripHeaderState, { color: isDark ? 'rgba(17,17,17,0.68)' : colors.textSecondary }]} maxFontSizeMultiplier={1.3}>
                              On
                            </Text>
                          </View>
                          <Switch
                            value={travelModeEnabled}
                            onValueChange={handleTravelModeToggle}
                            trackColor={{ false: isDark ? 'rgba(20,18,18,0.22)' : '#D1D5DB', true: '#34C759' }}
                            thumbColor={colors.white}
                            style={styles.tripHeaderSwitch}
                            accessibilityLabel={travelModeEnabled ? 'Travel Mode on' : 'Travel Mode off'}
                            accessibilityState={{ checked: travelModeEnabled }}
                          />
                        </View>
                        <Text
                          style={[styles.tripHeaderTitle, { color: isDark ? '#111111' : colors.textPrimary }]}
                          numberOfLines={2}
                          maxFontSizeMultiplier={1.35}
                          accessibilityLabel={`Current Trip: ${tripHeaderData.tripNames}`}
                        >
                          {`Current Trip: ${tripHeaderData.tripNames}`}
                        </Text>
                        <View style={styles.tripHeaderDayRow}>
                          <Text
                            style={[styles.tripHeaderDayText, { color: isDark ? 'rgba(17,17,17,0.72)' : colors.textSecondary }]}
                            numberOfLines={1}
                            maxFontSizeMultiplier={1.35}
                            accessibilityLabel={
                              tripHeaderData.totalDays
                                ? `Day ${tripHeaderData.dayNumber} of ${tripHeaderData.totalDays}`
                                : `Day ${tripHeaderData.dayNumber}`
                            }
                          >
                            {tripHeaderData.totalDays
                              ? `Day ${tripHeaderData.dayNumber} of ${tripHeaderData.totalDays}`
                              : `Day ${tripHeaderData.dayNumber}`}
                          </Text>
                        </View>
                      </View>
                    </>
                  ) : null}
                  {showHomeMap && (
                    <InteractiveMap
                      entries={entries ?? []}
                      onEntryPress={handleEntryPress}
                      collapsed={mapCollapsed}
                      onToggleCollapse={() => setMapCollapsed(!mapCollapsed)}
                      showEntryPins={false}
                    />
                  )}
                </View>
                {/* Memories header with view toggle */}
                <View style={styles.memoriesHeaderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.memoriesTitle} maxFontSizeMultiplier={1.4} numberOfLines={1}>
                      {tripActive && !showAllMemories ? 'This Trip\'s Memories' : 'Your Memories'}
                    </Text>
                    {tripActive && (
                      <TouchableOpacity
                        onPress={() => setShowAllMemories(v => !v)}
                        accessibilityRole="button"
                        accessibilityLabel={showAllMemories ? "Show this trip's memories" : 'Show all memories'}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={[styles.locationLabel, { marginTop: 2, color: colors.textSecondary }]} maxFontSizeMultiplier={1.35}>
                          {showAllMemories ? "Show this trip's memories" : 'Show all memories'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <View style={styles.toggleButtonsRow}>
                    <TouchableOpacity
                      style={styles.toggleButton}
                      onPress={() => setFeedViewMode('gallery')}
                      accessibilityRole="button"
                      accessibilityLabel="Gallery view"
                      accessibilityState={{ selected: galleryModeSelected }}
                    >
                      <GridIcon
                        width={20}
                        height={20}
                        color={galleryModeSelected ? colors.textPrimary : colors.textSecondary}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.toggleButton, { marginLeft: 8 }]}
                      onPress={() => setFeedViewMode('feed')}
                      accessibilityRole="button"
                      accessibilityLabel="Feed view"
                      accessibilityState={{ selected: feedModeSelected }}
                    >
                      <FeedIcon
                        width={20}
                        height={20}
                        color={feedModeSelected ? colors.textPrimary : colors.textSecondary}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            }
            ListEmptyComponent={null}
            contentContainerStyle={{
              paddingHorizontal: SPACING.md,
              paddingTop: headerPaddingTop,
              paddingBottom:
                getEffectiveMainTabInset(insets.bottom, hidden ? 0 : 1) +
                SPACING.md +
                homeCapturePillHeight +
                HOME_CAPTURE_FLOAT_GAP,
            }}
            decelerationRate="fast"
            snapToInterval={!feedSnapOffsets ? screenHeight * 0.85 : undefined}
            snapToOffsets={feedSnapOffsets}
            snapToAlignment="start"
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={(e) => {
              const y = e?.nativeEvent?.contentOffset?.y ?? 0;
              scrollOffsetYRef.current = y;
              reportScrollOffset(y);
            }}
            onScrollEndDrag={(e) => {
              const y = e?.nativeEvent?.contentOffset?.y ?? 0;
              if (!isRefreshing && y <= -PULL_THRESHOLD) {
                handleRefresh();
              }
            }}
          />
        </Animated.View>
        </>
      ) : (
        /* ── Gallery mode: non-virtualised two-column masonry ── */
        <ScrollView
          ref={scrollViewRef}
          style={styles.feed}
          contentContainerStyle={homeFeedContentContainerStyle}
          decelerationRate="normal"
          showsVerticalScrollIndicator
          scrollEventThrottle={16}
          onScroll={(e) => {
            const y = e?.nativeEvent?.contentOffset?.y ?? 0;
            scrollOffsetYRef.current = y;
            reportScrollOffset(y);
          }}
          onScrollEndDrag={(e) => {
            const y = e?.nativeEvent?.contentOffset?.y ?? 0;
            if (!isRefreshing && y <= -PULL_THRESHOLD) {
              handleRefresh();
            }
          }}
        >
          <View
            onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
            collapsable={false}
          >
            {/* Content above "Your Memories" - measured for first snap point */}
            <View onLayout={(e) => setHeightAboveMemories(e.nativeEvent.layout.height)} collapsable={false}>
              {!tripHeaderData && (
                <View
                  style={[
                    styles.travelModeGlassCard,
                    { borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(20,18,18,0.1)' },
                    Platform.OS === 'ios'
                      ? {
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: isDark ? 0.32 : 0.1,
                        shadowRadius: 10,
                      }
                      : { elevation: 7 },
                  ]}
                >
                  {Platform.OS === 'ios' ? (
                    <BlurView
                      intensity={isDark ? 48 : 62}
                      tint={isDark ? 'dark' : 'light'}
                      style={StyleSheet.absoluteFillObject}
                    />
                  ) : (
                    <View
                      style={[
                        StyleSheet.absoluteFillObject,
                        { backgroundColor: isDark ? 'rgba(32,30,30,0.94)' : 'rgba(248,248,248,0.97)' },
                      ]}
                    />
                  )}
                  <View
                    style={[
                      styles.travelModeGlassTintOverlay,
                      { backgroundColor: isDark ? 'rgba(12,10,10,0.28)' : 'rgba(255,255,255,0.42)' },
                    ]}
                    pointerEvents="none"
                  />
                  <View style={[styles.travelModeGlassRow]}>
                    <View style={styles.travelModeGlassTextBlock}>
                      <Text
                        style={[styles.travelModeGlassTitle, { color: colors.textPrimary }]}
                        maxFontSizeMultiplier={1.3}
                      >
                        Travel Mode
                      </Text>
                      <Text
                        style={[styles.travelModeGlassState, { color: colors.textSecondary }]}
                        maxFontSizeMultiplier={1.3}
                      >
                        {travelModeEnabled ? 'On' : 'Off'}
                      </Text>
                    </View>
                    <Switch
                      value={travelModeEnabled}
                      onValueChange={handleTravelModeToggle}
                      trackColor={{ false: isDark ? 'rgba(255,255,255,0.24)' : '#D1D5DB', true: '#34C759' }}
                      thumbColor={colors.white}
                      style={styles.travelModeGlassSwitch}
                      accessibilityLabel={travelModeEnabled ? 'Travel Mode on' : 'Travel Mode off'}
                      accessibilityState={{ checked: travelModeEnabled }}
                    />
                  </View>
                </View>
              )}
              {tripHeaderData ? (
                <>
                  <View
                    style={[
                      styles.tripHeaderCard,
                      {
                        backgroundColor: isDark ? '#D9D9DE' : 'rgba(248,248,248,0.97)',
                        borderColor: isDark ? 'rgba(20,18,18,0.18)' : 'rgba(20,18,18,0.1)',
                      },
                    ]}
                  >
                    <View style={styles.tripHeaderTopRow}>
                      <View style={styles.tripHeaderTopTextBlock}>
                        <Text style={[styles.travelModeGlassTitle, { color: isDark ? '#111111' : colors.textPrimary }]} maxFontSizeMultiplier={1.3}>
                          Travel Mode
                        </Text>
                        <Text style={[styles.tripHeaderState, { color: isDark ? 'rgba(17,17,17,0.68)' : colors.textSecondary }]} maxFontSizeMultiplier={1.3}>
                          On
                        </Text>
                      </View>
                      <Switch
                        value={travelModeEnabled}
                        onValueChange={handleTravelModeToggle}
                        trackColor={{ false: isDark ? 'rgba(20,18,18,0.22)' : '#D1D5DB', true: '#34C759' }}
                        thumbColor={colors.white}
                        style={styles.tripHeaderSwitch}
                        accessibilityLabel={travelModeEnabled ? 'Travel Mode on' : 'Travel Mode off'}
                        accessibilityState={{ checked: travelModeEnabled }}
                      />
                    </View>
                    <Text
                      style={[styles.tripHeaderTitle, { color: isDark ? '#111111' : colors.textPrimary }]}
                      numberOfLines={2}
                      maxFontSizeMultiplier={1.35}
                      accessibilityLabel={`Current Trip: ${tripHeaderData.tripNames}`}
                    >
                      {`Current Trip: ${tripHeaderData.tripNames}`}
                    </Text>
                    <View style={styles.tripHeaderDayRow}>
                      <Text
                        style={[styles.tripHeaderDayText, { color: isDark ? 'rgba(17,17,17,0.72)' : colors.textSecondary }]}
                        numberOfLines={1}
                        maxFontSizeMultiplier={1.35}
                        accessibilityLabel={
                          tripHeaderData.totalDays
                            ? `Day ${tripHeaderData.dayNumber} of ${tripHeaderData.totalDays}`
                            : `Day ${tripHeaderData.dayNumber}`
                        }
                      >
                        {tripHeaderData.totalDays
                          ? `Day ${tripHeaderData.dayNumber} of ${tripHeaderData.totalDays}`
                          : `Day ${tripHeaderData.dayNumber}`}
                      </Text>
                    </View>
                  </View>
                </>
              ) : null}
              {showHomeMap && (
                <InteractiveMap
                  entries={entries ?? []}
                  onEntryPress={handleEntryPress}
                  collapsed={mapCollapsed}
                  onToggleCollapse={() => setMapCollapsed(!mapCollapsed)}
                  showEntryPins={false}
                />
              )}
            </View>
            {/* Memories header with view toggle */}
            <View style={styles.memoriesHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.memoriesTitle} maxFontSizeMultiplier={1.4} numberOfLines={1}>
                  {tripActive && !showAllMemories ? 'This Trip\'s Memories' : 'Your Memories'}
                </Text>
                {tripActive && (
                  <TouchableOpacity
                    onPress={() => setShowAllMemories(v => !v)}
                    accessibilityRole="button"
                    accessibilityLabel={showAllMemories ? "Show this trip's memories" : 'Show all memories'}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={[styles.locationLabel, { marginTop: 2, color: colors.textSecondary }]} maxFontSizeMultiplier={1.35}>
                      {showAllMemories ? "Show this trip's memories" : 'Show all memories'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.toggleButtonsRow}>
                <TouchableOpacity
                  style={styles.toggleButton}
                  onPress={() => setFeedViewMode('gallery')}
                  accessibilityRole="button"
                  accessibilityLabel="Gallery view"
                  accessibilityState={{ selected: galleryModeSelected }}
                >
                  <GridIcon
                    width={20}
                    height={20}
                    color={galleryModeSelected ? colors.textPrimary : colors.textSecondary}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toggleButton, { marginLeft: 8 }]}
                  onPress={() => setFeedViewMode('feed')}
                  accessibilityRole="button"
                  accessibilityLabel="Feed view"
                  accessibilityState={{ selected: feedModeSelected }}
                >
                  <FeedIcon
                    width={20}
                    height={20}
                    color={feedModeSelected ? colors.textPrimary : colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Gallery cards */}
          <Animated.View style={{ opacity: feedOpacity }}>
            {(feedItems ?? []).length === 0 ? (
              <Text style={styles.placeholderText} maxFontSizeMultiplier={1.3}>
                {tripActive && !showAllMemories
                  ? 'Capture Travel Memories To See Them Here!'
                  : 'Your Photos And Experiences Will Be Shown Here!'}
              </Text>
            ) : (() => {
              const galleryCardWidth = (mapWidth - 16) / 2;
              const { leftColumn, rightColumn } = galleryColumns ?? { leftColumn: [], rightColumn: [] };
              return (
                <View style={styles.pinterestGrid}>
                  <View style={styles.pinterestColumnsContainer}>
                    <View style={[styles.pinterestColumn, { width: galleryCardWidth + 8 }]}>
                      {leftColumn.map((item) => {
                        const key = item.type === 'entry' ? `entry-${item.data.id}` : `journal-${item.data.id}`;
                        return <React.Fragment key={key}>{renderCard(item, sessionSeed, 'left')}</React.Fragment>;
                      })}
                    </View>
                    <View style={[styles.pinterestColumn, { width: galleryCardWidth + 8 }]}>
                      {rightColumn.map((item) => {
                        const key = item.type === 'entry' ? `entry-${item.data.id}` : `journal-${item.data.id}`;
                        return <React.Fragment key={key}>{renderCard(item, sessionSeed, 'right')}</React.Fragment>;
                      })}
                    </View>
                  </View>
                </View>
              );
            })()}
          </Animated.View>
        </ScrollView>
      )}

      {/* Custom pull-to-refresh indicator — sits below the camera safe area, always on top of content */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.pullIndicatorWrapper,
          { top: pullIndicatorTop },
        ]}
      >
        {/* Refresh phase: shown only while the refresh action is active */}
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              alignItems: 'center',
              justifyContent: 'center',
              opacity: refreshRevealAnim,
            },
          ]}
        >
          <LoadingSpinner size="small" />
        </Animated.View>
      </Animated.View>

      {/* Long-press overlay: dim background (with cutout so selected card stays bright) + action icons */}
      {longPressActiveEntryId && longPressCardLayout && (() => {
        const layout = longPressCardLayout;
        const SCALE = 1.05;
        // Cutout buffer so selected card + scale fits inside the cutout.
        const BUFFER = 2;
        let cutLeft: number;
        let cutTop: number;
        let cutWidth: number;
        let cutHeight: number;
        if (
          layout.width <= 0 ||
          layout.height <= 0 ||
          !Number.isFinite(layout.x) ||
          !Number.isFinite(layout.y)
        ) {
          cutLeft = layout.x;
          cutTop = layout.y;
          cutWidth = Math.max(0, layout.width);
          cutHeight = Math.max(0, layout.height);
        } else {
          const expandedWidth = layout.width * SCALE;
          const expandedHeight = layout.height * SCALE;
          let expandedX = layout.x - (expandedWidth - layout.width) / 2;
          let expandedY = layout.y - (expandedHeight - layout.height) / 2;
          expandedX -= BUFFER;
          expandedY -= BUFFER;
          const expandedW = expandedWidth + 2 * BUFFER;
          const expandedH = expandedHeight + 2 * BUFFER;
          if (
            !Number.isFinite(expandedX) ||
            !Number.isFinite(expandedY) ||
            !Number.isFinite(expandedW) ||
            !Number.isFinite(expandedH)
          ) {
            cutLeft = layout.x;
            cutTop = layout.y;
            cutWidth = layout.width;
            cutHeight = layout.height;
          } else {
            cutLeft = Math.max(0, expandedX);
            cutTop = Math.max(0, expandedY);
            cutWidth = Math.min(expandedW, screenWidth - cutLeft);
            cutHeight = Math.min(expandedH, screenHeight - cutTop);
            cutWidth = Math.max(0, cutWidth);
            cutHeight = Math.max(0, cutHeight);
          }
        }
        const ICON_SIZE = 44;
        const GAP = 8;
        const isGallery = feedViewMode === 'gallery';
        // Gallery: extra space between card and the action buttons (gallery only)
        const GALLERY_CARD_TO_BUTTONS_GAP = 20;
        const LABEL_GAP = 6;
        const LABEL_WIDTH_ESTIMATE = 52; // for "Delete" at ~11px
        const iconRowWidth = 3 * ICON_SIZE + 2 * GAP;
        const iconsColumnHeight = 3 * ICON_SIZE + 2 * GAP;
        const galleryGroupWidth = ICON_SIZE + LABEL_GAP + LABEL_WIDTH_ESTIMATE;
        // Gallery: icons outside card — left column → icons to the right of card; right column → icons to the left
        const iconsStyle = isGallery
          ? {
              position: 'absolute' as const,
              left:
                longPressColumn === 'right'
                  ? layout.x - GALLERY_CARD_TO_BUTTONS_GAP - galleryGroupWidth
                  : layout.x + layout.width + GALLERY_CARD_TO_BUTTONS_GAP,
              top: layout.y + Math.max(0, (layout.height - iconsColumnHeight) / 2),
            }
          : {
              position: 'absolute' as const,
              left: (screenWidth - iconRowWidth) / 2,
              top: layout.y + layout.height + GAP,
            };
        const dimPanelStyle = { backgroundColor: 'rgba(0,0,0,0.7)' as const };
        return (
          <TouchableWithoutFeedback onPress={dismissLongPress}>
            <Animated.View
              style={[StyleSheet.absoluteFillObject, { zIndex: 2000 }]}
            >
              {/* Four dim panels so the selected card area is not dimmed (stays at full brightness); cutout expanded for scale 1.05 */}
              <Animated.View
                style={[StyleSheet.absoluteFillObject, { opacity: overlayOpacity }]}
                pointerEvents="none"
              >
                <View style={[dimPanelStyle, { position: 'absolute', left: 0, top: 0, right: 0, height: cutTop }]} />
                <View
                  style={[
                    dimPanelStyle,
                    {
                      position: 'absolute',
                      left: 0,
                      top: cutTop + cutHeight,
                      right: 0,
                      height: Math.max(0, screenHeight - (cutTop + cutHeight)),
                    },
                  ]}
                />
                <View
                  style={[
                    dimPanelStyle,
                    { position: 'absolute', left: 0, top: cutTop, width: cutLeft, height: cutHeight },
                  ]}
                />
                <View
                  style={[
                    dimPanelStyle,
                    {
                      position: 'absolute',
                      left: cutLeft + cutWidth,
                      top: cutTop,
                      right: 0,
                      height: cutHeight,
                    },
                  ]}
                />
              </Animated.View>
              <View
                style={[
                  isGallery ? { flexDirection: 'column' } : { flexDirection: 'row', justifyContent: 'center' },
                  isGallery ? { alignItems: longPressColumn === 'right' ? 'flex-end' : 'flex-start' } : { alignItems: 'center' },
                  { gap: GAP },
                  iconsStyle,
                ]}
                pointerEvents="box-none"
              >
                {(() => {
                  const iconButtonStyle = {
                    width: ICON_SIZE,
                    height: ICON_SIZE,
                    borderRadius: ICON_SIZE / 2,
                    backgroundColor: colors.surface,
                    justifyContent: 'center' as const,
                    alignItems: 'center' as const,
                  };
                  const labelStyle = {
                    fontSize: 13,
                    fontWeight: FONT_WEIGHTS.bold,
                    color: colors.textPrimary,
                    fontFamily: FONTS.inter,
                    marginLeft: isGallery && longPressColumn !== 'right' ? LABEL_GAP : 0,
                    marginRight: isGallery && longPressColumn === 'right' ? LABEL_GAP : 0,
                    marginTop: isGallery ? 0 : 4,
                  };
                  const wrapButtonWithLabel = (button: React.ReactNode, label: string) =>
                    isGallery ? (
                      <View style={{ flexDirection: longPressColumn === 'right' ? 'row-reverse' : 'row', alignItems: 'center' }}>
                        {button}
                        <Text style={labelStyle} numberOfLines={1} maxFontSizeMultiplier={1.25}>{label}</Text>
                      </View>
                    ) : (
                      <View style={{ alignItems: 'center' }}>
                        {button}
                        <Text style={labelStyle} numberOfLines={1} maxFontSizeMultiplier={1.25}>{label}</Text>
                      </View>
                    );
                  return (
                    <>
                      {wrapButtonWithLabel(
                        <TouchableOpacity
                          style={iconButtonStyle}
                          onPress={() => {
                            dismissLongPress();
                            navigation.navigate('NotesEditor', { entryId: longPressActiveEntryId });
                          }}
                          accessibilityRole="button"
                          accessibilityLabel="Create journal from experience"
                        >
                          <Ionicons name="create-outline" size={20} color={colors.textPrimary} />
                        </TouchableOpacity>,
                        'Journal'
                      )}
                      {wrapButtonWithLabel(
                        <TouchableOpacity
                          style={iconButtonStyle}
                          onPress={() => {
                            dismissLongPress();
                            navigation.navigate('EntryEdit', { entryId: longPressActiveEntryId });
                          }}
                          accessibilityRole="button"
                          accessibilityLabel="Edit entry"
                        >
                          <Ionicons name="settings" size={20} color={colors.textPrimary} />
                        </TouchableOpacity>,
                        'Edit'
                      )}
                      {wrapButtonWithLabel(
                        <TouchableOpacity
                          style={iconButtonStyle}
                          onPress={() => {
                            const entryIdToDelete = longPressActiveEntryId;
                            dismissLongPress();
                            Alert.alert(
                              'Are you sure you want to delete this?',
                              undefined,
                              [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                  text: 'Yes, delete.',
                                  style: 'destructive',
                                  onPress: async () => {
                                    if (!entryIdToDelete) return;
                                    try {
                                      await deleteEntry(entryIdToDelete);
                                    } catch {
                                      Alert.alert('Error', 'Failed to delete entry. Please try again.');
                                    }
                                  },
                                },
                              ]
                            );
                          }}
                          accessibilityRole="button"
                          accessibilityLabel="Delete entry"
                        >
                          <TrashIcon width={20} height={20} color={colors.textPrimary} />
                        </TouchableOpacity>,
                        'Delete'
                      )}
                    </>
                  );
                })()}
              </View>
            </Animated.View>
          </TouchableWithoutFeedback>
        );
      })()}

      <Animated.View
        pointerEvents={isTransitioningToNotes ? 'auto' : 'box-none'}
        style={[
          isTransitioningToNotes
            ? {
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 3000,
              transform: [{
                translateY: notesTransitionProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -screenHeight + homeCaptureTransitionStart],
                }),
              }],
              height: notesTransitionProgress.interpolate({
                inputRange: [0, 1],
                outputRange: [homeCaptureTransitionStart, screenHeight],
              }),
              backgroundColor: colors.background,
            }
            : {
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: homeCaptureBottomAnim,
              zIndex: HOME_CAPTURE_BAR_ZINDEX,
              backgroundColor: 'transparent',
            },
        ]}
      >
        {!isTransitioningToNotes ? (
          <Animated.View
            onLayout={onHomeCapturePillLayout}
            style={{
              width: homeCaptureContainerWidth,
              marginRight: HOME_CAPTURE_PILL_HORIZONTAL_INSET,
              alignSelf: 'flex-end',
            }}
            pointerEvents="box-none"
          >
            <View
              style={[
                styles.capturePillOuter,
                {
                  borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(20,18,18,0.1)',
                },
                Platform.OS === 'ios'
                  ? {
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: isDark ? 0.35 : 0.12,
                    shadowRadius: 10,
                  }
                  : { elevation: 8 },
              ]}
            >
              {Platform.OS === 'ios' ? (
                <BlurView
                  intensity={isDark ? 52 : 64}
                  tint={isDark ? 'dark' : 'light'}
                  style={StyleSheet.absoluteFillObject}
                />
              ) : (
                <View
                  style={[
                    StyleSheet.absoluteFillObject,
                    { backgroundColor: isDark ? 'rgba(32,30,30,0.94)' : 'rgba(248,248,248,0.97)' },
                  ]}
                />
              )}
              <View
                style={[
                  styles.capturePillTintOverlay,
                  { backgroundColor: isDark ? 'rgba(12,10,10,0.28)' : 'rgba(255,255,255,0.42)' },
                ]}
                pointerEvents="none"
              />
              <View style={styles.capturePillRow}>
                <Animated.View
                  style={[
                    styles.captureTextZone,
                    {
                      opacity: captureTextZoneOpacity,
                      maxWidth: captureTextZoneMaxWidth,
                      marginRight: captureTextZoneMarginRight,
                      transform: [{ translateX: captureTextZoneTranslateX }],
                    },
                  ]}
                  pointerEvents={hidden ? 'none' : 'auto'}
                >
                  <TouchableOpacity
                    activeOpacity={1}
                    onPress={handleNotePlaceholderPress}
                    accessibilityRole="button"
                    accessibilityLabel="Capture a thought. Opens journal editor."
                    importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
                    style={styles.captureTextWellTouchable}
                  >
                    <View
                      style={[
                        styles.captureTextWell,
                        { backgroundColor: isDark ? 'rgba(0,0,0,0.32)' : 'rgba(255,255,255,0.55)' },
                      ]}
                      pointerEvents="none"
                    >
                      <Animated.Text
                        style={[
                          styles.captureTextInput,
                          styles.capturePromptText,
                          {
                            color: colors.textSecondary,
                            opacity: capturePromptOpacity,
                          },
                        ]}
                        numberOfLines={1}
                        maxFontSizeMultiplier={1.35}
                      >
                        {HOME_CAPTURE_ROTATING_PROMPTS[capturePromptIndex]}
                      </Animated.Text>
                    </View>
                  </TouchableOpacity>
                </Animated.View>
                <View style={styles.captureActionsRow}>
                  <Animated.View
                    style={{
                      width: capturePenWidth,
                      overflow: 'hidden',
                      opacity: capturePenOpacity,
                      marginRight: capturePenSpacing,
                      transform: [{ scale: capturePenScale }, { translateX: capturePenTranslateX }],
                    }}
                    pointerEvents={hidden ? 'auto' : 'none'}
                  >
                    <TouchableOpacity
                      style={styles.capturePenSlot}
                      onPress={handleNotePlaceholderPress}
                      accessibilityRole="button"
                      accessibilityLabel="Open notes editor"
                      accessibilityHint="Opens journal editor"
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <PenIcon width={20} height={20} color={colors.textPrimary} />
                    </TouchableOpacity>
                  </Animated.View>
                  <Animated.View
                    style={{
                      transform: [{ scale: cameraButtonScale }],
                      opacity: cameraButtonOpacity,
                    }}
                  >
                    <TouchableOpacity
                      style={styles.captureCameraSlot}
                      onPress={handleCameraPress}
                      onPressIn={handleCameraPressIn}
                      onPressOut={handleCameraPressOut}
                      accessibilityRole="button"
                      accessibilityLabel="Open camera to capture"
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <CameraIcon
                        width={24}
                        height={23}
                        color={colors.textPrimary}
                        lensFill={isDark ? colors.surfaceVariant : '#FFFFFF'}
                        lensCenterFill={isDark ? 'rgba(255,255,255,0.32)' : '#FFFFFF'}
                      />
                    </TouchableOpacity>
                  </Animated.View>
                </View>
              </View>
            </View>
          </Animated.View>
        ) : null}
      </Animated.View>
    </View>
  );
};

const HomeScreenStyles = (
  screenWidth: number,
  screenHeight: number,
  feedMapLeft: number,
  headerPaddingTop: number,
  mapWidth: number,
  colors: ThemeColors
) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  // Custom pull-to-refresh indicator pill — positioned below the camera safe area.
  // The circle uses colors.surface (theme-adaptive) so it always contrasts against the background.
  // Shadow (light mode) and border (dark mode) ensure the circle edge is visible.
  pullIndicatorWrapper: {
    position: 'absolute',
    left: (screenWidth - 40) / 2,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 50,
  },
  feed: {
    flex: 1,
    zIndex: 1,
  },
  feedContent: {
    padding: SPACING.md,
    paddingBottom: SPACING.md,
    paddingTop: headerPaddingTop,
  },
  locationLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  tripHeaderCard: {
    borderRadius: 18,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  travelModeGlassCard: {
    borderRadius: 18,
    marginBottom: SPACING.md,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  travelModeGlassTintOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  travelModeGlassRow: {
    minHeight: 56,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  travelModeGlassTextBlock: {
    flexDirection: 'column',
    justifyContent: 'center',
  },
  travelModeGlassTitle: {
    ...TEXT_STYLES.headerGreeting,
    fontSize: 15,
    fontWeight: FONT_WEIGHTS.semibold,
    letterSpacing: 0.1,
  },
  travelModeGlassState: {
    ...TEXT_STYLES.headerGreeting,
    marginTop: 2,
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.regular,
  },
  travelModeGlassSwitch: {
    transform: [{ scaleX: 0.9 }, { scaleY: 0.9 }],
    marginRight: -4,
  },
  tripHeaderTitle: {
    ...TEXT_STYLES.headerGreeting,
    fontSize: 20,
    fontWeight: FONT_WEIGHTS.semibold,
    lineHeight: 26,
    marginBottom: SPACING.sm,
  },
  tripHeaderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    marginBottom: SPACING.sm,
  },
  tripHeaderTopTextBlock: {
    flexDirection: 'column',
    justifyContent: 'center',
  },
  tripHeaderState: {
    ...TEXT_STYLES.headerGreeting,
    marginTop: 2,
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.regular,
  },
  tripHeaderDayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 0,
    marginTop: 0,
  },
  tripHeaderDayText: {
    ...TEXT_STYLES.headerGreeting,
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.regular,
    flex: 1,
  },
  tripHeaderSwitch: {
    transform: [{ scaleX: 0.9 }, { scaleY: 0.9 }],
    marginRight: -4,
  },
  locationLabel: {
    ...TEXT_STYLES.headerGreeting,
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.regular,
    color: colors.textPrimary,
    marginLeft: 6,
  },
  memoriesHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  memoriesTitle: {
    ...TEXT_STYLES.headerGreeting,
    fontSize: 18,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.textPrimary,
  },
  toggleButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggleButton: {
    padding: SPACING.xs,
    borderRadius: 6,
  },
  feedColumn: {
    width: mapWidth,
    alignSelf: 'center',
  },
  placeholderText: {
    ...TEXT_STYLES.placeholderText,
    textAlign: 'center',
    marginTop: SPACING.xxl,
    color: colors.textPrimary,
    fontWeight: FONT_WEIGHTS.black,
    fontSize: 21,
  },
  // Pinterest-style grid - true masonry layout with independent columns
  pinterestGrid: {
    width: mapWidth, // Match map width
    alignSelf: 'center', // Center horizontally
    marginTop: 0, // Start at same height as map (no top margin)
  },
  pinterestColumnsContainer: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between', // Space between columns
    alignItems: 'flex-start', // Align columns to top
  },
  pinterestColumn: {
    // Width set dynamically in JSX: cardWidth + 8 (for margins)
    // Cards will flow vertically within each column independently
  },
  pinterestCard: {
    marginBottom: 12,
    backgroundColor: 'transparent',
    borderRadius: DIMENSIONS.cardBorderRadius,
    overflow: 'hidden',
  },
  pinterestMediaContainer: {
    width: '100%',
    // aspectRatio will be set dynamically per card (1.0 to 1.4)
    backgroundColor: colors.surface,
    borderRadius: DIMENSIONS.cardBorderRadius, // Rounded corners on all sides
    overflow: 'hidden',
  },
  aura: {
    margin: -5,
  },
  pinterestImage: {
    width: '100%',
    height: '100%',
    borderRadius: DIMENSIONS.cardBorderRadius, // Rounded corners on all sides to match container
  },
  pinterestVideoPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.surface,
    borderRadius: DIMENSIONS.cardBorderRadius, // Rounded corners on all sides
    justifyContent: 'center',
    alignItems: 'center',
  },
  pinterestAudioPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.surface,
    borderRadius: DIMENSIONS.cardBorderRadius, // Rounded corners on all sides
    justifyContent: 'center',
    alignItems: 'center',
  },
  pinterestPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.stone600,
    borderRadius: DIMENSIONS.cardBorderRadius, // Rounded corners on all sides
    justifyContent: 'center',
    alignItems: 'center',
  },
  pinterestMediaIcon: {
    fontSize: 32,
    marginBottom: SPACING.xs,
  },
  pinterestMediaLabel: {
    fontFamily: TEXT_STYLES.entryLabel.fontFamily,
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.textPrimary,
  },
  pinterestTitle: {
    fontFamily: TEXT_STYLES.cardTitle.fontFamily,
    fontSize: TEXT_STYLES.cardTitle.fontSize,
    fontWeight: FONT_WEIGHTS.regular, // Normal weight instead of bold
    color: colors.textPrimary,
    padding: SPACING.sm,
    paddingTop: SPACING.xs,
    backgroundColor: 'transparent', // Transparent background (no gray rectangle)
    // Pinterest-style: title below image, no description shown in grid
  },
  // Feed entry card overlay styles
  feedCardFullImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  feedCardTopGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '40%',
  },
  feedCardBottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '42%',
  },
  feedCardCountry: {
    position: 'absolute',
    top: 27,
    left: 27,
    color: '#FFFFFF',
    fontFamily: FONTS.inter,
    fontSize: 22,
    fontWeight: FONT_WEIGHTS.bold,
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  feedCardTopRight: {
    position: 'absolute',
    top: 27,
    right: 27,
    alignItems: 'flex-end',
  },
  feedCardTopRightText: {
    color: '#FFFFFF',
    fontFamily: FONTS.inter,
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.semibold,
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    lineHeight: 18,
  },
  feedCardTitle: {
    position: 'absolute',
    bottom: 27,
    left: 27,
    right: 27,
    color: '#FFFFFF',
    fontFamily: FONTS.inter,
    fontSize: 24,
    fontWeight: FONT_WEIGHTS.bold,
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  capturePillOuter: {
    borderRadius: HOME_CAPTURE_PILL_RADIUS,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  capturePillTintOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  capturePillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    minHeight: 48,
  },
  captureTextZone: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    overflow: 'hidden',
  },
  captureTextWellTouchable: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
  },
  captureTextWell: {
    flex: 1,
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: SPACING.md,
    minHeight: 44,
  },
  captureTextInput: {
    fontFamily: TEXT_STYLES.entryInput.fontFamily,
    fontSize: 17,
    fontWeight: '400' as const,
    color: colors.textPrimary,
    backgroundColor: 'transparent',
    padding: 0,
    margin: 0,
    textAlign: 'left',
    includeFontPadding: false,
    minHeight: 22,
  },
  capturePromptText: {
    paddingVertical: 0,
  },
  captureCameraSlot: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.surfaceVariant,
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  capturePenSlot: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.surfaceVariant,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Journal card styles
  journalCard: {
    marginBottom: 12,
    borderRadius: DIMENSIONS.cardBorderRadius,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    padding: 24,
    justifyContent: 'flex-start',
  },
  journalDate: {
    fontSize: 17,
    color: colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : FONTS.playfairDisplay,
    marginBottom: 1,
    lineHeight: 22,
  },
  journalMeta: {
    fontSize: 17,
    color: colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : FONTS.playfairDisplay,
    marginBottom: 6,
    lineHeight: 22,
  },
  journalText: {
    fontSize: 15,
    color: colors.textPrimary,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : FONTS.playfairDisplay,
    lineHeight: 23,
    marginBottom: 0,
  },
});

export default HomeScreen;
