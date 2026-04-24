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
import { generateUUID } from '../utils/uuid';
import { findMatchingAlbumId } from '../utils/albumUtils';
import { getSeasonFromTimestamp } from '../utils/seasonUtils';
import { getWeatherAtLocation } from '../services/WeatherService';
import { formatEntryDate, reverseGeocode } from '../utils/dateUtils';
import { getAltitudeMetersFromExif, normalizeExifForMetadata } from '../utils/exifUtils';
import { Entry } from '../models/Entry';
import { attachCountryToEntryIfMissing } from '../utils/entryCountryResolve';
import { copyMediaToPersistentStorage, deletePersistentMediaForEntry } from '../storage/mediaStorage';
import type {
  ImportLatestProgress,
  ImportLatestRange,
  SuggestedExperienceWithDisplayUris,
} from '../services/ImportLatestService';
import { isImportLatestAbortedError, runImportLatest } from '../services/ImportLatestService';
import { getImportedAssetIds, addImportedAssetIds } from '../utils/importLatestStorage';
import { ANIMATION_CONFIG, createStaggeredDelay } from '../utils/animations';
import { getCountryFlagEmoji, getKnownCountryNames } from '../utils/countryUtils';
import LoadingSpinner from '../components/common/LoadingSpinner';

type ImportLatestNavigationProp = NativeStackNavigationProp<RootStackParamList, 'ImportLatest'>;
type SyncMode = 'date' | 'country';

/** Returns true if suggestion is already saved (by imported asset ID or by same photo path in an entry). */
function isDuplicateSuggestion(
  suggestion: SuggestedExperienceWithDisplayUris,
  entries: Entry[],
  importedIds: Set<string>
): boolean {
  if (suggestion.assets.some((a) => importedIds.has(a.id))) return true;
  const loadableUris = suggestion.assets
    .map((a) => a.displayUri ?? (a.uri.startsWith('file://') ? a.uri : null))
    .filter((u): u is string => typeof u === 'string' && u.length > 0);
  if (loadableUris.length === 0) return false;
  const uriSet = new Set(loadableUris);
  for (const entry of entries) {
    const paths = [...(entry.photoPaths ?? []), ...(entry.mediaPaths ?? [])];
    if (paths.some((p) => uriSet.has(p))) return true;
  }
  return false;
}

function getMissingColumnNameFromError(error: unknown): string | null {
  const message = String(error ?? '');
  const match = message.match(/no column named\s+([a-zA-Z0-9_]+)/i);
  return match?.[1] ?? null;
}

/** One decimal, clamped 0–100, for import progress bar label. */
function formatImportProgressPercent(percent: number): string {
  const clamped = Math.max(0, Math.min(100, percent));
  return `${(Math.round(clamped * 10) / 10).toFixed(1)}%`;
}

type ScreenState = 'filter' | 'loading' | 'list' | 'saving' | 'done' | 'error';
type QuickFilter = 'last24h' | 'last72h' | 'custom';

