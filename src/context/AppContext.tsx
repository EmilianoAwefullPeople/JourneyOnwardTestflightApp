// AppContext
// Global state management with SQLite integration (no native module dependencies at import time)

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Entry } from '../models/Entry';
import { Journal } from '../models/Journal';
import { TripAlbum } from '../models/TripAlbum';
import * as PersistenceManager from '../storage/PersistenceManager';
import { TRAVEL_MODE_KEYS, loadTravelModeState, saveTravelModeState } from '../storage/PersistenceManager';
import { logger } from '../utils/logger';
import { useMetadataBackfillWhenOnline } from '../hooks/useMetadataBackfillWhenOnline';
import { useCountryBackfillWhenOnline } from '../hooks/useCountryBackfillWhenOnline';
import { useColorPaletteBackfill } from '../hooks/useColorPaletteBackfill';
import { useEntryMediaRepair, ENTRY_MEDIA_REPAIR_STORAGE_KEY } from '../hooks/useEntryMediaRepair';
import { persistLog } from '../utils/persistentLogger';
import { IMPORT_LATEST_IMPORTED_IDS_KEY } from '../utils/importLatestStorage';
import { STATS_TIME_SCOPE_KEY } from '../utils/statsScopeStorage';
import { PROGRESS_STORAGE_KEY } from '../utils/progressStorage';
import { clearAllCachedPalettes } from '../storage/dashboardPaletteCache';

interface AppContextType {
  // User state
  userName: string | null;
  isLoading: boolean;
  isFirstLaunch: boolean;
  setUserName: (name: string) => Promise<void>;

  // Data state
  entries: Entry[];
  journals: Journal[];
  tripAlbums: TripAlbum[];
  activeTripAlbum: TripAlbum | null;

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
  
  createTripAlbum: (album: TripAlbum) => Promise<void>;
  updateTripAlbum: (album: TripAlbum) => Promise<void>;
  deleteTripAlbum: (id: string) => Promise<void>;
  
  // Initialization
  initializeApp: () => Promise<void>;
  refreshData: () => Promise<void>;
  /** Clears all data and resets to first-launch state; call then navigate to Welcome. */
  resetApp: () => Promise<void>;

  // Emotion capture return value (set by EmotionCaptureScreen on Save/Skip; read by Capture/EntryEdit on focus)
  pendingEmotionLabels: string[] | null;
  setPendingEmotionLabels: (labels: string[] | null) => void;
  pendingEmotionNote: string | null;
  setPendingEmotionNote: (note: string | null) => void;

  // Home screen preferences
  showHomeMap: boolean;
  setShowHomeMap: (val: boolean) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const STORAGE_KEYS = {
  USER_NAME: '@awefull_people:user_name',
  FIRST_LAUNCH: '@awefull_people:first_launch',
  SHOW_HOME_MAP: '@awefull_people:show_home_map',
};

interface AppProviderProps {
  children: ReactNode;
}

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  const [userName, setUserNameState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFirstLaunch, setIsFirstLaunch] = useState(true);
  
  // Data state
  const [entries, setEntries] = useState<Entry[]>([]);
  const [journals, setJournals] = useState<Journal[]>([]);
  const [tripAlbums, setTripAlbums] = useState<TripAlbum[]>([]);
  const [activeTripAlbum, setActiveTripAlbum] = useState<TripAlbum | null>(null);
  const [pendingEmotionLabels, setPendingEmotionLabels] = useState<string[] | null>(null);
  const [pendingEmotionNote, setPendingEmotionNote] = useState<string | null>(null);

  // Home screen preferences
  const [showHomeMap, setShowHomeMapState] = useState(true);

  // Travel Mode state
  const [travelModeEnabled, setTravelModeEnabled] = useState(false);
  const [travelModeExplicitlyDisabled, setTravelModeExplicitlyDisabled] = useState(false);
  const [activeTripAlbums, setActiveTripAlbums] = useState<TripAlbum[]>([]);

