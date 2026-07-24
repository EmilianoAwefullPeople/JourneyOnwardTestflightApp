// SuggestedAlbumsScreen
// Shows auto-detected trip candidates; user selects and confirms to persist as real TripAlbums.

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppContext } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { SPACING, FONTS, FONT_WEIGHTS } from '../config/constants';
import { TEXT_STYLES } from '../config/typography';
import { computeSuggestions, SuggestedTripAlbum } from '../services/TripAlbumSuggestionService';
import { EntryPhotoImage } from '../components/common/EntryPhotoImage';
import { TripAlbum } from '../models/TripAlbum';
import { Entry } from '../models/Entry';
import BackArrow from '../components/common/icons/BackArrow';

type Nav = NativeStackNavigationProp<RootStackParamList>;

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function buildCollage(
  entries: Entry[],
  styles: ReturnType<typeof buildStyles>,
  colors: { surface: string }
) {
  const previewImages: string[] = [];
  for (const entry of entries) {
    if (entry.mediaType === 'photo' && entry.photoPaths?.length > 0) {
      previewImages.push(...entry.photoPaths.slice(0, 3 - previewImages.length));
      if (previewImages.length >= 3) break;
    }
  }

  if (previewImages.length === 0) {
    return (
      <View style={styles.emptyPreview}>
        <Text style={styles.emptyPreviewText}>No photos</Text>
      </View>
    );
  }
  if (previewImages.length === 1) {
    return (
      <EntryPhotoImage
        uri={previewImages[0]}
        style={styles.singlePreview}
        resizeMode="cover"
        fallbackBackgroundColor={colors.surface}
      />
    );
  }
  if (previewImages.length === 2) {
    return (
      <View style={styles.splitPreview}>
        <EntryPhotoImage uri={previewImages[0]} style={styles.splitLeft} resizeMode="cover" fallbackBackgroundColor={colors.surface} />
        <EntryPhotoImage uri={previewImages[1]} style={styles.splitRight} resizeMode="cover" fallbackBackgroundColor={colors.surface} />
      </View>
    );
  }
  return (
    <View style={styles.mosaicPreview}>
      <EntryPhotoImage uri={previewImages[0]} style={styles.heroPreview} resizeMode="cover" fallbackBackgroundColor={colors.surface} />
      <View style={styles.stackedContainer}>
        <EntryPhotoImage uri={previewImages[1]} style={styles.stackedTop} resizeMode="cover" fallbackBackgroundColor={colors.surface} />
        <EntryPhotoImage uri={previewImages[2]} style={styles.stackedBottom} resizeMode="cover" fallbackBackgroundColor={colors.surface} />
      </View>
    </View>
  );
}

