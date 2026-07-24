// AppContext
// Global state management with SQLite integration (no native module dependencies at import time)

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { InteractionManager, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Entry } from '../models/Entry';
import { Journal } from '../models/Journal';
import { TripAlbum } from '../models/TripAlbum';
import { Postcard } from '../models/Postcard';
import * as PersistenceManager from '../storage/PersistenceManager';
import { resolveMediaPath, deletePostcardPhotoThumbnails } from '../storage/mediaStorage';
import { TRAVEL_MODE_KEYS, loadTravelModeState, saveTravelModeState } from '../storage/PersistenceManager';
import { logger } from '../utils/logger';
import { useMetadataBackfillWhenOnline } from '../hooks/useMetadataBackfillWhenOnline';
import { useCountryBackfillWhenOnline } from '../hooks/useCountryBackfillWhenOnline';
import { useJournalLocationBackfillWhenOnline } from '../hooks/useJournalLocationBackfillWhenOnline';
import { useColorPaletteBackfill } from '../hooks/useColorPaletteBackfill';
import { useThumbnailBackfill } from '../hooks/useThumbnailBackfill';
import { usePhotoDimensionsBackfill } from '../hooks/usePhotoDimensionsBackfill';
import { useEntryMediaRepair, ENTRY_MEDIA_REPAIR_STORAGE_KEY } from '../hooks/useEntryMediaRepair';
import { persistLog } from '../utils/persistentLogger';
import { Analytics } from '../services/AnalyticsService';
import { IMPORT_LATEST_IMPORTED_IDS_KEY } from '../utils/importLatestStorage';
import { STATS_TIME_SCOPE_KEY } from '../utils/statsScopeStorage';
import { clearAllCachedPalettes } from '../storage/dashboardPaletteCache';

interface AppContextType {
  // User state
  userName: string | null;
  isLoading: boolean;
  setUserName: (name: string) => Promise<void>;

  // Data state
  entries: Entry[];
  journals: Journal[];
  tripAlbums: TripAlbum[];
  activeTripAlbum: TripAlbum | null;
  postcards: Postcard[];

  // Travel Mode
  travelModeEnabled: boolean;
  travelModeExplicitlyDisabled: boolean;
  activeTripAlbums: TripAlbum[];
  setTravelMode: (enabled: boolean, explicit?: boolean) => Promise<void>;

  // CRUD operations
  createEntry: (entry: Entry) => Promise<void>;
  updateEntry: (entry: Entry) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  
  createJournal: (journal: Journal) => Promise<void>;
  updateJournal: (journal: Journal) => Promise<void>;
  deleteJournal: (id: string) => Promise<void>;
  
  createTripAlbum: (album: TripAlbum, creationMethod?: 'unpack' | 'import' | 'new') => Promise<void>;
  updateTripAlbum: (album: TripAlbum) => Promise<void>;
  deleteTripAlbum: (id: string) => Promise<void>;

  createPostcard: (postcard: Postcard) => Promise<void>;
  updatePostcard: (postcard: Postcard) => Promise<void>;
  deletePostcard: (id: string) => Promise<void>;

  // Initialization
  initializeApp: () => Promise<void>;
  refreshData: () => Promise<void>;
  /** Clears all data and resets state. */
  resetApp: () => Promise<void>;

  // Emotion capture return value (set by EmotionCaptureScreen on Save/Skip; read by Capture/EntryEdit on focus)
  pendingEmotionLabels: string[] | null;
  setPendingEmotionLabels: (labels: string[] | null) => void;
  pendingEmotionNote: string | null;
  setPendingEmotionNote: (note: string | null) => void;

  // Home screen preferences
  showHomeMap: boolean;
  setShowHomeMap: (val: boolean) => Promise<void>;

