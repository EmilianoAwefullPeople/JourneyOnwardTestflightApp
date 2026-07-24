// UnpackUnpackingScreen — Stage 3b of 4: per-moment quick tags. Fully skippable.
// Shows top 1–3 highlighted moments by default; "show more" reveals the rest.
// Writes emotionLabels, title, emotionNote. No minimum — skip anytime.

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { useNavigation, useRoute, RouteProp, CommonActions } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AppText from '../../components/common/AppText';
import { MeshGradientBackground } from '../../components/common/MeshGradientBackground';
import { UnpackStepBar } from '../../components/unpack/UnpackStepBar';
import { useTheme } from '../../context/ThemeContext';
import { useAppContext } from '../../context/AppContext';
import { COLORS, FONTS, FONT_WEIGHTS, SPACING } from '../../config/constants';
import { RootStackParamList } from '../../navigation/types';
import { logger } from '../../utils/logger';
import type { Entry } from '../../models/Entry';

const FLOW_GRADIENT: [string, string, string] = [COLORS.babyBlue, COLORS.royalGold, COLORS.fern];

type NavProp = NativeStackNavigationProp<RootStackParamList>;
type RoutePropT = RouteProp<RootStackParamList, 'UnpackUnpacking'>;

// Chip set: display label → stored value aligned to existing vocabulary for aggregation
const EMOTION_CHIPS: { label: string; stored: string; emoji: string }[] = [
  { label: 'Awe',        stored: 'Amazed',    emoji: '🤩' },
  { label: 'Connection', stored: 'Loving',    emoji: '🥰' },
  { label: 'Challenge',  stored: 'Nervous',   emoji: '😬' },
  { label: 'Surprise',   stored: 'Surprised', emoji: '😮' },
  { label: 'Peaceful',   stored: 'Peaceful',  emoji: '😊' },
  { label: 'Funny',      stored: 'Cheerful',  emoji: '😄' },
  { label: 'Comfort',    stored: 'Joyful',    emoji: '🥳' },
  { label: 'Adventure',  stored: 'Excited',   emoji: '😃' },
];

const DEFAULT_VISIBLE = 3;

interface MomentState {
  labels: Set<string>; // stored values, e.g. 'Amazed'
  title: string;
  note: string;
}

function emptyMomentState(): MomentState {
  return { labels: new Set(), title: '', note: '' };
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    });
  } catch {
    return '';
  }
}

// ─── Moment Card ─────────────────────────────────────────────────────────────

interface MomentCardProps {
  entry: Entry;
  state: MomentState;
  onToggleLabel: (stored: string) => void;
  onChangeTitle: (text: string) => void;
  onChangeNote: (text: string) => void;
  colors: ReturnType<typeof useTheme>['colors'];
  isDark: boolean;
}

const BANNER_H = 160;

