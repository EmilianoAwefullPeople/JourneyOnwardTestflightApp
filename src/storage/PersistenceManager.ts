// PersistenceManager
// SQLite database operations with lazy-loading to prevent early native module initialization

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Entry } from '../models/Entry';
import { Journal } from '../models/Journal';
import { TripAlbum } from '../models/TripAlbum';
import { isTimestampInAlbumRange } from '../utils/albumUtils';
import { logger } from '../utils/logger';
import { deleteAllPersistentMedia, deletePersistentMediaForEntry, resolveMediaPath } from './mediaStorage';

/** Bump when adding migrations; must match highest version set by migrations / resetDatabase. */
const TARGET_SCHEMA_VERSION = 7;
const REQUIRED_ENTRY_COLUMNS: Array<{ name: string; sql: string }> = [
  { name: 'is_awe', sql: 'is_awe INTEGER' },
  { name: 'weather', sql: 'weather TEXT' },
  { name: 'temperature_celsius', sql: 'temperature_celsius REAL' },
  { name: 'altitude_meters', sql: 'altitude_meters REAL' },
  { name: 'season', sql: 'season TEXT' },
  { name: 'emotion_note', sql: 'emotion_note TEXT' },
  { name: 'country', sql: 'country TEXT' },
  { name: 'city', sql: 'city TEXT' },
  { name: 'photo_color_palettes', sql: 'photo_color_palettes TEXT' },
];

// Lazy-load SQLite only when needed
let SQLite: any = null;
let db: any = null;
let dbInitialized = false;
let dbInitPromise: Promise<void> | null = null;

// Force reset database connection
const resetDatabaseConnection = () => {
  if (db) {
    try {
      db.closeSync?.();
    } catch (error) {
      // Ignore errors when closing
    }
  }
  db = null;
  dbInitialized = false;
  dbInitPromise = null;
};

const loadSQLite = async () => {
  if (!SQLite) {
    SQLite = await import('expo-sqlite');
  }
  return SQLite;
};

// Helper function to check if a column exists in a table
const columnExists = async (database: any, table: string, column: string): Promise<boolean> => {
  try {
    const result = await database.getAllAsync(`PRAGMA table_info(${table})`);
    return result.some((row: any) => row.name === column);
  } catch (error) {
    logger.error(`Error checking column ${column} in table ${table}:`, error);
    return false;
  }
};

// Get current schema version
const getSchemaVersion = async (database: any): Promise<number> => {
  try {
    const result = await database.getFirstAsync('SELECT version FROM schema_version LIMIT 1');
    return result ? result.version : 0;
  } catch (error) {
    // schema_version table doesn't exist yet
    return 0;
  }
};

// Set schema version
const setSchemaVersion = async (database: any, version: number): Promise<void> => {
  await database.runAsync(
    'INSERT OR REPLACE INTO schema_version (id, version) VALUES (1, ?)',
    [version]
  );
};

const getMissingColumnFromError = (error: unknown): string | null => {
  const message = String(error ?? '');
  const match = message.match(/no column named\s+([a-zA-Z0-9_]+)/i);
  return match?.[1] ?? null;
};

const ensureEntriesSchemaColumns = async (
  database: any,
  reason: 'migration' | 'createEntryRetry' | 'startup' = 'migration'
): Promise<string[]> => {
  const repaired: string[] = [];
  for (const col of REQUIRED_ENTRY_COLUMNS) {
    const exists = await columnExists(database, 'entries', col.name);
    if (exists) continue;
    await database.execAsync(`ALTER TABLE entries ADD COLUMN ${col.sql};`);
    repaired.push(col.name);
  }

  if (repaired.length > 0) {
    logger.warn(`MIGRATION_REPAIR: repaired entries columns (${reason})`, { repaired });
  } else {
    logger.log(`MIGRATION_REPAIR: entries schema verified (${reason})`);
  }
  return repaired;
};

// Reset database: Drop and recreate all tables with clean schema
const resetDatabase = async (database: any): Promise<void> => {
  logger.log('Resetting database with clean schema...');
  
  // Drop all existing tables
  await database.execAsync('DROP TABLE IF EXISTS entries;');
  await database.execAsync('DROP TABLE IF EXISTS journals;');
  await database.execAsync('DROP TABLE IF EXISTS trip_albums;');
  await database.execAsync('DROP TABLE IF EXISTS schema_version;');
  
  // Create schema_version table
  await database.execAsync(`
    CREATE TABLE schema_version (
      id INTEGER PRIMARY KEY,
      version INTEGER NOT NULL DEFAULT 1
    );
  `);
  
  // Create entries table with clean schema matching Entry interface exactly
  await database.execAsync(`
    CREATE TABLE entries (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT,
      description TEXT,
      media_type TEXT,
      photo_paths TEXT,
      media_paths TEXT,
      storage_urls TEXT,
      valence REAL,
      arousal REAL,
      emotion_labels TEXT,
      emotion_note TEXT,
      timestamp TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      cycle_type TEXT,
      album_id TEXT,
      journal_id TEXT,
      weather TEXT,
      temperature_celsius REAL,
      altitude_meters REAL,
      season TEXT,
      country TEXT,
      city TEXT,
      photo_color_palettes TEXT,
      is_draft INTEGER NOT NULL DEFAULT 0,
      is_awe INTEGER,
      created_at TEXT,
      updated_at TEXT
    );
  `);

  // Create journals table with clean schema matching Journal interface exactly
  await database.execAsync(`
    CREATE TABLE journals (
      id TEXT PRIMARY KEY,
      title TEXT,
      content TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      cycle_type TEXT NOT NULL,
      linked_entry_id TEXT,
      emotion_responses TEXT,
      ai_prompts TEXT,
      latitude REAL,
      longitude REAL,
      album_id TEXT,
      created_at TEXT,
      updated_at TEXT
    );
  `);
  
  // Create trip_albums table with clean schema matching TripAlbum interface exactly
  await database.execAsync(`
    CREATE TABLE trip_albums (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT,
      location_name TEXT,
      location_lat REAL,
      location_lng REAL,
      description TEXT,
      plans TEXT,
      intentions TEXT,
      travel_reasons TEXT,
      travel_reason_text TEXT,
      notes TEXT,
      review_standout_things TEXT,
      review_standout_reasons TEXT,
      review_deeper_thoughts TEXT,
      review_defining_words TEXT,
      review_completed_at TEXT,
      created_at TEXT,
      updated_at TEXT
    );
  `);
  
  // Set schema version to 7 (adds photo_color_palettes on entries)
  await setSchemaVersion(database, 7);
  logger.log('Database reset completed with clean schema');
};