  // Onboarding
  hasCompletedOnboarding: boolean;
  completeOnboarding: (path: 'unpack' | 'trip_album' | 'explore') => Promise<void>;
  pendingOnboardingPath: 'unpack' | 'trip_album' | null;
  setPendingOnboardingPath: (path: 'unpack' | 'trip_album' | null) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const STORAGE_KEYS = {
  USER_NAME: '@awefull_people:user_name',
  SHOW_HOME_MAP: '@awefull_people:show_home_map',
  ONBOARDING_COMPLETED: '@awefull_people:onboarding_completed',
};

interface AppProviderProps {
  children: ReactNode;
}

// Tracks whether the photo audit has run this JS session — resets on resetApp().
let _photoAuditRanThisSession = false;

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  const [userName, setUserNameState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Data state
  const [entries, setEntries] = useState<Entry[]>([]);
  const [journals, setJournals] = useState<Journal[]>([]);
  const [tripAlbums, setTripAlbums] = useState<TripAlbum[]>([]);
  const [postcards, setPostcards] = useState<Postcard[]>([]);
  const [activeTripAlbum, setActiveTripAlbum] = useState<TripAlbum | null>(null);
  const [pendingEmotionLabels, setPendingEmotionLabels] = useState<string[] | null>(null);
  const [pendingEmotionNote, setPendingEmotionNote] = useState<string | null>(null);

  // Home screen preferences
  const [showHomeMap, setShowHomeMapState] = useState(false);

  // Onboarding
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [pendingOnboardingPath, setPendingOnboardingPath] = useState<'unpack' | 'trip_album' | null>(null);

  // Travel Mode state
  const [travelModeEnabled, setTravelModeEnabled] = useState(false);
  const [travelModeExplicitlyDisabled, setTravelModeExplicitlyDisabled] = useState(false);
  const [activeTripAlbums, setActiveTripAlbums] = useState<TripAlbum[]>([]);

  const refreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshInFlightRef = useRef(false);

  // Fingerprints for stable state — skip setEntries/setJournals/setTripAlbums when
  // the loaded data is byte-for-byte the same as the previous load (no-op refreshes
  // from foreground returns or backfills that changed nothing visible).
  const entriesFingerprintRef = useRef('');
  const journalsFingerprintRef = useRef('');
  const albumsFingerprintRef = useRef('');

  const loadUserData = async () => {
    try {
      const [name, tmEnabled, tmExplicitlyDisabled, showMap, onboardingDone] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.USER_NAME),
        AsyncStorage.getItem(TRAVEL_MODE_KEYS.ENABLED),
        AsyncStorage.getItem(TRAVEL_MODE_KEYS.EXPLICITLY_DISABLED),
        AsyncStorage.getItem(STORAGE_KEYS.SHOW_HOME_MAP),
        AsyncStorage.getItem(STORAGE_KEYS.ONBOARDING_COMPLETED),
      ]);

      if (name) setUserNameState(name);
      if (onboardingDone === 'true') setHasCompletedOnboarding(true);

