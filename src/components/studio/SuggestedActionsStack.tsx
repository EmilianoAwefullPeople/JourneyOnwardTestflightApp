// SuggestedActionsStack
// Swipeable Tinder-style card stack for suggested actions in the Studio tab.
//
// Gesture model:
//   - PanResponder claims gesture only when horizontal displacement dominates (|dx| > |dy| + 8),
//     so vertical scrolling in the parent ScrollView is never stolen.
//   - During drag: card follows finger 1:1 via Animated.event (native driver).
//   - On release: spring-commit if |dx| > 5% screen width or |vx| > 0.15; else drift back
//     with release velocity (tension 40, friction 9) so bounce-back feels natural, not abrupt.
//   - Reduce Motion: rotation suppressed, exit is a 150ms fade instead of fly-off.
//   - Loop: after last card, deck index wraps to 0 (deck rebuilt fresh from entries).

import React, { useRef, useState, useMemo, useEffect } from 'react';
import {
  View,
  Animated,
  PanResponder,
  Dimensions,
  AccessibilityInfo,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AppText from '../common/AppText';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { useAppContext } from '../../context/AppContext';
import { Entry } from '../../models/Entry';
import { formatEntryDate, getCityCountryLabel } from '../../utils/dateUtils';
import SuggestedActionCard, { CardData } from './SuggestedActionCard';
import { FONTS, FONT_WEIGHTS, SPACING } from '../../config/constants';
import { useTheme } from '../../context/ThemeContext';
import { TRAVEL_MODE_KEYS } from '../../storage/PersistenceManager';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_X_THRESHOLD = SCREEN_WIDTH * 0.025;
const SWIPE_VX_THRESHOLD = 0.15;

// ---------------------------------------------------------------------------
// Deck construction helpers
// ---------------------------------------------------------------------------

type MissingField = 'title' | 'description' | 'emotion' | 'journal';

const FIELD_QUESTIONS: Record<MissingField, string> = {
  title: "What's a good title for this?",
  description: "What's the story behind this?",
  emotion: 'How did this moment feel?',
  journal: 'Want to write about this?',
};

function hasEmotionData(entry: Entry): boolean {
  const hasLabels = Array.isArray(entry.emotionLabels) && entry.emotionLabels.length > 0;
  const hasNote = typeof entry.emotionNote === 'string' && entry.emotionNote.trim().length > 0;
  // Backward compatibility for older entries that may only have valence/arousal.
  const hasLegacyMood = entry.valence != null || entry.arousal != null;
  return hasLabels || hasNote || hasLegacyMood;
}

function hasJournalData(entry: Entry, linkedJournalEntryIds: Set<string>): boolean {
  if (typeof entry.journalId === 'string' && entry.journalId.trim().length > 0) return true;
  return linkedJournalEntryIds.has(entry.id);
}

function getMissingField(entry: Entry, linkedJournalEntryIds: Set<string>): MissingField | null {
  if (!entry.title || entry.title.trim() === '') return 'title';
  if (!entry.description || entry.description.trim() === '') return 'description';
  if (!hasEmotionData(entry)) return 'emotion';
  if (!hasJournalData(entry, linkedJournalEntryIds)) return 'journal';
  return null;
}

function getFirstImageUri(entry: Entry): string {
  return (
    (entry.photoPaths && entry.photoPaths[0]) ||
    (entry.mediaPaths && entry.mediaPaths[0]) ||
    (entry.storageUrls && entry.storageUrls[0]) ||
    ''
  );
}

function buildLocationLine(entry: Entry, locationByEntryId: Record<string, string>): string {
  const resolved = locationByEntryId[entry.id];
  if (resolved && resolved.trim().length > 0) return resolved;
  return 'Location unavailable';
}

// ---------------------------------------------------------------------------

interface Props {
  /** True when the scroll has snapped to the card section page. Lowers gesture threshold. */
  isActivePage: boolean;
}

const SuggestedActionsStack: React.FC<Props> = ({ isActivePage }) => {
  const navigation = useNavigation<Nav>();
  const { entries, journals, travelModeEnabled, activeTripAlbums } = useAppContext();
  const { colors } = useTheme();

  const isActivePageRef = useRef(false);
  useEffect(() => {
    isActivePageRef.current = isActivePage;
  }, [isActivePage]);

  // Keep navigation in a ref so useMemo callbacks always call the latest nav object.
  const navRef = useRef(navigation);
  useEffect(() => {
    navRef.current = navigation;
  }, [navigation]);

  // ---------------------------------------------------------------------------
  // Reduce Motion
  // ---------------------------------------------------------------------------

  const [reduceMotion, setReduceMotion] = useState(false);
  const reduceMotionRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (!cancelled) {
          setReduceMotion(v);
          reduceMotionRef.current = v;
        }
      })
      .catch(() => {});

    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => {
      setReduceMotion(v);
      reduceMotionRef.current = v;
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Travel card — track which day the "Day X" card was last tapped
  // ---------------------------------------------------------------------------

  const getTodayString = () => new Date().toISOString().slice(0, 10);

  const [travelCardDayTapped, setTravelCardDayTapped] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(TRAVEL_MODE_KEYS.TRAVEL_CARD_DAY_TAPPED)
      .then(v => setTravelCardDayTapped(v))
      .catch(() => {});
  }, []);

  const markTravelCardTapped = () => {
    const today = getTodayString();
    setTravelCardDayTapped(today);
    AsyncStorage.setItem(TRAVEL_MODE_KEYS.TRAVEL_CARD_DAY_TAPPED, today).catch(() => {});
  };

  // ---------------------------------------------------------------------------
  // Location labels for card metadata (city, country)
  // ---------------------------------------------------------------------------

  const [locationByEntryId, setLocationByEntryId] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    const targetEntries = entries.filter(
      (e) =>
        e.type === 'experience' &&
        !e.isDraft &&
        typeof e.latitude === 'number' &&
        typeof e.longitude === 'number'
    );

    const missing = targetEntries.filter((e) => !locationByEntryId[e.id]);
    if (missing.length === 0) return;

    (async () => {
      const pairs = await Promise.all(
        missing.map(async (entry) => {
          const persistedLabel = [entry.city?.trim(), entry.country?.trim()].filter(Boolean).join(', ');
          if (persistedLabel) {
            return [entry.id, persistedLabel] as const;
          }
          const label = await getCityCountryLabel(entry.latitude as number, entry.longitude as number);
          return [entry.id, label && label.trim().length > 0 ? label : 'Location unavailable'] as const;
        })
      );

      if (cancelled || pairs.length === 0) return;

      setLocationByEntryId((prev) => {
        const next = { ...prev };
        for (const [entryId, label] of pairs) {
          next[entryId] = label;
        }
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [entries, locationByEntryId]);

  // ---------------------------------------------------------------------------
  // Deck construction
  // ---------------------------------------------------------------------------

  const linkedJournalEntryIds = useMemo(() => {
    const ids = new Set<string>();
    for (const journal of journals) {
      if (journal.linkedEntryId) ids.add(journal.linkedEntryId);
    }
    return ids;
  }, [journals]);

  const deck = useMemo<CardData[]>(() => {
    const activeAlbumIdSet = new Set(activeTripAlbums.map(a => a.id));

    const experienceCards: CardData[] = [];

    const eligible = entries
      .filter((e) => {
        if (e.type !== 'experience' || e.isDraft) return false;
        // When travel mode is on, only show entries from active trip albums
        if (travelModeEnabled && activeTripAlbums.length > 0) {
          return !!e.albumId && activeAlbumIdSet.has(e.albumId);
        }
        return true;
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    for (const entry of eligible) {
      const field = getMissingField(entry, linkedJournalEntryIds);
      if (!field) continue;
      const imageUri = getFirstImageUri(entry);
      if (!imageUri) continue;

      const entryId = entry.id;
      const question = FIELD_QUESTIONS[field];

      experienceCards.push({
        kind: 'experience',
        question,
        metaLine1: buildLocationLine(entry, locationByEntryId),
        metaLine2: formatEntryDate(entry.timestamp),
        imageUri,
        accessibilityLabel: `${question}. ${entry.title || formatEntryDate(entry.timestamp)}`,
        onPress: () => {
          if (field === 'journal') {
            navRef.current.navigate('NotesEditor', { entryId });
          } else {
            navRef.current.navigate('EntryEdit', { entryId, focusField: field });
          }
        },
      });
    }

    // ---------------------------------------------------------------------------
    // Travel-aware cards — injected when Travel Mode is on
    // ---------------------------------------------------------------------------
    const travelCards: CardData[] = [];

    if (travelModeEnabled) {
      const today = getTodayString();
      const todayStart = new Date(today).getTime();

      // Card 1: No journal today
      const hasJournalToday = journals.some(j => {
        const jDate = j.createdAt || (j as any).timestamp;
        if (!jDate) return false;
        return new Date(jDate).getTime() >= todayStart;
      });
      if (!hasJournalToday) {
        travelCards.push({
          kind: 'cta',
          question: "You haven't journaled today",
          iconName: 'pencil-outline',
          subtitle: 'Take a moment to capture how today went',
          accessibilityLabel: "You haven't journaled today. Tap to write a journal entry.",
          onPress: () => navRef.current.navigate('NotesEditor', {}),
        });
      }

      // Card 2: X moments since last journal
      const lastJournalTime = journals.length > 0
        ? Math.max(...journals.map(j => {
            const t = j.createdAt || (j as any).timestamp;
            return t ? new Date(t).getTime() : 0;
          }))
        : 0;
      const entriesSinceJournal = entries.filter(
        e => new Date(e.timestamp).getTime() > lastJournalTime
      ).length;
      if (entriesSinceJournal >= 3) {
        travelCards.push({
          kind: 'cta',
          question: `You've captured ${entriesSinceJournal} moments — take a minute to reflect`,
          iconName: 'book-outline',
          subtitle: 'Write about what you experienced',
          accessibilityLabel: `You've captured ${entriesSinceJournal} moments. Tap to reflect in your journal.`,
          onPress: () => navRef.current.navigate('NotesEditor', {}),
        });
      }

      // Card 3: Day X of your trip — reappears until tapped (swipe doesn't count)
      if (activeTripAlbums.length > 0 && travelCardDayTapped !== today) {
        const toLocalDayStart = (dateStr: string) => {
          const d = new Date(dateStr);
          return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        };
        const primaryAlbum = activeTripAlbums.reduce((a, b) => {
          const aEnd = a.endDate ? toLocalDayStart(a.endDate) : 0;
          const bEnd = b.endDate ? toLocalDayStart(b.endDate) : 0;
          return bEnd > aEnd ? b : a;
        });
        const msPerDay = 1000 * 60 * 60 * 24;
        const dayNumber = Math.floor((toLocalDayStart(new Date().toISOString()) - toLocalDayStart(primaryAlbum.startDate)) / msPerDay) + 1;
        travelCards.push({
          kind: 'cta',
          question: `Day ${dayNumber} of your trip — how's it going?`,
          iconName: 'sunny-outline',
          subtitle: 'Write a journal entry for today',
          accessibilityLabel: `Day ${dayNumber} of your trip. Tap to journal.`,
          onPress: () => {
            markTravelCardTapped();
            navRef.current.navigate('NotesEditor', {});
          },
        });
      }
    }

    // Interleave travel cards evenly through experience cards
    const combinedCards: CardData[] = [];
    if (travelCards.length === 0) {
      combinedCards.push(...experienceCards);
    } else {
      const step = Math.max(1, Math.floor(experienceCards.length / (travelCards.length + 1)));
      let tIdx = 0;
      for (let i = 0; i < experienceCards.length; i++) {
        if (tIdx < travelCards.length && i > 0 && i % step === 0) {
          combinedCards.push(travelCards[tIdx++]);
        }
        combinedCards.push(experienceCards[i]);
      }
      while (tIdx < travelCards.length) combinedCards.push(travelCards[tIdx++]);
    }

    // Append generic CTA cards only when combined deck is small
    const ctaCards: CardData[] =
      combinedCards.length < 6
        ? [
            {
              kind: 'cta',
              question: 'Capture a new experience',
              iconName: 'camera-outline',
              subtitle: 'Something worth remembering?',
              accessibilityLabel: 'Capture a new experience',
              onPress: () => navRef.current.navigate('Capture'),
            },
            {
              kind: 'cta',
              question: 'Write in your journal',
              iconName: 'pencil-outline',
              subtitle: "Reflect on where you've been",
              accessibilityLabel: 'Write in your journal',
              onPress: () => navRef.current.navigate('NotesEditor', {}),
            },
            {
              kind: 'cta',
              question: 'Sync latest photos',
              iconName: 'sync-outline',
              subtitle: 'Import recent memories from your library',
              accessibilityLabel: 'Sync latest photos',
              onPress: () => navRef.current.navigate('ImportLatest'),
            },
            {
              kind: 'cta',
              question: 'Add past memories',
              iconName: 'image-outline',
              subtitle: "Bring in experiences you haven't captured yet",
              accessibilityLabel: 'Add past memories',
              onPress: () => navRef.current.navigate('AddPastExperiences'),
            },
          ]
        : [];

    return [...combinedCards, ...ctaCards];
  }, [entries, journals, linkedJournalEntryIds, locationByEntryId, travelModeEnabled, activeTripAlbums, travelCardDayTapped]);

  // ---------------------------------------------------------------------------
  // Deck index (loops)
  // ---------------------------------------------------------------------------

  const [deckIndex, setDeckIndex] = useState(0);

  // Clamp index if deck shrinks (e.g. user filled in fields while away)
  useEffect(() => {
    if (deck.length > 0 && deckIndex >= deck.length) {
      setDeckIndex(0);
    }
  }, [deck.length, deckIndex]);

  // ---------------------------------------------------------------------------
  // Animation values (stable refs — safe to use in native-driver animations)
  // ---------------------------------------------------------------------------

  const translateX = useRef(new Animated.Value(0)).current;
  const cardOpacity = useRef(new Animated.Value(1)).current;

  // Reset animation whenever the visible card changes
  useEffect(() => {
    translateX.setValue(0);
    cardOpacity.setValue(1);
  }, [deckIndex, translateX, cardOpacity]);

  // ---------------------------------------------------------------------------
  // Advance-deck callback — kept in a ref so PanResponder closures always get
  // the latest deck length and setDeckIndex without recreating the responder.
  // ---------------------------------------------------------------------------

  const deckLengthRef = useRef(deck.length);
  useEffect(() => {
    deckLengthRef.current = deck.length;
  }, [deck.length]);

  const advanceDeckRef = useRef(() => {});
  advanceDeckRef.current = () => {
    translateX.setValue(0);
    cardOpacity.setValue(1);
    setDeckIndex((i) => (i + 1) % Math.max(deckLengthRef.current, 1));
  };

  const prevDeckRef = useRef(() => {});
  prevDeckRef.current = () => {
    translateX.setValue(0);
    cardOpacity.setValue(1);
    setDeckIndex((i) => (i - 1 + Math.max(deckLengthRef.current, 1)) % Math.max(deckLengthRef.current, 1));
  };

  const triggerNext = () => {
    if (reduceMotion) {
      Animated.timing(cardOpacity, { toValue: 0, duration: 150, useNativeDriver: true })
        .start(() => advanceDeckRef.current());
    } else {
      Animated.spring(translateX, {
        toValue: -SCREEN_WIDTH * 1.5,
        velocity: 0,
        tension: 40,
        friction: 7,
        useNativeDriver: true,
      }).start(() => advanceDeckRef.current());
    }
  };

  const triggerPrevious = () => {
    if (reduceMotion) {
      Animated.timing(cardOpacity, { toValue: 0, duration: 150, useNativeDriver: true })
        .start(() => prevDeckRef.current());
    } else {
      Animated.spring(translateX, {
        toValue: SCREEN_WIDTH * 1.5,
        velocity: 0,
        tension: 40,
        friction: 7,
        useNativeDriver: true,
      }).start(() => prevDeckRef.current());
    }
  };

  // ---------------------------------------------------------------------------
  // PanResponder (created once — mutable state accessed via refs)
  // ---------------------------------------------------------------------------

  const panResponder = useRef(
    PanResponder.create({
      // Don't claim on touch-start; let scroll begin normally.
      onStartShouldSetPanResponder: () => false,
      // On the card page (scroll locked at bottom boundary): claim any clear horizontal
      // gesture. On other pages: require horizontal to dominate vertical by a margin.
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        isActivePageRef.current
          ? Math.abs(dx) > 5
          : Math.abs(dx) > Math.abs(dy) + 8,
      onPanResponderGrant: () => {
        translateX.stopAnimation();
        cardOpacity.stopAnimation();
      },
      onPanResponderMove: (_, { dx }) => {
        translateX.setValue(dx);
      },
      onPanResponderRelease: (_, { dx, vx }) => {
        const commit =
          Math.abs(dx) > SWIPE_X_THRESHOLD || Math.abs(vx) > SWIPE_VX_THRESHOLD;

        if (commit) {
          const direction = dx >= 0 ? 1 : -1;
          if (reduceMotionRef.current) {
            // Reduce Motion: fade out instead of fly-off
            Animated.timing(cardOpacity, {
              toValue: 0,
              duration: 150,
              useNativeDriver: true,
            }).start(() => advanceDeckRef.current());
          } else {
            Animated.spring(translateX, {
              toValue: direction * SCREEN_WIDTH * 1.5,
              velocity: vx,
              tension: 40,
              friction: 7,
              useNativeDriver: true,
            }).start(() => advanceDeckRef.current());
          }
        } else {
          // Below threshold — drift back to origin using release velocity so the
          // card decelerates naturally rather than snapping back abruptly.
          if (reduceMotionRef.current) {
            translateX.setValue(0);
          } else {
            Animated.spring(translateX, {
              toValue: 0,
              velocity: vx,
              tension: 40,
              friction: 9,
              useNativeDriver: true,
            }).start();
          }
        }
      },
      // Gesture taken over by system — drift back softly
      onPanResponderTerminate: () => {
        Animated.spring(translateX, {
          toValue: 0,
          velocity: 0,
          tension: 40,
          friction: 9,
          useNativeDriver: true,
        }).start();
      },
    })
  ).current;

  // ---------------------------------------------------------------------------
  // Derived animated styles
  // ---------------------------------------------------------------------------

  // Rotation: interpolated from translateX; suppressed entirely for Reduce Motion.
  const frontRotate = translateX.interpolate({
    inputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
    outputRange: ['-20deg', '0deg', '20deg'],
    extrapolate: 'clamp',
  });

  // Peek card scale: grows from 0.95 → 1.0 as the front card is dragged away.
  const peekScale = translateX.interpolate({
    inputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
    outputRange: [1, 0.95, 1],
    extrapolate: 'clamp',
  });

  // Peek card vertical offset: drops from 8 → 0 as front card is dragged away.
  const peekTranslateY = translateX.interpolate({
    inputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
    outputRange: [0, 8, 0],
    extrapolate: 'clamp',
  });

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (deck.length === 0) return null;

  const safeIndex = deckIndex % deck.length;
  const frontCard = deck[safeIndex];
  const peekCard = deck.length > 1 ? deck[(safeIndex + 1) % deck.length] : null;

  const frontTransform = reduceMotion
    ? [{ translateX }]
    : [{ translateX }, { rotate: frontRotate }];

  return (
    <View style={styles.container}>
      <View style={styles.stack}>
        {peekCard && (
          <Animated.View
            style={[
              styles.peekCard,
              {
                transform: [{ scale: peekScale }, { translateY: peekTranslateY }],
              },
            ]}
            pointerEvents="none"
          >
            <SuggestedActionCard data={peekCard} />
          </Animated.View>
        )}

        <Animated.View
          style={[
            styles.frontCard,
            {
              transform: frontTransform as any,
              opacity: cardOpacity,
            },
          ]}
          {...panResponder.panHandlers}
        >
          <SuggestedActionCard data={frontCard} />
        </Animated.View>
      </View>

      <View style={styles.navRow}>
        <TouchableOpacity
          onPress={triggerPrevious}
          accessibilityRole="button"
          accessibilityLabel="Previous card"
          hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
        >
          <AppText style={[styles.navButton, { color: colors.textSecondary }]}>
            Previous
          </AppText>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={triggerNext}
          accessibilityRole="button"
          accessibilityLabel="Next card"
          hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
        >
          <AppText style={[styles.navButton, { color: colors.textSecondary }]}>
            Next
          </AppText>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginTop: SPACING.xl,
  },
  stack: {
    width: '100%',
    paddingBottom: 16,
    overflow: 'visible',
  },
  peekCard: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
  },
  frontCard: {
    zIndex: 2,
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginTop: SPACING.md,
  },
  navButton: {
    fontFamily: FONTS.inter,
    fontWeight: FONT_WEIGHTS.regular,
    fontSize: 13,
  },
});

export default SuggestedActionsStack;
