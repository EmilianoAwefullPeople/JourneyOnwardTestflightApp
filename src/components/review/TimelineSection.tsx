// TimelineSection
// Horizontal scrollable timeline view with cards in chronological order (oldest left, newest right)

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, Animated } from 'react-native';
import { Entry } from '../../models/Entry';
import { Journal } from '../../models/Journal';
import { DIMENSIONS, SPACING, FONT_WEIGHTS, FONTS } from '../../config/constants';
import { TEXT_STYLES } from '../../config/typography';
import { useTheme } from '../../context/ThemeContext';
import { EntryPhotoImage } from '../common/EntryPhotoImage';
import { formatEntryDate, formatTemperature } from '../../utils/dateUtils';
import { logger } from '../../utils/logger';

type TimelineItem = 
  | { type: 'entry'; data: Entry }
  | { type: 'journal'; data: Journal };

interface TimelineSectionProps {
  entries: Entry[];
  journals: Journal[];
  onEntryPress: (entry: Entry) => void;
  onJournalPress: (journal: Journal) => void;
  /** Optional ref for scroll-to-top/start when Review tab is tapped */
  scrollRef?: React.RefObject<ScrollView | null>;
}

const TimelineSection: React.FC<TimelineSectionProps> = ({ 
  entries, 
  journals, 
  onEntryPress, 
  onJournalPress,
  scrollRef: externalScrollRef,
}) => {
  const { colors } = useTheme();
  const screenWidth = Dimensions.get('window').width;
  const cardWidth = screenWidth * 0.9; // 90% of screen width
  const cardSpacing = SPACING.md;
  const [currentIndex, setCurrentIndex] = useState(0);
  const internalScrollRef = useRef<ScrollView>(null);
  const scrollViewRef = externalScrollRef ?? internalScrollRef;
  const scrollX = useRef(new Animated.Value(0)).current;

  const getItemTime = (item: TimelineItem): number => {
    try {
      const ts = item.type === 'entry' ? item.data.timestamp : item.data.timestamp;
      const t = new Date(ts).getTime();
      return Number.isFinite(t) ? t : 0;
    } catch {
      return 0;
    }
  };

  // Combine and sort by timestamp (oldest first = leftmost, newest rightmost)
  const timelineItems = useMemo<TimelineItem[]>(() => {
    const entryItems: TimelineItem[] = (entries ?? []).map((entry) => ({
      type: 'entry' as const,
      data: entry,
    }));
    const journalItems: TimelineItem[] = (journals ?? []).map((journal) => ({
      type: 'journal' as const,
      data: journal,
    }));
    const allItems = [...entryItems, ...journalItems];
    return allItems.sort((a, b) => getItemTime(a) - getItemTime(b));
  }, [entries, journals]);

  // Start with the most recent card in view (scroll to end on load)
  useEffect(() => {
    if (timelineItems.length === 0) return;
    const lastIndex = timelineItems.length - 1;
    const scrollToX = lastIndex * (cardWidth + cardSpacing);
    const scroll = () => {
      try {
        scrollViewRef.current?.scrollTo({ x: scrollToX, animated: false });
        setCurrentIndex(lastIndex);
        scrollX.setValue(scrollToX);
      } catch (err) {
        logger.warn('TimelineSection: initial scroll to newest failed', err);
      }
    };
    const t = setTimeout(scroll, 0);
    return () => clearTimeout(t);
  }, [timelineItems.length, cardWidth, cardSpacing]);

  // Render entry card
  const renderEntryCard = (entry: Entry) => {
    const dateText = formatEntryDate(entry.timestamp);
    const locationText = entry.latitude !== undefined && entry.longitude !== undefined
      ? `${entry.latitude.toFixed(4)}, ${entry.longitude.toFixed(4)}`
      : 'Unknown location';
    const locationDateText = `${locationText}. ${dateText}`;
    const contextParts: string[] = [];
    if (entry.weather) contextParts.push(entry.weather);
    if (entry.temperatureCelsius != null) contextParts.push(formatTemperature(entry.temperatureCelsius));
    if (entry.season) contextParts.push(entry.season.charAt(0).toUpperCase() + entry.season.slice(1));
    const contextLine = contextParts.length > 0 ? contextParts.join(' · ') : null;

    return (
      <TouchableOpacity
        key={`entry-${entry.id}`}
        style={[styles.card, { width: cardWidth }]}
        onPress={() => onEntryPress(entry)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={entry.title ? `Experience, ${entry.title}` : 'Experience'}
      >
        {/* Media */}
        <View style={styles.mediaContainer}>
          {entry.mediaType === 'photo' && entry.photoPaths && entry.photoPaths.length > 0 ? (
            <EntryPhotoImage
              uri={entry.photoPaths[0]}
              style={styles.mediaImage}
              resizeMode="cover"
              fallbackBackgroundColor={colors.surface}
            />
          ) : entry.mediaType === 'video' ? (
            <View style={styles.mediaPlaceholder}>
              <Text style={styles.mediaIcon}>🎥</Text>
              <Text style={styles.mediaLabel}>Video</Text>
            </View>
          ) : entry.mediaType === 'audio' ? (
            <View style={styles.mediaPlaceholder}>
              <Text style={styles.mediaIcon}>🎵</Text>
              <Text style={styles.mediaLabel}>Audio</Text>
            </View>
          ) : (
            <View style={styles.mediaPlaceholder}>
              <Text style={styles.mediaIcon}>📷</Text>
            </View>
          )}
        </View>

        {/* Content */}
        <View style={styles.cardContent}>
          {entry.title && (
            <Text style={styles.cardTitle} numberOfLines={2}>
              {entry.title}
            </Text>
          )}
          {entry.description && (
            <Text style={styles.cardDescription} numberOfLines={3}>
              {entry.description}
            </Text>
          )}
          <Text style={styles.cardLocationDate}>{locationDateText}</Text>
          {contextLine ? (
            <Text style={styles.cardLocationDate} numberOfLines={1}>{contextLine}</Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  // Render journal card
  const renderJournalCard = (journal: Journal) => {
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
    
    return (
      <TouchableOpacity
        key={`journal-${journal.id}`}
        style={[styles.card, styles.journalCard, { width: cardWidth }]}
        onPress={() => onJournalPress(journal)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Journal entry"
      >
        <View style={styles.cardContent}>
          <Text style={styles.journalDate}>{formattedDate}</Text>
          <Text style={styles.journalLocation}>{locationText}</Text>
          <Text style={styles.journalText} numberOfLines={8}>
            {journal.content}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  // Animated scroll handler with interpolation for smooth dot transitions
  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    { 
      useNativeDriver: false, // Required for scroll position
      listener: (event: any) => {
        // Update currentIndex for dot selection logic
        const scrollXValue = event.nativeEvent.contentOffset.x;
        const index = Math.round(scrollXValue / (cardWidth + cardSpacing));
        setCurrentIndex(Math.max(0, Math.min(index, timelineItems.length - 1)));
      }
    }
  );

  // Render pagination dots (Instagram-style) with sliding animation
  const renderPaginationDots = () => {
    const totalItems = timelineItems.length;
    if (totalItems === 0) return null;
    
    const DOT_COUNT = 7;
    const CENTER_DOT_INDEX = 3; // Center dot is at index 3 (0-6)
    const DOT_SPACING = 8; // Space between dots
    
    // Calculate which item each dot represents
    const getItemIndexForDot = (dotIndex: number): number | null => {
      const offset = dotIndex - CENTER_DOT_INDEX;
      const itemIndex = currentIndex + offset;
      
      if (itemIndex < 0 || itemIndex >= totalItems) {
        return null; // Dot is out of bounds
      }
      return itemIndex;
    };
    
    // Calculate center dot's scroll position
    const centerDotScrollPosition = currentIndex * (cardWidth + cardSpacing);
    
    const dots = [];
    for (let dotIndex = 0; dotIndex < DOT_COUNT; dotIndex++) {
      const itemIndex = getItemIndexForDot(dotIndex);
      const distanceFromCenter = Math.abs(dotIndex - CENTER_DOT_INDEX);
      
      // Skip dots that are out of bounds (at start/end of timeline)
      if (itemIndex === null) {
        // Render invisible placeholder to maintain spacing
        dots.push(
          <View key={`placeholder-${dotIndex}`} style={[styles.paginationDot, { opacity: 0 }]} />
        );
        continue;
      }
      
      // Calculate scale and opacity based on distance from center
      const scale = distanceFromCenter === 0 ? 1 : Math.max(0.6, 1 - (distanceFromCenter * 0.15));
      const opacity = distanceFromCenter === 0 ? 1 : Math.max(0.4, 1 - (distanceFromCenter * 0.2));
      
      // Calculate individual dot position offset from center
      const dotOffset = (dotIndex - CENTER_DOT_INDEX) * DOT_SPACING;
      
      // Calculate translation for this specific dot
      // Combine the sliding offset (based on scroll) with the dot's fixed position offset
      // When scrollX matches centerDotScrollPosition, base translation is 0
      // When scrolling right, dots move left (negative), when scrolling left, dots move right (positive)
      const dotTranslateX = scrollX.interpolate({
        inputRange: [
          centerDotScrollPosition - (cardWidth + cardSpacing) * 2,
          centerDotScrollPosition - (cardWidth + cardSpacing),
          centerDotScrollPosition,
          centerDotScrollPosition + (cardWidth + cardSpacing),
          centerDotScrollPosition + (cardWidth + cardSpacing) * 2,
        ],
        outputRange: [
          DOT_SPACING * 2 + dotOffset,
          DOT_SPACING + dotOffset,
          0 + dotOffset,
          -DOT_SPACING + dotOffset,
          -DOT_SPACING * 2 + dotOffset,
        ],
        extrapolate: 'clamp',
      });
      
      dots.push(
        <Animated.View
          key={itemIndex}
          style={[
            styles.paginationDot,
            {
              transform: [
                { translateX: dotTranslateX },
                { scale }
              ],
              opacity,
              backgroundColor: dotIndex === CENTER_DOT_INDEX ? colors.textPrimary : colors.textSecondary,
            }
          ]}
        />
      );
    }
    
    return (
      <View style={styles.paginationContainer}>
        {dots}
      </View>
    );
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        scrollContent: {
          paddingHorizontal: SPACING.md,
          paddingVertical: SPACING.lg,
        },
        card: {
          backgroundColor: colors.surface,
          borderRadius: DIMENSIONS.cardBorderRadius,
          marginRight: SPACING.md,
          overflow: 'hidden',
          shadowColor: '#FFFFFF',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.25,
          shadowRadius: 4.2,
          elevation: 6,
        },
        journalCard: { backgroundColor: colors.surface },
        mediaContainer: {
          width: '100%',
          aspectRatio: 1.2,
          backgroundColor: colors.surface,
        },
        mediaImage: { width: '100%', height: '100%' },
        mediaPlaceholder: {
          width: '100%',
          height: '100%',
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: colors.surface,
        },
        mediaIcon: { fontSize: 48, marginBottom: SPACING.sm },
        mediaLabel: {
          ...TEXT_STYLES.entryInput,
          fontSize: 16,
          color: colors.textPrimary,
        },
        cardContent: { padding: SPACING.md },
        cardTitle: {
          ...TEXT_STYLES.cardTitle,
          fontSize: 20,
          fontWeight: FONT_WEIGHTS.semibold,
          color: colors.textPrimary,
          marginBottom: SPACING.sm,
        },
        cardDescription: {
          ...TEXT_STYLES.entryInput,
          fontSize: 15,
          color: colors.textSecondary,
          marginBottom: SPACING.sm,
          lineHeight: 22,
        },
        cardLocationDate: {
          ...TEXT_STYLES.entryInput,
          fontSize: 13,
          color: colors.textSecondary,
        },
        journalDate: {
          fontSize: 15,
          color: colors.textPrimary,
          fontFamily: FONTS.playfairDisplay,
          fontStyle: 'italic',
          marginBottom: SPACING.xs,
          fontWeight: FONT_WEIGHTS.semibold,
        },
        journalLocation: {
          fontSize: 12,
          color: colors.textSecondary,
          fontFamily: FONTS.playfairDisplay,
          fontStyle: 'italic',
          marginBottom: SPACING.md,
        },
        journalText: {
          fontSize: 16,
          color: colors.textPrimary,
          fontFamily: FONTS.playfairDisplay,
          fontStyle: 'italic',
          lineHeight: 24,
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
        paginationContainer: {
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          paddingVertical: SPACING.md,
          gap: 0,
          overflow: 'hidden',
          height: 20,
        },
        paginationDot: {
          width: 7,
          height: 7,
          borderRadius: 3.5,
          backgroundColor: colors.textSecondary,
        },
      }),
    [colors]
  );

  // Empty state
  if (timelineItems.length === 0) {
    return (
      <View style={styles.emptyState} accessibilityLabel="Timeline view, no entries yet">
        <Text style={styles.emptyStateText}>No entries yet</Text>
        <Text style={styles.emptyStateSubtext}>
          Start capturing your journey to see it here
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container} accessibilityLabel="Timeline view">
      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled={false}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        snapToInterval={cardWidth + cardSpacing}
        decelerationRate="fast"
        onScroll={handleScroll}
        scrollEventThrottle={16}
        accessibilityLabel="Timeline cards"
      >
        {timelineItems.map((item) => {
          if (item.type === 'entry') {
            return renderEntryCard(item.data);
          } else {
            return renderJournalCard(item.data);
          }
        })}
      </ScrollView>
      {renderPaginationDots()}
    </View>
  );
};

export default TimelineSection;