  const loadUserData = async () => {
    try {
      const [name, firstLaunch, tmEnabled, tmExplicitlyDisabled, showMap] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.USER_NAME),
        AsyncStorage.getItem(STORAGE_KEYS.FIRST_LAUNCH),
        AsyncStorage.getItem(TRAVEL_MODE_KEYS.ENABLED),
        AsyncStorage.getItem(TRAVEL_MODE_KEYS.EXPLICITLY_DISABLED),
        AsyncStorage.getItem(STORAGE_KEYS.SHOW_HOME_MAP),
      ]);

      if (name) setUserNameState(name);
      if (firstLaunch === 'false') setIsFirstLaunch(false);

      // Pre-populate travel mode from cache so UI doesn't flicker on slow DB loads
      if (tmEnabled !== null) setTravelModeEnabled(tmEnabled === 'true');
      if (tmExplicitlyDisabled !== null) setTravelModeExplicitlyDisabled(tmExplicitlyDisabled === 'true');
      // null means never set → default true (show map)
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
      ])) as [Entry[], Journal[], TripAlbum[], TripAlbum | null, TripAlbum[]];

      const [loadedEntries, loadedJournals, loadedAlbums, activeTrip, activeAlbums] = result;

      setEntries(loadedEntries || []);
      setJournals(loadedJournals || []);
      setTripAlbums(loadedAlbums || []);
      setActiveTripAlbum(activeTrip || null);

      // Fire-and-forget photo path audit — surfaces broken paths in Xcode console
      // and persistent log so diagnostics panel can report them.
      auditPhotoPaths(loadedEntries || []).catch(() => {});

      // Run travel mode check with fresh album list (fire-and-forget, non-blocking)
      runTravelModeCheck(activeAlbums || []).catch(error => {
        logger.error('Travel mode check error:', error);
      });
    } catch (error) {
      logger.error('Error loading data:', error);
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
      
      // Mark first launch as complete
      await AsyncStorage.setItem(STORAGE_KEYS.FIRST_LAUNCH, 'false');
      setIsFirstLaunch(false);
    } catch (error) {
      logger.error('Error saving user name:', error);
      throw error;
    }
  };

  // Entry operations
  const createEntry = async (entry: Entry) => {
    await PersistenceManager.createEntry(entry);
    await refreshData();
  };

  const updateEntry = async (entry: Entry) => {
    await PersistenceManager.updateEntry(entry);
    await refreshData();
  };

  const deleteEntry = async (id: string) => {
    await PersistenceManager.deleteEntry(id);
    await refreshData();
  };

  useMetadataBackfillWhenOnline(updateEntry);
  useCountryBackfillWhenOnline(updateEntry);
  useColorPaletteBackfill(updateEntry);

  // Journal operations
  const createJournal = async (journal: Journal) => {
    await PersistenceManager.createJournal(journal);
    await refreshData();
  };

  const updateJournal = async (journal: Journal) => {
    await PersistenceManager.updateJournal(journal);
    await refreshData();
  };

  const deleteJournal = async (id: string) => {
    await PersistenceManager.deleteJournal(id);
    await refreshData();
  };

  // Trip Album operations
  const createTripAlbum = async (album: TripAlbum) => {
    await PersistenceManager.createTripAlbum(album);
    try {
      await PersistenceManager.assignExistingItemsToAlbum(album);
    } catch (error) {
      logger.error('Error assigning existing entries/journals to new album:', error);
      // Album was created; continue so UI updates. Items can be added manually if needed.
    }
    await refreshData();
  };

  const updateTripAlbum = async (album: TripAlbum) => {
    await PersistenceManager.updateTripAlbum(album);
    await refreshData();
  };

  const deleteTripAlbum = async (id: string) => {
    await PersistenceManager.deleteTripAlbum(id);
    await refreshData();
  };

  const refreshData = async () => {
    await loadData();
  };

  useEntryMediaRepair(isLoading, refreshData);

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

  const resetApp = async () => {
    try {
      await Promise.all([
        AsyncStorage.removeItem(STORAGE_KEYS.USER_NAME),
        AsyncStorage.removeItem(STORAGE_KEYS.FIRST_LAUNCH),
        AsyncStorage.removeItem(IMPORT_LATEST_IMPORTED_IDS_KEY),
        AsyncStorage.removeItem(PROGRESS_STORAGE_KEY),
        AsyncStorage.removeItem(TRAVEL_MODE_KEYS.ENABLED),
        AsyncStorage.removeItem(TRAVEL_MODE_KEYS.EXPLICITLY_DISABLED),
        AsyncStorage.removeItem(TRAVEL_MODE_KEYS.HAD_ACTIVE_ALBUMS),
        AsyncStorage.removeItem(TRAVEL_MODE_KEYS.LAST_CHECK_DATE),
        AsyncStorage.removeItem(TRAVEL_MODE_KEYS.TRAVEL_CARD_DAY_TAPPED),
        AsyncStorage.removeItem(ENTRY_MEDIA_REPAIR_STORAGE_KEY),
        AsyncStorage.removeItem(STATS_TIME_SCOPE_KEY),
        AsyncStorage.removeItem(STORAGE_KEYS.SHOW_HOME_MAP),
      ]);
      await PersistenceManager.clearAllData();
      await clearAllCachedPalettes();
      setUserNameState(null);
      setIsFirstLaunch(true);
      setEntries([]);
      setJournals([]);
      setTripAlbums([]);
      setActiveTripAlbum(null);
      setTravelModeEnabled(false);
      setTravelModeExplicitlyDisabled(false);
      setActiveTripAlbums([]);
      setShowHomeMapState(true);
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
    isFirstLaunch,
    setUserName,
    entries,
    journals,
    tripAlbums,
    activeTripAlbum,
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
    initializeApp,
    refreshData,
    resetApp,
    pendingEmotionLabels,
    setPendingEmotionLabels,
    pendingEmotionNote,
    setPendingEmotionNote,
    showHomeMap,
    setShowHomeMap,
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
