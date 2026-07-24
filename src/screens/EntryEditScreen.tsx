// EntryEditScreen
// Edit entry details — same layout as CaptureSavedScreen:
// FeedStyleEntryCard + "Add more details:" + [Write A Caption / Emotion check] + Bookmark.
// Each action (caption, emotion, bookmark) persists immediately; no manual save button.

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, useIsFocused } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { RootStackParamList } from '../navigation/types';
import { useAppContext } from '../context/AppContext';
import { COLORS, SPACING, FONTS, FONT_WEIGHTS } from '../config/constants';
import { logger } from '../utils/logger';
import { useTheme } from '../context/ThemeContext';
import BackArrow from '../components/common/icons/BackArrow';
import PenIcon from '../components/common/icons/PenIcon';
import HeartIcon from '../components/common/icons/HeartIcon';
import CompassIcon from '../components/common/icons/CompassIcon';
import FeedStyleEntryCard from '../components/common/FeedStyleEntryCard';
import LoadingSpinner from '../components/common/LoadingSpinner';
import type { ThemeColors } from '../config/theme';

type EntryEditNavigationProp = NativeStackNavigationProp<RootStackParamList, 'EntryEdit'>;
type EntryEditRouteProp = RouteProp<RootStackParamList, 'EntryEdit'>;

