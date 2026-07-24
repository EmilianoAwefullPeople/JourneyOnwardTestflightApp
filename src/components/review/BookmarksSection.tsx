// BookmarksSection (Gallery view)
// Review screen gallery: most recent at top, optional "Bookmarks" filter.
// Two-column masonry layout (shortest-column) so tiles stack without row gaps.

import React, { useMemo, useRef, useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Animated, Dimensions, Easing, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Entry } from '../../models/Entry';
import { Journal } from '../../models/Journal';
import { Postcard } from '../../models/Postcard';
import PostcardThumbnail from '../postcards/PostcardThumbnail';
import GradientText from '../common/GradientText';
import { DIMENSIONS, SPACING, FONTS, FONT_WEIGHTS } from '../../config/constants';
import { getEffectiveMainTabInset } from '../../navigation/mainTabBarMetrics';
import { TEXT_STYLES } from '../../config/typography';
import { ANIMATION_CONFIG, createStaggeredDelay } from '../../utils/animations';
import { useTheme } from '../../context/ThemeContext';
import { EntryPhotoImage } from '../common/EntryPhotoImage';
import type { ImagePriority } from '../../hooks/useFeedMediaPriority';
import {
  getGalleryAspectRatio,
  getGalleryEntryTileHeight,
  GALLERY_CARD_MARGIN_BOTTOM,
} from '../../utils/galleryAspectRatio';
import { buildMasonryColumnsLayout } from '../../utils/galleryMasonryLayout';
import { getEntryGalleryPhotoUri, getEntryPhotoPriorityKey, buildGalleryPhotoUrisFromEntries } from '../../utils/galleryPhotoUri';
import { useMasonryGalleryScroll } from '../../hooks/useMasonryGalleryScroll';

function safeTimestamp(entry: Entry): number {
  try {
    const t = entry.timestamp || entry.createdAt;
    if (!t) return 0;
    const d = new Date(t);
    return Number.isFinite(d.getTime()) ? d.getTime() : 0;
  } catch {
    return 0;
  }
}

function safeJournalTimestamp(journal: Journal): number {
  try {
    const t = journal.timestamp || journal.createdAt;
    if (!t) return 0;
    const d = new Date(t);
    return Number.isFinite(d.getTime()) ? d.getTime() : 0;
  } catch {
    return 0;
  }
}

/** Debounce before a keystroke triggers a re-filter, so fast typing doesn't re-scan the full list on every character. */
const SEARCH_DEBOUNCE_MS = 200;

/**
 * Lowercased date text for a timestamp, e.g. "wednesday, february 11, 2026 2026-02-11".
 * Covers weekday, full month name, day, year (as free text) plus an ISO form for exact-date queries,
 * so "february", "2026", "wednesday", or "2026-02-11" all match via the same plain substring check.
 */
function buildDateHaystackFragment(timestamp: string | undefined): string {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  if (!Number.isFinite(d.getTime())) return '';
  const longForm = d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const isoForm = d.toISOString().slice(0, 10);
  return `${longForm} ${isoForm}`.toLowerCase();
}

/** Lowercased, space-joined searchable text for an entry. Built once per entry (not per keystroke) so search is a single cheap substring check per item. */
function buildEntryHaystack(entry: Entry): string {
  const parts = [
    entry.title,
    entry.description,
    entry.city,
    entry.country,
    entry.weather,
    entry.season,
    entry.emotionNote,
    ...(entry.emotionLabels ?? []),
    buildDateHaystackFragment(entry.timestamp || entry.createdAt),
  ];
  return parts.filter(Boolean).join(' ').toLowerCase();
}

function buildJournalHaystack(journal: Journal): string {
  const parts = [
    journal.title,
    journal.content,
    journal.city,
    journal.country,
    buildDateHaystackFragment(journal.timestamp || journal.createdAt),
  ];
  return parts.filter(Boolean).join(' ').toLowerCase();
}

type MemoriesFilter = 'experiences' | 'photos' | 'notes' | 'postcards' | 'bookmarks';