const ImportLatestScreen: React.FC = () => {
  const navigation = useNavigation<ImportLatestNavigationProp>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { createEntry, refreshData, tripAlbums, entries } = useAppContext();

  const [state, setState] = useState<ScreenState>('filter');
  const [syncMode, setSyncMode] = useState<SyncMode | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<QuickFilter>('last72h');
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const [isYearPickerOpen, setIsYearPickerOpen] = useState(false);
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

  const countryOptions = useMemo(() => getKnownCountryNames(), []);
  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const oldestSelectableYear = 1970;
    const years: number[] = [];
    for (let year = currentYear; year >= oldestSelectableYear; year--) {
      years.push(year);
    }
    return years;
  }, []);
  const availableYearChoices = useMemo(
    () => yearOptions.filter((year) => !selectedYears.includes(year)),
    [yearOptions, selectedYears]
  );

  const runScan = useCallback(
    async (
      range: ImportLatestRange | undefined,
      rangeLabel: string,
      countryName?: string,
      years?: number[]
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
      const result = await runImportLatest({
        range,
        countryName,
        selectedYears: years,
        signal: scanController.signal,
        onProgress: (progress: ImportLatestProgress) => {
          setProgressPercent(progress.percent);
          setProgressLabel(progress.label);
          const showCounts =
            progress.total > 0 &&
            (progress.total > 1 ||
              progress.phase === 'fetch' ||
              progress.phase === 'country');
          if (showCounts) {
            setProgressDetail(`${progress.completed}/${progress.total}`);
          } else {
            setProgressDetail('');
          }
        },
      });
      if (result.error) {
        setErrorMessage(result.error);
        setState('error');
        return;
      }
      const importedIds = await getImportedAssetIds();
      const filtered = result.suggestions.filter(
        (s) => !s.assets.some((a) => importedIds.has(a.id))
      );
      setSuggestions(filtered);
      setAcceptedIds(new Set());
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
    if (syncMode === 'country') {
      const countryName = selectedCountry?.trim();
      const years = [...selectedYears].sort((a, b) => a - b);
      if (!countryName || years.length === 0) {
        setFilterError('Please select at least one year.');
        return;
      }
      const yearsLabel = years.length === 1 ? `${years[0]}` : `${years[0]}-${years[years.length - 1]}`;
      runScan(undefined, `${countryName} (${yearsLabel})`, countryName, years);
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
    selectedCountry,
    selectedYears,
    selectedFilter,
    startScanForFilter,
    syncMode,
  ]);

  const addYear = useCallback((year: number) => {
    setSelectedYears((prev) => {
      if (prev.includes(year)) return prev;
      return [...prev, year].sort((a, b) => b - a);
    });
    setIsYearPickerOpen(false);
  }, []);

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

  const buildEntryFromSuggestion = useCallback(
    (suggestion: SuggestedExperienceWithDisplayUris): Entry => {
      const timestamp = suggestion.timestamp;
      const locationProps =
        suggestion.latitude != null && suggestion.longitude != null
          ? { latitude: suggestion.latitude, longitude: suggestion.longitude }
          : {};
      const matchingAlbumId = findMatchingAlbumId(timestamp, tripAlbums ?? []);
      // Use only loadable URIs (displayUri/file) so entry detail and other screens can render images.
      const loadableUris = suggestion.assets
        .map((a) => a.displayUri ?? (a.uri.startsWith('file://') ? a.uri : null))
        .filter((u): u is string => typeof u === 'string' && u.length > 0);
      const altitudeMeters = getAltitudeMetersFromExif(
        normalizeExifForMetadata(suggestion.assets[0]?.exif) ?? undefined
      );
      return {
        id: generateUUID(),
        type: 'experience',
        title: undefined,
        description: '',
        mediaType: 'photo',
        photoPaths: loadableUris,
        mediaPaths: loadableUris,
        storageUrls: [],
        timestamp,
        ...locationProps,
        ...(matchingAlbumId ? { albumId: matchingAlbumId } : {}),
        season: getSeasonFromTimestamp(timestamp, suggestion.latitude),
        ...(altitudeMeters != null ? { altitudeMeters } : {}),
        isDraft: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    },
    [tripAlbums]
  );

  const handleAddExperiences = useCallback(async () => {
    const toAdd = suggestions.filter((s) => acceptedIds.has(s.id));
    if (toAdd.length === 0) return;

    importSaveAbortRef.current?.abort();
    const saveController = new AbortController();
    importSaveAbortRef.current = saveController;

    setState('saving');
    setSchemaFailureNotice('');
    let added = 0;
    let failed = 0;
    let skippedDuplicates = 0;
    const createdSuggestions: SuggestedExperienceWithDisplayUris[] = [];
    let schemaIssueDetected = false;
    let schemaIssueNotice = '';

    try {
      const importedIds = await getImportedAssetIds();
      const totalToProcess = Math.max(1, toAdd.length);
      let processed = 0;
      let sharedLocationModule: typeof import('expo-location') | null = null;

      for (const suggestion of toAdd) {
        if (saveController.signal.aborted) {
          logger.log('ImportLatestScreen: add experiences cancelled');
          break;
        }
        if (isDuplicateSuggestion(suggestion, entries, importedIds)) {
          skippedDuplicates++;
          processed++;
          continue;
        }
        let entry = buildEntryFromSuggestion(suggestion);
        try {
          if (entry.photoPaths.length > 0) {
            try {
              const persistentUris = await copyMediaToPersistentStorage(entry.photoPaths, entry.id);
              entry.photoPaths = persistentUris;
              entry.mediaPaths = persistentUris;
            } catch (copyError) {
              logger.error('ImportLatestScreen: copy to persistent storage failed', copyError);
              deletePersistentMediaForEntry(entry.id);
              failed++;
              processed++;
              continue;
            }
          }
          if (saveController.signal.aborted) break;
          if (
            entry.latitude != null &&
            entry.longitude != null
          ) {
            try {
              const weather = await getWeatherAtLocation(entry.latitude, entry.longitude);
              if (weather) {
                entry.weather = weather.condition;
                entry.temperatureCelsius = weather.temperatureCelsius;
              }
            } catch (_) {
              // non-blocking
            }
          }
          if (saveController.signal.aborted) break;
          if (
            entry.latitude != null &&
            entry.longitude != null &&
            (!entry.country?.trim() || !entry.city?.trim())
          ) {
            try {
              if (!sharedLocationModule) {
                sharedLocationModule = await import('expo-location');
              }
              entry = await attachCountryToEntryIfMissing(entry, { locationModule: sharedLocationModule });
            } catch (_) {
              // non-blocking
            }
          }
          if (saveController.signal.aborted) break;
          await createEntry(entry);
          if (saveController.signal.aborted) break;
          added++;
          createdSuggestions.push(suggestion);
          processed++;
        } catch (e) {
          const missingColumn = getMissingColumnNameFromError(e);
          if (missingColumn) {
            schemaIssueDetected = true;
            schemaIssueNotice =
              'Database schema issue prevented full import. Please restart the app and retry Import Latest.';
            logger.error('ImportLatestScreen: schema mismatch during createEntry; stopping batch', {
              missingColumn,
              entryId: entry.id,
            });
          }
          logger.error('ImportLatestScreen: createEntry failed', e);
          logger.warn('IMPORT_LATEST_CLEANUP: deleting copied media for failed entry', { entryId: entry.id });
          deletePersistentMediaForEntry(entry.id);
          failed++;
          processed++;
          if (schemaIssueDetected) break;
        }
      }

      if (saveController.signal.aborted) {
        await refreshData();
        return;
      }

      if (createdSuggestions.length > 0) {
        const newlyImportedIds = createdSuggestions.flatMap((s) => s.assets.map((a) => a.id));
        await addImportedAssetIds(newlyImportedIds);
      }

      await refreshData();
      setAddedCount(added);
      setFailedCount(failed);
      setSkippedDuplicateCount(skippedDuplicates);
      setSchemaFailureNotice(schemaIssueNotice);
      if (schemaIssueDetected) {
        logger.warn('ImportLatestScreen: batch ended early due to schema mismatch', {
          added,
          failed,
          skippedDuplicates,
        });
      }
      setState('done');
    } finally {
      if (importSaveAbortRef.current === saveController) {
        importSaveAbortRef.current = null;
      }
    }
  }, [suggestions, acceptedIds, entries, buildEntryFromSuggestion, createEntry, refreshData]);

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

  const handleBackToStudio = useCallback(() => {
    try {
      navigation.navigate('MainTabs', { screen: 'Studio' });
    } catch (e) {
      logger.warn('ImportLatestScreen: navigate to Studio failed', e);
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
    setSelectedCountry(null);
    setSelectedYears([]);
    setIsYearPickerOpen(false);
    setState('filter');
  }, []);

  const acceptedCount = acceptedIds.size;
  const isCustomRangeInvalid = customStartDate.getTime() > customEndDate.getTime();
  const isDateMode = syncMode === 'date';
  const isCountryMode = syncMode === 'country';
  const isScanDisabled =
    !syncMode ||
    (isDateMode && selectedFilter === 'custom' && isCustomRangeInvalid) ||
    (isCountryMode &&
      (!selectedCountry || selectedCountry.trim().length === 0 || selectedYears.length === 0));
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
                syncMode !== null && !isCountryMode && styles.modeFilterButtonInactive,
              ]}
              onPress={() => {
                setFilterError('');
                setSyncMode('country');
                setSelectedCountry(null);
                setSelectedYears([]);
                setIsYearPickerOpen(false);
              }}
              activeOpacity={0.7}
            >
              <View style={styles.modeFilterButtonContent}>
                <Ionicons name="earth-outline" size={18} color={colors.textPrimary} />
                <Text style={[styles.filterOptionText, { color: colors.textPrimary }]}>Country</Text>
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

          {isCountryMode && (
            <View style={styles.filterDetailSection}>
              <ScrollView
                style={styles.countryScrollOuter}
                contentContainerStyle={styles.countryScrollContent}
                nestedScrollEnabled
                showsVerticalScrollIndicator
              >
                {countryOptions.map((country, index) => {
                  const isSelected = selectedCountry === country;
                  const flag = getCountryFlagEmoji(country);
                  const showFlag = flag !== '🌍';
                  const isLast = index === countryOptions.length - 1;
                  return (
                    <TouchableOpacity
                      key={country}
                      style={[
                        styles.countryRow,
                        !isLast && styles.countryRowBorder,
                        !isLast && { borderBottomColor: colors.border },
                        isSelected && { backgroundColor: colors.surfaceVariant },
                      ]}
                      onPress={() => {
                        setSelectedCountry(country);
                        setSelectedYears([]);
                        setIsYearPickerOpen(false);
                        setFilterError('');
                      }}
                      activeOpacity={0.7}
                    >
                      {showFlag ? (
                        <Text style={styles.countryRowFlag} accessibilityLabel={`${country} flag`}>
                          {flag}
                        </Text>
                      ) : (
                        <View style={styles.countryRowFlagSpacer} />
                      )}
                      <Text style={[styles.countryRowName, { color: colors.textPrimary }]}>{country}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {selectedCountry && (
                <View style={styles.yearSection}>
                  <Text style={styles.yearSectionTitle}>When were you there?</Text>
                  {yearOptions.length > 0 && (
                    <View style={styles.yearPickerWrap}>
                      <View style={styles.selectedYearsRow}>
                        {selectedYears.map((year) => (
                          <View key={year} style={[styles.selectedYearPill, { borderColor: colors.border }]}>
                            <Text style={[styles.selectedYearText, { color: colors.textPrimary }]}>{year}</Text>
                          </View>
                        ))}
                        {availableYearChoices.length > 0 && (
                          <TouchableOpacity
                            style={[styles.addYearButton, { borderColor: colors.border }]}
                            onPress={() => setIsYearPickerOpen((prev) => !prev)}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.addYearButtonText, { color: colors.textPrimary }]}>+</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                      {isYearPickerOpen && (
                        <View style={[styles.yearPickerList, { borderColor: colors.border }]}>
                          <ScrollView
                            style={styles.yearPickerListScroll}
                            nestedScrollEnabled
                            showsVerticalScrollIndicator
                          >
                            {availableYearChoices.map((year, index) => {
                              const isLast = index === availableYearChoices.length - 1;
                              return (
                                <TouchableOpacity
                                  key={year}
                                  style={[
                                    styles.yearPickerRow,
                                    !isLast && styles.yearPickerRowBorder,
                                    !isLast && { borderBottomColor: colors.border },
                                  ]}
                                  onPress={() => addYear(year)}
                                  activeOpacity={0.7}
                                >
                                  <Text style={[styles.yearPickerRowText, { color: colors.textPrimary }]}>{year}</Text>
                                </TouchableOpacity>
                              );
                            })}
                          </ScrollView>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              )}

              {filterError.length > 0 ? <Text style={styles.filterErrorText}>{filterError}</Text> : null}

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
        </ScrollView>
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
          <TouchableOpacity onPress={handleBackToStudio} style={styles.backButton} activeOpacity={0.7}>
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
          <TouchableOpacity style={styles.secondaryButton} onPress={handleBackToStudio} activeOpacity={0.7}>
            <Text style={styles.secondaryButtonText}>Back to Studio</Text>
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
          <Text style={styles.loadingText}>Adding experiences…</Text>
        </View>
      </View>
    );
  }

  // state === 'list'
  const emptyAfterScan = suggestions.length === 0;
  if (emptyAfterScan) {
    const emptyMessage = isCountryMode
      ? `No moments found for ${activeRangeLabel}.`
      : `No recent moments in ${activeRangeLabel}.`;
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
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator
      >
        {suggestions.map((suggestion, index) => (
          <SuggestionCard
            key={suggestion.id}
            suggestion={suggestion}
            index={index}
            isAccepted={acceptedIds.has(suggestion.id)}
            onAccept={() => toggleAccept(suggestion.id)}
            onSkip={() => skip(suggestion.id)}
            colors={colors as ThemeColors}
            formatDate={formatEntryDate}
            hideCountryLabel={isCountryMode}
          />
        ))}
      </ScrollView>
      {acceptedCount > 0 && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + SPACING.md }]}>
          <TouchableOpacity
            style={styles.addButton}
            onPress={handleAddExperiences}
            activeOpacity={0.7}
          >
            <Text style={styles.addButtonText}>Add {acceptedCount} experience{acceptedCount !== 1 ? 's' : ''}</Text>
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
  hideCountryLabel,
}: {
  suggestion: SuggestedExperienceWithDisplayUris;
  index: number;
  isAccepted: boolean;
  onAccept: () => void;
  onSkip: () => void;
  colors: ThemeColors;
  formatDate: (timestamp: string) => string;
  hideCountryLabel: boolean;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const [placeLabel, setPlaceLabel] = useState<string>('Unknown place');
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
    if (suggestion.latitude == null || suggestion.longitude == null) return;
    let cancelled = false;
    reverseGeocode(suggestion.latitude, suggestion.longitude).then((name) => {
      if (!cancelled && name) setPlaceLabel(name);
    });
    return () => {
      cancelled = true;
    };
  }, [suggestion.latitude, suggestion.longitude]);

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

        {!hideCountryLabel && countryLabel.length > 0 && (
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
    countryScrollOuter: {
      marginTop: SPACING.md,
      marginBottom: SPACING.md,
      maxHeight: 380,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      backgroundColor: colors.background,
      overflow: 'hidden',
    },
    countryScrollContent: {
      paddingBottom: SPACING.xs,
    },
    countryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.md,
      minHeight: 52,
    },
    countryRowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    countryRowFlag: {
      fontSize: 22,
      lineHeight: 28,
      width: 40,
      textAlign: 'center',
      marginRight: SPACING.sm,
    },
    countryRowFlagSpacer: {
      width: 40,
      marginRight: SPACING.sm,
    },
    countryRowName: {
      flex: 1,
      fontFamily: FONTS.inter,
      fontSize: 16,
      fontWeight: FONT_WEIGHTS.regular,
    },
    yearSection: {
      marginTop: SPACING.sm,
      marginBottom: SPACING.sm,
    },
    yearSectionTitle: {
      fontFamily: FONTS.inter,
      fontSize: 16,
      fontWeight: FONT_WEIGHTS.semibold,
      color: colors.textPrimary,
      marginBottom: SPACING.sm,
    },
    yearPickerWrap: {
      gap: SPACING.sm,
    },
    selectedYearsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.sm,
    },
    selectedYearPill: {
      borderWidth: 1,
      borderRadius: 999,
      paddingVertical: SPACING.xs,
      paddingHorizontal: SPACING.md,
      backgroundColor: colors.surfaceVariant,
    },
    selectedYearText: {
      fontFamily: FONTS.inter,
      fontSize: 14,
      fontWeight: FONT_WEIGHTS.semibold,
    },
    addYearButton: {
      minWidth: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: SPACING.xs,
    },
    addYearButtonText: {
      fontFamily: FONTS.inter,
      fontSize: 20,
      fontWeight: FONT_WEIGHTS.semibold,
      lineHeight: 22,
    },
    yearPickerList: {
      borderWidth: 1,
      borderRadius: 12,
      maxHeight: 240,
      overflow: 'hidden',
      backgroundColor: colors.background,
    },
    yearPickerListScroll: {
      maxHeight: 240,
    },
    yearPickerRow: {
      minHeight: 46,
      justifyContent: 'center',
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
    },
    yearPickerRowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    yearPickerRowText: {
      fontFamily: FONTS.inter,
      fontSize: 15,
      fontWeight: FONT_WEIGHTS.semibold,
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
  });
}

export default ImportLatestScreen;
