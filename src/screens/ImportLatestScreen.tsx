// ImportLatestScreen
// Sync Latest Experiences: scan last 72h, show up to 12 suggested moments, Accept/Skip, then create entries.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Animated,
  Platform,
  FlatList,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import DateTimePicker from '@react-native-community/datetimepicker';
import { RootStackParamList } from '../navigation/types';
import { FONTS, FONT_WEIGHTS, SPACING, COLORS } from '../config/constants';
import { useTheme } from '../context/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';
import type { ThemeColors } from '../config/theme';
import { MeshGradientBackground } from '../components/common/MeshGradientBackground';
import BackArrow from '../components/common/icons/BackArrow';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../context/AppContext';
import { logger } from '../utils/logger';
import { formatEntryDate, reverseGeocode } from '../utils/dateUtils';
import type {
  ImportLatestProgress,
  ImportLatestRange,
  PickedGalleryAsset,
  SuggestedExperienceWithDisplayUris,
} from '../services/ImportLatestService';
import { isImportLatestAbortedError } from '../services/ImportLatestService';

import * as ImagePicker from 'expo-image-picker';
import {
  discoverExperienceSuggestions,
  persistSelectedExperiences,
} from '../services/ExperienceImportService';
import { ANIMATION_CONFIG, createStaggeredDelay } from '../utils/animations';
import { mapWithConcurrency } from '../utils/concurrency';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { FlashList } from '@shopify/flash-list';

type ImportLatestNavigationProp = NativeStackNavigationProp<RootStackParamList, 'ImportLatest'>;
type SyncMode = 'date' | 'gallery';

/** One decimal, clamped 0–100, for import progress bar label. */
function formatImportProgressPercent(percent: number): string {
  const clamped = Math.max(0, Math.min(100, percent));
  return `${(Math.round(clamped * 10) / 10).toFixed(1)}%`;
}

type ScreenState = 'filter' | 'loading' | 'list' | 'saving' | 'done' | 'error';
type QuickFilter = 'last24h' | 'last72h' | 'custom';

const GALLERY_SELECTION_LIMIT = 500;

