// AllSection
// Grid view section for Review screen - reuses HomeScreen grid logic with randomization

import React, { useMemo, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Dimensions, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Entry } from '../../models/Entry';
import { Journal } from '../../models/Journal';
import MoreIcon from '../common/icons/MoreIcon';
import GradientText from '../common/GradientText';
import { DIMENSIONS, SPACING, FONT_WEIGHTS, FONTS } from '../../config/constants';
import { getMainTabScrollContentPaddingBottom } from '../../navigation/mainTabBarMetrics';
import { TEXT_STYLES } from '../../config/typography';
import { useTheme } from '../../context/ThemeContext';
import { EntryPhotoImage } from '../common/EntryPhotoImage';
import { ANIMATION_CONFIG, createStaggeredDelay } from '../../utils/animations';

type FeedItem =
  | { type: 'entry'; data: Entry }
  | { type: 'journal'; data: Journal };

interface AllSectionProps {
  entries: Entry[];
  journals: Journal[];
  onEntryPress: (entry: Entry) => void;
  onJournalPress: (journal: Journal) => void;
  scrollRef?: React.RefObject<ScrollView | null>;
}

const AllSection: React.FC<AllSectionProps> = ({ entries, journals, onEntryPress, onJournalPress, scrollRef }) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const sessionSeedRef = useRef<string | null>(null);

  // Animation refs for cards
  const cardAnimations = useRef<Map<string, { opacity: Animated.Value; translateY: Animated.Value; scale: Animated.Value }>>(new Map());
  const previousItemsLengthRef = useRef(0);

  // Responsive dimensions - Pinterest-like spacing
  const screenWidth = Dimensions.get('window').width;
  // Use consistent edge padding (SPACING.md = 16px)
  const edgePadding = SPACING.md; // 16px on each side
  // Card width calculation: (screenWidth - leftPadding - rightPadding - columnGap) / 2
  // Column gap is 8px (4px margin on each card)
  const cardWidth = (screenWidth - (edgePadding * 2) - 8) / 2;

  // Generate session seed once on mount
  useEffect(() => {
    if (!sessionSeedRef.current) {
      sessionSeedRef.current = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    }
  }, []);

  // Combine entries and journals into unified feed
  const feedItems = useMemo<FeedItem[]>(() => {
    const entryItems: FeedItem[] = entries.map(entry => ({
      type: 'entry' as const,
      data: entry
    }));

    const journalItems: FeedItem[] = journals.map(journal => ({
      type: 'journal' as const,
      data: journal
    }));

    return [...entryItems, ...journalItems];
  }, [entries, journals]);

  // Seeded random number generator
  const seededRandom = (seed: string): number => {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      const char = seed.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash) / 2147483647;
  };

  // Get aspect ratio for an entry using session seed
  const getAspectRatio = (entry: Entry, sessionSeed: string): number => {
    const combinedSeed = `${entry.id}-${sessionSeed}`;
    const seed = combinedSeed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const randomFactor = (seed % 100) / 100;
    return 0.75 + (randomFactor * 0.9);
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        scrollView: { flex: 1 },
        scrollContent: {
          paddingBottom: getMainTabScrollContentPaddingBottom(insets.bottom, SPACING.md),
        },
        pinterestGrid: {
          width: '100%',
          paddingHorizontal: SPACING.md,
          alignSelf: 'center',
          marginTop: 0,
        },
        pinterestColumnsContainer: {
          flexDirection: 'row',
          width: '100%',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        },
        pinterestColumn: {},
        pinterestCard: {
          marginBottom: 12,
          backgroundColor: 'transparent',
          borderRadius: DIMENSIONS.cardBorderRadius,
          overflow: 'visible',
        },
        pinterestMediaContainer: {
          width: '100%',
          borderRadius: 16,
          overflow: 'hidden',
          backgroundColor: colors.surface,
        },
        pinterestImage: { width: '100%', height: '100%', borderRadius: DIMENSIONS.cardBorderRadius },
        pinterestVideoPlaceholder: {
          width: '100%',
          height: '100%',
          backgroundColor: colors.surface,
          borderRadius: DIMENSIONS.cardBorderRadius,
          justifyContent: 'center',
          alignItems: 'center',
        },
        pinterestAudioPlaceholder: {
          width: '100%',
          height: '100%',
          backgroundColor: colors.surface,
          borderRadius: DIMENSIONS.cardBorderRadius,
          justifyContent: 'center',
          alignItems: 'center',
        },
        pinterestPlaceholder: {
          width: '100%',
          height: '100%',
          backgroundColor: colors.stone600,
          borderRadius: DIMENSIONS.cardBorderRadius,
          justifyContent: 'center',
          alignItems: 'center',
        },
        pinterestMediaIcon: { fontSize: 32, marginBottom: SPACING.xs },
        pinterestMediaLabel: {
          fontFamily: TEXT_STYLES.entryLabel.fontFamily,
          fontSize: 12,
          fontWeight: FONT_WEIGHTS.semibold,
          color: colors.textPrimary,
        },
        pinterestTitle: {
          fontFamily: TEXT_STYLES.cardTitle.fontFamily,
          fontSize: 12,
          fontWeight: '600',
          color: colors.textPrimary,
          padding: 0,
          marginTop: 6,
          marginLeft: 4,
          backgroundColor: 'transparent',
        },
        journalCard: {
          marginBottom: 12,
          borderRadius: DIMENSIONS.cardBorderRadius,
          backgroundColor: colors.surface,
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
          color: colors.textPrimary,
          fontFamily: FONTS.playfairDisplay,
          fontStyle: 'italic',
          marginBottom: 4,
        },
        journalLocation: {
          fontSize: 11,
          color: colors.textSecondary,
          fontFamily: FONTS.playfairDisplay,
          fontStyle: 'italic',
          marginBottom: 8,
        },
        journalText: {
          fontSize: 15,
          color: colors.textPrimary,
          fontFamily: FONTS.playfairDisplay,
          fontStyle: 'italic',
          lineHeight: 22,
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
          color: colors.textPrimary,
        },
        emptyStateSubtext: {
          ...TEXT_STYLES.placeholderText,
          textAlign: 'center',
          color: colors.textSecondary,
        },
      }),
    [colors, insets.bottom]
  );

  // Shuffle feed items using session seed
  const shuffledItems = useMemo(() => {
    if (!sessionSeedRef.current || feedItems.length === 0) return feedItems;

    const shuffled = [...feedItems];
    const seed = sessionSeedRef.current;

    // Fisher-Yates shuffle with seeded random
    for (let i = shuffled.length - 1; i > 0; i--) {
      const randomValue = seededRandom(`${seed}-${i}`);
      const j = Math.floor(randomValue * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled;
  }, [feedItems, sessionSeedRef.current]);

  // Distribute items into two columns
  const distributeItemsIntoColumns = (items: FeedItem[], cardWidth: number, sessionSeed: string) => {
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
  };

  // Initialize animations for existing items on mount
  useEffect(() => {
    feedItems.forEach((item) => {
      const id = item.type === 'entry' ? item.data.id : item.data.id;
      if (!cardAnimations.current.has(id)) {
        const opacity = new Animated.Value(1);
        const translateY = new Animated.Value(0);
        const scale = new Animated.Value(1);
        cardAnimations.current.set(id, { opacity, translateY, scale });
      }
    });
  }, []);

  // Animate new items when array changes
  useEffect(() => {
    const currentLength = feedItems.length;
    const previousLength = previousItemsLengthRef.current;

    if (currentLength > previousLength) {
      const newItems = feedItems.slice(previousLength);
      newItems.forEach((item, index) => {
        const id = item.type === 'entry' ? item.data.id : item.data.id;
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

    previousItemsLengthRef.current = currentLength;
  }, [feedItems.length]);

  // Card press feedback handlers
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

  // Render entry card
  const renderEntryCard = (entry: Entry, sessionSeed: string) => {
    const aspectRatio = getAspectRatio(entry, sessionSeed);

    let anim = cardAnimations.current.get(entry.id);
    if (!anim) {
      const opacity = new Animated.Value(1);
      const translateY = new Animated.Value(0);
      const scale = new Animated.Value(1);
      anim = { opacity, translateY, scale };
      cardAnimations.current.set(entry.id, anim);
    }

    return (
      <Animated.View
        key={entry.id}
        style={[
          {
            width: cardWidth,
            marginHorizontal: 4,
          },
          {
            opacity: anim.opacity,
            transform: [
              { translateY: anim.translateY },
              { scale: anim.scale },
            ],
          },
        ]}
      >
        <TouchableOpacity
          style={styles.pinterestCard}
          onPress={() => onEntryPress(entry)}
          onPressIn={() => handleCardPressIn(entry.id)}
          onPressOut={() => handleCardPressOut(entry.id)}
          activeOpacity={0.8}
        >
          <View style={[
            styles.pinterestMediaContainer,
            { aspectRatio },
          ]}>

            {entry.mediaType === 'photo' && entry.photoPaths && entry.photoPaths.length > 0 ? (
              <EntryPhotoImage
                uri={entry.photoPaths[0]}
                style={styles.pinterestImage}
                resizeMode="cover"
                fallbackBackgroundColor={colors.surface}
              />
            ) : entry.mediaType === 'video' ? (
              <View style={styles.pinterestVideoPlaceholder}>
                <Text style={styles.pinterestMediaIcon}>🎥</Text>
                <Text style={styles.pinterestMediaLabel}>Video</Text>
              </View>
            ) : entry.mediaType === 'audio' ? (
              <View style={styles.pinterestAudioPlaceholder}>
                <Text style={styles.pinterestMediaIcon}>🎵</Text>
                <Text style={styles.pinterestMediaLabel}>Audio</Text>
              </View>
            ) : (
              <View style={styles.pinterestPlaceholder}>
                <Text style={styles.pinterestMediaIcon}>📷</Text>
              </View>
            )}
          </View>

          {entry.title ? (
            entry.isAwe ? (
              <GradientText style={styles.pinterestTitle}>
                {entry.title}
              </GradientText>
            ) : (
              <Text style={styles.pinterestTitle} numberOfLines={2}>
                {entry.title}
              </Text>
            )
          ) : null}
        </TouchableOpacity>
      </Animated.View>
    );
  };

  // Render journal card
  const renderJournalCard = (journal: Journal, sessionSeed: string) => {
    const cardHeight = 180;

    let anim = cardAnimations.current.get(journal.id);
    if (!anim) {
      const opacity = new Animated.Value(1);
      const translateY = new Animated.Value(0);
      const scale = new Animated.Value(1);
      anim = { opacity, translateY, scale };
      cardAnimations.current.set(journal.id, anim);
    }

    const date = new Date(journal.timestamp);
    const formattedDate = date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }) + '.';

    const locationText = journal.latitude && journal.longitude
      ? `${journal.latitude.toFixed(4)}, ${journal.longitude.toFixed(4)}`
      : 'Unknown location';

    const previewText = journal.content.length > 150
      ? journal.content.substring(0, 150) + '...'
      : journal.content;

    return (
      <Animated.View
        key={journal.id}
        style={[
          {
            width: cardWidth,
            marginHorizontal: 4,
          },
          {
            opacity: anim.opacity,
            transform: [
              { translateY: anim.translateY },
              { scale: anim.scale },
            ],
          },
        ]}
      >
        <TouchableOpacity
          style={[styles.journalCard, { height: cardHeight }]}
          onPress={() => onJournalPress(journal)}
          onPressIn={() => handleCardPressIn(journal.id)}
          onPressOut={() => handleCardPressOut(journal.id)}
          activeOpacity={0.8}
        >
          <Text style={styles.journalDate}>{formattedDate}</Text>
          <Text style={styles.journalLocation}>{locationText}</Text>
          <Text style={styles.journalText} numberOfLines={4}>
            {previewText}
          </Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  // Render card function
  const renderCard = (item: FeedItem, sessionSeed: string) => {
    if (item.type === 'entry') {
      return renderEntryCard(item.data, sessionSeed);
    } else {
      return renderJournalCard(item.data, sessionSeed);
    }
  };

  // Empty state
  if (feedItems.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyStateText}>No entries yet</Text>
        <Text style={styles.emptyStateSubtext}>
          Start capturing your journey to see it here
        </Text>
      </View>
    );
  }

  const sessionSeed = sessionSeedRef.current || '';
  const { leftColumn, rightColumn } = distributeItemsIntoColumns(shuffledItems, cardWidth, sessionSeed);

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.scrollView}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.pinterestGrid}>
        <View style={styles.pinterestColumnsContainer}>
          <View style={[styles.pinterestColumn, { width: cardWidth + 8 }]}>
            {leftColumn.map((item) => {
              const key = item.type === 'entry' ? `entry-${item.data.id}` : `journal-${item.data.id}`;
              return <React.Fragment key={key}>{renderCard(item, sessionSeed)}</React.Fragment>;
            })}
          </View>

          <View style={[styles.pinterestColumn, { width: cardWidth + 8 }]}>
            {rightColumn.map((item) => {
              const key = item.type === 'entry' ? `entry-${item.data.id}` : `journal-${item.data.id}`;
              return <React.Fragment key={key}>{renderCard(item, sessionSeed)}</React.Fragment>;
            })}
          </View>
        </View>
      </View>
    </ScrollView>
  );
};

export default AllSection;
