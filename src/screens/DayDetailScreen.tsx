// DayDetailScreen — modal opened by tapping a calendar day.
// Shows memories (entries + journals) captured on that local day as proper visual
// cards, lets the user page horizontally through adjacent days, and — only when no
// country flag is known for the day — lets the user record which country they were in.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import BackArrow from '../components/common/icons/BackArrow';
import PinterestGrid from '../components/review/PinterestGrid';
import AppTextInput from '../components/common/AppTextInput';
import { FONT_WEIGHTS, FONTS, SPACING } from '../config/constants';
import { TEXT_STYLES } from '../config/typography';
import { useTheme } from '../context/ThemeContext';
import { useAppContext } from '../context/AppContext';
import { Entry } from '../models/Entry';
import { Journal } from '../models/Journal';
import type { RootStackParamList } from '../navigation/types';
import { dayKeyFromTimestampIso, localDayKeyFromDate } from '../utils/dayKeyUtils';
import { ALL_COUNTRY_NAMES, getCountryFlagEmoji } from '../utils/countryUtils';
import { getCountryFromCoordinates } from '../utils/dateUtils';
import { getDayCountrySnapshot, setDayCountrySnapshot } from '../storage/dayCountrySnapshotStorage';

type Nav = NativeStackNavigationProp<RootStackParamList, 'DayDetail'>;
type DayDetailRoute = RouteProp<RootStackParamList, 'DayDetail'>;

const MAX_SUGGESTIONS = 6;
/** Horizontal drag distance to commit a day change (vs. just a scroll/tap gesture). */
const SWIPE_COMMIT_DISTANCE = 60;

function parseDayKey(dayKey: string): Date | null {
  const parts = dayKey.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [year, monthIndex0, day] = parts;
  return new Date(year, monthIndex0, day);
}

function shiftDayKey(dayKey: string, deltaDays: number): string {
  const d = parseDayKey(dayKey) ?? new Date();
  d.setDate(d.getDate() + deltaDays);
  return localDayKeyFromDate(d);
}

const DayDetailScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute<DayDetailRoute>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { entries, journals } = useAppContext();

  const [activeDayKey, setActiveDayKey] = useState(route.params.dayKey);
  const [country, setCountry] = useState<string | null>(null);
  const [resolvingCountry, setResolvingCountry] = useState(true);
  const [countryInput, setCountryInput] = useState('');
  const [saving, setSaving] = useState(false);

  const goToPrevDay = useCallback(() => setActiveDayKey((k) => shiftDayKey(k, -1)), []);
  const goToNextDay = useCallback(() => setActiveDayKey((k) => shiftDayKey(k, 1)), []);

  // Swipe left/right to page between days. activeOffsetX + failOffsetY means the
  // gesture only claims genuinely horizontal drags, so vertical scrolling of the
  // memories list underneath is untouched. .runOnJS(true) avoids Reanimated
  // worklets (see PostcardFramedPhotoSlot.tsx) — plain JS-thread state updates.
  const swipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX([-20, 20])
        .failOffsetY([-14, 14])
        .onEnd((e) => {
          if (e.translationX <= -SWIPE_COMMIT_DISTANCE) goToNextDay();
          else if (e.translationX >= SWIPE_COMMIT_DISTANCE) goToPrevDay();
        }),
    [goToNextDay, goToPrevDay]
  );

  const dateObj = useMemo(() => parseDayKey(activeDayKey), [activeDayKey]);
  const dateLabel = useMemo(() => {
    if (!dateObj) return 'Unknown date';
    return dateObj.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }, [dateObj]);

  const dayEntries = useMemo(
    () => entries.filter((e) => dayKeyFromTimestampIso(e.timestamp) === activeDayKey),
    [entries, activeDayKey]
  );
  const dayJournals = useMemo(
    () =>
      journals
        .filter((j) => dayKeyFromTimestampIso(j.timestamp) === activeDayKey)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
    [journals, activeDayKey]
  );
  const hasMemories = dayEntries.length > 0 || dayJournals.length > 0;

  // Reset the country-input draft whenever the visible day changes.
  useEffect(() => {
    setCountryInput('');
  }, [activeDayKey]);

  // Resolve a known country for this day: persisted entry country > reverse-geocode > manual snapshot.
  useEffect(() => {
    let cancelled = false;
    setResolvingCountry(true);
    (async () => {
      const persisted = [...dayEntries].reverse().map((e) => e.country?.trim()).find((c) => !!c);
      if (persisted) {
        if (!cancelled) {
          setCountry(persisted);
          setResolvingCountry(false);
        }
        return;
      }

      const allItems: Array<Entry | Journal> = [...dayEntries, ...dayJournals];
      const withCoords = [...allItems]
        .reverse()
        .find((i) => i.latitude != null && i.longitude != null);
      if (withCoords) {
        try {
          const geocoded = await getCountryFromCoordinates(withCoords.latitude!, withCoords.longitude!);
          if (geocoded) {
            if (!cancelled) {
              setCountry(geocoded);
              setResolvingCountry(false);
            }
            return;
          }
        } catch {
          /* fall through to snapshot lookup */
        }
      }

      const snapshot = await getDayCountrySnapshot(activeDayKey);
      if (!cancelled) {
        setCountry(snapshot?.country ?? null);
        setResolvingCountry(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dayEntries, dayJournals, activeDayKey]);

  const suggestions = useMemo(() => {
    const query = countryInput.trim().toLowerCase();
    if (!query) return [];
    return ALL_COUNTRY_NAMES.filter((name) => name.toLowerCase().includes(query)).slice(0, MAX_SUGGESTIONS);
  }, [countryInput]);

  const handleSaveCountry = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await setDayCountrySnapshot(activeDayKey, trimmed);
      setCountry(trimmed);
      setCountryInput('');
    } finally {
      setSaving(false);
    }
  };

  const handleEntryPress = useCallback(
    (entry: Entry) => {
      navigation.navigate('EntryDetail', { entryId: entry.id });
    },
    [navigation]
  );
  const handleJournalPress = useCallback(
    (journal: Journal) => {
      navigation.navigate('JournalDetail', { journalId: journal.id });
    },
    [navigation]
  );

  const showCountryInput = !resolvingCountry && !country;

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + SPACING.sm, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={12}
        >
          <BackArrow width={22} height={22} color={colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <TouchableOpacity
            onPress={goToPrevDay}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Previous day"
            style={styles.chevronBtn}
          >
            <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
          </TouchableOpacity>

          <View style={styles.headerTitleWrap}>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>
              {dateLabel}
            </Text>
            {country ? (
              <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.25}>
                {getCountryFlagEmoji(country)} {country}
              </Text>
            ) : null}
          </View>

          <TouchableOpacity
            onPress={goToNextDay}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Next day"
            style={styles.chevronBtn}
          >
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.headerSpacer} />
      </View>

      {showCountryInput ? (
        <View style={[styles.countryPrompt, { borderBottomColor: colors.border }]}>
          <Text style={[styles.countryPromptLabel, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.3}>
            Which country were you in?
          </Text>
          <AppTextInput
            value={countryInput}
            onChangeText={setCountryInput}
            placeholder="Type a country name"
            placeholderTextColor={colors.textTertiary}
            style={[
              styles.countryInput,
              { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface },
            ]}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={() => handleSaveCountry(countryInput)}
          />
          {suggestions.length > 0 ? (
            <View style={styles.suggestionsWrap}>
              {suggestions.map((name) => (
                <TouchableOpacity
                  key={name}
                  style={[styles.suggestionChip, { borderColor: colors.border, backgroundColor: colors.surface }]}
                  onPress={() => handleSaveCountry(name)}
                  disabled={saving}
                >
                  <Text style={[styles.suggestionText, { color: colors.textPrimary }]}>
                    {getCountryFlagEmoji(name)} {name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      <GestureDetector gesture={swipeGesture}>
        <View style={styles.swipeArea}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingTop: SPACING.md, paddingBottom: insets.bottom + SPACING.xl, flexGrow: 1 }}
            showsVerticalScrollIndicator={false}
          >
            {hasMemories ? (
              <>
                {dayEntries.length > 0 ? (
                  <View style={styles.gridWrap}>
                    <PinterestGrid entries={dayEntries} onEntryPress={handleEntryPress} />
                  </View>
                ) : null}

                {dayJournals.length > 0 ? (
                  <View style={styles.journalsWrap}>
                    {dayJournals.map((journal) => {
                      const time = new Date(journal.timestamp).toLocaleTimeString(undefined, {
                        hour: 'numeric',
                        minute: '2-digit',
                      });
                      return (
                        <TouchableOpacity
                          key={journal.id}
                          style={[styles.journalCard, { backgroundColor: colors.surface }]}
                          onPress={() => handleJournalPress(journal)}
                          activeOpacity={0.8}
                          accessibilityRole="button"
                          accessibilityLabel="Journal entry"
                        >
                          {journal.title ? (
                            <Text style={[styles.journalTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                              {journal.title}
                            </Text>
                          ) : null}
                          <Text style={[styles.journalText, { color: colors.textPrimary }]} numberOfLines={6}>
                            {journal.content}
                          </Text>
                          <Text style={[styles.journalTime, { color: colors.textTertiary }]}>{time}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : null}
              </>
            ) : (
              <View style={styles.emptyState}>
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No memories on this date.</Text>
                <Text style={[styles.emptyHint, { color: colors.textTertiary }]}>Swipe to browse other days.</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </GestureDetector>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronBtn: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
    minWidth: 0,
  },
  headerTitle: {
    ...TEXT_STYLES.cardTitle,
    fontSize: 15,
    fontWeight: FONT_WEIGHTS.semibold,
    textAlign: 'center',
  },
  headerSubtitle: {
    ...TEXT_STYLES.entryInput,
    fontSize: 13,
    marginTop: 2,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  countryPrompt: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  countryPromptLabel: {
    ...TEXT_STYLES.cardTitle,
    fontSize: 15,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: SPACING.sm,
  },
  countryInput: {
    ...TEXT_STYLES.entryInput,
    fontSize: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  suggestionsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginTop: SPACING.sm,
  },
  suggestionChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
  },
  suggestionText: {
    ...TEXT_STYLES.entryInput,
    fontSize: 13,
  },
  swipeArea: {
    flex: 1,
  },
  gridWrap: {
    paddingHorizontal: SPACING.md,
    alignItems: 'center',
  },
  journalsWrap: {
    paddingHorizontal: SPACING.md,
    marginTop: SPACING.md,
    gap: SPACING.md,
  },
  journalCard: {
    borderRadius: 16,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  journalTitle: {
    fontSize: 15,
    fontFamily: FONTS.playfairDisplay,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: SPACING.xs,
  },
  journalText: {
    fontSize: 15,
    fontFamily: FONTS.playfairDisplay,
    fontStyle: 'italic',
    lineHeight: 22,
  },
  journalTime: {
    ...TEXT_STYLES.entryInput,
    fontSize: 11,
    marginTop: SPACING.sm,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: SPACING.xxl,
    paddingHorizontal: SPACING.lg,
  },
  emptyText: {
    ...TEXT_STYLES.entryInput,
    fontSize: 15,
    textAlign: 'center',
  },
  emptyHint: {
    ...TEXT_STYLES.entryInput,
    fontSize: 13,
    textAlign: 'center',
    marginTop: SPACING.xs,
  },
});

export default DayDetailScreen;