const countAllUserRows = async (database: any): Promise<number> => {
  let total = 0;
  for (const table of ['entries', 'journals', 'trip_albums'] as const) {
    try {
      const row = await database.getFirstAsync(`SELECT COUNT(*) as cnt FROM ${table}`);
      if (row && typeof row === 'object') {
        const r = row as Record<string, unknown>;
        const n = Number(r.cnt ?? r.c ?? r['COUNT(*)']);
        if (Number.isFinite(n)) total += n;
      }
    } catch {
      // table missing
    }
  }
  return total;
};

/**
 * Infer schema version from entries columns when schema_version was never set but user data exists.
 */
const inferSchemaVersion = async (database: any): Promise<number> => {
  try {
    const tableInfo = await database.getAllAsync('PRAGMA table_info(entries)');
    if (!tableInfo || tableInfo.length === 0) return 1;
    const names = new Set((tableInfo as { name: string }[]).map((r) => r.name));
    if (names.has('photo_color_palettes')) return 7;
    if (names.has('city')) return 6;
    if (names.has('country')) return 5;
    if (names.has('emotion_note')) return 4;
    if (names.has('weather')) return 3;
    if (names.has('is_awe')) return 2;
  } catch (error) {
    logger.warn('inferSchemaVersion: PRAGMA entries failed', error);
  }
  return 1;
};

/**
 * Rescues user data from a legacy schema that contains a `user_id` column.
 * Reads all recoverable entry rows into memory, wipes the table, recreates it with the
 * clean v6 entries schema, and re-inserts rescued rows. Journals and trip_albums that already
 * have the correct schema are left untouched.
 */
const rescueLegacySchema = async (database: any): Promise<void> => {
  // Read all salvageable columns that exist in both old and new schema
  let legacyRows: any[] = [];
  try {
    legacyRows = await database.getAllAsync(
      `SELECT id, type, title, description, media_type, photo_paths, media_paths,
              storage_urls, valence, arousal, emotion_labels, emotion_note,
              timestamp, latitude, longitude, cycle_type, album_id, journal_id,
              weather, temperature_celsius, altitude_meters, season,
              is_draft, is_awe, created_at, updated_at
       FROM entries`
    );
  } catch (readError) {
    // If we can't even read the old rows, fall back to a clean reset
    logger.error('rescueLegacySchema: failed to read legacy rows, falling back to reset', readError);
    await resetDatabase(database);
    return;
  }

  logger.log(`rescueLegacySchema: read ${legacyRows.length} legacy entry rows`);

  // Drop only the entries table and recreate it; leave journals/trip_albums intact
  await database.execAsync('DROP TABLE IF EXISTS entries;');
  await database.execAsync(`
    CREATE TABLE entries (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT,
      description TEXT,
      media_type TEXT,
      photo_paths TEXT,
      media_paths TEXT,
      storage_urls TEXT,
      valence REAL,
      arousal REAL,
      emotion_labels TEXT,
      emotion_note TEXT,
      timestamp TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      cycle_type TEXT,
      album_id TEXT,
      journal_id TEXT,
      weather TEXT,
      temperature_celsius REAL,
      altitude_meters REAL,
      season TEXT,
      country TEXT,
      city TEXT,
      photo_color_palettes TEXT,
      is_draft INTEGER NOT NULL DEFAULT 0,
      is_awe INTEGER,
      created_at TEXT,
      updated_at TEXT
    );
  `);

  // Ensure schema_version table exists
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_version (
      id INTEGER PRIMARY KEY,
      version INTEGER NOT NULL DEFAULT 0
    );
  `);

  let rescued = 0;
  let failed = 0;
  for (const row of legacyRows) {
    try {
      await database.runAsync(
        `INSERT OR IGNORE INTO entries (
          id, type, title, description, media_type, photo_paths, media_paths,
          storage_urls, valence, arousal, emotion_labels, emotion_note,
          timestamp, latitude, longitude, cycle_type, album_id, journal_id,
          weather, temperature_celsius, altitude_meters, season, country, city,
          photo_color_palettes, is_draft, is_awe, created_at, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          row.id, row.type, row.title ?? null, row.description,
          row.media_type, row.photo_paths, row.media_paths, row.storage_urls,
          row.valence ?? null, row.arousal ?? null, row.emotion_labels, row.emotion_note ?? null,
          row.timestamp, row.latitude ?? null, row.longitude ?? null,
          row.cycle_type ?? null, row.album_id ?? null, row.journal_id ?? null,
          row.weather ?? null, row.temperature_celsius ?? null,
          row.altitude_meters ?? null, row.season ?? null,
          row.country ?? null,
          row.city ?? null,
          null, // photo_color_palettes — not in legacy schema
          row.is_draft ?? 0, row.is_awe ?? null,
          row.created_at ?? null, row.updated_at ?? null,
        ]
      );
      rescued++;
    } catch (insertError) {
      failed++;
      logger.error('rescueLegacySchema: failed to re-insert row', { id: row.id, insertError });
    }
  }

  await setSchemaVersion(database, 7);
  logger.error(
    `rescueLegacySchema: complete — rescued=${rescued} failed=${failed} total=${legacyRows.length}`
  );
};