const ImportLatestScreen: React.FC = () => {
  const navigation = useNavigation<ImportLatestNavigationProp>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { createEntry, refreshData, tripAlbums, entries } = useAppContext();

  const [state, setState] = useState<ScreenState>('filter');
  const [syncMode, setSyncMode] = useState<SyncMode | null>(null);
  const [isAwaitingGallery, setIsAwaitingGallery] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<QuickFilter>('last72h');
  const [customStartDate, setCustomStartDate] = useState<Date>(() => {
    const now = new Date();
    const prior = new Date(now.getTime());
    prior.setDate(now.getDate() - 7);
    return prior;
  });
  const [customEndDate, setCustomEndDate] = useState<Date>(() => new Date());
  const [filterError, setFilterError] = useState<string>('');
  const [activeRangeLabel, setActiveRangeLabel] = useState<string>('last 72 hours');
  const [suggestions, setSuggestions] = useState<SuggestedExperienceWithDisplayUris[]>([]);
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set());
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [addedCount, setAddedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [skippedDuplicateCount, setSkippedDuplicateCount] = useState(0);
  const [schemaFailureNotice, setSchemaFailureNotice] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressLabel, setProgressLabel] = useState('Preparing import…');
  const [progressDetail, setProgressDetail] = useState('');
  const [placeLabelsBySuggestionId, setPlaceLabelsBySuggestionId] = useState<Map<string, string>>(new Map());

  const importScanAbortRef = useRef<AbortController | null>(null);
  const importSaveAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', () => {
      importScanAbortRef.current?.abort();
      importSaveAbortRef.current?.abort();
    });
    return () => {
      unsubscribe();
      importScanAbortRef.current?.abort();
      importSaveAbortRef.current?.abort();
    };
  }, [navigation]);

  // Batch-geocode suggestion cards in the parent to avoid up to 12 burst CLGeocoder calls.
  // Dedup by coordinate bucket so nearby suggestions share one API call.
  useEffect(() => {
    if (suggestions.length === 0) return;
    let cancelled = false;

    const coordBucketToSuggestionIds = new Map<string, string[]>();
    const bucketToCoord = new Map<string, { lat: number; lng: number }>();

    for (const s of suggestions) {
      if (s.latitude == null || s.longitude == null) continue;
      const bucket = `${s.latitude.toFixed(2)},${s.longitude.toFixed(2)}`;
      if (!coordBucketToSuggestionIds.has(bucket)) {
        coordBucketToSuggestionIds.set(bucket, []);
        bucketToCoord.set(bucket, { lat: s.latitude, lng: s.longitude });
      }
      coordBucketToSuggestionIds.get(bucket)!.push(s.id);
    }

    const uniqueBuckets = Array.from(coordBucketToSuggestionIds.keys());
    if (uniqueBuckets.length === 0) return;

    (async () => {
      const labelMap = new Map<string, string>();
      await mapWithConcurrency(uniqueBuckets, 4, async (bucket) => {
        if (cancelled) return;
        const coord = bucketToCoord.get(bucket);
        if (!coord) return;
        try {
          const label = await reverseGeocode(coord.lat, coord.lng);
          if (label && !cancelled) {
            for (const id of coordBucketToSuggestionIds.get(bucket) ?? []) {
              labelMap.set(id, label);
            }
          }
        } catch {
          // Soft-fail; card shows 'Unknown place'
        }
      });
      if (!cancelled) setPlaceLabelsBySuggestionId(new Map(labelMap));
    })();

    return () => { cancelled = true; };
  }, [suggestions]);

  const runScan = useCallback(
    async (
      range: ImportLatestRange | undefined,
      rangeLabel: string,
    ) => {
    setState('loading');
    setErrorMessage('');
    setSchemaFailureNotice('');
    setActiveRangeLabel(rangeLabel);
    setProgressPercent(0);
    setProgressLabel('Preparing import…');
    setProgressDetail('');
    importScanAbortRef.current?.abort();
    const scanController = new AbortController();
    importScanAbortRef.current = scanController;
    try {
      const result = await discoverExperienceSuggestions({
        kind: 'latest',
        options: {
          range,
          signal: scanController.signal,
          onProgress: (progress: ImportLatestProgress) => {
            setProgressPercent(progress.percent);
            setProgressLabel(progress.label);
            const showCounts =
              progress.total > 0 &&
              (progress.total > 1 || progress.phase === 'fetch');
            if (showCounts) {
              setProgressDetail(`${progress.completed}/${progress.total}`);
            } else {
              setProgressDetail('');
            }
          },
        },
      });
      if (result.error) {
        setErrorMessage(result.error);
        setState('error');
        return;
      }
      setSuggestions(result.suggestions);
      setAcceptedIds(new Set(result.suggestions.map((s) => s.id)));
      setProgressPercent(100);
      setProgressLabel('Suggestions ready');
      setProgressDetail('');
      setState('list');
    } catch (e) {
      if (isImportLatestAbortedError(e)) {
        logger.log('ImportLatestScreen: import scan cancelled');
        return;
      }
      logger.error('ImportLatestScreen: runImportLatest failed', e);
      setErrorMessage('Could not load recent photos.');
      setState('error');
    } finally {
      if (importScanAbortRef.current === scanController) {
        importScanAbortRef.current = null;
      }
    }
    },
    []
  );

  const startScanForFilter = useCallback(
    (filter: QuickFilter) => {
      if (filter === 'last24h') {
        const now = Date.now();
        runScan({ createdAfter: now - 24 * 60 * 60 * 1000, createdBefore: now }, 'last 24 hours');
        return;
      }
      runScan(undefined, 'last 72 hours');
    },
    [runScan]
  );

  const handleStartScan = useCallback(() => {
    setFilterError('');
    if (!syncMode) {
      setFilterError('Please choose how to sync first.');
      return;
    }
    if (selectedFilter !== 'custom') {
      startScanForFilter(selectedFilter);
      return;
    }

    const normalizedStart = new Date(customStartDate);
    normalizedStart.setHours(0, 0, 0, 0);
    const normalizedEnd = new Date(customEndDate);
    normalizedEnd.setHours(23, 59, 59, 999);

    if (Number.isNaN(normalizedStart.getTime()) || Number.isNaN(normalizedEnd.getTime())) {
      setFilterError('Please choose a valid start and end date.');
      return;
    }
    if (normalizedStart.getTime() > normalizedEnd.getTime()) {
      setFilterError('Start date must be before end date.');
      return;
    }

    runScan(
      {
        createdAfter: normalizedStart.getTime(),
        createdBefore: normalizedEnd.getTime(),
      },
      `${customStartDate.toLocaleDateString()} to ${customEndDate.toLocaleDateString()}`
    );
  }, [
    customEndDate,
    customStartDate,
    runScan,
    selectedFilter,
    startScanForFilter,
    syncMode,
  ]);

  const toggleAccept = useCallback((id: string) => {
    setAcceptedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const skip = useCallback((id: string) => {
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
    setAcceptedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const handleAddExperiences = useCallback(async () => {
    const toAdd = suggestions.filter((s) => acceptedIds.has(s.id));
    if (toAdd.length === 0) return;

    importSaveAbortRef.current?.abort();
    const saveController = new AbortController();
    importSaveAbortRef.current = saveController;

    setState('saving');
    setProgressLabel('Saving experiences…');
    setSchemaFailureNotice('');
    try {
      const result = await persistSelectedExperiences({
        suggestions,
        selectedIds: acceptedIds,
        existingEntries: entries,
        tripAlbums: tripAlbums ?? [],
        createEntry,
        refreshData,
        signal: saveController.signal,
        onProgress: (completed, total) => {
          setProgressLabel(`Saving ${completed} of ${total}…`);
        },
      });
      if (saveController.signal.aborted) {
        return;
      }
      setAddedCount(result.added);
      setFailedCount(result.failed);
      setSkippedDuplicateCount(result.skippedDuplicates);
      setSchemaFailureNotice(result.schemaFailureNotice ?? '');
      setState('done');
    } finally {
      if (importSaveAbortRef.current === saveController) {
        importSaveAbortRef.current = null;
      }
    }
  }, [suggestions, acceptedIds, entries, tripAlbums, createEntry, refreshData]);

  const handleBack = useCallback(() => {
    if (state === 'loading' || state === 'saving') {
      importScanAbortRef.current?.abort();
      importSaveAbortRef.current?.abort();
    }
    try {
      navigation.goBack();
    } catch (e) {
      logger.warn('ImportLatestScreen: goBack failed', e);
    }
  }, [navigation, state]);

  const handleBackToHome = useCallback(() => {
    try {
      navigation.navigate('MainTabs', { screen: 'Home' });
    } catch (e) {
      logger.warn('ImportLatestScreen: navigate to Home failed', e);
      navigation.goBack();
    }
  }, [navigation]);

  const handleViewHome = useCallback(() => {
    try {
      navigation.navigate('MainTabs', { screen: 'Home' });
    } catch (e) {
      logger.warn('ImportLatestScreen: navigate to Home failed', e);
      navigation.goBack();
    }
  }, [navigation]);

  const handleChangeFilter = useCallback(() => {
    setFilterError('');
    setSyncMode(null);
    setState('filter');
  }, []);

  const handlePickFromGallery = useCallback(async () => {
    setFilterError('');
    // Activate the overlay before the picker opens so it is already rendered
    // the moment the picker sheet dismisses — covering any gap between the native
    // dismiss animation and the JS promise resolving with EXIF data.
    setIsAwaitingGallery(true);

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      selectionLimit: GALLERY_SELECTION_LIMIT,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      exif: true,
      quality: 1,
      orderedSelection: false,
    });

    if (result.canceled || result.assets.length === 0) {
      setIsAwaitingGallery(false);
      return;
    }

    const count = result.assets.length;
    const pickedLabel = `${count} photo${count !== 1 ? 's' : ''}`;
    setState('loading');
    setIsAwaitingGallery(false);
    setActiveRangeLabel(pickedLabel);
    setErrorMessage('');
    setSchemaFailureNotice('');
    setProgressPercent(0);
    setProgressLabel(`Grouping ${pickedLabel}…`);
    setProgressDetail('');

    importScanAbortRef.current?.abort();
    const scanController = new AbortController();
    importScanAbortRef.current = scanController;

    try {
      const picked: PickedGalleryAsset[] = result.assets.map((a) => ({
        uri: a.uri,
        width: a.width,
        height: a.height,
        assetId: a.assetId ?? null,
        exif: (a.exif as Record<string, unknown> | null | undefined) ?? null,
        fileSize: a.fileSize,
      }));

      const importResult = await discoverExperienceSuggestions({
        kind: 'selected',
        assets: picked,
        options: {
          signal: scanController.signal,
          onProgress: (progress) => {
            setProgressPercent(progress.percent);
            setProgressLabel(progress.label);
            setProgressDetail('');
          },
        },
      });

      if (importResult.error) {
        setErrorMessage(importResult.error);
        setState('error');
        return;
      }

      setSuggestions(importResult.suggestions);
      setAcceptedIds(new Set(importResult.suggestions.map((s) => s.id)));
      setProgressPercent(100);
      setProgressLabel('Suggestions ready');
      setProgressDetail('');
      setState('list');
    } catch (e) {
      if (isImportLatestAbortedError(e)) {
        logger.log('ImportLatestScreen: gallery scan cancelled');
        return;
      }
      logger.error('ImportLatestScreen: gallery scan failed', e);
      setErrorMessage('Could not process selected photos.');
      setState('error');
    } finally {
      if (importScanAbortRef.current === scanController) {
        importScanAbortRef.current = null;
      }
    }
  }, []);

  const acceptedCount = acceptedIds.size;

  const handleSelectAll = useCallback(() => {
    setAcceptedIds(new Set(suggestions.map((s) => s.id)));
  }, [suggestions]);

  const handleDeselectAll = useCallback(() => {
    setAcceptedIds(new Set());
  }, []);

  const totalPhotosInAccepted = useMemo(
    () => suggestions.filter((s) => acceptedIds.has(s.id)).reduce((sum, s) => sum + s.totalPhotos, 0),
    [suggestions, acceptedIds]
  );
  const isCustomRangeInvalid = customStartDate.getTime() > customEndDate.getTime();
  const isDateMode = syncMode === 'date';
  const isGalleryMode = syncMode === 'gallery';
  const isScanDisabled =
    !syncMode ||
    (isDateMode && selectedFilter === 'custom' && isCustomRangeInvalid);
  const styles = useMemo(
    () =>
      createStyles(colors as ThemeColors, insets),
    [colors, insets]
  );

  if (state === 'filter') {
    const quickOptions: Array<{ id: QuickFilter; label: string }> = [
      { id: 'last24h', label: 'Last 24 hours' },
      { id: 'last72h', label: 'Last 72 hours' },
      { id: 'custom', label: 'Select date range' },
    ];

    return (
      <View style={styles.container}>
        <MeshGradientBackground baseColor={colors.background} lightMode={!isDark} />
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton} activeOpacity={0.7}>
            <BackArrow color={colors.textPrimary} width={24} height={24} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Sync from gallery</Text>
        </View>
        <ScrollView
          style={styles.filterScroll}
          contentContainerStyle={styles.filterContent}
          showsVerticalScrollIndicator
          bounces
        >
          <Text style={styles.filterTitle}>Choose a filter</Text>
          <View style={styles.modeFilterGrid}>
            <TouchableOpacity
              style={[
                styles.modeFilterButton,
                syncMode !== null && !isDateMode && styles.modeFilterButtonInactive,
              ]}
              onPress={() => {
                setFilterError('');
                setSyncMode('date');
              }}
              activeOpacity={0.7}
            >
              <View style={styles.modeFilterButtonContent}>
                <Ionicons name="calendar-outline" size={18} color={colors.textPrimary} />
                <Text style={[styles.filterOptionText, { color: colors.textPrimary }]}>Date</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.modeFilterButton,
                syncMode !== null && !isGalleryMode && styles.modeFilterButtonInactive,
              ]}
              onPress={() => {
                setFilterError('');
                setSyncMode('gallery');
                handlePickFromGallery();
              }}
              activeOpacity={0.7}
            >
              <View style={styles.modeFilterButtonContent}>
                <Ionicons name="images-outline" size={18} color={colors.textPrimary} />
                <Text style={[styles.filterOptionText, { color: colors.textPrimary }]}>Gallery</Text>
              </View>
            </TouchableOpacity>
          </View>

          {isDateMode && (
            <View style={styles.filterDetailSection}>
              <View style={styles.filterOptions}>
                {quickOptions.map((option) => {
                  const isSelected = option.id === selectedFilter;
                  return (
                    <TouchableOpacity
                      key={option.id}
                      style={[
                        styles.filterOption,
                        {
                          borderColor: isSelected ? colors.textPrimary : colors.border,
                          backgroundColor: isSelected ? colors.surfaceVariant : 'transparent',
                        },
                      ]}
                      onPress={() => setSelectedFilter(option.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.filterOptionText, { color: colors.textPrimary }]}>{option.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {selectedFilter === 'custom' && (
                <View style={styles.customDateContainer}>
                  <Text style={styles.customDateLabel}>Start date</Text>
                  <DateTimePicker
                    value={customStartDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(_, date) => date && setCustomStartDate(date)}
                    textColor={colors.textPrimary}
                  />
                  <Text style={styles.customDateLabel}>End date</Text>
                  <DateTimePicker
                    value={customEndDate}
                    mode="date"
                    minimumDate={customStartDate}
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(_, date) => date && setCustomEndDate(date)}
                    textColor={colors.textPrimary}
                  />
                </View>
              )}

              {(filterError || isCustomRangeInvalid) && (
                <Text style={styles.filterErrorText}>
                  {filterError || 'Start date must be before end date.'}
                </Text>
              )}

              <TouchableOpacity
                style={[
                  styles.scanButton,
                  isScanDisabled && styles.scanButtonDisabled,
                ]}
                onPress={handleStartScan}
                activeOpacity={0.7}
                disabled={isScanDisabled}
              >
                <Text style={styles.scanButtonText}>Scan photos</Text>
              </TouchableOpacity>
            </View>
          )}

          {isGalleryMode && (
            <View style={styles.filterDetailSection}>
              <Text style={[styles.galleryHint, { color: colors.textSecondary }]}>
                Pick any photos from your library. They'll be grouped into experiences by time and location.
              </Text>
              {filterError.length > 0 && (
                <Text style={styles.filterErrorText}>{filterError}</Text>
              )}
              <TouchableOpacity
                style={styles.scanButton}
                onPress={handlePickFromGallery}
                activeOpacity={0.7}
              >
                <Text style={styles.scanButtonText}>Select photos</Text>
              </TouchableOpacity>
            </View>
          )}
          <TouchableOpacity
            style={styles.addManuallyLink}
            onPress={() => navigation.navigate('AddPastExperiences')}
            activeOpacity={0.7}
          >
            <Text style={[styles.addManuallyLinkText, { color: colors.textSecondary }]}>
              Or add a past experience manually
            </Text>
          </TouchableOpacity>
        </ScrollView>
        {isAwaitingGallery && (
          <View style={styles.galleryOverlay}>
            <LoadingSpinner size="large" />
          </View>
        )}
      </View>
    );
  }

  if (state === 'loading') {
    return (
      <View style={styles.container}>
        <MeshGradientBackground baseColor={colors.background} lightMode={!isDark} />
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton} activeOpacity={0.7}>
            <BackArrow color={colors.textPrimary} width={24} height={24} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Import latest</Text>
        </View>
        <View style={styles.centerContent}>
          <LoadingSpinner size="large" />
          <Text style={styles.loadingText}>{progressLabel || `Scanning ${activeRangeLabel}…`}</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.max(0, Math.min(100, progressPercent))}%` }]} />
          </View>
          <Text style={styles.progressText}>
            {formatImportProgressPercent(progressPercent)} {progressDetail}
          </Text>
        </View>
      </View>
    );
  }

  if (state === 'error') {
    return (
      <View style={styles.container}>
        <MeshGradientBackground baseColor={colors.background} lightMode={!isDark} />
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton} activeOpacity={0.7}>
            <BackArrow color={colors.textPrimary} width={24} height={24} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Import latest</Text>
        </View>
        <View style={styles.centerContent}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.textSecondary} />
          <Text style={styles.errorText}>{errorMessage}</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={handleBack} activeOpacity={0.7}>
            <LinearGradient
              colors={[COLORS.babyBlue, COLORS.royalGold, COLORS.fern]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[StyleSheet.absoluteFillObject, { borderRadius: 12 }]}
            />
            <Text style={styles.primaryButtonText}>Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (state === 'done') {
    const message =
      failedCount > 0
        ? `Added ${addedCount} experiences. ${failedCount} failed.`
        : `Added ${addedCount} experience${addedCount !== 1 ? 's' : ''}.`;
    return (
      <View style={styles.container}>
        <MeshGradientBackground baseColor={colors.background} lightMode={!isDark} />
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBackToHome} style={styles.backButton} activeOpacity={0.7}>
            <BackArrow color={colors.textPrimary} width={24} height={24} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Import latest</Text>
        </View>
        <View style={styles.centerContent}>
          <Ionicons name="checkmark-circle-outline" size={48} color={colors.fern} />
          <Text style={styles.doneTitle}>Done</Text>
          <Text style={styles.doneMessage}>{message}</Text>
          {schemaFailureNotice.length > 0 && <Text style={styles.doneMessage}>{schemaFailureNotice}</Text>}
          {skippedDuplicateCount > 0 && (
            <Text style={styles.doneMessage}>
              {skippedDuplicateCount} duplicate{skippedDuplicateCount !== 1 ? 's' : ''} skipped.
            </Text>
          )}
          <TouchableOpacity style={styles.primaryButtonFlat} onPress={handleViewHome} activeOpacity={0.7}>
            <Text style={styles.primaryButtonFlatText}>View on Home</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={handleBackToHome} activeOpacity={0.7}>
            <Text style={styles.secondaryButtonText}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (state === 'saving') {
    return (
      <View style={styles.container}>
        <MeshGradientBackground baseColor={colors.background} lightMode={!isDark} />
        <View style={styles.centerContent}>
          <LoadingSpinner size="large" />
          <Text style={styles.loadingText}>{progressLabel}</Text>
        </View>
      </View>
    );
  }

  // state === 'list'
  const emptyAfterScan = suggestions.length === 0;
  if (emptyAfterScan) {
    const emptyMessage = `No recent moments in ${activeRangeLabel}.`;
    return (
      <View style={styles.container}>
        <MeshGradientBackground baseColor={colors.background} lightMode={!isDark} />
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton} activeOpacity={0.7}>
            <BackArrow color={colors.textPrimary} width={24} height={24} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Import latest</Text>
        </View>
        <View style={styles.centerContent}>
          <Text style={styles.emptyText}>{emptyMessage}</Text>
          <TouchableOpacity style={styles.secondaryButton} onPress={handleChangeFilter} activeOpacity={0.7}>
            <Text style={styles.secondaryButtonText}>Change filter</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryButton} onPress={handleBack} activeOpacity={0.7}>
            <LinearGradient
              colors={[COLORS.babyBlue, COLORS.royalGold, COLORS.fern]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[StyleSheet.absoluteFillObject, { borderRadius: 12 }]}
            />
            <Text style={styles.primaryButtonText}>Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const allSelected = suggestions.length > 0 && acceptedCount === suggestions.length;

  const renderBatchControls = () => (
    <View style={styles.batchControls}>
      <Text style={[styles.batchSummary, { color: colors.textSecondary }]}>
        {suggestions.length} moment{suggestions.length !== 1 ? 's' : ''}
        {acceptedCount > 0 ? ` · ${acceptedCount} selected · ${totalPhotosInAccepted} photo${totalPhotosInAccepted !== 1 ? 's' : ''}` : ''}
      </Text>
      <View style={styles.batchButtons}>
        <TouchableOpacity
          onPress={allSelected ? handleDeselectAll : handleSelectAll}
          style={[styles.batchBtn, { borderColor: colors.border }]}
          activeOpacity={0.7}
        >
          <Text style={[styles.batchBtnText, { color: colors.textPrimary }]}>
            {allSelected ? 'Deselect all' : 'Select all'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <MeshGradientBackground baseColor={colors.background} lightMode={!isDark} />
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton} activeOpacity={0.7}>
          <BackArrow color={colors.textPrimary} width={24} height={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Import latest</Text>
        <TouchableOpacity onPress={handleChangeFilter} style={styles.headerActionButton} activeOpacity={0.7}>
          <Text style={styles.headerActionText}>Change filter</Text>
        </TouchableOpacity>
      </View>
      <FlashList
        data={suggestions}
        keyExtractor={(item) => item.id}
        renderItem={({ item: suggestion, index }) => (
          <SuggestionCard
            suggestion={suggestion}
            index={index}
            isAccepted={acceptedIds.has(suggestion.id)}
            onAccept={() => toggleAccept(suggestion.id)}
            onSkip={() => skip(suggestion.id)}
            colors={colors as ThemeColors}
            formatDate={formatEntryDate}
            placeLabel={placeLabelsBySuggestionId.get(suggestion.id)}
          />
        )}
        ListHeaderComponent={renderBatchControls}
        contentContainerStyle={{
          paddingBottom: acceptedCount > 0
            ? insets.bottom + SPACING.md + 72
            : insets.bottom + SPACING.md,
        }}
        showsVerticalScrollIndicator={false}
      />
      {acceptedCount > 0 && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + SPACING.md }]}>
          <TouchableOpacity
            style={styles.addButton}
            onPress={handleAddExperiences}
            activeOpacity={0.7}
          >
            <Text style={styles.addButtonText}>
              Add {acceptedCount} moment{acceptedCount !== 1 ? 's' : ''} · {totalPhotosInAccepted} photo{totalPhotosInAccepted !== 1 ? 's' : ''}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

/** URI that React Native Image can load (file:// or http(s)://). ph:// on iOS must not be passed to Image. */
function getDisplayableUri(asset: { uri: string; displayUri?: string | null }): string | null {
  if (asset.displayUri && asset.displayUri.length > 0) return asset.displayUri;
  if (asset.uri.startsWith('file://') || asset.uri.startsWith('http://') || asset.uri.startsWith('https://')) return asset.uri;
  return null;
}

function SuggestionCard({
  suggestion,
  index,
  isAccepted,
  onAccept,
  onSkip,
  colors,
  formatDate,
  placeLabel: placeLabelProp,
}: {
  suggestion: SuggestedExperienceWithDisplayUris;
  index: number;
  isAccepted: boolean;
  onAccept: () => void;
  onSkip: () => void;
  colors: ThemeColors;
  formatDate: (timestamp: string) => string;
  placeLabel?: string;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const placeLabel = placeLabelProp ?? 'Unknown place';
  const photoCountLabel = suggestion.totalPhotos > suggestion.assets.length
    ? `${suggestion.totalPhotos} photos`
    : null;
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [mediaWidth, setMediaWidth] = useState(320);
  const mediaFlatListRef = useRef<FlatList<string>>(null);

  const imageUris = useMemo(
    () =>
      suggestion.assets
        .map((asset) => getDisplayableUri(asset))
        .filter((uri): uri is string => typeof uri === 'string' && uri.length > 0),
    [suggestion.assets]
  );

  useEffect(() => {
    const delay = createStaggeredDelay(index, 60);
    Animated.timing(opacity, {
      toValue: 1,
      duration: ANIMATION_CONFIG.durations.normal,
      delay,
      easing: ANIMATION_CONFIG.easing.easeOut,
      useNativeDriver: true,
    }).start();
  }, [index, opacity]);


  useEffect(() => {
    if (imageUris.length === 0) {
      if (currentImageIndex !== 0) setCurrentImageIndex(0);
      return;
    }
    if (currentImageIndex > imageUris.length - 1) {
      setCurrentImageIndex(0);
      mediaFlatListRef.current?.scrollToOffset({ offset: 0, animated: false });
    }
  }, [currentImageIndex, imageUris.length]);

  const handleImagePagerMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const width = event.nativeEvent.layoutMeasurement.width;
      if (!Number.isFinite(width) || width <= 0) return;
      const idx = Math.max(0, Math.min(imageUris.length - 1, Math.round(offsetX / width)));
      setCurrentImageIndex(idx);
    },
    [imageUris.length]
  );

  const countryLabel = useMemo(() => {
    if (!placeLabel || placeLabel === 'Unknown place') return '';
    const parts = placeLabel.split(',').map((p) => p.trim()).filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : '';
  }, [placeLabel]);

  const dateLabel = formatDate(suggestion.timestamp);
  return (
    <Animated.View style={[cardStyles.card, { borderColor: colors.border, opacity }]}>
      <View
        style={cardStyles.mediaShell}
        onLayout={(event) => {
          const nextWidth = Math.round(event.nativeEvent.layout.width);
          if (nextWidth > 0 && nextWidth !== mediaWidth) {
            setMediaWidth(nextWidth);
          }
        }}
      >
        {imageUris.length > 0 ? (
          <FlatList
            ref={mediaFlatListRef}
            data={imageUris}
            keyExtractor={(uri, idx) => `${uri}_${idx}`}
            renderItem={({ item: uri }) => (
              <View style={[cardStyles.mediaItem, { width: mediaWidth }]}>
                <Image source={{ uri }} style={cardStyles.feedMediaImage} resizeMode="cover" />
              </View>
            )}
            horizontal
            pagingEnabled
            bounces={false}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={handleImagePagerMomentumEnd}
          />
        ) : (
          <View style={[cardStyles.feedMediaImage, { backgroundColor: colors.surfaceVariant }]} />
        )}

        <LinearGradient
          colors={['rgba(0,0,0,0.55)', 'transparent']}
          style={cardStyles.feedTopGradient}
          pointerEvents="none"
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.62)']}
          style={cardStyles.feedBottomGradient}
          pointerEvents="none"
        />

        {countryLabel.length > 0 && (
          <Text style={cardStyles.feedCountry} numberOfLines={1} maxFontSizeMultiplier={1.2}>
            {countryLabel}
          </Text>
        )}

        <View style={cardStyles.feedTopRight} pointerEvents="none">
          <Text style={cardStyles.feedTopRightText} numberOfLines={1} maxFontSizeMultiplier={1.2}>
            {dateLabel}
          </Text>
          {placeLabel.length > 0 && placeLabel !== 'Unknown place' && (
            <Text style={cardStyles.feedTopRightText} numberOfLines={1} maxFontSizeMultiplier={1.2}>
              {placeLabel}
            </Text>
          )}
        </View>

        {imageUris.length > 1 && (
          <View style={cardStyles.mediaDots}>
            {imageUris.map((_, idx) => (
              <View
                key={`dot_${idx}`}
                style={[
                  cardStyles.mediaDot,
                  idx === currentImageIndex ? cardStyles.mediaDotActive : cardStyles.mediaDotInactive,
                ]}
              />
            ))}
          </View>
        )}

        {photoCountLabel && (
          <View style={cardStyles.photoCountPill}>
            <Text style={cardStyles.photoCountText}>{photoCountLabel}</Text>
          </View>
        )}
      </View>
      <View style={cardStyles.actions}>
        <TouchableOpacity
          style={[
            cardStyles.actionBtn,
            cardStyles.skipBtn,
            { borderColor: colors.border },
          ]}
          onPress={onSkip}
          activeOpacity={0.7}
        >
          <Text style={[cardStyles.skipBtnText, { color: colors.textSecondary }]}>Skip</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            cardStyles.actionBtn,
            cardStyles.acceptBtn,
            {
              backgroundColor: isAccepted ? colors.surfaceVariant : colors.surfaceVariant,
              borderColor: colors.border,
              overflow: 'hidden',
            },
          ]}
          onPress={onAccept}
          activeOpacity={0.7}
        >
          {isAccepted ? (
            <>
              <Ionicons name="checkmark-circle" size={20} color={colors.textPrimary} />
              <Text style={[cardStyles.acceptBtnText, { color: colors.textPrimary }]}>Accepted</Text>
            </>
          ) : (
            <>
              <Ionicons name="add-circle-outline" size={20} color={colors.textPrimary} />
              <Text style={[cardStyles.acceptBtnText, { color: colors.textPrimary }]}>Accept</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'visible',
  },
  mediaShell: {
    height: 260,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#000000',
  },
  mediaItem: {
    height: 260,
  },
  feedMediaImage: {
    width: '100%',
    height: '100%',
  },
  feedTopGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '40%',
  },
  feedBottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '42%',
  },
  feedCountry: {
    position: 'absolute',
    top: 20,
    left: 20,
    color: '#FFFFFF',
    fontFamily: FONTS.inter,
    fontSize: 20,
    fontWeight: FONT_WEIGHTS.bold,
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  feedTopRight: {
    position: 'absolute',
    top: 20,
    right: 20,
    alignItems: 'flex-end',
    maxWidth: '64%',
  },
  feedTopRightText: {
    color: '#FFFFFF',
    fontFamily: FONTS.inter,
    fontSize: 13,
    fontWeight: FONT_WEIGHTS.semibold,
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    lineHeight: 18,
  },
  mediaDots: {
    position: 'absolute',
    bottom: 14,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  mediaDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  mediaDotActive: {
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  mediaDotInactive: {
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  photoCountPill: {
    position: 'absolute',
    bottom: 14,
    left: 16,
    backgroundColor: 'rgba(0,0,0,0.52)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  photoCountText: {
    color: '#FFFFFF',
    fontFamily: FONTS.inter,
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  actions: {
    flexDirection: 'row',
    paddingTop: SPACING.md,
    paddingHorizontal: SPACING.sm,
    paddingBottom: SPACING.sm,
    gap: SPACING.sm,
    justifyContent: 'flex-end',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
  },
  skipBtn: {},
  skipBtnText: {},
  acceptBtn: {},
  acceptBtnText: {
    fontFamily: FONTS.inter,
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});

function createStyles(colors: ThemeColors, insets: { top: number; bottom: number }) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.md,
      paddingTop: insets.top + SPACING.sm,
      paddingBottom: SPACING.md,
    },
    backButton: {
      marginRight: SPACING.sm,
    },
    headerTitle: {
      fontFamily: FONTS.inter,
      fontSize: 18,
      fontWeight: FONT_WEIGHTS.semibold,
      color: colors.textPrimary,
      flex: 1,
    },
    headerActionButton: {
      paddingVertical: SPACING.xs,
      paddingHorizontal: SPACING.xs,
    },
    headerActionText: {
      fontFamily: FONTS.inter,
      fontSize: 13,
      color: colors.textSecondary,
    },
    centerContent: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: SPACING.xl,
    },
    filterContent: {
      flexGrow: 1,
      paddingHorizontal: SPACING.lg,
      paddingBottom: insets.bottom + SPACING.lg,
    },
    filterScroll: {
      flex: 1,
    },
    filterTitle: {
      fontFamily: FONTS.inter,
      fontSize: 22,
      fontWeight: FONT_WEIGHTS.semibold,
      color: colors.textPrimary,
      marginTop: SPACING.md,
      marginBottom: SPACING.sm,
    },
    filterSubtitle: {
      fontFamily: FONTS.inter,
      fontSize: 15,
      color: colors.textSecondary,
      marginBottom: SPACING.lg,
    },
    galleryHint: {
      fontFamily: FONTS.inter,
      fontSize: 15,
      lineHeight: 22,
      marginTop: SPACING.sm,
      marginBottom: SPACING.md,
    },
    galleryOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.background,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    filterOptions: {
      gap: SPACING.sm,
    },
    modeFilterGrid: {
      flexDirection: 'row',
      gap: SPACING.sm,
      marginBottom: SPACING.md,
    },
    filterDetailSection: {
      marginTop: SPACING.xs,
    },
    filterOption: {
      borderWidth: 1,
      borderRadius: 12,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.md,
    },
    modeFilterButton: {
      flex: 1,
      borderWidth: 1,
      borderRadius: 12,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.md,
      borderColor: colors.border,
      backgroundColor: colors.surfaceVariant,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modeFilterButtonInactive: {
      opacity: 0.45,
    },
    modeFilterButtonContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.xs,
    },
    filterOptionText: {
      fontFamily: FONTS.inter,
      fontSize: 16,
      fontWeight: FONT_WEIGHTS.semibold,
    },
    customDateContainer: {
      marginTop: SPACING.lg,
      marginBottom: SPACING.md,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingVertical: SPACING.sm,
      backgroundColor: colors.surfaceVariant,
    },
    customDateLabel: {
      fontFamily: FONTS.inter,
      fontSize: 14,
      fontWeight: FONT_WEIGHTS.semibold,
      color: colors.textPrimary,
      marginTop: SPACING.xs,
    },
    filterErrorText: {
      fontFamily: FONTS.inter,
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: SPACING.sm,
    },
    loadingText: {
      fontFamily: FONTS.inter,
      fontSize: 16,
      color: colors.textSecondary,
      marginTop: SPACING.lg,
      textAlign: 'center',
    },
    progressTrack: {
      width: '100%',
      height: 10,
      borderRadius: 999,
      marginTop: SPACING.md,
      backgroundColor: colors.border,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: 999,
      backgroundColor: colors.textPrimary,
    },
    progressText: {
      fontFamily: FONTS.inter,
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: SPACING.sm,
    },
    errorText: {
      fontFamily: FONTS.inter,
      fontSize: 16,
      color: colors.textPrimary,
      textAlign: 'center',
      marginTop: SPACING.lg,
    },
    emptyText: {
      fontFamily: FONTS.inter,
      fontSize: 16,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    doneTitle: {
      fontFamily: FONTS.inter,
      fontSize: 20,
      fontWeight: FONT_WEIGHTS.semibold,
      color: colors.textPrimary,
      marginTop: SPACING.lg,
    },
    doneMessage: {
      fontFamily: FONTS.inter,
      fontSize: 16,
      color: colors.textSecondary,
      marginTop: SPACING.sm,
      marginBottom: SPACING.xl,
    },
    primaryButton: {
      position: 'relative',
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.xl,
      borderRadius: 12,
      marginTop: SPACING.lg,
      overflow: 'hidden',
    },
    primaryButtonText: {
      fontFamily: FONTS.inter,
      fontSize: 16,
      fontWeight: FONT_WEIGHTS.semibold,
      color: colors.white,
    },
    primaryButtonFlat: {
      marginTop: SPACING.lg,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.xl,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceVariant,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryButtonFlatText: {
      fontFamily: FONTS.inter,
      fontSize: 16,
      fontWeight: FONT_WEIGHTS.semibold,
      color: colors.textPrimary,
    },
    scanButton: {
      marginTop: SPACING.lg,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.xl,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceVariant,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scanButtonDisabled: {
      opacity: 0.5,
    },
    scanButtonText: {
      fontFamily: FONTS.inter,
      fontSize: 16,
      fontWeight: FONT_WEIGHTS.semibold,
      color: colors.textPrimary,
    },
    addManuallyLink: {
      alignItems: 'center',
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.lg,
      marginTop: SPACING.sm,
    },
    addManuallyLinkText: {
      fontFamily: FONTS.inter,
      fontSize: 14,
      fontWeight: FONT_WEIGHTS.regular,
      textDecorationLine: 'underline',
    },
    secondaryButton: {
      marginTop: SPACING.sm,
      paddingVertical: SPACING.sm,
    },
    secondaryButtonText: {
      fontFamily: FONTS.inter,
      fontSize: 15,
      color: colors.textSecondary,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: 120,
    },
    footer: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.md,
      backgroundColor: colors.background,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    addButton: {
      paddingVertical: SPACING.md,
      borderRadius: 12,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceVariant,
    },
    addButtonText: {
      fontFamily: FONTS.inter,
      fontSize: 16,
      fontWeight: FONT_WEIGHTS.semibold,
      color: colors.textPrimary,
    },
    batchControls: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.sm,
      paddingBottom: SPACING.md,
    },
    batchSummary: {
      fontFamily: FONTS.inter,
      fontSize: 13,
      flex: 1,
      marginRight: SPACING.sm,
    },
    batchButtons: {
      flexDirection: 'row',
      gap: SPACING.xs,
    },
    batchBtn: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 8,
      borderWidth: 1,
    },
    batchBtnText: {
      fontFamily: FONTS.inter,
      fontSize: 13,
      fontWeight: FONT_WEIGHTS.semibold,
    },
  });
}

export default ImportLatestScreen;