      // Pre-populate travel mode from cache so UI doesn't flicker on slow DB loads
      if (tmEnabled !== null) setTravelModeEnabled(tmEnabled === 'true');
      if (tmExplicitlyDisabled !== null) setTravelModeExplicitlyDisabled(tmExplicitlyDisabled === 'true');
      // null means never set → keep initial default (map hidden)
      if (showMap !== null) setShowHomeMapState(showMap === 'true');
    } catch (error) {
      logger.error('Error loading user data:', error);
      // Don't throw - allow app to continue even if user data fails to load
    }
  };

  // ---------------------------------------------------------------------------
  // Travel Mode helpers
  // ---------------------------------------------------------------------------

  const setTravelMode = async (enabled: boolean, explicit = false) => {
    const nextExplicitlyDisabled = !enabled && explicit;
    setTravelModeEnabled(enabled);
    setTravelModeExplicitlyDisabled(nextExplicitlyDisabled);
    await saveTravelModeState({ enabled, explicitlyDisabled: nextExplicitlyDisabled });
  };

  // Returns today's date as YYYY-MM-DD
  const getTodayString = () => new Date().toISOString().slice(0, 10);

  // Runs on app open (and after each data refresh). Silently auto-activates or
  // auto-deactivates Travel Mode based on active trip albums.
  const runTravelModeCheck = async (currentAlbums: TripAlbum[]) => {
    try {
      const today = getTodayString();
      const tmState = await loadTravelModeState();

      const hasActiveAlbums = currentAlbums.length > 0;
      let { enabled, explicitlyDisabled, hadActiveAlbums } = tmState;

      if (hasActiveAlbums) {
        // Mark that we have (or still have) active albums
        hadActiveAlbums = true;
        if (!explicitlyDisabled) {
          // Auto-activate silently (runs every refresh so new albums activate immediately)
          enabled = true;
        }
      } else {
        // No active albums right now
        if (hadActiveAlbums) {
          // Albums just ended — auto-deactivate and reset override
          enabled = false;
          explicitlyDisabled = false;
          hadActiveAlbums = false;
        }
        // If hadActiveAlbums was false: manual ON with no albums → leave enabled as-is
      }

      setTravelModeEnabled(enabled);
      setTravelModeExplicitlyDisabled(explicitlyDisabled);
      setActiveTripAlbums(currentAlbums);

      await saveTravelModeState({
        enabled,
        explicitlyDisabled,
        hadActiveAlbums,
        lastCheckDate: today,
      });
    } catch (error) {
      logger.error('Error running travel mode check:', error);
    }
  };

  // Runs after every data load. Checks all stored photo paths for existence and
  // logs any broken ones via logger.error (always-on) + persistentLogger so they
  // appear in the Diagnostics panel on TestFlight builds.
  const auditPhotoPaths = async (loadedEntries: Entry[]) => {
    try {
      const { File } = await import('expo-file-system');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const buildNumber: string = require('../../app.json').expo.ios.buildNumber;
      const photoEntries = loadedEntries.filter(
        (e) => e.mediaType === 'photo' && e.photoPaths && e.photoPaths.length > 0
      );
      let broken = 0;
      for (const entry of photoEntries) {
        for (const path of entry.photoPaths ?? []) {
          if (!path || !path.startsWith('file://')) continue;
          const f = new File(path);
          if (!f.exists) {
            broken++;
            logger.error('PHOTO_AUDIT: broken path', { entryId: entry.id, path, buildNumber });
            persistLog('PHOTO_AUDIT broken', entry.id, path, `build=${buildNumber}`);
          }
        }
      }
      const msg = broken > 0
        ? `PHOTO_AUDIT: ${broken} broken path(s) across ${photoEntries.length} photo entries build=${buildNumber}`
        : `PHOTO_AUDIT: ok — ${photoEntries.length} photo entries all valid build=${buildNumber}`;
      if (broken > 0) logger.error(msg);
      persistLog(msg);
    } catch (e) {
      logger.error('PHOTO_AUDIT: audit failed', e);
    }
  };

  const loadData = async () => {
    try {
      // Await full load — short timeouts caused empty UI on slow DB init after updates.
      const result = (await Promise.all([
        PersistenceManager.getEntries().catch(() => []),
        PersistenceManager.getJournals().catch(() => []),
        PersistenceManager.getTripAlbums().catch(() => []),
        PersistenceManager.getActiveTripAlbum().catch(() => null),
        PersistenceManager.getActiveTripAlbums().catch(() => []),
        PersistenceManager.getPostcards().catch(() => []),
      ])) as [Entry[], Journal[], TripAlbum[], TripAlbum | null, TripAlbum[], Postcard[]];

      const [loadedEntries, loadedJournals, loadedAlbums, activeTrip, activeAlbums, loadedPostcards] = result;

      // Only set state when data actually changed — prevents cascading re-renders
      // on no-op refreshes (foreground returns, backfills that touched nothing visible).
      const newEntriesFingerprint = (loadedEntries || []).map(e => `${e.id}:${e.updatedAt}`).join(',');
      if (newEntriesFingerprint !== entriesFingerprintRef.current) {
        entriesFingerprintRef.current = newEntriesFingerprint;
        setEntries(loadedEntries || []);
      }
      const newJournalsFingerprint = (loadedJournals || []).map(j => `${j.id}:${j.updatedAt}`).join(',');
      if (newJournalsFingerprint !== journalsFingerprintRef.current) {
        journalsFingerprintRef.current = newJournalsFingerprint;
        setJournals(loadedJournals || []);
      }
      const newAlbumsFingerprint = (loadedAlbums || []).map(a => `${a.id}:${a.updatedAt}`).join(',');
      if (newAlbumsFingerprint !== albumsFingerprintRef.current) {
        albumsFingerprintRef.current = newAlbumsFingerprint;
        setTripAlbums(loadedAlbums || []);
      }
      setPostcards(loadedPostcards || []);
      setActiveTripAlbum(activeTrip || null);

      // Push latest country + full countries list from SQLite entries every session.
      const entriesWithCountry = (loadedEntries || []).filter(e => e.country);
      const latestCountry = entriesWithCountry
        .slice()
        .sort((a, b) => (b.timestamp ?? '').localeCompare(a.timestamp ?? ''))
        [0]?.country ?? null;
      const allCountries = [...new Set(entriesWithCountry.map(e => e.country as string))];
      Analytics.syncCountriesFromEntries(latestCountry, allCountries).catch(() => {});

      // One-time backfill of pre-analytics SQLite counts. No-ops after first run.
      const t = getTodayString();
      Analytics.syncInitialData({
        totalAlbumCount:       (loadedAlbums  || []).length,
        pastAlbumCount:        (loadedAlbums  || []).filter(a => !!(a.endDate && a.endDate < t)).length,
        liveAlbumCount:        (loadedAlbums  || []).filter(a => !(a.endDate && a.endDate < t)).length,
        currentLiveAlbumCount: (activeAlbums  || []).length,
        imageCount:            (loadedEntries || []).reduce((s, e) => s + (e.photoPaths?.length ?? 0), 0),
        momentCount:           (loadedEntries || []).length,
        noteCount:             (loadedJournals|| []).length,
      }).catch(() => {});

      // Fire-and-forget photo path audit — deferred until after first frame so it
      // never competes with initial render. Runs once per JS session only.
      if (!_photoAuditRanThisSession) {
        _photoAuditRanThisSession = true;
        InteractionManager.runAfterInteractions(() => {
          auditPhotoPaths(loadedEntries || []).catch(() => {});
        });
      }

      // Run travel mode check with fresh album list (fire-and-forget, non-blocking)
      runTravelModeCheck(activeAlbums || []).catch(error => {
        logger.error('Travel mode check error:', error);
      });
    } catch (error) {
      logger.error('Error loading data:', error);
      // Reset fingerprints so the next successful load always applies.
      entriesFingerprintRef.current = '';
      journalsFingerprintRef.current = '';
      albumsFingerprintRef.current = '';
      setEntries([]);
      setJournals([]);
      setTripAlbums([]);
      setActiveTripAlbum(null);
    }
  };

  const setUserName = async (name: string) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.USER_NAME, name);
      setUserNameState(name);
      Analytics.setUserName(name).catch(() => {});
    } catch (error) {
      logger.error('Error saving user name:', error);
      throw error;
    }
  };

  const refreshData = async () => {
    await loadData();
  };

  // Debounced DB reload — collapses rapid-fire calls (backfill hooks, CRUD chains)
  // into a single loadData() per 300 ms window. The actual reload is deferred via
  // InteractionManager so it never runs while the user is scrolling or animating.
  // External callers that need immediate semantics (e.g. Settings reset) use refreshData().
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const scheduleRefresh = useCallback(() => {
    if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
    refreshDebounceRef.current = setTimeout(() => {
      refreshDebounceRef.current = null;
      if (refreshInFlightRef.current) { scheduleRefresh(); return; }
      refreshInFlightRef.current = true;
      InteractionManager.runAfterInteractions(async () => {
        try { await loadData(); }
        finally { refreshInFlightRef.current = false; }
      });
    }, 300);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Match DB read path: relative paths → file:// for Image/expo-image. */
  const withResolvedMediaPaths = (e: Entry): Entry => ({
    ...e,
    photoPaths: (e.photoPaths ?? []).map(resolveMediaPath),
    mediaPaths: (e.mediaPaths ?? []).map(resolveMediaPath),
  });

  // Entry operations
  const createEntry = async (entry: Entry) => {
    await PersistenceManager.createEntry(entry);
    setEntries(prev => {
      const resolved = withResolvedMediaPaths(entry);
      return [resolved, ...prev.filter(x => x.id !== entry.id)];
    });
    scheduleRefresh();
    const isLiveCapture = !!(entry.albumId && activeTripAlbums.some(a => a.id === entry.albumId));
    const liveAlbumCaptureCount = isLiveCapture
      ? entries.filter(e => e.albumId === entry.albumId).length + 1
      : 0;
    Analytics.onEntryCreated({ ...entry, isLiveCapture, liveAlbumCaptureCount }).catch(() => {});
    if (entry.country) Analytics.setLastKnownCountry(entry.country).catch(() => {});
  };

  const updateEntry = async (entry: Entry) => {
    await PersistenceManager.updateEntry(entry);
    const resolved = withResolvedMediaPaths(entry);
    setEntries(prev => prev.map(e => e.id === entry.id ? resolved : e));
    scheduleRefresh();
  };

  const deleteEntry = async (id: string) => {
    await PersistenceManager.deleteEntry(id);
    setEntries(prev => prev.filter(e => e.id !== id));
    scheduleRefresh();
  };

  useMetadataBackfillWhenOnline(scheduleRefresh);
  useCountryBackfillWhenOnline(scheduleRefresh);
  useColorPaletteBackfill(scheduleRefresh);
  useThumbnailBackfill(scheduleRefresh);
  usePhotoDimensionsBackfill(scheduleRefresh);

  // Refresh data when the app returns to the foreground (e.g. after phone lock or switching apps).
  // Skips the first 'active' event on mount since initializeApp handles the initial load.
  useEffect(() => {
    const appStateRef = { skipFirst: true };
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        if (appStateRef.skipFirst) { appStateRef.skipFirst = false; return; }
        scheduleRefresh();
        Analytics.onSessionStart().catch(() => {});
      }
    });
    return () => subscription.remove();
  }, [scheduleRefresh]);

  // Journal operations
  const createJournal = async (journal: Journal) => {
    await PersistenceManager.createJournal(journal);
    setJournals(prev => [journal, ...prev.filter(j => j.id !== journal.id)]);
    scheduleRefresh();
    Analytics.onNoteCreated().catch(() => {});
  };

  const updateJournal = async (journal: Journal) => {
    await PersistenceManager.updateJournal(journal);
    setJournals(prev => prev.map(j => j.id === journal.id ? journal : j));
    scheduleRefresh();
  };

  const deleteJournal = async (id: string) => {
    await PersistenceManager.deleteJournal(id);
    setJournals(prev => prev.filter(j => j.id !== id));
    scheduleRefresh();
  };

  useJournalLocationBackfillWhenOnline(updateJournal);

  // Trip Album operations
  const createTripAlbum = async (album: TripAlbum, creationMethod: 'unpack' | 'import' | 'new' = 'new') => {
    await PersistenceManager.createTripAlbum(album);
    try {
      await PersistenceManager.assignExistingItemsToAlbum(album);
    } catch (error) {
      logger.error('Error assigning existing entries/journals to new album:', error);
      // Album was created; continue so UI updates. Items can be added manually if needed.
    }
    scheduleRefresh();
    Analytics.onAlbumCreated(album, creationMethod).catch(() => {});
  };

  const updateTripAlbum = async (album: TripAlbum) => {
    await PersistenceManager.updateTripAlbum(album);
    setTripAlbums(prev => prev.map(a => a.id === album.id ? album : a));
    scheduleRefresh();
  };

  const deleteTripAlbum = async (id: string) => {
    const album = tripAlbums.find(a => a.id === id);
    await PersistenceManager.deleteTripAlbum(id);
    setTripAlbums(prev => prev.filter(a => a.id !== id));
    scheduleRefresh();
    if (album) Analytics.onAlbumDeleted(album).catch(() => {});
  };

  // Postcard operations
  const createPostcard = async (postcard: Postcard) => {
    await PersistenceManager.createPostcard(postcard);
    scheduleRefresh();
    Analytics.onPostcardCreated().catch(() => {});
  };

  const updatePostcard = async (postcard: Postcard) => {
    await PersistenceManager.updatePostcard(postcard);
    scheduleRefresh();
  };

  const deletePostcard = async (id: string) => {
    await PersistenceManager.deletePostcard(id);
    deletePostcardPhotoThumbnails(id);
    scheduleRefresh();
  };

  useEntryMediaRepair(isLoading, () => Promise.resolve(scheduleRefresh()));

  const initializeApp = async () => {
    try {
      // Load user data first (fast, no native modules)
      await loadUserData();

      // Set loading to false immediately after user data loads
      // Don't wait for database initialization - it can happen in background
      setIsLoading(false);

      // Load data in background (non-blocking)
      loadData().catch(error => {
        logger.error('Background data load error:', error);
      });

      // Analytics: register/update device row in jo_users. Fire-and-forget.
      Analytics.initialize().catch(() => {});

    } catch (error) {
      logger.error('Error during app initialization:', error);
      // Always set loading to false, even if there were errors
      setIsLoading(false);
    }
  };

  const setShowHomeMap = async (val: boolean) => {
    setShowHomeMapState(val);
    await AsyncStorage.setItem(STORAGE_KEYS.SHOW_HOME_MAP, String(val));
  };

  const completeOnboarding = async (path: 'unpack' | 'trip_album' | 'explore') => {
    setHasCompletedOnboarding(true);
    setPendingOnboardingPath(null);
    await AsyncStorage.setItem(STORAGE_KEYS.ONBOARDING_COMPLETED, 'true');
    PersistenceManager.upsertOnboardingCompletion(path).catch(e => {
      logger.error('Error writing onboarding completion to DB:', e);
    });
    Analytics.track('onboarding_completed', { path }).catch(() => {});
  };

  const resetApp = async () => {
    try {
      await Promise.all([
        AsyncStorage.removeItem(STORAGE_KEYS.USER_NAME),
        AsyncStorage.removeItem(IMPORT_LATEST_IMPORTED_IDS_KEY),
        AsyncStorage.removeItem(TRAVEL_MODE_KEYS.ENABLED),
        AsyncStorage.removeItem(TRAVEL_MODE_KEYS.EXPLICITLY_DISABLED),
        AsyncStorage.removeItem(TRAVEL_MODE_KEYS.HAD_ACTIVE_ALBUMS),
        AsyncStorage.removeItem(TRAVEL_MODE_KEYS.LAST_CHECK_DATE),
        AsyncStorage.removeItem(TRAVEL_MODE_KEYS.TRAVEL_CARD_DAY_TAPPED),
        AsyncStorage.removeItem(ENTRY_MEDIA_REPAIR_STORAGE_KEY),
        AsyncStorage.removeItem(STATS_TIME_SCOPE_KEY),
        AsyncStorage.removeItem(STORAGE_KEYS.SHOW_HOME_MAP),
        AsyncStorage.removeItem(STORAGE_KEYS.ONBOARDING_COMPLETED),
      ]);
      await PersistenceManager.clearAllData();
      await clearAllCachedPalettes();
      setUserNameState(null);
      setEntries([]);
      setJournals([]);
      setTripAlbums([]);
      setPostcards([]);
      setActiveTripAlbum(null);
      setTravelModeEnabled(false);
      setTravelModeExplicitlyDisabled(false);
      setActiveTripAlbums([]);
      setShowHomeMapState(false);
      setHasCompletedOnboarding(false);
      _photoAuditRanThisSession = false;
    } catch (error) {
      logger.error('Error during resetApp:', error);
      throw error;
    }
  };

  useEffect(() => {
    initializeApp();
  }, []);

  const value: AppContextType = {
    userName,
    isLoading,
    setUserName,
    entries,
    journals,
    tripAlbums,
    activeTripAlbum,
    postcards,
    travelModeEnabled,
    travelModeExplicitlyDisabled,
    activeTripAlbums,
    setTravelMode,
    createEntry,
    updateEntry,
    deleteEntry,
    createJournal,
    updateJournal,
    deleteJournal,
    createTripAlbum,
    updateTripAlbum,
    deleteTripAlbum,
    createPostcard,
    updatePostcard,
    deletePostcard,
    initializeApp,
    refreshData,
    resetApp,
    pendingEmotionLabels,
    setPendingEmotionLabels,
    pendingEmotionNote,
    setPendingEmotionNote,
    showHomeMap,
    setShowHomeMap,
    hasCompletedOnboarding,
    completeOnboarding,
    pendingOnboardingPath,
    setPendingOnboardingPath,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = (): AppContextType => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};