// Migration function to handle schema updates
const migrateDatabase = async (database: any): Promise<void> => {
  let missingEntriesTable = false;
  let legacyUserIdSchema = false;

  try {
    const tableInfo = await database.getAllAsync('PRAGMA table_info(entries)');
    if (tableInfo && tableInfo.length > 0) {
      if (tableInfo.some((row: any) => row.name === 'user_id')) {
        logger.log('Detected legacy schema with user_id column - forcing reset');
        legacyUserIdSchema = true;
      }
    } else {
      missingEntriesTable = true;
    }
  } catch (error) {
    logger.log('Entries table check failed - will create with clean schema', error);
    missingEntriesTable = true;
  }

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_version (
      id INTEGER PRIMARY KEY,
      version INTEGER NOT NULL DEFAULT 0
    );
  `);

  let currentVersion = await getSchemaVersion(database);

  if (legacyUserIdSchema) {
    const existingRows = await countAllUserRows(database);
    if (existingRows === 0) {
      // No user data — safe to wipe and start fresh
      await resetDatabase(database);
      return;
    }
    // User has data in the legacy schema. Attempt to rescue entries before wiping.
    logger.error('MIGRATION: legacyUserIdSchema with user data — attempting rescue', { existingRows });
    await rescueLegacySchema(database);
    return;
  }

  if (missingEntriesTable) {
    await resetDatabase(database);
    return;
  }

  // Existing installs may have user data but schema_version row missing (version 0). Never wipe that data.
  if (currentVersion < 1) {
    const rows = await countAllUserRows(database);
    if (rows > 0) {
      currentVersion = await inferSchemaVersion(database);
      await setSchemaVersion(database, currentVersion);
      logger.log(`Adopted existing database at inferred schema version ${currentVersion}`);
    } else {
      await resetDatabase(database);
      return;
    }
  }

  while (currentVersion < TARGET_SCHEMA_VERSION) {
    if (currentVersion === 1) {
      const hasIsAwe = await columnExists(database, 'entries', 'is_awe');
      if (!hasIsAwe) {
        await database.execAsync('ALTER TABLE entries ADD COLUMN is_awe INTEGER;');
        logger.log('Migration 1→2: Added is_awe column to entries');
      }
      await setSchemaVersion(database, 2);
      currentVersion = 2;
      logger.log('Migration 1→2 completed');
      continue;
    }

    if (currentVersion === 2) {
      const newColumns = [
        { name: 'weather', sql: 'weather TEXT' },
        { name: 'temperature_celsius', sql: 'temperature_celsius REAL' },
        { name: 'altitude_meters', sql: 'altitude_meters REAL' },
        { name: 'season', sql: 'season TEXT' },
      ];
      for (const col of newColumns) {
        try {
          const exists = await columnExists(database, 'entries', col.name);
          if (!exists) {
            await database.execAsync(`ALTER TABLE entries ADD COLUMN ${col.sql};`);
            logger.log(`Migration 2→3: Added ${col.name} column to entries`);
          }
        } catch (error) {
          logger.error(`Migration 2→3: Failed to add column ${col.name}`, error);
        }
      }
      await setSchemaVersion(database, 3);
      currentVersion = 3;
      logger.log('Migration 2→3 completed');
      continue;
    }

    if (currentVersion === 3) {
      const hasEmotionNote = await columnExists(database, 'entries', 'emotion_note');
      if (!hasEmotionNote) {
        await database.execAsync('ALTER TABLE entries ADD COLUMN emotion_note TEXT;');
        logger.log('Migration 3→4: Added emotion_note column to entries');
      }
      await setSchemaVersion(database, 4);
      currentVersion = 4;
      logger.log('Migration 3→4 completed');
      continue;
    }

    if (currentVersion === 4) {
      const hasCountry = await columnExists(database, 'entries', 'country');
      if (!hasCountry) {
        await database.execAsync('ALTER TABLE entries ADD COLUMN country TEXT;');
        logger.log('Migration 4→5: Added country column to entries');
      }
      await setSchemaVersion(database, 5);
      currentVersion = 5;
      logger.log('Migration 4→5 completed');
      continue;
    }

    if (currentVersion === 5) {
      const hasCity = await columnExists(database, 'entries', 'city');
      if (!hasCity) {
        await database.execAsync('ALTER TABLE entries ADD COLUMN city TEXT;');
        logger.log('Migration 5→6: Added city column to entries');
      }
      await setSchemaVersion(database, 6);
      currentVersion = 6;
      logger.log('Migration 5→6 completed');
      continue;
    }

    if (currentVersion === 6) {
      const hasPalettes = await columnExists(database, 'entries', 'photo_color_palettes');
      if (!hasPalettes) {
        await database.execAsync('ALTER TABLE entries ADD COLUMN photo_color_palettes TEXT;');
        logger.log('Migration 6→7: Added photo_color_palettes column to entries');
      }
      await setSchemaVersion(database, 7);
      currentVersion = 7;
      logger.log('Migration 6→7 completed');
      continue;
    }

    logger.warn('migrateDatabase: unhandled schema version, stopping', { currentVersion });
    break;
  }

  const repairedColumns = await ensureEntriesSchemaColumns(database, 'migration');
  if (repairedColumns.length > 0 && currentVersion < TARGET_SCHEMA_VERSION) {
    await setSchemaVersion(database, TARGET_SCHEMA_VERSION);
    currentVersion = TARGET_SCHEMA_VERSION;
  }

  if (currentVersion > TARGET_SCHEMA_VERSION) {
    logger.warn('Database schema is newer than this app build; upgrade the app', {
      dbVersion: currentVersion,
      appVersion: TARGET_SCHEMA_VERSION,
    });
  }

  logger.log(`Database schema is up to date (version ${TARGET_SCHEMA_VERSION})`);
};

const initializeDatabase = async (database: any) => {
  // Always run migrations to check for schema issues (even if already initialized)
  // This ensures we catch legacy schemas on app restart
  await migrateDatabase(database);
  
  if (!dbInitialized) {
    dbInitialized = true;
  }
};

const getDatabase = async () => {
  if (!db) {
    try {
      const sqlite = await loadSQLite();
      
      // Close any existing connection and reset state
      resetDatabaseConnection();
      
      // Open fresh database connection
      db = await sqlite.openDatabaseAsync('journeyon.db');
      
      // Initialize database only once
      if (!dbInitPromise) {
        dbInitPromise = initializeDatabase(db);
      }
      await dbInitPromise;
    } catch (error) {
      logger.error('Error initializing database:', error);
      // Reset connection on error to allow retry
      resetDatabaseConnection();
      throw error;
    }
  }
  return db;
};

/** Returns the current schema version stored in the DB. Used by Diagnostics panel. */
export const getDatabaseSchemaVersion = async (): Promise<number> => {
  try {
    const database = await getDatabase();
    return await getSchemaVersion(database);
  } catch {
    return -1;
  }
};

/**
 * Clears all app data (entries, journals, trip albums). Used for "Restart app".
 * Does not close the DB connection; next reads will see empty tables.
 */
export const clearAllData = async (): Promise<void> => {
  const database = await getDatabase();
  await resetDatabase(database);
  deleteAllPersistentMedia();
};

// Helper functions for JSON serialization
const stringify = (value: any): string => {
  return value ? JSON.stringify(value) : '';
};

const parse = (value: string | null): any => {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    if (value.trim().length > 0) {
      logger.warn('PersistenceManager: JSON parse failed for stored value', {
        preview: value.length > 120 ? `${value.slice(0, 120)}…` : value,
      });
    }
    return undefined;
  }
};

// Trip Album Operations
export const createTripAlbum = async (album: TripAlbum): Promise<void> => {
  try {
    const database = await getDatabase();
    const now = new Date().toISOString();
    
    await database.runAsync(
      `INSERT INTO trip_albums (
        id, name, start_date, end_date, location_name, location_lat, location_lng,
        description, plans, intentions, travel_reasons, travel_reason_text, notes,
        review_standout_things, review_standout_reasons, review_deeper_thoughts,
        review_defining_words, review_completed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        album.id,
        album.name,
        album.startDate,
        album.endDate || null,
        album.locationName || null,
        album.locationLat || null,
        album.locationLng || null,
        album.description || null,
        stringify(album.plans),
        stringify(album.intentions),
        stringify(album.travelReasons),
        album.travelReasonText || null,
        album.notes || null,
        stringify(album.reviewStandoutThings),
        stringify(album.reviewStandoutReasons),
        album.reviewDeeperThoughts || null,
        stringify(album.reviewDefiningWords),
        album.reviewCompletedAt || null,
        now,
        now,
      ]
    );
  } catch (error) {
    logger.error('Error creating trip album:', error);
    throw error;
  }
};

