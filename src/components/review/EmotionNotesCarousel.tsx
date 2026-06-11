import React, { useEffect, useMemo, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SPACING } from '../../config/constants';
import { TEXT_STYLES } from '../../config/typography';
import type { ThemeColors } from '../../config/theme';

export interface EmotionNoteExcerpt {
  id: string;
  excerpt: string;
  timestamp: string;
}

interface EmotionNotesCarouselProps {
  notes: EmotionNoteExcerpt[];
  colors: ThemeColors;
  isDark: boolean;
}

const NOTE_CARD_WIDTH = 220;
const NOTE_CARD_GAP = SPACING.xs;
const AUTO_SCROLL_STEP_PX = 1;
const AUTO_SCROLL_INTERVAL_MS = 45;
const AUTO_SCROLL_RESUME_DELAY_MS = 3200;

const EmotionNotesCarousel: React.FC<EmotionNotesCarouselProps> = ({ notes, colors, isDark }) => {
  if (notes.length === 0) return null;
  const scrollRef = useRef<ScrollView | null>(null);
  const offsetRef = useRef(0);
  const autoplayEnabledRef = useRef(notes.length > 1);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasUserInteractedRef = useRef(false);
  const loopWidth = useMemo(() => (NOTE_CARD_WIDTH + NOTE_CARD_GAP) * notes.length, [notes.length]);
  const duplicatedNotes = useMemo(() => (notes.length > 1 ? [...notes, ...notes] : notes), [notes]);
  const noteTextColor = isDark ? '#A5A5A5' : '#7A6C5F';

  const clearResumeTimer = () => {
    if (!resumeTimerRef.current) return;
    clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = null;
  };

  const pauseAutoplay = () => {
    autoplayEnabledRef.current = false;
    hasUserInteractedRef.current = true;
    clearResumeTimer();
  };

  const scheduleResumeAutoplay = () => {
    if (notes.length <= 1) return;
    clearResumeTimer();
    resumeTimerRef.current = setTimeout(() => {
      autoplayEnabledRef.current = true;
      resumeTimerRef.current = null;
    }, AUTO_SCROLL_RESUME_DELAY_MS);
  };

  useEffect(() => {
    autoplayEnabledRef.current = notes.length > 1 && !hasUserInteractedRef.current;
    if (notes.length <= 1) return;

    const intervalId = setInterval(() => {
      if (!autoplayEnabledRef.current) return;
      const nextOffset = offsetRef.current + AUTO_SCROLL_STEP_PX;
      offsetRef.current = nextOffset;
      scrollRef.current?.scrollTo({ x: nextOffset, animated: false });

      if (nextOffset >= loopWidth) {
        const wrappedOffset = nextOffset - loopWidth;
        offsetRef.current = wrappedOffset;
        scrollRef.current?.scrollTo({ x: wrappedOffset, animated: false });
      }
    }, AUTO_SCROLL_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
      clearResumeTimer();
    };
  }, [loopWidth, notes.length]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
      onTouchStart={pauseAutoplay}
      onScrollBeginDrag={pauseAutoplay}
      onScrollEndDrag={scheduleResumeAutoplay}
      onMomentumScrollEnd={scheduleResumeAutoplay}
      onScroll={(event) => {
        const x = event.nativeEvent.contentOffset.x;
        offsetRef.current = x;
        if (notes.length > 1 && x >= loopWidth) {
          const wrappedOffset = x - loopWidth;
          offsetRef.current = wrappedOffset;
          scrollRef.current?.scrollTo({ x: wrappedOffset, animated: false });
        }
      }}
      scrollEventThrottle={16}
      accessibilityRole="list"
      accessibilityLabel="Emotion note excerpts"
    >
      {duplicatedNotes.map((note, idx) => (
        <View
          key={`${note.id}-${idx}`}
          style={styles.noteCard}
          accessibilityRole="text"
          accessibilityLabel={note.excerpt}
        >
          <Text style={[styles.noteText, { color: noteTextColor }]} numberOfLines={3}>
            "{note.excerpt}"
          </Text>
        </View>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  noteCard: {
    width: NOTE_CARD_WIDTH,
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingHorizontal: 2,
    paddingVertical: 2,
    marginRight: NOTE_CARD_GAP,
  },
  noteText: {
    ...TEXT_STYLES.entryInput,
    fontSize: 14,
    lineHeight: 20,
    fontStyle: 'italic',
  },
});

export default EmotionNotesCarousel;
