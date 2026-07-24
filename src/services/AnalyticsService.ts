// AnalyticsService.ts
// Fire-and-forget analytics over Supabase. Never throws, never blocks the UI.
// Writes to: jo_users, jo_user_data, jo_user_milestones, jo_events.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const APP_VERSION  = Constants.expoConfig?.version ?? '1.0.0';
// iOS build number (13, 14…) — more useful than semantic version for TestFlight tracking.
const APP_BUILD    = Constants.expoConfig?.ios?.buildNumber ?? APP_VERSION;

const APP_USER_NAME_KEY = '@awefull_people:user_name';

// ── AsyncStorage keys ─────────────────────────────────────────────────────────

const K = {
  USER_ID:            '@jo/analytics/user_id',
  LAST_KNOWN_COUNTRY: '@jo/analytics/last_known_country',
  USER_DATA_STATE:    '@jo/ud/state',
  DATA_BACKFILLED:    '@jo/ud/backfilled',
  MILESTONE_STATE:    '@jo/ms/state',
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

interface State {
  userId:           string;
  lastKnownCountry: string | null;
}

interface RecapEntry {
  trip_id:        string;
  percent_viewed: number;
  completed:      boolean;
}

interface UserDataState {
  sessionCount:            number;
  totalAlbumCount:         number;
  pastAlbumCount:          number;
  liveAlbumCount:          number;
  currentLiveAlbumCount:   number;
  unpackTripCount:         number;
  importMemoriesCount:     number;
  newTripAlbumCount:       number;
  imageCount:              number;
  momentCount:             number;
  noteCount:               number;
  emotionCheckCount:       number;
  postcardExportCount:     number;
  postcardAfterRecapCount: number;
  countriesVisited:        string[];
  recapData:               RecapEntry[];
}

// Milestone keys paired: flag (bool) + timestamp (string | null).
// Keep this in sync with syncMilestones() and the Supabase schema.
type MilestoneKey =
  | 'activationStrict' | 'activationFlexible'
  | 'retentionD7' | 'retentionD30'
  | 'postcardCreated' | 'postcardShared'
  | 'albums3' | 'liveCaptures5' | 'liveRecapViewed' | 'albums7';

type MilestoneAtKey =
  | 'activationStrictAt' | 'activationFlexibleAt'
  | 'retentionD7At' | 'retentionD30At'
  | 'postcardCreatedAt' | 'postcardSharedAt'
  | 'albums3At' | 'liveCaptures5At' | 'liveRecapViewedAt' | 'albums7At';

interface MilestoneState {
  // The 10 milestones — bool + ISO string when first reached
  activationStrict:    boolean; activationStrictAt:    string | null;
  activationFlexible:  boolean; activationFlexibleAt:  string | null;
  retentionD7:         boolean; retentionD7At:         string | null;
  retentionD30:        boolean; retentionD30At:        string | null;
  postcardCreated:     boolean; postcardCreatedAt:     string | null;
  postcardShared:      boolean; postcardSharedAt:      string | null;
  albums3:             boolean; albums3At:             string | null;
  liveCaptures5:       boolean; liveCaptures5At:       string | null;
  liveRecapViewed:     boolean; liveRecapViewedAt:     string | null;
  albums7:             boolean; albums7At:             string | null;
  // Local-only derived fields — not written to Supabase
  firstActivationAt:   string | null;   // when activation_flexible first fired
  liveCaptureTripIds:  string[];         // album IDs that received live in-app captures
}

const DEFAULT_USER_DATA: UserDataState = {
  sessionCount:            0,
  totalAlbumCount:         0,
  pastAlbumCount:          0,
  liveAlbumCount:          0,
  currentLiveAlbumCount:   0,
  unpackTripCount:         0,
  importMemoriesCount:     0,
  newTripAlbumCount:       0,
  imageCount:              0,
  momentCount:             0,
  noteCount:               0,
  emotionCheckCount:       0,
  postcardExportCount:     0,
  postcardAfterRecapCount: 0,
  countriesVisited:        [],
  recapData:               [],
};

const DEFAULT_MILESTONES: MilestoneState = {
  activationStrict:    false, activationStrictAt:    null,
  activationFlexible:  false, activationFlexibleAt:  null,
  retentionD7:         false, retentionD7At:         null,
  retentionD30:        false, retentionD30At:        null,
  postcardCreated:     false, postcardCreatedAt:     null,
  postcardShared:      false, postcardSharedAt:      null,
  albums3:             false, albums3At:             null,
  liveCaptures5:       false, liveCaptures5At:       null,
  liveRecapViewed:     false, liveRecapViewedAt:     null,
  albums7:             false, albums7At:             null,
  firstActivationAt:   null,
  liveCaptureTripIds:  [],
};

// ── Module singletons ─────────────────────────────────────────────────────────

let _client:         SupabaseClient | null = null;
let _state:          State | null          = null;
let _userDataState:  UserDataState | null  = null;
let _milestoneState: MilestoneState | null = null;
let _initPromise:    Promise<void> | null  = null;
let _needsBackfill:  boolean               = false;

// ── Private helpers ───────────────────────────────────────────────────────────

function db(): SupabaseClient {
  if (!_client) {
    if (__DEV__) {
      if (!SUPABASE_URL || !SUPABASE_KEY) {
        console.error('[Analytics] ❌ Missing Supabase credentials. Run: npx expo start --clear');
      } else {
        console.log('[Analytics] ✅ Supabase client initializing. URL:', SUPABASE_URL);
      }
    }
    _client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return _client;
}

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function getLocale(): string | null {
  try { return Intl.DateTimeFormat().resolvedOptions().locale ?? null; } catch { return null; }
}

function now(): string { return new Date().toISOString(); }

function today(): string { return now().slice(0, 10); }

// Whole-day difference — negative means isoA is in the future relative to isoB.
function daysBetween(isoA: string, isoB: string): number {
  return Math.floor((Date.parse(isoB) - Date.parse(isoA)) / 86400000);
}

// ── jo_user_data ──────────────────────────────────────────────────────────────

async function persistUserData(): Promise<void> {
  if (!_userDataState) return;
  await AsyncStorage.setItem(K.USER_DATA_STATE, JSON.stringify(_userDataState));
}

async function mutateUserData(patch: Partial<UserDataState>): Promise<void> {
  if (!_userDataState) return;
  Object.assign(_userDataState, patch);
  await persistUserData();
  syncUserData().catch(() => {});
}

async function syncUserData(): Promise<void> {
  if (!_state || !_userDataState) return;
  const ud = _userDataState;
  const { error } = await db().from('jo_user_data').upsert(
    {
      user_id:                    _state.userId,
      updated_at:                 now(),
      session_count:              ud.sessionCount,
      total_album_count:          ud.totalAlbumCount,
      past_album_count:           ud.pastAlbumCount,
      live_album_count:           ud.liveAlbumCount,
      current_live_album_count:   ud.currentLiveAlbumCount,
      unpack_trip_count:          ud.unpackTripCount,
      import_memories_count:      ud.importMemoriesCount,
      new_trip_album_count:       ud.newTripAlbumCount,
      image_count:                ud.imageCount,
      moment_count:               ud.momentCount,
      note_count:                 ud.noteCount,
      emotion_check_count:        ud.emotionCheckCount,
      postcard_export_count:      ud.postcardExportCount,
      postcard_after_recap_count: ud.postcardAfterRecapCount,
      countries_visited:          ud.countriesVisited,
      recap_data:                 ud.recapData,
    },
    { onConflict: 'user_id' }
  );
  if (__DEV__ && error) console.warn('[Analytics] syncUserData error:', JSON.stringify(error));
}

// ── jo_user_milestones ────────────────────────────────────────────────────────

async function persistMilestones(): Promise<void> {
  if (!_milestoneState) return;
  await AsyncStorage.setItem(K.MILESTONE_STATE, JSON.stringify(_milestoneState));
}

async function syncMilestones(): Promise<void> {
  if (!_state || !_milestoneState) return;
  const ms = _milestoneState;
  const { error } = await db().from('jo_user_milestones').upsert(
    {
      user_id:                _state.userId,
      updated_at:             now(),
      activation_strict:      ms.activationStrict,     activation_strict_at:    ms.activationStrictAt,
      activation_flexible:    ms.activationFlexible,   activation_flexible_at:  ms.activationFlexibleAt,
      retention_d7:           ms.retentionD7,           retention_d7_at:         ms.retentionD7At,
      retention_d30:          ms.retentionD30,          retention_d30_at:        ms.retentionD30At,
      postcard_created:       ms.postcardCreated,       postcard_created_at:     ms.postcardCreatedAt,
      postcard_shared:        ms.postcardShared,        postcard_shared_at:      ms.postcardSharedAt,
      albums_3:               ms.albums3,               albums_3_at:             ms.albums3At,
      live_captures_5:        ms.liveCaptures5,         live_captures_5_at:      ms.liveCaptures5At,
      live_recap_viewed:      ms.liveRecapViewed,       live_recap_viewed_at:    ms.liveRecapViewedAt,
      albums_7:               ms.albums7,               albums_7_at:             ms.albums7At,
    },
    { onConflict: 'user_id' }
  );
  if (__DEV__ && error) console.warn('[Analytics] syncMilestones error:', JSON.stringify(error));
}

// One-way latch. Flips flag + timestamp when condition is met, returns true if it changed.
function latch(
  ms: MilestoneState,
  flag: MilestoneKey,
  atField: MilestoneAtKey,
  condition: boolean,
  ts: string
): boolean {
  if (ms[flag] || !condition) return false;
  ms[flag] = true;
  ms[atField] = ts;
  return true;
}

// Persists changed milestone state and fires off a Supabase upsert.
async function flushMilestones(): Promise<void> {
  await persistMilestones();
  syncMilestones().catch(() => {});
}

// ── jo_events ─────────────────────────────────────────────────────────────────

async function track(
  eventName: string,
  properties?: Record<string, unknown>
): Promise<void> {
  try {
    await initialize();
    if (!_state) return;
    const payload: Record<string, unknown> = {
      user_id:       _state.userId,
      event_name:    eventName,
      build_version: APP_BUILD,
    };
    if (properties) payload.properties = properties;
    const { error } = await db().from('jo_events').insert(payload);
    if (__DEV__ && error) console.warn('[Analytics] track error:', JSON.stringify(error));
  } catch (e) {
    if (__DEV__) console.warn('[Analytics] track error:', e);
  }
}

// ── Initialization ────────────────────────────────────────────────────────────

async function _doInitialize(): Promise<void> {
  const [[, existingId], [, cachedCountry], [, rawUdState], [, backfilled], [, rawMsState]] =
    await AsyncStorage.multiGet([
      K.USER_ID, K.LAST_KNOWN_COUNTRY, K.USER_DATA_STATE, K.DATA_BACKFILLED, K.MILESTONE_STATE,
    ]);

  const isNewDevice = !existingId;
  const userId      = existingId ?? generateUUID();
  if (isNewDevice) await AsyncStorage.setItem(K.USER_ID, userId);

  _state = { userId, lastKnownCountry: cachedCountry ?? null };

  try {
    _userDataState = rawUdState
      ? { ...DEFAULT_USER_DATA, ...JSON.parse(rawUdState) }
      : { ...DEFAULT_USER_DATA };
  } catch {
    _userDataState = { ...DEFAULT_USER_DATA };
  }

  try {
    _milestoneState = rawMsState
      ? { ...DEFAULT_MILESTONES, ...JSON.parse(rawMsState) }
      : { ...DEFAULT_MILESTONES };
  } catch {
    _milestoneState = { ...DEFAULT_MILESTONES };
  }

  _needsBackfill = backfilled !== 'true';

  // ── jo_users upsert ───────────────────────────────────────────────────────
  const displayName = await AsyncStorage.getItem(APP_USER_NAME_KEY);
  const payload: Record<string, unknown> = {
    id: userId, platform: Platform.OS, locale: getLocale(), build_version: APP_BUILD,
  };
  if (isNewDevice) payload.first_app_version = APP_BUILD;
  if (displayName)  payload.display_name     = displayName;

  const { error: uErr } = await db().from('jo_users').upsert(payload, { onConflict: 'id' });
  if (__DEV__) console.log('[Analytics] jo_users upsert:', uErr ? JSON.stringify(uErr) : 'OK');

  // Push current local state on every init — catches up any writes that were
  // missed in prior sessions (e.g. RLS blocking, network failure).
  syncUserData().catch(() => {});
  syncMilestones().catch(() => {});
}

async function initialize(): Promise<void> {
  if (_initPromise) return _initPromise;
  _initPromise = _doInitialize().catch(e => {
    if (__DEV__) console.warn('[Analytics] init error:', e);
    _initPromise = null;
  });
  return _initPromise;
}

// ── jo_users field updates ────────────────────────────────────────────────────

async function setUserName(name: string): Promise<void> {
  try {
    await initialize();
    if (!_state) return;
    const { error } = await db().from('jo_users').update({ display_name: name }).eq('id', _state.userId);
    if (__DEV__ && error) console.warn('[Analytics] setUserName error:', JSON.stringify(error));
  } catch (e) {
    if (__DEV__) console.warn('[Analytics] setUserName error:', e);
  }
}

async function setUserEmail(email: string): Promise<void> {
  try {
    await initialize();
    if (!_state) return;
    const { error } = await db().from('jo_users').update({ email }).eq('id', _state.userId);
    if (__DEV__ && error) console.warn('[Analytics] setUserEmail error:', JSON.stringify(error));
  } catch (e) {
    if (__DEV__) console.warn('[Analytics] setUserEmail error:', e);
  }
}

// Called every session from loadData(). Pushes latest country to jo_users and
// merges the full SQLite-derived country list into jo_user_data (set union, idempotent).
async function syncCountriesFromEntries(
  latestCountry: string | null,
  allCountries:  string[]
): Promise<void> {
  try {
    await initialize();
    if (latestCountry) await setLastKnownCountry(latestCountry);
    if (!_userDataState || allCountries.length === 0) return;
    const existing = new Set(_userDataState.countriesVisited);
    const newOnes  = allCountries.filter(c => !existing.has(c));
    if (newOnes.length === 0) return;
    await mutateUserData({
      countriesVisited: [..._userDataState.countriesVisited, ...newOnes],
    });
    if (__DEV__) console.log('[Analytics] syncCountriesFromEntries: added', newOnes);
  } catch (e) {
    if (__DEV__) console.warn('[Analytics] syncCountriesFromEntries error:', e);
  }
}

async function setLastKnownCountry(country: string): Promise<void> {
  try {
    await initialize();
    if (!_state || country === _state.lastKnownCountry) return;
    _state.lastKnownCountry = country;
    await AsyncStorage.setItem(K.LAST_KNOWN_COUNTRY, country);
    const { error } = await db().from('jo_users').update({ last_known_country: country }).eq('id', _state.userId);
    if (__DEV__ && error) console.warn('[Analytics] setLastKnownCountry error:', JSON.stringify(error));
  } catch (e) {
    if (__DEV__) console.warn('[Analytics] setLastKnownCountry error:', e);
  }
}

// ── jo_user_data + milestone mutations ───────────────────────────────────────

async function onSessionStart(): Promise<void> {
  try {
    await initialize();
    if (!_userDataState) return;
    await mutateUserData({ sessionCount: _userDataState.sessionCount + 1 });
    if (__DEV__) console.log('[Analytics] onSessionStart — session count:', _userDataState.sessionCount);

    track('session_start').catch(() => {});

    // Milestone: retention_d7 — first return session within 7 days of activation.
    // onSessionStart fires at the START of each session before any content actions,
    // so firstActivationAt (set mid-session) is naturally absent on the activation session.
    if (_milestoneState) {
      const ms = _milestoneState;
      const ts = now();
      const newMilestones: string[] = [];
      if (ms.firstActivationAt) {
        if (latch(ms, 'retentionD7', 'retentionD7At',
          daysBetween(ms.firstActivationAt, ts) <= 7, ts)) newMilestones.push('retention_d7');
      }
      if (newMilestones.length) {
        await flushMilestones();
        for (const m of newMilestones) track('milestone_reached', { milestone_name: m }).catch(() => {});
      }
    }
  } catch (e) {
    if (__DEV__) console.warn('[Analytics] onSessionStart error:', e);
  }
}

async function syncInitialData(counts: {
  totalAlbumCount:       number;
  pastAlbumCount:        number;
  liveAlbumCount:        number;
  currentLiveAlbumCount: number;
  imageCount:            number;
  momentCount:           number;
  noteCount:             number;
}): Promise<void> {
  try {
    await initialize();
    if (!_userDataState || !_needsBackfill) return;
    _needsBackfill = false;
    await AsyncStorage.setItem(K.DATA_BACKFILLED, 'true');
    await mutateUserData(counts);
    if (__DEV__) console.log('[Analytics] syncInitialData: backfill complete', counts);
  } catch (e) {
    if (__DEV__) console.warn('[Analytics] syncInitialData error:', e);
  }
}

async function onAlbumCreated(
  album: { endDate?: string | null },
  method: 'unpack' | 'import' | 'new'
): Promise<void> {
  try {
    await initialize();
    if (!_userDataState) return;
    const isPast = !!(album.endDate && album.endDate < today());
    const ud = _userDataState;
    const patch: Partial<UserDataState> = {
      totalAlbumCount: ud.totalAlbumCount + 1,
      ...(isPast
        ? { pastAlbumCount: ud.pastAlbumCount + 1 }
        : { liveAlbumCount: ud.liveAlbumCount + 1, currentLiveAlbumCount: ud.currentLiveAlbumCount + 1 }),
      ...(method === 'unpack' && { unpackTripCount:     ud.unpackTripCount + 1 }),
      ...(method === 'import' && { importMemoriesCount: ud.importMemoriesCount + 1 }),
      ...(method === 'new'    && { newTripAlbumCount:   ud.newTripAlbumCount + 1 }),
    };
    await mutateUserData(patch);

    track('album_created', { method, is_past: isPast }).catch(() => {});

    // Milestones: albums_3, albums_7, retention_d30
    if (_milestoneState) {
      const ms  = _milestoneState;
      const ts  = now();
      const tot = _userDataState.totalAlbumCount;
      const newMilestones: string[] = [];
      if (latch(ms, 'albums3', 'albums3At', tot >= 3, ts)) newMilestones.push('albums_3');
      if (latch(ms, 'albums7', 'albums7At', tot >= 7, ts)) newMilestones.push('albums_7');
      if (ms.firstActivationAt) {
        if (latch(ms, 'retentionD30', 'retentionD30At',
          tot >= 2 && daysBetween(ms.firstActivationAt, ts) <= 30, ts)) newMilestones.push('retention_d30');
      }
      if (newMilestones.length) {
        await flushMilestones();
        for (const m of newMilestones) track('milestone_reached', { milestone_name: m }).catch(() => {});
      }
    }
  } catch (e) {
    if (__DEV__) console.warn('[Analytics] onAlbumCreated error:', e);
  }
}

async function onAlbumDeleted(album: { endDate?: string | null }): Promise<void> {
  try {
    await initialize();
    if (!_userDataState) return;
    const wasPast = !!(album.endDate && album.endDate < today());
    const ud = _userDataState;
    await mutateUserData({
      totalAlbumCount: Math.max(0, ud.totalAlbumCount - 1),
      ...(wasPast
        ? { pastAlbumCount: Math.max(0, ud.pastAlbumCount - 1) }
        : {
            liveAlbumCount:        Math.max(0, ud.liveAlbumCount - 1),
            currentLiveAlbumCount: Math.max(0, ud.currentLiveAlbumCount - 1),
          }),
    });
    // No milestone checks on delete — milestones are one-way latches.
  } catch (e) {
    if (__DEV__) console.warn('[Analytics] onAlbumDeleted error:', e);
  }
}

async function onEntryCreated(entry: {
  photoPaths?:             string[] | null;
  emotionLabels?:          string[] | null;
  country?:                string  | null;
  albumId?:                string  | null;
  isLiveCapture?:          boolean;
  liveAlbumCaptureCount?:  number;
}): Promise<void> {
  try {
    await initialize();
    if (!_userDataState) return;
    const ud         = _userDataState;
    const photoCount = entry.photoPaths?.length ?? 0;
    await mutateUserData({
      momentCount: ud.momentCount + 1,
      imageCount:  ud.imageCount + photoCount,
      ...(entry.emotionLabels?.length && { emotionCheckCount: ud.emotionCheckCount + 1 }),
      ...(entry.country && !ud.countriesVisited.includes(entry.country) && {
        countriesVisited: [...ud.countriesVisited, entry.country],
      }),
    });

    track('entry_created', {
      has_photos:      photoCount > 0,
      photo_count:     photoCount,
      has_emotion:     !!(entry.emotionLabels?.length),
      is_live_capture: entry.isLiveCapture === true,
    }).catch(() => {});

    // Milestones: live_captures_5 + maintain liveCaptureTripIds for live_recap_viewed
    if (_milestoneState) {
      const ms    = _milestoneState;
      const ts    = now();
      let dirty   = false;
      const isLive = entry.isLiveCapture === true && !!entry.albumId;
      const newMilestones: string[] = [];

      if (isLive && !ms.liveCaptureTripIds.includes(entry.albumId!)) {
        ms.liveCaptureTripIds = [...ms.liveCaptureTripIds, entry.albumId!];
        dirty = true;
      }

      const captureCount = entry.liveAlbumCaptureCount ?? 0;
      if (latch(ms, 'liveCaptures5', 'liveCaptures5At', isLive && captureCount >= 5, ts)) {
        dirty = true;
        newMilestones.push('live_captures_5');
      }

      if (dirty) {
        await flushMilestones();
        for (const m of newMilestones) track('milestone_reached', { milestone_name: m }).catch(() => {});
      }
    }
  } catch (e) {
    if (__DEV__) console.warn('[Analytics] onEntryCreated error:', e);
  }
}

async function onNoteCreated(): Promise<void> {
  try {
    await initialize();
    if (!_userDataState) return;
    await mutateUserData({ noteCount: _userDataState.noteCount + 1 });
    track('note_created').catch(() => {});
  } catch (e) {
    if (__DEV__) console.warn('[Analytics] onNoteCreated error:', e);
  }
}

// Called when a postcard is saved in the PostcardEditor (create-in-app path).
async function onPostcardCreated(): Promise<void> {
  try {
    await initialize();
    if (!_milestoneState) return;
    const ms = _milestoneState;
    const ts = now();
    const newMilestones: string[] = [];
    if (latch(ms, 'postcardCreated', 'postcardCreatedAt', true, ts)) newMilestones.push('postcard_created');
    if (newMilestones.length) {
      await flushMilestones();
      for (const m of newMilestones) track('milestone_reached', { milestone_name: m }).catch(() => {});
    }
  } catch (e) {
    if (__DEV__) console.warn('[Analytics] onPostcardCreated error:', e);
  }
}

// Called on any export (download or share) from PostcardEditor or JourneyRecapPost.
async function onPostcardExported(tripId: string | null): Promise<void> {
  try {
    await initialize();
    if (!_userDataState) return;
    const ud = _userDataState;
    const hadRecap = !!tripId && ud.recapData.some(r => r.trip_id === tripId);
    await mutateUserData({
      postcardExportCount:     ud.postcardExportCount + 1,
      ...(hadRecap && { postcardAfterRecapCount: ud.postcardAfterRecapCount + 1 }),
    });

    track('postcard_exported', { had_recap: hadRecap }).catch(() => {});

    // Milestones: postcard_created (covers share-without-save path), postcard_shared, activation_strict
    if (_milestoneState && _userDataState) {
      const ms  = _milestoneState;
      const ud2 = _userDataState;
      const ts  = now();
      const newMilestones: string[] = [];
      if (latch(ms, 'postcardCreated', 'postcardCreatedAt', true, ts)) newMilestones.push('postcard_created');
      if (latch(ms, 'postcardShared',  'postcardSharedAt',  true, ts)) newMilestones.push('postcard_shared');
      const anyCompleted = ud2.recapData.some(r => r.completed);
      if (latch(ms, 'activationStrict', 'activationStrictAt',
        anyCompleted && ud2.postcardExportCount >= 1, ts)) newMilestones.push('activation_strict');
      if (newMilestones.length) {
        await flushMilestones();
        for (const m of newMilestones) track('milestone_reached', { milestone_name: m }).catch(() => {});
      }
    }
  } catch (e) {
    if (__DEV__) console.warn('[Analytics] onPostcardExported error:', e);
  }
}

async function onRecapViewed(
  tripId:        string,
  percentViewed: number,
  completed:     boolean
): Promise<void> {
  try {
    await initialize();
    if (!_userDataState) return;
    const existing = _userDataState.recapData.find(r => r.trip_id === tripId);
    const newRecapData: RecapEntry[] = existing
      ? _userDataState.recapData.map(r =>
          r.trip_id === tripId
            ? { trip_id: r.trip_id, percent_viewed: Math.max(r.percent_viewed, percentViewed), completed: r.completed || completed }
            : r
        )
      : [..._userDataState.recapData, { trip_id: tripId, percent_viewed: percentViewed, completed }];
    await mutateUserData({ recapData: newRecapData });

    const isLiveTrip = _milestoneState?.liveCaptureTripIds.includes(tripId) ?? false;
    track('recap_viewed', { percent_viewed: percentViewed, completed, is_live_trip: isLiveTrip }).catch(() => {});

    // Milestones: activation_flexible, activation_strict, live_recap_viewed
    if (_milestoneState && _userDataState) {
      const ms  = _milestoneState;
      const ud  = _userDataState;
      const ts  = now();
      const newMilestones: string[] = [];

      // activation_flexible: any recap >= 50% viewed
      const wasFlexible = ms.activationFlexible;
      if (latch(ms, 'activationFlexible', 'activationFlexibleAt',
        ud.recapData.some(r => r.percent_viewed >= 0.5), ts)) newMilestones.push('activation_flexible');
      // Record anchor for retention milestones when activation_flexible first fires
      if (!wasFlexible && ms.activationFlexible && !ms.firstActivationAt) {
        ms.firstActivationAt = ts;
      }

      // activation_strict: any recap completed + any postcard exported
      if (latch(ms, 'activationStrict', 'activationStrictAt',
        ud.recapData.some(r => r.completed) && ud.postcardExportCount >= 1, ts)) newMilestones.push('activation_strict');

      // live_recap_viewed: recap viewed for a trip that had in-app live captures
      if (latch(ms, 'liveRecapViewed', 'liveRecapViewedAt',
        ms.liveCaptureTripIds.includes(tripId), ts)) newMilestones.push('live_recap_viewed');

      if (newMilestones.length) {
        await flushMilestones();
        for (const m of newMilestones) track('milestone_reached', { milestone_name: m }).catch(() => {});
      } else if (!wasFlexible && ms.activationFlexible) {
        // firstActivationAt was set but no milestone event fired (edge case: already had flexible, skipped latch)
        // In practice can't happen, but guard to ensure firstActivationAt is always persisted.
        await flushMilestones();
      }
    }
  } catch (e) {
    if (__DEV__) console.warn('[Analytics] onRecapViewed error:', e);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export const Analytics = {
  // jo_users
  initialize,
  setUserName,
  setUserEmail,
  setLastKnownCountry,
  // jo_user_data
  onSessionStart,
  syncInitialData,
  onAlbumCreated,
  onAlbumDeleted,
  onEntryCreated,
  onNoteCreated,
  onPostcardExported,
  onRecapViewed,
  // jo_user_milestones
  onPostcardCreated,
  // jo_events
  track,
  // countries
  syncCountriesFromEntries,
};