const MEMORIES_FILTERS: { key: MemoriesFilter; label: string }[] = [
  { key: 'experiences', label: 'Experiences' },
  { key: 'bookmarks', label: 'Bookmarks' },
  { key: 'photos', label: 'Photos' },
  { key: 'notes', label: 'Notes' },
  { key: 'postcards', label: 'Postcards' },
];

const PHOTO_GRID_COLUMNS = 3;
const PHOTO_GRID_GAP = 4;
const POSTCARD_GRID_COLUMNS = 2;
const POSTCARD_GRID_GAP = 12;

interface PhotoGridItem {
  key: string;
  uri: string;
  entry: Entry;
}

interface BookmarksSectionProps {
  entries: Entry[];
  journals?: Journal[];
  postcards?: Postcard[];
  onEntryPress: (entry: Entry) => void;
  onJournalPress?: (journal: Journal) => void;
  onPostcardPress?: (postcard: Postcard) => void;
  scrollRef?: React.RefObject<ScrollView | null>;
  tripFilterAvailable?: boolean;
  tripFilterActive?: boolean;
  onTripFilterToggle?: () => void;
  onScrollReport?: (offsetY: number) => void;
  tabBarVisibilityProgress?: number;
}

const BookmarksSection: React.FC<BookmarksSectionProps> = ({
  entries,
  journals,
  postcards,
  onEntryPress,
  onJournalPress,
  onPostcardPress,
  scrollRef: externalScrollRef,
  tripFilterAvailable = false,
  tripFilterActive = false,
  onTripFilterToggle,
  onScrollReport,
  tabBarVisibilityProgress = 1,
}) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [activeFilter, setActiveFilter] = useState<MemoriesFilter>('experiences');
  const [filterRowHeight, setFilterRowHeight] = useState(0);
  const [searchActive, setSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const scrollViewRef = useRef<ScrollView>(null);
  const searchInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!externalScrollRef) return;
    externalScrollRef.current = scrollViewRef.current;
  }, [externalScrollRef]);

  useEffect(() => {
    scrollViewRef.current?.scrollTo({ y: 0, animated: false });
  }, [activeFilter, searchActive]);

  // Debounce so typing quickly doesn't re-scan the full list on every keystroke.
  useEffect(() => {
    const trimmed = searchQuery.trim().toLowerCase();
    const handle = setTimeout(() => setDebouncedSearchQuery(trimmed), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  const handleCloseSearch = () => {
    searchInputRef.current?.blur();
    setSearchActive(false);
    setSearchQuery('');
    setDebouncedSearchQuery('');
  };

  /** Tapping a filter tab while searching exits search first so the tap has one unambiguous effect. */
  const handleFilterTabPress = (apply: () => void) => {
    if (searchActive) handleCloseSearch();
    apply();
  };

  const cardAnimations = useRef<Map<string, { opacity: Animated.Value; translateY: Animated.Value; scale: Animated.Value }>>(new Map());
  // null = first render not yet processed; skip stagger on initial mount so existing
  // entries appear immediately rather than sliding in when the panel becomes visible.
  const previousItemsLengthRef = useRef<number | null>(null);

  const screenWidth = Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height;
  const edgePadding = SPACING.md;
  const cardWidth = (screenWidth - (edgePadding * 2) - 8) / 2;
  const columnWidth = cardWidth + 8;

  const displayList = useMemo(() => {
    const list = entries ?? [];
    const filtered = activeFilter === 'bookmarks' ? list.filter((e) => e.isBookmarked === true) : list;
    return [...filtered].sort((a, b) => safeTimestamp(b) - safeTimestamp(a));
  }, [entries, activeFilter]);

  const photoGridItems = useMemo<PhotoGridItem[]>(() => {
    const list = [...(entries ?? [])].sort((a, b) => safeTimestamp(b) - safeTimestamp(a));
    const items: PhotoGridItem[] = [];
    list.forEach((entry) => {
      if (entry.mediaType !== 'photo' || !entry.photoPaths?.length) return;
      entry.photoPaths.forEach((path, index) => {
        if (!path) return;
        const uri = entry.thumbPaths?.[index] || path;
        items.push({ key: `${entry.id}-${index}`, uri, entry });
      });
    });
    return items;
  }, [entries]);

  const notesList = useMemo(() => {
    const list = journals ?? [];
    return [...list].sort((a, b) => safeJournalTimestamp(b) - safeJournalTimestamp(a));
  }, [journals]);

  const postcardsList = useMemo(() => {
    const list = postcards ?? [];
    return [...list].sort(
      (a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()
    );
  }, [postcards]);

  // Haystacks are recomputed only when the underlying data changes, not on every keystroke.
  const entryHaystacks = useMemo(() => {
    const map = new Map<string, string>();
    (entries ?? []).forEach((entry) => map.set(entry.id, buildEntryHaystack(entry)));
    return map;
  }, [entries]);

  const journalHaystacks = useMemo(() => {
    const map = new Map<string, string>();
    (journals ?? []).forEach((journal) => map.set(journal.id, buildJournalHaystack(journal)));
    return map;
  }, [journals]);

  // A single linear pass over precomputed lowercase strings — cheap and stays linear as the library grows.
  const searchEntryResults = useMemo(() => {
    if (!debouncedSearchQuery) return [];
    const list = (entries ?? []).filter((e) => entryHaystacks.get(e.id)?.includes(debouncedSearchQuery));
    return [...list].sort((a, b) => safeTimestamp(b) - safeTimestamp(a));
  }, [entries, entryHaystacks, debouncedSearchQuery]);

  const searchJournalResults = useMemo(() => {
    if (!debouncedSearchQuery) return [];
    const list = (journals ?? []).filter((j) => journalHaystacks.get(j.id)?.includes(debouncedSearchQuery));
    return [...list].sort((a, b) => safeJournalTimestamp(b) - safeJournalTimestamp(a));
  }, [journals, journalHaystacks, debouncedSearchQuery]);

  const masonryLayout = useMemo(
    () =>
      buildMasonryColumnsLayout(displayList, (entry) => getGalleryEntryTileHeight(cardWidth, entry)),
    [displayList, cardWidth]
  );

  const galleryPhotoUris = useMemo(
    () => buildGalleryPhotoUrisFromEntries(displayList),
    [displayList]
  );

  const { isMediaActive, getPriorityForUri, wrapOnScroll } = useMasonryGalleryScroll({
    layout: masonryLayout,
    photoUris: galleryPhotoUris,
    contentTop: filterRowHeight,
    viewportHeight: screenHeight,
  });

  // Separate windowed layout for search results so matched photos still lazy-load by scroll
  // position instead of all mounting at once when a query matches a large number of entries.
  const searchMasonryLayout = useMemo(
    () =>
      buildMasonryColumnsLayout(searchEntryResults, (entry) => getGalleryEntryTileHeight(cardWidth, entry)),
    [searchEntryResults, cardWidth]
  );

  const searchGalleryPhotoUris = useMemo(
    () => buildGalleryPhotoUrisFromEntries(searchEntryResults),
    [searchEntryResults]
  );

  const {
    isMediaActive: searchIsMediaActive,
    getPriorityForUri: searchGetPriorityForUri,
    wrapOnScroll: searchWrapOnScroll,
  } = useMasonryGalleryScroll({
    layout: searchMasonryLayout,
    photoUris: searchGalleryPhotoUris,
    contentTop: filterRowHeight,
    viewportHeight: screenHeight,
  });

  // Pre-initialise animation values for all entries
  useEffect(() => {
    displayList.forEach((entry) => {
      if (!cardAnimations.current.has(entry.id)) {
        cardAnimations.current.set(entry.id, {
          opacity: new Animated.Value(1),
          translateY: new Animated.Value(0),
          scale: new Animated.Value(1),
        });
      }
    });
    // Prune animation values for entries no longer in the list (e.g. deleted entries).
    const currentIds = new Set(displayList.map(e => e.id));
    for (const key of cardAnimations.current.keys()) {
      if (!currentIds.has(key)) cardAnimations.current.delete(key);
    }
  }, [displayList.length]);

  // Stagger-animate only entries that are genuinely new (added after initial mount).
  // Two early-return cases suppress animation for initial data arrival:
  //   1. previousLength === null  → first effect run, set baseline and exit
  //   2. previousLength === 0     → entries loaded asynchronously after mount (common when
  //      this component is always-rendered via absoluteFillObject and AppContext hasn't
  //      finished its SQLite load yet). Treat the whole batch as initial state, not captures.
  // Only animate when the gallery already had content and more arrives (genuine new captures).
  useEffect(() => {
    const currentLength = displayList.length;
    const previousLength = previousItemsLengthRef.current;

    if (previousLength === null) {
      previousItemsLengthRef.current = currentLength;
      return;
    }

    // Entries arrived asynchronously after mount — not a new capture, skip animation.
    if (previousLength === 0 && currentLength > 0) {
      previousItemsLengthRef.current = currentLength;
      return;
    }

    if (currentLength > previousLength) {
      const newItems = displayList.slice(previousLength);
      newItems.forEach((entry, index) => {
        const globalIndex = previousLength + index;
        const opacity = new Animated.Value(0);
        const translateY = new Animated.Value(15);
        const scale = new Animated.Value(1);
        cardAnimations.current.set(entry.id, { opacity, translateY, scale });
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
    previousItemsLengthRef.current = currentLength;
  }, [displayList.length]);

  const handleCardPressIn = (id: string) => {
    const anim = cardAnimations.current.get(id);
    if (anim) {
      Animated.timing(anim.scale, {
        toValue: 0.97,
        duration: 150,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    }
  };

  const handleCardPressOut = (id: string) => {
    const anim = cardAnimations.current.get(id);
    if (anim) {
      Animated.timing(anim.scale, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  };

  const renderEntryCard = (entry: Entry, loadMedia: boolean, priority: ImagePriority) => {
    const photoUri = getEntryGalleryPhotoUri(entry);

    let anim = cardAnimations.current.get(entry.id);
    if (!anim) {
      anim = {
        opacity: new Animated.Value(1),
        translateY: new Animated.Value(0),
        scale: new Animated.Value(1),
      };
      cardAnimations.current.set(entry.id, anim);
    }

    const isBookmarked = entry.isBookmarked === true;
    const aspectRatio = getGalleryAspectRatio(entry);
    const a11yLabel = entry.title
      ? `${isBookmarked ? 'Bookmarked experience, ' : ''}${entry.title}`
      : isBookmarked ? 'Bookmarked experience' : 'Experience';

    return (
      <Animated.View
        key={entry.id}
        style={[
          { width: cardWidth, marginHorizontal: 4 },
          {
            opacity: anim.opacity,
            transform: [{ translateY: anim.translateY }, { scale: anim.scale }],
          },
        ]}
      >
        <TouchableOpacity
          style={styles.card}
          onPress={() => onEntryPress(entry)}
          onPressIn={() => handleCardPressIn(entry.id)}
          onPressOut={() => handleCardPressOut(entry.id)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={a11yLabel}
        >
          <View style={[styles.mediaContainer, { aspectRatio, backgroundColor: colors.surface }]}>
            {entry.mediaType === 'photo' && entry.photoPaths?.length > 0 ? (
              loadMedia && photoUri ? (
                <EntryPhotoImage
                  uri={photoUri}
                  style={styles.mediaImage}
                  resizeMode="cover"
                  fallbackBackgroundColor={colors.stone600}
                  priority={priority}
                />
              ) : (
                <View style={[styles.mediaImage, { backgroundColor: colors.surface }]} />
              )
            ) : entry.mediaType === 'video' ? (
              <View style={[styles.placeholder, { backgroundColor: colors.surface }]}>
                <Text style={styles.placeholderIcon}>🎥</Text>
                <Text style={[styles.placeholderLabel, { color: colors.textPrimary }]}>Video</Text>
              </View>
            ) : entry.mediaType === 'audio' ? (
              <View style={[styles.placeholder, { backgroundColor: colors.surface }]}>
                <Text style={styles.placeholderIcon}>🎵</Text>
                <Text style={[styles.placeholderLabel, { color: colors.textPrimary }]}>Audio</Text>
              </View>
            ) : (
              <View style={[styles.placeholder, { backgroundColor: colors.surface }]}>
                <Text style={styles.placeholderIcon}>📷</Text>
              </View>
            )}
          </View>
          {entry.title ? (
            entry.isBookmarked ? (
              <GradientText style={styles.cardTitle}>{entry.title}</GradientText>
            ) : (
              <Text
                style={[styles.cardTitle, { color: colors.textPrimary }]}
                numberOfLines={2}
              >
                {entry.title}
              </Text>
            )
          ) : null}
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const EMPTY_STATE_COPY: Record<MemoriesFilter, { message: string; subtext: string }> = {
    experiences: {
      message: 'No experiences yet',
      subtext: 'Capture or add experiences to see them in the gallery',
    },
    photos: {
      message: 'No photos yet',
      subtext: 'Capture experiences with photos to see them here',
    },
    notes: {
      message: 'No notes yet',
      subtext: 'Write a journal entry to see it here',
    },
    postcards: {
      message: 'No postcards yet',
      subtext: 'Create a postcard from the Studio to see it here',
    },
    bookmarks: {
      message: 'No bookmarks yet',
      subtext: 'Bookmark experiences from the home or edit screen to see them here',
    },
  };
  const { message: emptyMessage, subtext: emptySubtext } = EMPTY_STATE_COPY[activeFilter];

  const renderGalleryFilterRow = () => (
    <View
      onLayout={(e) => {
        const h = e.nativeEvent.layout.height;
        if (h > 0 && Math.abs(h - filterRowHeight) > 1) setFilterRowHeight(h);
      }}
    >
      <View style={styles.searchBarRow}>
        <View style={[styles.searchBarInputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search" size={16} color={colors.textSecondary} style={styles.searchBarIcon} />
          <TextInput
            ref={searchInputRef}
            style={[styles.searchBarInput, { color: colors.textPrimary }]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => setSearchActive(true)}
            placeholder="Search title, place, date, season..."
            placeholderTextColor={colors.textSecondary}
            returnKeyType="search"
            clearButtonMode="while-editing"
            accessibilityLabel="Search memories"
          />
        </View>
        {searchActive ? (
          <TouchableOpacity
            onPress={handleCloseSearch}
            style={styles.searchCancelButton}
            accessibilityRole="button"
            accessibilityLabel="Cancel search"
          >
            <Text style={[styles.searchCancelText, { color: colors.textPrimary }]}>Cancel</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {tripFilterAvailable && onTripFilterToggle ? (
          <TouchableOpacity
            style={[
              styles.filterChip,
              tripFilterActive
                ? [styles.filterChipActive, { backgroundColor: colors.textPrimary }]
                : { backgroundColor: colors.surface },
            ]}
            onPress={() => handleFilterTabPress(onTripFilterToggle)}
            accessibilityRole="button"
            accessibilityLabel={
              tripFilterActive ? 'Trip filter on, tap to show all' : 'Trip filter off, tap to filter by trip'
            }
            accessibilityState={{ selected: tripFilterActive }}
          >
            <Text
              style={[
                styles.filterButtonText,
                { color: tripFilterActive ? colors.background : colors.textSecondary },
                tripFilterActive && styles.filterButtonTextActive,
              ]}
              numberOfLines={1}
            >
              This Trip
            </Text>
          </TouchableOpacity>
        ) : null}
        {MEMORIES_FILTERS.map((filter) => {
          const isActive = !searchActive && activeFilter === filter.key;
          return (
            <TouchableOpacity
              key={filter.key}
              style={[
                styles.filterChip,
                isActive
                  ? [styles.filterChipActive, { backgroundColor: colors.textPrimary }]
                  : { backgroundColor: colors.surface },
              ]}
              onPress={() => handleFilterTabPress(() => setActiveFilter(filter.key))}
              accessibilityRole="button"
              accessibilityLabel={`Show ${filter.label.toLowerCase()}`}
              accessibilityState={{ selected: isActive }}
            >
              <Text
                style={[
                  styles.filterButtonText,
                  { color: isActive ? colors.background : colors.textSecondary },
                  isActive && styles.filterButtonTextActive,
                ]}
                numberOfLines={1}
              >
                {filter.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  const ListEmptyComponent = () => (
    <View style={styles.emptyStateInner}>
      <Text style={[styles.emptyStateText, { color: colors.textPrimary }]}>{emptyMessage}</Text>
      <Text style={[styles.emptyStateSubtext, { color: colors.textSecondary }]}>{emptySubtext}</Text>
    </View>
  );

  const photoCellSize =
    (screenWidth - edgePadding * 2 - PHOTO_GRID_GAP * (PHOTO_GRID_COLUMNS - 1)) / PHOTO_GRID_COLUMNS;

  const postcardCellSize =
    (screenWidth - edgePadding * 2 - POSTCARD_GRID_GAP * (POSTCARD_GRID_COLUMNS - 1)) / POSTCARD_GRID_COLUMNS;

  const renderPhotoGridItem = (item: PhotoGridItem, index: number) => {
    const priority = index < 9 ? 'high' : index < 18 ? 'normal' : 'low';
    return (
      <TouchableOpacity
        key={item.key}
        style={{ width: photoCellSize, height: photoCellSize }}
        onPress={() => onEntryPress(item.entry)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={item.entry.title ? `Photo from ${item.entry.title}` : 'Photo'}
      >
        <EntryPhotoImage
          uri={item.uri}
          style={styles.photoGridImage}
          resizeMode="cover"
          fallbackBackgroundColor={colors.surface}
          priority={priority}
        />
      </TouchableOpacity>
    );
  };

  const renderPostcardGridItem = (postcard: Postcard) => (
    <TouchableOpacity
      key={postcard.id}
      style={[styles.postcardCell, { width: postcardCellSize }]}
      onPress={() => onPostcardPress?.(postcard)}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`Open postcard: ${postcard.label1 || 'Untitled'}`}
    >
      <PostcardThumbnail postcard={postcard} width={postcardCellSize} />
    </TouchableOpacity>
  );

  const renderNoteCard = (journal: Journal) => {
    const date = new Date(journal.timestamp);
    const formattedDate =
      date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }) + '.';
    const locationText =
      journal.city || journal.country
        ? [journal.city, journal.country].filter(Boolean).join(', ')
        : journal.latitude != null && journal.longitude != null
          ? `${journal.latitude.toFixed(4)}, ${journal.longitude.toFixed(4)}`
          : 'Unknown location';
    const previewText =
      journal.content.length > 220 ? journal.content.substring(0, 220) + '...' : journal.content;

    return (
      <TouchableOpacity
        key={journal.id}
        style={[styles.noteCard, { backgroundColor: colors.surface }]}
        onPress={() => onJournalPress?.(journal)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`Journal entry, ${formattedDate}`}
      >
        <Text style={[styles.journalDate, { color: colors.textPrimary }]}>{formattedDate}</Text>
        <Text style={[styles.journalLocation, { color: colors.textSecondary }]}>{locationText}</Text>
        <Text style={[styles.journalText, { color: colors.textPrimary }]} numberOfLines={6}>
          {previewText}
        </Text>
      </TouchableOpacity>
    );
  };

  const accessibilityLabelByFilter: Record<MemoriesFilter, string> = {
    experiences: 'Gallery, showing experiences',
    photos: 'Gallery, showing photos',
    notes: 'Gallery, showing notes',
    postcards: 'Gallery, showing postcards',
    bookmarks: 'Gallery, bookmarks only',
  };

  const renderSearchResults = () => {
    if (!debouncedSearchQuery) {
      return (
        <View style={styles.emptyStateInner}>
          <Text style={[styles.emptyStateText, { color: colors.textPrimary }]}>Search your memories</Text>
          <Text style={[styles.emptyStateSubtext, { color: colors.textSecondary }]}>
            Try a title, city, weather, season, or date
          </Text>
        </View>
      );
    }

    const hasResults = searchEntryResults.length > 0 || searchJournalResults.length > 0;
    if (!hasResults) {
      return (
        <View style={styles.emptyStateInner}>
          <Text style={[styles.emptyStateText, { color: colors.textPrimary }]}>
            No results for "{searchQuery.trim()}"
          </Text>
          <Text style={[styles.emptyStateSubtext, { color: colors.textSecondary }]}>
            Try a different title, city, weather, season, or date
          </Text>
        </View>
      );
    }

    return (
      <View>
        {searchEntryResults.length > 0 ? (
          <View>
            <Text style={[styles.searchSectionHeader, { color: colors.textSecondary }]}>
              EXPERIENCES ({searchEntryResults.length})
            </Text>
            <View style={styles.columnsContainer}>
              <View style={[styles.column, { width: columnWidth }]}>
                {searchMasonryLayout.left.map(({ item, globalIndex }) => (
                  <React.Fragment key={item.id}>
                    {renderEntryCard(
                      item,
                      searchIsMediaActive(globalIndex),
                      searchGetPriorityForUri(getEntryPhotoPriorityKey(item))
                    )}
                  </React.Fragment>
                ))}
              </View>
              <View style={[styles.column, { width: columnWidth }]}>
                {searchMasonryLayout.right.map(({ item, globalIndex }) => (
                  <React.Fragment key={item.id}>
                    {renderEntryCard(
                      item,
                      searchIsMediaActive(globalIndex),
                      searchGetPriorityForUri(getEntryPhotoPriorityKey(item))
                    )}
                  </React.Fragment>
                ))}
              </View>
            </View>
          </View>
        ) : null}
        {searchJournalResults.length > 0 ? (
          <View>
            <Text style={[styles.searchSectionHeader, { color: colors.textSecondary }]}>
              NOTES ({searchJournalResults.length})
            </Text>
            <View style={{ paddingHorizontal: edgePadding }}>
              {searchJournalResults.map((journal) => renderNoteCard(journal))}
            </View>
          </View>
        ) : null}
      </View>
    );
  };

  const renderContent = () => {
    if (searchActive) return renderSearchResults();

    if (activeFilter === 'photos') {
      if (photoGridItems.length === 0) return <ListEmptyComponent />;
      return (
        <View style={[styles.photoGrid, { paddingHorizontal: edgePadding, gap: PHOTO_GRID_GAP }]}>
          {photoGridItems.map((item, index) => renderPhotoGridItem(item, index))}
        </View>
      );
    }

    if (activeFilter === 'notes') {
      if (notesList.length === 0) return <ListEmptyComponent />;
      return (
        <View style={{ paddingHorizontal: edgePadding }}>
          {notesList.map((journal) => renderNoteCard(journal))}
        </View>
      );
    }

    if (activeFilter === 'postcards') {
      if (postcardsList.length === 0) return <ListEmptyComponent />;
      return (
        <View style={[styles.postcardGrid, { paddingHorizontal: edgePadding, gap: POSTCARD_GRID_GAP }]}>
          {postcardsList.map((postcard) => renderPostcardGridItem(postcard))}
        </View>
      );
    }

    if (displayList.length === 0) return <ListEmptyComponent />;
    return (
      <View style={styles.columnsContainer}>
        <View style={[styles.column, { width: columnWidth }]}>
          {masonryLayout.left.map(({ item, globalIndex }) => (
            <React.Fragment key={item.id}>
              {renderEntryCard(item, isMediaActive(globalIndex), getPriorityForUri(getEntryPhotoPriorityKey(item)))}
            </React.Fragment>
          ))}
        </View>
        <View style={[styles.column, { width: columnWidth }]}>
          {masonryLayout.right.map(({ item, globalIndex }) => (
            <React.Fragment key={item.id}>
              {renderEntryCard(item, isMediaActive(globalIndex), getPriorityForUri(getEntryPhotoPriorityKey(item)))}
            </React.Fragment>
          ))}
        </View>
      </View>
    );
  };

  const activeWrapOnScroll = searchActive ? searchWrapOnScroll : wrapOnScroll;
  const accessibilityLabel = searchActive
    ? debouncedSearchQuery
      ? `Gallery, search results for ${debouncedSearchQuery}`
      : 'Gallery, search'
    : accessibilityLabelByFilter[activeFilter];

  return (
    <ScrollView
      ref={scrollViewRef}
      contentContainerStyle={{
        paddingBottom: getEffectiveMainTabInset(insets.bottom, tabBarVisibilityProgress) + SPACING.md,
      }}
      onScroll={activeWrapOnScroll(onScrollReport)}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
      accessibilityLabel={accessibilityLabel}
    >
      {renderGalleryFilterRow()}
      {renderContent()}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  columnsContainer: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  column: {},
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.xs,
    gap: SPACING.sm,
  },
  filterChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  filterButtonText: {
    ...TEXT_STYLES.entryInput,
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  filterButtonTextActive: {
    fontWeight: FONT_WEIGHTS.bold,
  },
  searchBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.xs,
    gap: SPACING.sm,
  },
  searchBarInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SPACING.md,
  },
  searchBarIcon: {
    marginRight: SPACING.xs,
  },
  searchBarInput: {
    flex: 1,
    ...TEXT_STYLES.entryInput,
    fontSize: 15,
    paddingVertical: 10,
  },
  searchCancelButton: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xs,
  },
  searchCancelText: {
    ...TEXT_STYLES.entryInput,
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  searchSectionHeader: {
    ...TEXT_STYLES.entryInput,
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.semibold,
    letterSpacing: 0.5,
    paddingHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  photoGridImage: {
    width: '100%',
    height: '100%',
    borderRadius: 4,
  },
  postcardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  postcardCell: {
    marginBottom: POSTCARD_GRID_GAP,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 6,
  },
  noteCard: {
    marginBottom: GALLERY_CARD_MARGIN_BOTTOM,
    borderRadius: DIMENSIONS.cardBorderRadius,
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 4.2,
    elevation: 6,
    overflow: 'hidden',
    padding: 16,
  },
  journalDate: {
    fontSize: 13,
    fontFamily: FONTS.playfairDisplay,
    fontStyle: 'italic',
    marginBottom: 4,
  },
  journalLocation: {
    fontSize: 11,
    fontFamily: FONTS.playfairDisplay,
    fontStyle: 'italic',
    marginBottom: 8,
  },
  journalText: {
    fontSize: 15,
    fontFamily: FONTS.playfairDisplay,
    fontStyle: 'italic',
    lineHeight: 22,
  },
  card: {
    marginBottom: GALLERY_CARD_MARGIN_BOTTOM,
    backgroundColor: 'transparent',
    borderRadius: DIMENSIONS.cardBorderRadius,
    overflow: 'visible',
  },
  mediaContainer: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  mediaImage: {
    width: '100%',
    height: '100%',
    borderRadius: DIMENSIONS.cardBorderRadius,
  },
  placeholder: {
    width: '100%',
    height: '100%',
    borderRadius: DIMENSIONS.cardBorderRadius,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderIcon: {
    fontSize: 32,
    marginBottom: SPACING.xs,
  },
  placeholderLabel: {
    fontFamily: TEXT_STYLES.entryLabel.fontFamily,
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  cardTitle: {
    fontFamily: TEXT_STYLES.cardTitle.fontFamily,
    fontSize: 12,
    fontWeight: '600',
    padding: 0,
    marginTop: 6,
    marginLeft: 4,
    backgroundColor: 'transparent',
  },
  emptyStateInner: {
    paddingTop: 80,
    alignItems: 'center',
    paddingHorizontal: SPACING.xxl,
  },
  emptyStateText: {
    ...TEXT_STYLES.entryInput,
    fontSize: 20,
    marginBottom: SPACING.sm,
  },
  emptyStateSubtext: {
    ...TEXT_STYLES.placeholderText,
    textAlign: 'center',
  },
});

export default BookmarksSection;