function buildStyles(colors: any, insets: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: insets.top + SPACING.sm,
      paddingHorizontal: SPACING.md,
      paddingBottom: SPACING.sm,
    },
    backButton: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: SPACING.sm,
      paddingRight: SPACING.md,
      gap: SPACING.xs,
    },
    backButtonText: {
      fontFamily: FONTS.inter,
      fontSize: 17,
      color: colors.textPrimary,
      fontWeight: FONT_WEIGHTS.semibold,
    },
    title: {
      ...TEXT_STYLES.cardTitle,
      fontSize: 22,
      fontWeight: FONT_WEIGHTS.bold,
      color: colors.textPrimary,
      marginTop: SPACING.xs,
      marginBottom: SPACING.xs,
    },
    subtitle: {
      ...TEXT_STYLES.entryInput,
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: SPACING.sm,
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: SPACING.xl,
    },
    loadingText: {
      ...TEXT_STYLES.entryInput,
      fontSize: 15,
      color: colors.textSecondary,
      marginTop: SPACING.md,
      textAlign: 'center',
    },
    emptyTitle: {
      ...TEXT_STYLES.cardTitle,
      fontSize: 17,
      fontWeight: FONT_WEIGHTS.semibold,
      color: colors.textPrimary,
      textAlign: 'center',
      marginBottom: SPACING.sm,
    },
    emptySubtext: {
      ...TEXT_STYLES.entryInput,
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
    },
    grid: {
      padding: SPACING.md,
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      justifyContent: 'space-between' as const,
      rowGap: SPACING.md,
    },
    card: { marginBottom: SPACING.xs },
    previewContainer: {
      width: '100%',
      aspectRatio: 1.08,
      borderRadius: 16,
      backgroundColor: colors.surface,
      overflow: 'hidden',
    },
    singlePreview: { width: '100%', height: '100%' },
    splitPreview: { width: '100%', height: '100%', flexDirection: 'row' as const },
    splitLeft: { width: '50%', height: '100%' },
    splitRight: { width: '50%', height: '100%' },
    mosaicPreview: { width: '100%', height: '100%', flexDirection: 'row' as const },
    heroPreview: { width: '67%', height: '100%' },
    stackedContainer: { width: '33%', height: '100%', flexDirection: 'column' as const },
    stackedTop: { width: '100%', height: '50%' },
    stackedBottom: { width: '100%', height: '50%' },
    emptyPreview: {
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.surface,
    },
    emptyPreviewText: {
      ...TEXT_STYLES.entryInput,
      fontSize: 12,
      color: colors.textSecondary,
    },
    selectionBadge: {
      position: 'absolute',
      top: SPACING.sm,
      right: SPACING.sm,
      width: 26,
      height: 26,
      borderRadius: 13,
      borderWidth: 2,
      borderColor: 'white',
      justifyContent: 'center',
      alignItems: 'center',
    },
    selectionBadgeSelected: {
      backgroundColor: colors.textPrimary,
    },
    selectionBadgeUnselected: {
      backgroundColor: 'rgba(0,0,0,0.35)',
    },
    checkmark: {
      color: colors.background,
      fontSize: 13,
      fontWeight: FONT_WEIGHTS.bold,
      lineHeight: 15,
    },
    albumInfo: { paddingTop: SPACING.sm },
    albumName: {
      ...TEXT_STYLES.cardTitle,
      fontSize: 15,
      fontWeight: FONT_WEIGHTS.semibold,
      color: colors.textPrimary,
      marginBottom: 2,
    },
    albumDate: {
      ...TEXT_STYLES.entryInput,
      fontSize: 12,
      color: colors.textSecondary,
      marginBottom: 1,
    },
    albumCount: {
      ...TEXT_STYLES.entryInput,
      fontSize: 12,
      color: colors.textSecondary,
    },
    footerSpace: {
      height: 90 + insets.bottom,
    },
    footer: {
      position: 'absolute' as const,
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: colors.background,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      paddingHorizontal: SPACING.md,
      paddingTop: SPACING.md,
      paddingBottom: insets.bottom > 0 ? insets.bottom : SPACING.md,
    },
    addButton: {
      backgroundColor: colors.textPrimary,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
    },
    addButtonDisabled: {
      opacity: 0.6,
    },
    addButtonText: {
      fontFamily: FONTS.inter,
      fontSize: 16,
      fontWeight: FONT_WEIGHTS.semibold,
      color: colors.background,
    },
  });
}

const SuggestedAlbumsScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { entries, createTripAlbum, refreshData } = useAppContext();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [status, setStatus] = useState<'loading' | 'empty' | 'results'>('loading');
  const [suggestions, setSuggestions] = useState<SuggestedTripAlbum[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isAdding, setIsAdding] = useState(false);

  const screenWidth = Dimensions.get('window').width;
  const cardWidth = (screenWidth - SPACING.md * 3) / 2;

  const styles = useMemo(() => buildStyles(colors, insets), [colors, insets]);

  useEffect(() => {
    const run = async () => {
      setStatus('loading');
      setSelectedIds(new Set());
      try {
        const results = await computeSuggestions(entries);
        setSuggestions(results);
        setStatus(results.length === 0 ? 'empty' : 'results');
      } catch {
        setStatus('empty');
      } finally {
        refreshData().catch(() => {});
      }
    };
    run();
    // Intentionally run once on mount; entries snapshot at open time is what we cluster
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleAddAlbums = useCallback(async () => {
    if (isAdding || selectedIds.size === 0) return;
    setIsAdding(true);
    try {
      const toCreate = suggestions.filter(s => selectedIds.has(s.id));
      for (const s of toCreate) {
        const album: TripAlbum = {
          id: generateId(),
          name: s.name,
          startDate: s.startDate,
          endDate: s.endDate,
          locationName: s.country !== 'Unknown' ? s.country : undefined,
        };
        await createTripAlbum(album, 'import');
      }
      navigation.goBack();
    } catch {
      setIsAdding(false);
    }
  }, [isAdding, selectedIds, suggestions, createTripAlbum, navigation]);

  const renderCard = useCallback((suggestion: SuggestedTripAlbum) => {
    const isSelected = selectedIds.has(suggestion.id);
    const startDate = new Date(suggestion.startDate);
    const endDate = new Date(suggestion.endDate);
    const sameYear = startDate.getFullYear() === endDate.getFullYear();
    const dateRange = sameYear
      ? `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
      : `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} – ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

    return (
      <TouchableOpacity
        key={suggestion.id}
        style={[styles.card, { width: cardWidth }]}
        onPress={() => toggleSelection(suggestion.id)}
        activeOpacity={0.85}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isSelected }}
        accessibilityLabel={`${suggestion.name}, ${isSelected ? 'selected' : 'not selected'}`}
      >
        <View style={styles.previewContainer}>
          {buildCollage(suggestion.entries, styles, colors)}
          <View style={[
            styles.selectionBadge,
            isSelected ? styles.selectionBadgeSelected : styles.selectionBadgeUnselected,
          ]}>
            {isSelected && <Text style={styles.checkmark}>✓</Text>}
          </View>
        </View>
        <View style={styles.albumInfo}>
          <Text style={styles.albumName} numberOfLines={1}>{suggestion.name}</Text>
          <Text style={styles.albumDate} numberOfLines={1}>{dateRange}</Text>
          <Text style={styles.albumCount}>
            {suggestion.entries.length} {suggestion.entries.length === 1 ? 'item' : 'items'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }, [selectedIds, cardWidth, styles, colors, toggleSelection]);

  const selectedCount = selectedIds.size;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <BackArrow width={19} height={21} color={colors.textPrimary} />
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Suggested Trips</Text>
        {status === 'results' && (
          <Text style={styles.subtitle}>
            {suggestions.length} trip{suggestions.length !== 1 ? 's' : ''} found · Tap to select
          </Text>
        )}
      </View>

      {status === 'loading' && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.textPrimary} />
          <Text style={styles.loadingText}>Finding your trips…</Text>
        </View>
      )}

      {status === 'empty' && (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>No trip suggestions yet</Text>
          <Text style={styles.emptySubtext}>
            Add more experiences with location data{'\n'}to unlock trip suggestions.
          </Text>
        </View>
      )}

      {status === 'results' && (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.grid}
        >
          {suggestions.map(renderCard)}
          {selectedCount > 0 && <View style={styles.footerSpace} />}
        </ScrollView>
      )}

      {status === 'results' && selectedCount > 0 && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.addButton, isAdding && styles.addButtonDisabled]}
            onPress={handleAddAlbums}
            disabled={isAdding}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`Add ${selectedCount} album${selectedCount !== 1 ? 's' : ''}`}
          >
            <Text style={styles.addButtonText}>
              {isAdding
                ? 'Adding…'
                : `Add ${selectedCount} Album${selectedCount !== 1 ? 's' : ''}`}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

export default SuggestedAlbumsScreen;