const EntryEditScreen: React.FC = () => {
  const navigation = useNavigation<EntryEditNavigationProp>();
  const route = useRoute<EntryEditRouteProp>();
  const { colors } = useTheme();
  const { entryId } = route.params;
  const focusField = route.params?.focusField;
  const {
    entries,
    updateEntry,
    pendingEmotionLabels,
    setPendingEmotionLabels,
    pendingEmotionNote,
    setPendingEmotionNote,
  } = useAppContext();

  const entry = useMemo(() => entries.find(e => e.id === entryId), [entries, entryId]);

  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const hasHandledInitialFocusRef = useRef(false);

  const { width: windowWidth } = useWindowDimensions();
  const scaleFactor = Math.min(Math.max(windowWidth, 320), 430) / 390;
  const safeTop = Number.isFinite(insets.top) ? insets.top : 0;
  const safeBottom = Number.isFinite(insets.bottom) ? insets.bottom : 0;

  const CARD_INSET = 24 * scaleFactor;
  const cardWidth = windowWidth - CARD_INSET * 2;

  const [emotionLabels, setEmotionLabels] = useState<string[]>([]);
  const [emotionNote, setEmotionNote] = useState('');
  const [isBookmarked, setIsBookmarked] = useState(false);

  useEffect(() => {
    if (!entry) return;
    setEmotionLabels(entry.emotionLabels ?? []);
    setEmotionNote(entry.emotionNote ?? '');
    setIsBookmarked(entry.isBookmarked ?? false);
  }, [entry]);

  // Reset one-time focus-field handling when editing a different entry.
  useEffect(() => {
    hasHandledInitialFocusRef.current = false;
  }, [entryId]);

  // Apply pending emotion values returned from EmotionCaptureScreen; persist immediately.
  useEffect(() => {
    if (!isFocused || !entry) return;
    if (pendingEmotionLabels === null) return;

    const updatedLabels = pendingEmotionLabels;
    const updatedNote = pendingEmotionNote?.trim() ?? '';
    setEmotionLabels(updatedLabels);
    setEmotionNote(updatedNote);
    setPendingEmotionLabels(null);
    setPendingEmotionNote(null);

    updateEntry({ ...entry, emotionLabels: updatedLabels, emotionNote: updatedNote })
      .catch(err => logger.error('EntryEdit: updateEntry (emotion) failed', err));
  }, [isFocused, pendingEmotionLabels, entry]);

  // Auto-navigate to the requested sub-editor on first focus.
  useEffect(() => {
    if (!entry || !focusField || hasHandledInitialFocusRef.current) return;
    hasHandledInitialFocusRef.current = true;

    const timer = setTimeout(() => {
      if (focusField === 'title' || focusField === 'description') {
        navigation.navigate('NotesEditor', { entryId, editEntryDescription: true });
      } else if (focusField === 'emotion') {
        navigation.navigate('EmotionCapture', {
          returnFrom: 'EntryEdit',
          initialLabels: emotionLabels,
          entryId,
        });
      }
      navigation.setParams({ focusField: undefined });
    }, 100);

    return () => clearTimeout(timer);
  }, [entry, focusField, entryId, navigation]);

  const handleBookmarkToggle = () => {
    if (!entry) return;
    const next = !isBookmarked;
    setIsBookmarked(next);
    updateEntry({ ...entry, isBookmarked: next })
      .catch(err => logger.error('EntryEdit: updateEntry (bookmark) failed', err));
  };

  const handleCaptionPress = () => {
    if (!entry) return;
    navigation.navigate('NotesEditor', { entryId: entry.id, editEntryDescription: true });
  };

  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!entry) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: safeTop }]}>
        <LoadingSpinner />
      </View>
    );
  }

  const liveEntry = { ...entry, isBookmarked };

  return (
    <View style={[styles.container, { paddingTop: safeTop }]}>

      <View style={[styles.backRow, { marginTop: SPACING.sm + 6 * scaleFactor }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          activeOpacity={0.7}
        >
          <BackArrow width={19 * scaleFactor} height={21 * scaleFactor} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <View style={[styles.contentBlock, { paddingTop: SPACING.lg + 14 * scaleFactor }]}>
        <View style={[styles.cardWrapper, { paddingHorizontal: CARD_INSET }]}>
          <FeedStyleEntryCard
            entry={liveEntry}
            width={cardWidth}
            aspectRatio={3 / 4}
          />
        </View>

        <Text style={[styles.addMoreLabel, { fontSize: 13 * scaleFactor }]}>Add more details:</Text>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleCaptionPress}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Write a caption"
          >
            <PenIcon width={16 * scaleFactor} height={16 * scaleFactor} color={colors.textPrimary} />
            <Text style={[styles.actionButtonText, { fontSize: 13 * scaleFactor }]}>Write A Caption</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() =>
              navigation.navigate('EmotionCapture', {
                returnFrom: 'EntryEdit',
                initialLabels: emotionLabels,
                entryId,
              })
            }
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Emotion check"
          >
            <HeartIcon width={16 * scaleFactor} height={16 * scaleFactor} color={colors.textPrimary} />
            <Text style={[styles.actionButtonText, { fontSize: 13 * scaleFactor }]}>Emotion check</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[
            styles.bookmarkButton,
            { marginBottom: safeBottom + SPACING.lg },
            isBookmarked && styles.bookmarkButtonActive,
          ]}
          onPress={handleBookmarkToggle}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={isBookmarked ? 'Remove bookmark' : 'Bookmark this experience'}
          accessibilityState={{ selected: isBookmarked }}
        >
          {isBookmarked && (
            <LinearGradient
              colors={[COLORS.babyBlue, COLORS.royalGold, COLORS.fern]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[StyleSheet.absoluteFillObject, { borderRadius: 24 * scaleFactor }]}
            />
          )}
          <CompassIcon width={16 * scaleFactor} height={16 * scaleFactor} color={colors.textPrimary} />
          <Text style={[styles.actionButtonText, { fontSize: 13 * scaleFactor }]}>Bookmark</Text>
        </TouchableOpacity>
      </View>

    </View>
  );
};

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: { justifyContent: 'center', alignItems: 'center' },
    backRow: { paddingHorizontal: 18 },
    backButton: {
      flexDirection: 'row',
      alignItems: 'center',
      minWidth: 40,
    },
    contentBlock: { flex: 1 },
    cardWrapper: { marginBottom: SPACING.sm },
    addMoreLabel: {
      fontFamily: FONTS.inter,
      fontWeight: FONT_WEIGHTS.semibold,
      color: colors.textPrimary,
      textAlign: 'center',
      marginBottom: SPACING.sm,
    },
    actionRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 12,
      marginBottom: 10,
    },
    actionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderWidth: 1,
      borderColor: colors.textPrimary,
      borderRadius: 24,
      paddingHorizontal: 14,
      paddingVertical: 9,
      backgroundColor: 'transparent',
    },
    bookmarkButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderWidth: 1,
      borderColor: colors.textPrimary,
      borderRadius: 24,
      paddingHorizontal: 20,
      paddingVertical: 9,
      alignSelf: 'center',
      backgroundColor: 'transparent',
      overflow: 'hidden',
    },
    bookmarkButtonActive: {
      borderColor: COLORS.babyBlue,
    },
    actionButtonText: {
      fontFamily: FONTS.inter,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.textPrimary,
    },
  });
}

export default EntryEditScreen;