const MomentCard: React.FC<MomentCardProps> = ({
  entry, state, onToggleLabel, onChangeTitle, onChangeNote, colors, isDark,
}) => {
  const photoUri = entry.thumbPaths?.[0] ?? entry.mediaPaths?.[0] ?? entry.photoPaths?.[0];
  const location = entry.city ?? entry.country;

  return (
    <View style={[cardStyles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Full-width photo banner */}
      <View style={cardStyles.banner}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={cardStyles.bannerImg} resizeMode="cover" />
        ) : (
          <View style={[cardStyles.bannerImg, cardStyles.bannerPlaceholder, { backgroundColor: colors.surfaceVariant }]}>
            <Ionicons name="image-outline" size={32} color={colors.textSecondary} />
          </View>
        )}
        {/* Gradient scrim + date/location overlay */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.62)']}
          style={cardStyles.bannerScrim}
        >
          <AppText style={cardStyles.bannerDate}>{formatDate(entry.timestamp)}</AppText>
          {location && (
            <AppText style={cardStyles.bannerLocation} numberOfLines={1}>{location}</AppText>
          )}
        </LinearGradient>
      </View>

      {/* Chips */}
      <View style={cardStyles.section}>
        <AppText style={[cardStyles.sectionLabel, { color: colors.textSecondary }]}>
          What stood out?
        </AppText>
        <View style={cardStyles.chipWrap}>
          {EMOTION_CHIPS.map(chip => {
            const selected = state.labels.has(chip.stored);
            return (
              <TouchableOpacity
                key={chip.stored}
                onPress={() => onToggleLabel(chip.stored)}
                style={[
                  chipStyles.chip,
                  {
                    backgroundColor: selected ? 'transparent' : colors.surfaceVariant,
                    borderColor: selected ? 'transparent' : colors.border,
                  },
                ]}
                activeOpacity={0.75}
              >
                {selected && (
                  <LinearGradient
                    colors={FLOW_GRADIENT}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={StyleSheet.absoluteFillObject}
                  />
                )}
                <AppText style={chipStyles.emoji}>{chip.emoji}</AppText>
                <AppText style={[chipStyles.label, { color: selected ? COLORS.black : colors.textPrimary }]}>
                  {chip.label}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Title */}
      <View style={cardStyles.section}>
        <AppText style={[cardStyles.sectionLabel, { color: colors.textSecondary }]}>
          Name this moment · optional
        </AppText>
        <TextInput
          style={[cardStyles.lineInput, { color: colors.textPrimary, borderBottomColor: colors.border }]}
          placeholder="e.g. Sunset at the temple"
          placeholderTextColor={colors.textTertiary}
          value={state.title}
          onChangeText={onChangeTitle}
          maxLength={80}
          returnKeyType="done"
          autoCapitalize="sentences"
        />
      </View>

      {/* Note */}
      <View style={[cardStyles.section, cardStyles.lastSection]}>
        <AppText style={[cardStyles.sectionLabel, { color: colors.textSecondary }]}>
          Add a note · optional
        </AppText>
        <TextInput
          style={[cardStyles.lineInput, cardStyles.noteInput, { color: colors.textPrimary, borderBottomColor: colors.border }]}
          placeholder="What do you want to remember?"
          placeholderTextColor={colors.textTertiary}
          value={state.note}
          onChangeText={onChangeNote}
          multiline
          textAlignVertical="top"
          maxLength={500}
        />
      </View>
    </View>
  );
};

const cardStyles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: SPACING.lg,
    overflow: 'hidden',
  },
  banner: {
    height: BANNER_H,
  },
  bannerImg: {
    width: '100%',
    height: BANNER_H,
  },
  bannerPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 64,
    justifyContent: 'flex-end',
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  bannerDate: {
    fontFamily: FONTS.inter,
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: '#FFFFFF',
  },
  bannerLocation: {
    fontFamily: FONTS.inter,
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
  },
  section: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
  },
  lastSection: {
    paddingBottom: SPACING.lg,
  },
  sectionLabel: {
    fontFamily: FONTS.inter,
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.regular as any,
    marginBottom: SPACING.sm,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs + 2,
  },
  lineInput: {
    fontFamily: FONTS.inter,
    fontSize: 15,
    borderBottomWidth: 1,
    paddingHorizontal: 0,
    paddingVertical: SPACING.sm,
  },
  noteInput: {
    minHeight: 72,
  },
});

const chipStyles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    overflow: 'hidden',
  },
  emoji: {
    fontSize: 13,
  },
  label: {
    fontFamily: FONTS.inter,
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.semibold as any,
  },
});

// ─── Main Screen ─────────────────────────────────────────────────────────────

const UnpackUnpackingScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropT>();
  const { albumId, highlightedIds } = route.params;
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { entries, updateEntry, pendingOnboardingPath, completeOnboarding } = useAppContext();

  const highlightedEntries = useMemo(
    () => entries.filter(e => highlightedIds.includes(e.id)),
    [entries, highlightedIds]
  );

  const [visibleCount, setVisibleCount] = useState(() =>
    Math.min(DEFAULT_VISIBLE, highlightedEntries.length)
  );

  const [momentStates, setMomentStates] = useState<Map<string, MomentState>>(() => {
    const m = new Map<string, MomentState>();
    for (const entry of highlightedEntries) {
      m.set(entry.id, {
        labels: new Set(),
        title: entry.title ?? '',
        note: entry.emotionNote ?? '',
      });
    }
    return m;
  });

  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Fade-in animation for the "building your recap" overlay
  const genOpacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (generating) {
      Animated.timing(genOpacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    }
  }, [generating, genOpacity]);

  const GENERATING_PHRASES = [
    'Building your recap…',
    'Gathering your moments…',
    'Almost there…',
  ];
  const [phraseIndex, setPhraseIndex] = useState(0);
  const phraseOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!generating) return;
    let i = 0;
    const cycle = () => {
      Animated.timing(phraseOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
        i = Math.min(i + 1, GENERATING_PHRASES.length - 1);
        setPhraseIndex(i);
        Animated.timing(phraseOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      });
    };
    const t1 = setTimeout(cycle, 1800);
    const t2 = setTimeout(cycle, 3600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [generating, phraseOpacity]);

  const handleToggleLabel = useCallback((entryId: string, stored: string) => {
    setMomentStates(prev => {
      const next = new Map(prev);
      const cur = next.get(entryId) ?? emptyMomentState();
      const newLabels = new Set(cur.labels);
      if (newLabels.has(stored)) {
        newLabels.delete(stored);
      } else {
        newLabels.add(stored);
      }
      next.set(entryId, { ...cur, labels: newLabels });
      return next;
    });
  }, []);

  const handleChangeTitle = useCallback((entryId: string, text: string) => {
    setMomentStates(prev => {
      const next = new Map(prev);
      const cur = next.get(entryId) ?? emptyMomentState();
      next.set(entryId, { ...cur, title: text });
      return next;
    });
  }, []);

  const handleChangeNote = useCallback((entryId: string, text: string) => {
    setMomentStates(prev => {
      const next = new Map(prev);
      const cur = next.get(entryId) ?? emptyMomentState();
      next.set(entryId, { ...cur, note: text });
      return next;
    });
  }, []);

  const navigateToOutput = useCallback(async (alreadyShowingOverlay = false) => {
    if (pendingOnboardingPath === 'unpack') {
      await completeOnboarding('unpack');
      navigation.dispatch(
        CommonActions.reset({
          index: 1,
          routes: [
            { name: 'MainTabs' },
            { name: 'JourneyRecapPlayer', params: { albumId } },
          ],
        })
      );
      return;
    }
    if (!alreadyShowingOverlay) {
      setGenerating(true);
      setTimeout(() => navigation.navigate('JourneyRecapPlayer', { albumId }), 300);
    } else {
      navigation.navigate('JourneyRecapPlayer', { albumId });
    }
  }, [navigation, albumId, pendingOnboardingPath, completeOnboarding]);

  const handleDone = async () => {
    if (saving) return;
    setSaving(true);
    setGenerating(true); // show full-screen overlay immediately
    try {
      const updates: Promise<void>[] = [];
      for (const entry of highlightedEntries) {
        const state = momentStates.get(entry.id);
        if (!state) continue;
        const hasLabels = state.labels.size > 0;
        const hasTitle = state.title.trim().length > 0;
        const hasNote = state.note.trim().length > 0;
        if (hasLabels || hasTitle || hasNote) {
          updates.push(
            updateEntry({
              ...entry,
              ...(hasLabels && { emotionLabels: [...state.labels] }),
              ...(hasTitle && { title: state.title.trim() }),
              ...(hasNote && { emotionNote: state.note.trim() }),
            })
          );
        }
      }
      await Promise.all(updates);
    } catch (err) {
      logger.error('UnpackUnpacking: save failed', err);
    } finally {
      setSaving(false);
      navigateToOutput(true); // overlay already showing
    }
  };

  const visibleEntries = highlightedEntries.slice(0, visibleCount);
  const hiddenCount = highlightedEntries.length - visibleCount;
  const isEmpty = highlightedEntries.length === 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MeshGradientBackground baseColor={colors.background} lightMode={!isDark} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          {/* Skip affordance — top right */}
          <TouchableOpacity onPress={navigateToOutput} activeOpacity={0.7} style={styles.skipBtn}>
            <AppText style={[styles.skipText, { color: colors.textSecondary }]}>Skip</AppText>
          </TouchableOpacity>
        </View>
        <UnpackStepBar currentStage={3} />
      </View>

      {isEmpty ? (
        // Edge case: no highlighted entries made it through
        <View style={[styles.emptyState, { paddingBottom: insets.bottom + SPACING.xl }]}>
          <TouchableOpacity
            style={[styles.outputBtn, { backgroundColor: colors.buttonGray }]}
            onPress={navigateToOutput}
            activeOpacity={0.85}
          >
            <AppText style={[styles.outputBtnText, { color: colors.textPrimary }]}>
              See your Trip in Review →
            </AppText>
          </TouchableOpacity>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: insets.bottom + 100 },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Screen title + skip link */}
            <View style={styles.titleSection}>
              <AppText style={[styles.screenTitle, { color: colors.textPrimary }]}>
                A little more, if you like
              </AppText>
              <AppText style={[styles.screenSubtitle, { color: colors.textSecondary }]}>
                Tag what stood out, name a moment, add a note. All optional — skip anytime.
              </AppText>
            </View>

            {/* Moment cards */}
            {visibleEntries.map(entry => {
              const state = momentStates.get(entry.id) ?? emptyMomentState();
              return (
                <MomentCard
                  key={entry.id}
                  entry={entry}
                  state={state}
                  onToggleLabel={stored => handleToggleLabel(entry.id, stored)}
                  onChangeTitle={text => handleChangeTitle(entry.id, text)}
                  onChangeNote={text => handleChangeNote(entry.id, text)}
                  colors={colors}
                  isDark={isDark}
                />
              );
            })}

            {/* Show more */}
            {hiddenCount > 0 && (
              <TouchableOpacity
                style={[styles.showMoreBtn, { borderColor: colors.border }]}
                onPress={() => setVisibleCount(highlightedEntries.length)}
                activeOpacity={0.7}
              >
                <AppText style={[styles.showMoreText, { color: colors.textSecondary }]}>
                  Show {hiddenCount} more moment{hiddenCount !== 1 ? 's' : ''}
                </AppText>
                <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* Footer */}
      {!isEmpty && (
        <View style={[
          styles.footer,
          {
            paddingBottom: Math.max(insets.bottom, SPACING.md) + SPACING.md,
            borderTopColor: colors.border,
            backgroundColor: colors.background,
          },
        ]}>
          <TouchableOpacity
            style={[styles.doneBtn, { backgroundColor: colors.buttonGray, opacity: saving ? 0.7 : 1 }]}
            onPress={handleDone}
            activeOpacity={0.85}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={colors.textPrimary} size="small" />
            ) : (
              <AppText style={[styles.doneBtnText, { color: colors.textPrimary }]}>
                Done, let's see it →
              </AppText>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Full-screen overlay shown while saving + recap is loading */}
      {generating && (
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.generatingOverlay, { opacity: genOpacity }]}
          pointerEvents="box-only"
        >
          <MeshGradientBackground baseColor={colors.background} lightMode={!isDark} />
          <ActivityIndicator size="large" color={colors.textSecondary} style={{ marginBottom: SPACING.xl }} />
          <Animated.Text
            style={[styles.generatingText, { color: colors.textPrimary, opacity: phraseOpacity }]}
          >
            {GENERATING_PHRASES[phraseIndex]}
          </Animated.Text>
        </Animated.View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  backBtn: {
    padding: SPACING.xs,
    marginLeft: -SPACING.xs,
  },
  skipBtn: {
    padding: SPACING.xs,
    marginRight: -SPACING.xs,
  },
  skipText: {
    fontFamily: FONTS.inter,
    fontSize: 15,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
  },
  titleSection: {
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.lg,
  },
  screenTitle: {
    fontFamily: FONTS.playfairDisplay,
    fontSize: 26,
    fontStyle: 'italic',
    fontWeight: FONT_WEIGHTS.bold as any,
    marginBottom: SPACING.xs,
  },
  screenSubtitle: {
    fontFamily: FONTS.inter,
    fontSize: 14,
    lineHeight: 21,
  },
  showMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  showMoreText: {
    fontFamily: FONTS.inter,
    fontSize: 14,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  doneBtn: {
    borderRadius: 14,
    paddingVertical: SPACING.md,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  doneBtnText: {
    fontFamily: FONTS.inter,
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.semibold as any,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
  },
  outputBtn: {
    borderRadius: 14,
    paddingVertical: SPACING.md,
    alignItems: 'center' as const,
  },
  outputBtnText: {
    fontFamily: FONTS.inter,
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.semibold as any,
  },
  generatingOverlay: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  generatingText: {
    fontFamily: FONTS.inter,
    fontSize: 18,
    lineHeight: 28,
    textAlign: 'center',
  },
});

export default UnpackUnpackingScreen;
