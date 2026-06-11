// CaptureSavedScreen
// Post-save confirmation screen. Shows SAVED! heading, a feed-style card of the entry,
// and optional enrichment buttons (Write A Caption / Emotion check / Bookmark).
// All enrichments call updateEntry directly since the entry is already persisted.

import React, { useState, useEffect, useMemo } from 'react';
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
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../config/theme';
import BackArrow from '../components/common/icons/BackArrow';
import PenIcon from '../components/common/icons/PenIcon';
import HeartIcon from '../components/common/icons/HeartIcon';
import CompassIcon from '../components/common/icons/CompassIcon';
import FeedStyleEntryCard from '../components/common/FeedStyleEntryCard';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { logger } from '../utils/logger';

type CaptureSavedNavigationProp = NativeStackNavigationProp<RootStackParamList, 'CaptureSaved'>;
type CaptureSavedRouteProp = RouteProp<RootStackParamList, 'CaptureSaved'>;

const CaptureSavedScreen: React.FC = () => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<CaptureSavedNavigationProp>();
  const route = useRoute<CaptureSavedRouteProp>();
  const isFocused = useIsFocused();
  const { entryId, previewFirstPhotoUri } = route.params;

  const {
    entries,
    updateEntry,
    pendingEmotionLabels,
    setPendingEmotionLabels,
    pendingEmotionNote,
    setPendingEmotionNote,
  } = useAppContext();

  const entry = useMemo(() => entries.find(e => e.id === entryId), [entries, entryId]);

  const displayEntry = useMemo(() => {
    if (entry) return entry;
    if (previewFirstPhotoUri) {
      const now = new Date().toISOString();
      return {
        id: entryId,
        type: 'experience' as const,
        description: '',
        mediaType: 'photo' as const,
        photoPaths: [previewFirstPhotoUri],
        mediaPaths: [previewFirstPhotoUri],
        storageUrls: [],
        timestamp: now,
        isDraft: false,
        isAwe: false,
      };
    }
    return null;
  }, [entry, entryId, previewFirstPhotoUri]);

  const [emotionLabels, setEmotionLabels] = useState<string[]>([]);
  const [emotionNote, setEmotionNote] = useState('');
  const [isAwe, setIsAwe] = useState(false);

  const styles = useMemo(() => createStyles(colors), [colors]);
  const { width: windowWidth } = useWindowDimensions();
  const scaleFactor = Math.min(Math.max(windowWidth, 320), 430) / 390;
  const safeTop = Number.isFinite(insets.top) ? insets.top : 0;
  const safeBottom = Number.isFinite(insets.bottom) ? insets.bottom : 0;

  const CARD_INSET = 24 * scaleFactor;
  const cardWidth = windowWidth - CARD_INSET * 2;

  useEffect(() => {
    if (!entry) return;
    setEmotionLabels(entry.emotionLabels ?? []);
    setEmotionNote(entry.emotionNote ?? '');
    setIsAwe(entry.isAwe ?? false);
  }, [entry]);

  // ─── Emotion return handoff ────────────────────────────────────────────────

  useEffect(() => {
    if (!isFocused || !entry) return;
    if (pendingEmotionLabels === null) return;

    const updatedEntry = {
      ...entry,
      emotionLabels: pendingEmotionLabels,
      emotionNote: pendingEmotionNote?.trim() ?? '',
    };
    setEmotionLabels(pendingEmotionLabels);
    setEmotionNote(pendingEmotionNote ?? '');
    setPendingEmotionLabels(null);
    setPendingEmotionNote(null);

    updateEntry(updatedEntry).catch(err => logger.error('CaptureSaved: updateEntry (emotion) failed', err));
  }, [isFocused, pendingEmotionLabels, entry, pendingEmotionNote, setPendingEmotionLabels, setPendingEmotionNote, updateEntry]);

  // ─── Bookmark toggle ───────────────────────────────────────────────────────

  const handleBookmarkToggle = () => {
    if (!entry) return;
    const next = !isAwe;
    setIsAwe(next);
    updateEntry({ ...entry, isAwe: next })
      .catch(err => logger.error('CaptureSaved: updateEntry (bookmark) failed', err));
  };

  const handleCaptionPress = () => {
    if (!entry) return;
    navigation.navigate('NotesEditor', {
      entryId: entry.id,
      editEntryDescription: true,
    });
  };

  // ─── Navigation ───────────────────────────────────────────────────────────

  const handleHome = () => {
    navigation.navigate('MainTabs', { screen: 'Home' });
  };

  if (!displayEntry) {
    return (
      <View style={[styles.container, styles.centered]}>
        <LoadingSpinner />
      </View>
    );
  }

  const liveEntry = { ...displayEntry, isAwe };

  return (
    <View style={[styles.container, { paddingTop: safeTop }]}>

      <View style={[styles.homeRow, { marginTop: SPACING.sm + 6 * scaleFactor }]}>
        <TouchableOpacity
          style={styles.homeButton}
          onPress={handleHome}
          accessibilityRole="button"
          accessibilityLabel="Go to Home"
          activeOpacity={0.7}
        >
          <BackArrow width={19 * scaleFactor} height={21 * scaleFactor} color={colors.textPrimary} />
          <Text style={[styles.homeButtonText, { fontSize: 14 * scaleFactor }]}>HOME</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.savedContentBlock, { paddingTop: SPACING.lg + 14 * scaleFactor }]}>
        <View style={styles.savedTitleWrap}>
          <Text style={[styles.savedTitle, { fontSize: 22 * scaleFactor }]}>SAVED!</Text>
        </View>

        <View style={[styles.cardWrapper, { paddingHorizontal: CARD_INSET }]}>
          <FeedStyleEntryCard
            entry={liveEntry}
            width={cardWidth}
            aspectRatio={3 / 4}
            directImageUri={previewFirstPhotoUri}
          />
        </View>

        <Text style={[styles.addMoreLabel, { fontSize: 13 * scaleFactor }]}>Add more details:</Text>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionButton, !entry && styles.actionButtonDisabled]}
            onPress={handleCaptionPress}
            disabled={!entry}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Write a caption"
          >
            <PenIcon width={16 * scaleFactor} height={16 * scaleFactor} color={colors.textPrimary} />
            <Text style={[styles.actionButtonText, { fontSize: 13 * scaleFactor }]}>Write A Caption</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, !entry && styles.actionButtonDisabled]}
            onPress={() =>
              entry &&
              navigation.navigate('EmotionCapture', {
                returnFrom: 'CaptureSaved',
                initialLabels: emotionLabels,
              })
            }
            disabled={!entry}
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
            isAwe && styles.bookmarkButtonActive,
            !entry && styles.actionButtonDisabled,
          ]}
          onPress={handleBookmarkToggle}
          disabled={!entry}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={isAwe ? 'Remove bookmark' : 'Bookmark this experience'}
          accessibilityState={{ selected: isAwe }}
        >
          {isAwe && (
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
    homeRow: {
      paddingHorizontal: 18,
    },
    savedContentBlock: {
      flex: 1,
    },
    savedTitleWrap: {
      alignItems: 'center',
      marginBottom: SPACING.md,
    },
    homeButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minWidth: 70,
    },
    homeButtonText: {
      fontFamily: FONTS.inter,
      fontWeight: FONT_WEIGHTS.semibold,
      color: colors.textPrimary,
    },
    savedTitle: {
      fontFamily: FONTS.inter,
      fontWeight: FONT_WEIGHTS.black,
      color: colors.textPrimary,
      textAlign: 'center',
    },
    cardWrapper: {
      marginBottom: SPACING.sm,
    },
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
    actionButtonDisabled: {
      opacity: 0.45,
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

export default CaptureSavedScreen;