/**
 * Assigns existing entries and journals whose timestamp falls within the album's
 * date range to this album (sets albumId). Call after creating a new trip album.
 */
export const assignExistingItemsToAlbum = async (album: TripAlbum): Promise<void> => {
  try {
    const entries = await getEntries();
    const journals = await getJournals();
    const albumId = album.id;

    for (const entry of entries) {
      if (isTimestampInAlbumRange(entry.timestamp, album.startDate, album.endDate)) {
        await updateEntry({ ...entry, albumId });
      }
    }

    for (const journal of journals) {
      if (isTimestampInAlbumRange(journal.timestamp, album.startDate, album.endDate)) {
        await updateJournal({ ...journal, albumId });
      }
    }
  } catch (error) {
    logger.error('Error assigning existing items to album:', error);
    throw error;
  }
};

export const getTripAlbums = async (): Promise<TripAlbum[]> => {
  try {
    const database = await getDatabase();
    const result = await database.getAllAsync('SELECT * FROM trip_albums ORDER BY start_date DESC');
    
    return result.map((row: any) => ({
      id: row.id,
      name: row.name,
      startDate: row.start_date,
      endDate: row.end_date || undefined,
      locationName: row.location_name || undefined,
      locationLat: row.location_lat || undefined,
      locationLng: row.location_lng || undefined,
      description: row.description || undefined,
      plans: parse(row.plans),
      intentions: parse(row.intentions),
      travelReasons: parse(row.travel_reasons),
      travelReasonText: row.travel_reason_text || undefined,
      notes: row.notes || undefined,
      reviewStandoutThings: parse(row.review_standout_things),
      reviewStandoutReasons: parse(row.review_standout_reasons),
      reviewDeeperThoughts: row.review_deeper_thoughts || undefined,
      reviewDefiningWords: parse(row.review_defining_words),
      reviewCompletedAt: row.review_completed_at || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  } catch (error) {
    logger.error('Error getting trip albums:', error);
    return [];
  }
};

export const getTripAlbumById = async (id: string): Promise<TripAlbum | null> => {
  try {
    const database = await getDatabase();
    const result = await database.getFirstAsync('SELECT * FROM trip_albums WHERE id = ?', [id]);
    
    if (!result) return null;
    
    const row: any = result;
    return {
      id: row.id,
      name: row.name,
      startDate: row.start_date,
      endDate: row.end_date || undefined,
      locationName: row.location_name || undefined,
      locationLat: row.location_lat || undefined,
      locationLng: row.location_lng || undefined,
      description: row.description || undefined,
      plans: parse(row.plans),
      intentions: parse(row.intentions),
      travelReasons: parse(row.travel_reasons),
      travelReasonText: row.travel_reason_text || undefined,
      notes: row.notes || undefined,
      reviewStandoutThings: parse(row.review_standout_things),
      reviewStandoutReasons: parse(row.review_standout_reasons),
      reviewDeeperThoughts: row.review_deeper_thoughts || undefined,
      reviewDefiningWords: parse(row.review_defining_words),
      reviewCompletedAt: row.review_completed_at || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  } catch (error) {
    logger.error('Error getting trip album by id:', error);
    return null;
  }
};

export const updateTripAlbum = async (album: TripAlbum): Promise<void> => {
  try {
    const database = await getDatabase();
    const now = new Date().toISOString();
    
    await database.runAsync(
      `UPDATE trip_albums SET
        name = ?, start_date = ?, end_date = ?, location_name = ?, location_lat = ?,
        location_lng = ?, description = ?, plans = ?, intentions = ?, travel_reasons = ?,
        travel_reason_text = ?, notes = ?, review_standout_things = ?,
        review_standout_reasons = ?, review_deeper_thoughts = ?, review_defining_words = ?,
        review_completed_at = ?, updated_at = ?
      WHERE id = ?`,
      [
        album.name,
        album.startDate,
        album.endDate || null,
        album.locationName || null,
        album.locationLat || null,
        album.locationLng || null,
        album.description || null,
        stringify(album.plans),
        stringify(album.intentions),
        stringify(album.travelReasons),
        album.travelReasonText || null,
        album.notes || null,
        stringify(album.reviewStandoutThings),
        stringify(album.reviewStandoutReasons),
        album.reviewDeeperThoughts || null,
        stringify(album.reviewDefiningWords),
        album.reviewCompletedAt || null,
        now,
        album.id,
      ]
    );
  } catch (error) {
    logger.error('Error updating trip album:', error);
    throw error;
  }
};

export const deleteTripAlbum = async (id: string): Promise<void> => {
  try {
    const database = await getDatabase();
    await database.runAsync('DELETE FROM trip_albums WHERE id = ?', [id]);
  } catch (error) {
    logger.error('Error deleting trip album:', error);
    throw error;
  }
};

// Entry Operations
export const createEntry = async (entry: Entry): Promise<void> => {
  const runInsert = async (database: any, now: string) =>
    database.runAsync(
      `INSERT INTO entries (
        id, type, title, description, media_type, photo_paths, media_paths, storage_urls,
        valence, arousal, emotion_labels, emotion_note, timestamp, latitude, longitude, cycle_type,
        album_id, journal_id, weather, temperature_celsius, altitude_meters, season, country, city,
        photo_color_palettes, is_draft, is_awe, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        entry.type,
        entry.title || null,
        entry.description,
        entry.mediaType,
        stringify(entry.photoPaths),
        stringify(entry.mediaPaths),
        stringify(entry.storageUrls),
        entry.valence ?? null,
        entry.arousal ?? null,
        stringify(entry.emotionLabels),
        entry.emotionNote ?? null,
        entry.timestamp,
        entry.latitude || null,
        entry.longitude || null,
        entry.cycleType || null,
        entry.albumId || null,
        entry.journalId || null,
        entry.weather ?? null,
        entry.temperatureCelsius ?? null,
        entry.altitudeMeters ?? null,
        entry.season ?? null,
        entry.country?.trim() || null,
        entry.city?.trim() || null,
        stringify(entry.colorPalettes),
        entry.isDraft ? 1 : 0,
        entry.isAwe ? 1 : 0,
        now,
        now,
      ]
    );

  try {
    const database = await getDatabase();
    const now = new Date().toISOString();
    try {
      await runInsert(database, now);
      return;
    } catch (error) {
      const missingColumn = getMissingColumnFromError(error);
      if (!missingColumn) throw error;
      logger.warn('CREATE_ENTRY_RETRY: missing column detected, repairing schema', {
        entryId: entry.id,
        missingColumn,
      });
      await ensureEntriesSchemaColumns(database, 'createEntryRetry');
      await runInsert(database, now);
      logger.log('CREATE_ENTRY_RETRY: insert succeeded after schema repair', { entryId: entry.id });
    }
  } catch (error) {
    logger.error('Error creating entry:', error);
    throw error;
  }
};

export const getEntries = async (): Promise<Entry[]> => {
  try {
    const database = await getDatabase();
    const result = await database.getAllAsync('SELECT * FROM entries ORDER BY timestamp DESC');
    
    return result.map((row: any) => ({
      id: row.id,
      type: row.type,
      title: row.title || undefined,
      description: row.description,
      mediaType: row.media_type,
      photoPaths: (parse(row.photo_paths) || []).map(resolveMediaPath),
      mediaPaths: (parse(row.media_paths) || []).map(resolveMediaPath),
      storageUrls: parse(row.storage_urls) || [],
      valence: row.valence !== null ? row.valence : undefined,
      arousal: row.arousal !== null ? row.arousal : undefined,
      emotionLabels: parse(row.emotion_labels),
      emotionNote: row.emotion_note ?? undefined,
      timestamp: row.timestamp,
      latitude: row.latitude !== null ? row.latitude : undefined,
      longitude: row.longitude !== null ? row.longitude : undefined,
      cycleType: row.cycle_type || undefined,
      albumId: row.album_id || undefined,
      journalId: row.journal_id || undefined,
      weather: row.weather ?? undefined,
      temperatureCelsius: row.temperature_celsius != null ? row.temperature_celsius : undefined,
      altitudeMeters: row.altitude_meters != null ? row.altitude_meters : undefined,
      season: row.season ?? undefined,
      country: row.country != null && String(row.country).trim() !== '' ? String(row.country).trim() : undefined,
      city: row.city != null && String(row.city).trim() !== '' ? String(row.city).trim() : undefined,
      colorPalettes: parse(row.photo_color_palettes) ?? undefined,
      isDraft: row.is_draft === 1,
      isAwe: row.is_awe === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  } catch (error) {
    logger.error('Error getting entries:', error);
    return [];
  }
};

const rowToEntry = (row: any): Entry => ({
  id: row.id,
  type: row.type,
  title: row.title || undefined,
  description: row.description,
  mediaType: row.media_type,
  photoPaths: (parse(row.photo_paths) || []).map(resolveMediaPath),
  mediaPaths: (parse(row.media_paths) || []).map(resolveMediaPath),
  storageUrls: parse(row.storage_urls) || [],
  valence: row.valence !== null ? row.valence : undefined,
  arousal: row.arousal !== null ? row.arousal : undefined,
  emotionLabels: parse(row.emotion_labels),
  emotionNote: row.emotion_note ?? undefined,
  timestamp: row.timestamp,
  latitude: row.latitude !== null ? row.latitude : undefined,
  longitude: row.longitude !== null ? row.longitude : undefined,
  cycleType: row.cycle_type || undefined,
  albumId: row.album_id || undefined,
  journalId: row.journal_id || undefined,
  weather: row.weather ?? undefined,
  temperatureCelsius: row.temperature_celsius != null ? row.temperature_celsius : undefined,
  altitudeMeters: row.altitude_meters != null ? row.altitude_meters : undefined,
  season: row.season ?? undefined,
  country: row.country != null && String(row.country).trim() !== '' ? String(row.country).trim() : undefined,
  city: row.city != null && String(row.city).trim() !== '' ? String(row.city).trim() : undefined,
  colorPalettes: parse(row.photo_color_palettes) ?? undefined,
  isDraft: row.is_draft === 1,
  isAwe: row.is_awe === 1,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/**
 * Entries that have coordinates but no weather (e.g. saved offline). Used for metadata backfill.
 */
export const getEntriesMissingWeather = async (limit = 50): Promise<Entry[]> => {
  try {
    const database = await getDatabase();
    const result = await database.getAllAsync(
      `SELECT * FROM entries
       WHERE latitude IS NOT NULL AND longitude IS NOT NULL
         AND (weather IS NULL OR weather = '')
         AND is_draft = 0
       ORDER BY timestamp DESC
       LIMIT ?`,
      [limit]
    );
    return (result as any[]).map(rowToEntry);
  } catch (error) {
    logger.error('Error getting entries missing weather:', error);
    return [];
  }
};

/** Entries with coords but no persisted country (backfill). */
export const getEntriesMissingCountry = async (limit = 40): Promise<Entry[]> => {
  try {
    const database = await getDatabase();
    const result = await database.getAllAsync(
      `SELECT * FROM entries
       WHERE latitude IS NOT NULL AND longitude IS NOT NULL
         AND (country IS NULL OR country = '')
         AND is_draft = 0
       ORDER BY timestamp DESC
       LIMIT ?`,
      [limit]
    );
    return (result as any[]).map(rowToEntry);
  } catch (error) {
    logger.error('Error getting entries missing country:', error);
    return [];
  }
};

/** Entries with coords but missing either persisted country or city/locality text. */
export const getEntriesMissingLocationText = async (limit = 40): Promise<Entry[]> => {
  try {
    const database = await getDatabase();
    const result = await database.getAllAsync(
      `SELECT * FROM entries
       WHERE latitude IS NOT NULL AND longitude IS NOT NULL
         AND (
           country IS NULL OR country = '' OR
           city IS NULL OR city = ''
         )
         AND is_draft = 0
       ORDER BY timestamp DESC
       LIMIT ?`,
      [limit]
    );
    return (result as any[]).map(rowToEntry);
  } catch (error) {
    logger.error('Error getting entries missing location text:', error);
    return [];
  }
};

/** Photo entries that have photos but no extracted color palettes yet. Used for color backfill. */
export const getEntriesMissingColorPalettes = async (limit = 20): Promise<Entry[]> => {
  try {
    const database = await getDatabase();
    const result = await database.getAllAsync(
      `SELECT * FROM entries
       WHERE media_type = 'photo'
         AND photo_paths IS NOT NULL AND photo_paths != '' AND photo_paths != '[]'
         AND (photo_color_palettes IS NULL OR photo_color_palettes = '')
         AND is_draft = 0
       ORDER BY timestamp DESC
       LIMIT ?`,
      [limit]
    );
    return (result as any[]).map(rowToEntry);
  } catch (error) {
    logger.error('Error getting entries missing color palettes:', error);
    return [];
  }
};

export const getEntryById = async (id: string): Promise<Entry | null> => {
  try {
    const database = await getDatabase();
    const result = await database.getFirstAsync('SELECT * FROM entries WHERE id = ?', [id]);
    
    if (!result) return null;
    
    const row: any = result;
    return {
      id: row.id,
      type: row.type,
      title: row.title || undefined,
      description: row.description,
      mediaType: row.media_type,
      photoPaths: parse(row.photo_paths) || [],
      mediaPaths: parse(row.media_paths) || [],
      storageUrls: parse(row.storage_urls) || [],
      valence: row.valence !== null ? row.valence : undefined,
      arousal: row.arousal !== null ? row.arousal : undefined,
      emotionLabels: parse(row.emotion_labels),
      emotionNote: row.emotion_note ?? undefined,
      timestamp: row.timestamp,
      latitude: row.latitude !== null ? row.latitude : undefined,
      longitude: row.longitude !== null ? row.longitude : undefined,
      cycleType: row.cycle_type || undefined,
      albumId: row.album_id || undefined,
      journalId: row.journal_id || undefined,
      weather: row.weather ?? undefined,
      temperatureCelsius: row.temperature_celsius != null ? row.temperature_celsius : undefined,
      altitudeMeters: row.altitude_meters != null ? row.altitude_meters : undefined,
      season: row.season ?? undefined,
      country: row.country != null && String(row.country).trim() !== '' ? String(row.country).trim() : undefined,
      city: row.city != null && String(row.city).trim() !== '' ? String(row.city).trim() : undefined,
      colorPalettes: parse(row.photo_color_palettes) ?? undefined,
      isDraft: row.is_draft === 1,
      isAwe: row.is_awe === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  } catch (error) {
    logger.error('Error getting entry by id:', error);
    return null;
  }
};

export const updateEntry = async (entry: Entry): Promise<void> => {
  try {
    const database = await getDatabase();
    const now = new Date().toISOString();
    
    await database.runAsync(
      `UPDATE entries SET
        type = ?, title = ?, description = ?, media_type = ?, photo_paths = ?,
        media_paths = ?, storage_urls = ?, valence = ?, arousal = ?, emotion_labels = ?, emotion_note = ?,
        timestamp = ?, latitude = ?, longitude = ?, cycle_type = ?, album_id = ?,
        journal_id = ?, weather = ?, temperature_celsius = ?, altitude_meters = ?, season = ?, country = ?, city = ?,
        photo_color_palettes = ?, is_draft = ?, is_awe = ?, updated_at = ?
      WHERE id = ?`,
      [
        entry.type,
        entry.title || null,
        entry.description,
        entry.mediaType,
        stringify(entry.photoPaths),
        stringify(entry.mediaPaths),
        stringify(entry.storageUrls),
        entry.valence ?? null,
        entry.arousal ?? null,
        stringify(entry.emotionLabels),
        entry.emotionNote ?? null,
        entry.timestamp,
        entry.latitude || null,
        entry.longitude || null,
        entry.cycleType || null,
        entry.albumId || null,
        entry.journalId || null,
        entry.weather ?? null,
        entry.temperatureCelsius ?? null,
        entry.altitudeMeters ?? null,
        entry.season ?? null,
        entry.country?.trim() || null,
        entry.city?.trim() || null,
        stringify(entry.colorPalettes),
        entry.isDraft ? 1 : 0,
        entry.isAwe ? 1 : 0,
        now,
        entry.id,
      ]
    );
  } catch (error) {
    logger.error('Error updating entry:', error);
    throw error;
  }
};

export const deleteEntry = async (id: string): Promise<void> => {
  try {
    const database = await getDatabase();
    await database.runAsync('DELETE FROM entries WHERE id = ?', [id]);
    deletePersistentMediaForEntry(id);
  } catch (error) {
    logger.error('Error deleting entry:', error);
    throw error;
  }
};

// Journal Operations
export const createJournal = async (journal: Journal): Promise<void> => {
  try {
    const database = await getDatabase();
    const now = new Date().toISOString();
    
    await database.runAsync(
      `INSERT INTO journals (
        id, title, content, timestamp, cycle_type, linked_entry_id,
        emotion_responses, ai_prompts, latitude, longitude, album_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        journal.id,
        journal.title || null,
        journal.content,
        journal.timestamp,
        journal.cycleType,
        journal.linkedEntryId || null,
        stringify(journal.emotionResponses),
        stringify(journal.aiPrompts),
        journal.latitude || null,
        journal.longitude || null,
        journal.albumId || null,
        now,
        now,
      ]
    );
  } catch (error) {
    logger.error('Error creating journal:', error);
    throw error;
  }
};

export const getJournals = async (): Promise<Journal[]> => {
  try {
    const database = await getDatabase();
    const result = await database.getAllAsync('SELECT * FROM journals ORDER BY timestamp DESC');
    
    return result.map((row: any) => ({
      id: row.id,
      title: row.title || undefined,
      content: row.content,
      timestamp: row.timestamp,
      cycleType: row.cycle_type,
      linkedEntryId: row.linked_entry_id || undefined,
      emotionResponses: parse(row.emotion_responses),
      aiPrompts: parse(row.ai_prompts),
      latitude: row.latitude !== null ? row.latitude : undefined,
      longitude: row.longitude !== null ? row.longitude : undefined,
      albumId: row.album_id || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  } catch (error) {
    logger.error('Error getting journals:', error);
    return [];
  }
};

export const getJournalById = async (id: string): Promise<Journal | null> => {
  try {
    const database = await getDatabase();
    const result = await database.getFirstAsync('SELECT * FROM journals WHERE id = ?', [id]);
    
    if (!result) return null;
    
    const row: any = result;
    return {
      id: row.id,
      title: row.title || undefined,
      content: row.content,
      timestamp: row.timestamp,
      cycleType: row.cycle_type,
      linkedEntryId: row.linked_entry_id || undefined,
      emotionResponses: parse(row.emotion_responses),
      aiPrompts: parse(row.ai_prompts),
      latitude: row.latitude !== null ? row.latitude : undefined,
      longitude: row.longitude !== null ? row.longitude : undefined,
      albumId: row.album_id || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  } catch (error) {
    logger.error('Error getting journal by id:', error);
    return null;
  }
};

export const updateJournal = async (journal: Journal): Promise<void> => {
  try {
    const database = await getDatabase();
    const now = new Date().toISOString();
    
    await database.runAsync(
      `UPDATE journals SET
        title = ?, content = ?, timestamp = ?, cycle_type = ?, linked_entry_id = ?,
        emotion_responses = ?, ai_prompts = ?, latitude = ?, longitude = ?,
        album_id = ?, updated_at = ?
      WHERE id = ?`,
      [
        journal.title || null,
        journal.content,
        journal.timestamp,
        journal.cycleType,
        journal.linkedEntryId || null,
        stringify(journal.emotionResponses),
        stringify(journal.aiPrompts),
        journal.latitude || null,
        journal.longitude || null,
        journal.albumId || null,
        now,
        journal.id,
      ]
    );
  } catch (error) {
    logger.error('Error updating journal:', error);
    throw error;
  }
};

export const deleteJournal = async (id: string): Promise<void> => {
  try {
    const database = await getDatabase();
    await database.runAsync('DELETE FROM journals WHERE id = ?', [id]);
  } catch (error) {
    logger.error('Error deleting journal:', error);
    throw error;
  }
};

// Utility function to get active trip album
export const getActiveTripAlbum = async (): Promise<TripAlbum | null> => {
  try {
    const albums = await getTripAlbums();
    const now = new Date().toISOString();

    return albums.find(album =>
      isTimestampInAlbumRange(now, album.startDate, album.endDate)
    ) || null;
  } catch (error) {
    logger.error('Error getting active trip album:', error);
    return null;
  }
};

// Returns ALL trip albums whose date range contains today (vs. getActiveTripAlbum which returns first match)
export const getActiveTripAlbums = async (): Promise<TripAlbum[]> => {
  try {
    const albums = await getTripAlbums();
    const now = new Date().toISOString();

    return albums.filter(album =>
      isTimestampInAlbumRange(now, album.startDate, album.endDate)
    );
  } catch (error) {
    logger.error('Error getting active trip albums:', error);
    return [];
  }
};

// ---------------------------------------------------------------------------
// Travel Mode — AsyncStorage helpers
// ---------------------------------------------------------------------------

export const TRAVEL_MODE_KEYS = {
  ENABLED: '@awefull_people:travel_mode_enabled',
  EXPLICITLY_DISABLED: '@awefull_people:travel_mode_explicitly_disabled',
  HAD_ACTIVE_ALBUMS: '@awefull_people:travel_mode_had_active_albums',
  LAST_CHECK_DATE: '@awefull_people:last_travel_mode_check_date',
  TRAVEL_CARD_DAY_TAPPED: '@awefull_people:travel_card_day_tapped',
};

export interface TravelModeState {
  enabled: boolean;
  explicitlyDisabled: boolean;
  hadActiveAlbums: boolean;
  lastCheckDate: string | null;
}

export const loadTravelModeState = async (): Promise<TravelModeState> => {
  try {
    const [enabled, explicitlyDisabled, hadActiveAlbums, lastCheckDate] = await Promise.all([
      AsyncStorage.getItem(TRAVEL_MODE_KEYS.ENABLED),
      AsyncStorage.getItem(TRAVEL_MODE_KEYS.EXPLICITLY_DISABLED),
      AsyncStorage.getItem(TRAVEL_MODE_KEYS.HAD_ACTIVE_ALBUMS),
      AsyncStorage.getItem(TRAVEL_MODE_KEYS.LAST_CHECK_DATE),
    ]);
    return {
      enabled: enabled === 'true',
      explicitlyDisabled: explicitlyDisabled === 'true',
      hadActiveAlbums: hadActiveAlbums === 'true',
      lastCheckDate,
    };
  } catch (error) {
    logger.error('Error loading travel mode state:', error);
    return { enabled: false, explicitlyDisabled: false, hadActiveAlbums: false, lastCheckDate: null };
  }
};

export const saveTravelModeState = async (state: Partial<TravelModeState>): Promise<void> => {
  try {
    const pairs: [string, string][] = [];
    if (state.enabled !== undefined) pairs.push([TRAVEL_MODE_KEYS.ENABLED, String(state.enabled)]);
    if (state.explicitlyDisabled !== undefined) pairs.push([TRAVEL_MODE_KEYS.EXPLICITLY_DISABLED, String(state.explicitlyDisabled)]);
    if (state.hadActiveAlbums !== undefined) pairs.push([TRAVEL_MODE_KEYS.HAD_ACTIVE_ALBUMS, String(state.hadActiveAlbums)]);
    if (state.lastCheckDate !== undefined) pairs.push([TRAVEL_MODE_KEYS.LAST_CHECK_DATE, state.lastCheckDate ?? '']);
    if (pairs.length > 0) await AsyncStorage.multiSet(pairs);
  } catch (error) {
    logger.error('Error saving travel mode state:', error);
  }
};
