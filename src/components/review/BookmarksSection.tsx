// BookmarksSection (Gallery view)
// Review screen gallery: most recent at top, optional "Bookmarks" filter

import React, { useMemo, useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Dimensions, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Entry } from '../../models/Entry';
import GradientText from '../common/GradientText';
import { DIMENSIONS, SPACING, FONT_WEIGHTS } from '../../config/constants';
import { getEffectiveMainTabInset } from '../../navigation/mainTabBarMetrics';
import { TEXT_STYLES } from '../../config/typography';
import { ANIMATION_CONFIG, createStaggeredDelay } from '../../utils/animations';
import { useTheme } from '../../context/ThemeContext';
import { EntryPhotoImage } from '../common/EntryPhotoImage';

const CARD_ASPECT_RATIO = 0.85;

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

interface BookmarksSectionProps {
  entries: Entry[];
  onEntryPress: (entry: Entry) => void;
  /** Optional ref for scroll-to-top when Review tab is tapped */
  scrollRef?: React.RefObject<ScrollView | null>;
  /** When true, "This Trip" appears on the same row as All / Bookmarks (Review gallery + travel mode). */
  tripFilterAvailable?: boolean;
  tripFilterActive?: boolean;
  onTripFilterToggle?: () => void;
  onScrollReport?: (offsetY: number) => void;
  tabBarVisibilityProgress?: number;
}

const BookmarksSection: React.FC<BookmarksSectionProps> = ({
  entries,
  onEntryPress,
  scrollRef: externalScrollRef,
  tripFilterAvailable = false,
  tripFilterActive = false,
  onTripFilterToggle,
  onScrollReport,
  tabBarVisibilityProgress = 1,
}) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [showOnlyBookmarks, setShowOnlyBookmarks] = useState(false);
  const internalScrollRef = useRef<ScrollView>(null);
  const scrollRef = externalScrollRef ?? internalScrollRef;

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [showOnlyBookmarks]);
  const cardAnimations = useRef<Map<string, { opacity: Animated.Value; translateY: Animated.Value; scale: Animated.Value }>>(new Map());
  const previousItemsLengthRef = useRef(0);

  const screenWidth = Dimensions.get('window').width;
  const edgePadding = SPACING.md;
  const cardWidth = (screenWidth - (edgePadding * 2) - 8) / 2;

  const displayList = useMemo(() => {
    const list = entries ?? [];
    const filtered = showOnlyBookmarks ? list.filter((e) => e.isAwe === true) : list;
    return [...filtered].sort((a, b) => safeTimestamp(b) - safeTimestamp(a));
  }, [entries, showOnlyBookmarks]);

  const leftColumn = useMemo(() => displayList.filter((_, i) => i % 2 === 0), [displayList]);
  const rightColumn = useMemo(() => displayList.filter((_, i) => i % 2 === 1), [displayList]);

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
  }, [displayList.length]);

  useEffect(() => {
    const currentLength = displayList.length;
    const previousLength = previousItemsLengthRef.current;
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

  const renderEntryCard = (entry: Entry) => {
    let anim = cardAnimations.current.get(entry.id);
    if (!anim) {
      anim = {
        opacity: new Animated.Value(1),
        translateY: new Animated.Value(0),
        scale: new Animated.Value(1),
      };
      cardAnimations.current.set(entry.id, anim);
    }

    const isBookmarked = entry.isAwe === true;
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
          <View style={[styles.mediaContainer, { width: cardWidth, height: cardWidth / CARD_ASPECT_RATIO, backgroundColor: colors.surface }]}>
            {entry.mediaType === 'photo' && entry.photoPaths?.length > 0 ? (
              <EntryPhotoImage
                uri={entry.photoPaths[0]}
                style={styles.mediaImage}
                resizeMode="cover"
                fallbackBackgroundColor={colors.surface}
              />
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
            entry.isAwe ? (
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

  const emptyMessage = showOnlyBookmarks
    ? 'No bookmarks yet'
    : 'No experiences yet';
  const emptySubtext = showOnlyBookmarks
    ? 'Bookmark experiences from the home or edit screen to see them here'
    : 'Capture or add experiences to see them in the gallery';

  const renderGalleryFilterRow = () => (
    <View style={styles.filterRow}>
      <TouchableOpacity
        style={[
          styles.filterButton,
          { backgroundColor: colors.surface },
          showOnlyBookmarks && { opacity: 0.7 },
          styles.filterButtonFlex,
        ]}
        onPress={() => setShowOnlyBookmarks(false)}
        accessibilityRole="button"
        accessibilityLabel="Show all experiences"
        accessibilityState={{ selected: !showOnlyBookmarks }}
      >
        <Text style={[styles.filterButtonText, { color: colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>
          All
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.filterButton,
          { backgroundColor: colors.surface },
          !showOnlyBookmarks && { opacity: 0.7 },
          styles.filterButtonFlex,
        ]}
        onPress={() => setShowOnlyBookmarks(true)}
        accessibilityRole="button"
        accessibilityLabel="Show bookmarks only"
        accessibilityState={{ selected: showOnlyBookmarks }}
      >
        <Text style={[styles.filterButtonText, { color: colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>
          Bookmarks
        </Text>
      </TouchableOpacity>
      {tripFilterAvailable && onTripFilterToggle ? (
        <TouchableOpacity
          style={[
            styles.filterButton,
            { backgroundColor: colors.surface },
            !tripFilterActive && { opacity: 0.7 },
            styles.filterButtonFlex,
          ]}
          onPress={onTripFilterToggle}
          accessibilityRole="button"
          accessibilityLabel={
            tripFilterActive ? 'Trip filter on, tap to show all' : 'Trip filter off, tap to filter by trip'
          }
          accessibilityState={{ selected: tripFilterActive }}
        >
          <Text style={[styles.filterButtonText, { color: colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>
            {tripFilterActive ? 'This Trip ✓' : 'This Trip'}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  if (displayList.length === 0) {
    return (
      <View style={styles.emptyState}>
        {renderGalleryFilterRow()}
        <Text style={[styles.emptyStateText, { color: colors.textPrimary }]}>{emptyMessage}</Text>
        <Text style={[styles.emptyStateSubtext, { color: colors.textSecondary }]}>{emptySubtext}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.scrollView}
      contentContainerStyle={{
        paddingBottom: getEffectiveMainTabInset(insets.bottom, tabBarVisibilityProgress) + SPACING.md,
      }}
      showsVerticalScrollIndicator={false}
      accessibilityLabel={showOnlyBookmarks ? 'Gallery, bookmarks only' : 'Gallery, showing all'}
      onScroll={(e) => onScrollReport?.(e.nativeEvent.contentOffset.y)}
      scrollEventThrottle={16}
    >
      {renderGalleryFilterRow()}
      <View style={styles.grid}>
        <View style={[styles.column, { width: cardWidth + 8 }]}>
          {leftColumn.map((entry) => renderEntryCard(entry))}
        </View>
        <View style={[styles.column, { width: cardWidth + 8 }]}>
          {rightColumn.map((entry) => renderEntryCard(entry))}
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.xs,
    gap: SPACING.sm,
  },
  filterButton: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
  },
  filterButtonFlex: {
    flex: 1,
  },
  filterButtonText: {
    ...TEXT_STYLES.entryInput,
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  grid: {
    flexDirection: 'row',
    width: '100%',
    paddingHorizontal: SPACING.md,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  column: {},
  card: {
    marginBottom: 12,
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
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xxl,
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
