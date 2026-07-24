// UnpackHighlightScreen — Stage 3a of 4
// Review suggested experiences: accept/skip, highlight at least 3 (bookmarked).
// Persists accepted entries then updates isBookmarked on highlighted entries before advancing.

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
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
import { persistSelectedExperiences } from '../../services/ExperienceImportService';
import { logger } from '../../utils/logger';
import type { SuggestedExperienceWithDisplayUris } from '../../services/ImportLatestService';
import type { Entry } from '../../models/Entry';
import type { TripAlbum } from '../../models/TripAlbum';

const FLOW_GRADIENT: [string, string, string] = [COLORS.babyBlue, COLORS.royalGold, COLORS.fern];

type NavProp = NativeStackNavigationProp<RootStackParamList>;
type RoutePropT = RouteProp<RootStackParamList, 'UnpackHighlight'>;

interface PendingHighlight {
  timestamp: string;
}

const MAX_THUMBS = 3;

function formatDate(isoString: string): string {
  try {
    return new Date(isoString).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch {
    return '';
  }
}

// ─── Suggestion Card ──────────────────────────────────────────────────────────

interface SuggestionCardProps {
  suggestion: SuggestedExperienceWithDisplayUris;
  isAccepted: boolean;
  isHighlighted: boolean;
  onSkip: () => void;
  onToggleAccept: () => void;
  onToggleHighlight: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
}

const SuggestionCard: React.FC<SuggestionCardProps> = ({
  suggestion, isAccepted, isHighlighted, onSkip, onToggleAccept, onToggleHighlight, colors,
}) => {
  const thumbs = suggestion.assets
    .slice(0, MAX_THUMBS)
    .map(a => a.displayUri ?? a.uri)
    .filter(Boolean);

  return (
    <View style={[
      cardStyles.container,
      {
        backgroundColor: colors.surface,
        borderColor: isHighlighted ? COLORS.royalGold : colors.border,
        borderWidth: isHighlighted ? 1.5 : StyleSheet.hairlineWidth,
      },
    ]}>
      {/* Tri-color gradient accent strip — only when highlighted */}
      {isHighlighted && (
        <LinearGradient
          colors={FLOW_GRADIENT}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={cardStyles.highlightStrip}
        />
      )}

      {/* Full-width photo area with date overlay */}
      <View style={cardStyles.photoArea}>
        {thumbs.length > 0 ? (
          <View style={cardStyles.thumbRow}>
            {thumbs.map((uri, i) => (
              <Image key={i} source={{ uri }} style={cardStyles.thumb} resizeMode="cover" />
            ))}
          </View>
        ) : (
          <View style={[cardStyles.thumbRow, cardStyles.noPhoto, { backgroundColor: colors.surfaceVariant }]}>
            <Ionicons name="image-outline" size={32} color={colors.textSecondary} />
          </View>
        )}
        {/* Gradient scrim + date overlay */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.6)']}
          style={cardStyles.scrim}
        >
          <AppText style={cardStyles.photoDate}>
            {formatDate(suggestion.timestamp)}
            {suggestion.assets.length > 1 ? ` · ${suggestion.assets.length} photos` : ''}
          </AppText>
        </LinearGradient>
      </View>

      {/* Action row */}
      <View style={[cardStyles.actions, { borderTopColor: colors.border }]}>
        {/* Skip */}
        <TouchableOpacity onPress={onSkip} style={cardStyles.skipBtn} activeOpacity={0.7}>
          <AppText style={[cardStyles.skipText, { color: colors.textTertiary }]}>Skip</AppText>
        </TouchableOpacity>

        <View style={cardStyles.rightActions}>
          {/* Highlight star */}
          <TouchableOpacity
            onPress={onToggleHighlight}
            style={[
              cardStyles.starBtn,
              {
                backgroundColor: isHighlighted ? COLORS.royalGold + '22' : colors.surfaceVariant,
                borderColor: isHighlighted ? COLORS.royalGold : colors.border,
              },
            ]}
            activeOpacity={0.7}
            accessibilityLabel={isHighlighted ? 'Remove highlight' : 'Highlight this moment'}
          >
            <Ionicons
              name={isHighlighted ? 'star' : 'star-outline'}
              size={17}
              color={isHighlighted ? COLORS.royalGold : colors.textSecondary}
            />
          </TouchableOpacity>

          {/* Accept toggle */}
          <TouchableOpacity
            onPress={onToggleAccept}
            style={[
              cardStyles.keepBtn,
              { backgroundColor: isAccepted ? COLORS.babyBlue : colors.surfaceVariant, borderColor: isAccepted ? COLORS.babyBlue : colors.border },
            ]}
            activeOpacity={0.7}
          >
            <Ionicons
              name={isAccepted ? 'checkmark' : 'add'}
              size={14}
              color={isAccepted ? COLORS.black : colors.textSecondary}
            />
            <AppText style={[cardStyles.keepText, { color: isAccepted ? COLORS.black : colors.textSecondary }]}>
              {isAccepted ? 'Kept' : 'Keep'}
            </AppText>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const PHOTO_HEIGHT = 180;

const cardStyles = StyleSheet.create({
  container: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: SPACING.sm,
  },
  highlightStrip: {
    height: 3,
  },
  photoArea: {
    height: PHOTO_HEIGHT,
  },
  thumbRow: {
    flexDirection: 'row',
    height: PHOTO_HEIGHT,
    gap: 2,
  },
  thumb: {
    flex: 1,
    height: PHOTO_HEIGHT,
  },
  noPhoto: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 72,
    justifyContent: 'flex-end',
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  photoDate: {
    fontFamily: FONTS.inter,
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: '#FFFFFF',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    gap: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  skipBtn: {
    paddingVertical: SPACING.xs,
    paddingRight: SPACING.sm,
  },
  skipText: {
    fontFamily: FONTS.inter,
    fontSize: 14,
  },
  rightActions: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  starBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keepBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
  },
  keepText: {
    fontFamily: FONTS.inter,
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.semibold as any,
  },
});

// ─── Main Screen ─────────────────────────────────────────────────────────────

const UnpackHighlightScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropT>();
  const {
    albumId,
    suggestions: initialSuggestions,
    albumName,
    albumStartDate,
    albumEndDate,
    albumDescription,
  } = route.params;
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { entries, tripAlbums, createEntry, updateEntry, refreshData, createTripAlbum } = useAppContext();

  const [suggestions, setSuggestions] = useState<SuggestedExperienceWithDisplayUris[]>(
    () => initialSuggestions
  );
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(() => new Set());
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const [pendingHighlights, setPendingHighlights] = useState<PendingHighlight[]>([]);

  const minHighlights = Math.min(3, suggestions.length);
  const canContinue = highlightedIds.size >= minHighlights;
  const needed = minHighlights - highlightedIds.size;

  // After persistSelectedExperiences + refreshData, entries is fresh.
  // Find entries matching highlighted suggestion timestamps and set isBookmarked.
  useEffect(() => {
    if (pendingHighlights.length === 0) return;

    const timestamps = pendingHighlights.map(h => h.timestamp);
    const matched: Entry[] = entries.filter(e => timestamps.includes(e.timestamp));

    if (matched.length === 0) return; // entries not refreshed yet, wait

    const toProcess = [...pendingHighlights];
    setPendingHighlights([]); // clear to prevent re-firing

    Promise.all(matched.map(entry => updateEntry({ ...entry, isBookmarked: true })))
      .then(() => {
        navigation.navigate('UnpackUnpacking', {
          albumId,
          highlightedIds: matched.map(e => e.id),
        });
      })
      .catch(err => {
        logger.error('UnpackHighlight: isBookmarked update failed', err);
        // Proceed anyway — isBookmarked is optional for the output
        navigation.navigate('UnpackUnpacking', {
          albumId,
          highlightedIds: matched.map(e => e.id),
        });
      });
  }, [entries, pendingHighlights]);

  const handleSkip = useCallback((id: string) => {
    setSuggestions(prev => prev.filter(s => s.id !== id));
    setAcceptedIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    setHighlightedIds(prev => { const next = new Set(prev); next.delete(id); return next; });
  }, []);

  const handleToggleAccept = useCallback((id: string) => {
    setAcceptedIds(prev => {
      const isCurrentlyAccepted = prev.has(id);
      const nextAccepted = new Set(prev);
      if (isCurrentlyAccepted) {
        nextAccepted.delete(id);
        setHighlightedIds(h => { const hn = new Set(h); hn.delete(id); return hn; });
      } else {
        nextAccepted.add(id);
      }
      return nextAccepted;
    });
  }, []);

  const handleToggleHighlight = useCallback((id: string) => {
    setHighlightedIds(prev => {
      const isCurrentlyHighlighted = prev.has(id);
      const nextHighlighted = new Set(prev);
      if (isCurrentlyHighlighted) {
        nextHighlighted.delete(id);
      } else {
        nextHighlighted.add(id);
        setAcceptedIds(a => { const an = new Set(a); an.add(id); return an; });
      }
      return nextHighlighted;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setAcceptedIds(new Set(suggestions.map(s => s.id)));
  }, [suggestions]);

  const handleContinue = async () => {
    if (!canContinue || saving) return;
    setSaving(true);
    try {
      // Create the TripAlbum now — deferred from Stage 1 so abandoned flows
      // never leave an empty album in the user's profile.
      if (albumName && albumStartDate && albumEndDate) {
        const now = new Date().toISOString();
        const album: TripAlbum = {
          id: albumId,
          name: albumName,
          startDate: albumStartDate,
          endDate: albumEndDate,
          description: albumDescription,
          createdAt: now,
          updatedAt: now,
        };
        await createTripAlbum(album, 'unpack');
      }

      await persistSelectedExperiences({
        suggestions,
        selectedIds: acceptedIds,
        existingEntries: entries,
        tripAlbums,
        createEntry,
        refreshData,
        albumId,
      });

      const highlighted = suggestions
        .filter(s => highlightedIds.has(s.id))
        .map(s => ({ timestamp: s.timestamp }));

      if (highlighted.length === 0) {
        // Nothing to highlight — navigate directly
        navigation.navigate('UnpackUnpacking', { albumId, highlightedIds: [] });
        setSaving(false);
        return;
      }

      // useEffect will find entries by timestamp, set isBookmarked, then navigate
      setPendingHighlights(highlighted);
    } catch (error) {
      logger.error('UnpackHighlight: persist failed', error);
      Alert.alert('Something went wrong', 'Memories could not be saved. Please try again.');
      setSaving(false);
    }
  };

  const isEmpty = suggestions.length === 0;

  const renderItem = useCallback(({ item }: { item: SuggestedExperienceWithDisplayUris }) => (
    <SuggestionCard
      suggestion={item}
      isAccepted={acceptedIds.has(item.id)}
      isHighlighted={highlightedIds.has(item.id)}
      onSkip={() => handleSkip(item.id)}
      onToggleAccept={() => handleToggleAccept(item.id)}
      onToggleHighlight={() => handleToggleHighlight(item.id)}
      colors={colors}
    />
  ), [acceptedIds, highlightedIds, handleSkip, handleToggleAccept, handleToggleHighlight, colors]);

  const ListHeader = useMemo(() => (
    <View style={styles.listHeader}>
      <AppText style={[styles.screenTitle, { color: colors.textPrimary }]}>
        Highlight what mattered
      </AppText>
      <AppText style={[styles.screenSubtitle, { color: colors.textSecondary }]}>
        {suggestions.length} moment{suggestions.length !== 1 ? 's' : ''} found.{' '}
        {minHighlights > 0 ? `Star at least ${minHighlights} to continue.` : ''}
      </AppText>

      {suggestions.length > 1 && (
        <TouchableOpacity
          onPress={handleSelectAll}
          style={[styles.selectAllBtn, { borderColor: colors.border }]}
          activeOpacity={0.7}
        >
          <AppText style={[styles.selectAllText, { color: colors.textPrimary }]}>Keep all</AppText>
        </TouchableOpacity>
      )}
    </View>
  ), [suggestions.length, minHighlights, handleSelectAll, colors]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <MeshGradientBackground baseColor={colors.background} lightMode={!isDark} />

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
        </View>
        <UnpackStepBar currentStage={3} />
      </View>

      {isEmpty ? (
        <View style={[styles.emptyState, { paddingBottom: insets.bottom + SPACING.xl }]}>
          <AppText style={[styles.emptyTitle, { color: colors.textPrimary }]}>
            No moments found
          </AppText>
          <AppText style={[styles.emptyBody, { color: colors.textSecondary }]}>
            Try going back and selecting different photos.
          </AppText>
          <TouchableOpacity
            style={[styles.emptyBackBtn, { backgroundColor: colors.surface }]}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <AppText style={[styles.emptyBackText, { color: colors.textPrimary }]}>← Go back</AppText>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={suggestions}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          ListHeaderComponent={ListHeader}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 120 },
          ]}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Footer */}
      {!isEmpty && (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, SPACING.md) + SPACING.md, borderTopColor: colors.border }]}>
          {saving ? (
            <View style={[styles.ctaBtn, { backgroundColor: colors.surface, opacity: 0.8 }]}>
              <ActivityIndicator color={colors.textPrimary} size="small" />
              <AppText style={[styles.ctaText, { color: colors.textPrimary }]}>Saving…</AppText>
            </View>
          ) : canContinue ? (
            <TouchableOpacity
              style={[styles.ctaBtn, { backgroundColor: colors.buttonGray }]}
              onPress={handleContinue}
              activeOpacity={0.85}
            >
              <AppText style={[styles.ctaText, { color: colors.textPrimary }]}>Continue →</AppText>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.ctaBtn, { backgroundColor: colors.surface, opacity: 0.6 }]}
              disabled
            >
              <Ionicons name="star-outline" size={16} color={colors.textSecondary} />
              <AppText style={[styles.ctaText, { color: colors.textSecondary }]}>
                {needed === 1 ? 'Star 1 more to continue' : `Star ${needed} more to continue`}
              </AppText>
            </TouchableOpacity>
          )}
        </View>
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
    marginBottom: SPACING.md,
  },
  backBtn: {
    padding: SPACING.xs,
    marginLeft: -SPACING.xs,
  },
  listContent: {
    paddingHorizontal: SPACING.lg,
  },
  listHeader: {
    paddingTop: SPACING.md,
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
    lineHeight: 20,
    marginBottom: SPACING.md,
  },
  selectAllBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: SPACING.xs + 2,
    paddingHorizontal: SPACING.md,
    alignSelf: 'flex-start',
  },
  selectAllText: {
    fontFamily: FONTS.inter,
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.semibold as any,
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
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    borderRadius: 14,
    paddingVertical: SPACING.md,
  },
  ctaText: {
    fontFamily: FONTS.inter,
    fontSize: 16,
    fontWeight: FONT_WEIGHTS.semibold as any,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    gap: SPACING.md,
  },
  emptyTitle: {
    fontFamily: FONTS.playfairDisplay,
    fontSize: 22,
    fontStyle: 'italic',
    fontWeight: FONT_WEIGHTS.bold as any,
    textAlign: 'center',
  },
  emptyBody: {
    fontFamily: FONTS.inter,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  emptyBackBtn: {
    borderRadius: 12,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
  },
  emptyBackText: {
    fontFamily: FONTS.inter,
    fontSize: 15,
    fontWeight: FONT_WEIGHTS.semibold as any,
  },
});

export default UnpackHighlightScreen;
