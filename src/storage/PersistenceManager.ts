// PersistenceManager
// SQLite database operations with lazy-loading to prevent early native module initialization

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Entry } from '../models/Entry';
import { Journal } from '../models/Journal';
import { TripAlbum } from '../models/TripAlbum';
import { Postcard, PostcardPhotoTransform } from '../models/Postcard';
import { isTimestampInAlbumRange } from '../utils/albumUtils';
import { logger } from '../utils/logger';
import { deleteAllPersistentMedia, deletePersistentMediaForEntry, resolveMediaPath, toRelativePathArray } from './mediaStorage';

/** Bump when adding migrations; must match highest version set by migrations / resetDatabase. */
const TARGET_SCHEMA_VERSION = 17;
const REQUIRED_ENTRY_COLUMNS: Array<{ name: string; sql: string }> = [
  { name: 'is_bookmarked', sql: 'is_bookmarked INTEGER' },
  { name: 'weather', sql: 'weather TEXT' },
  { name: 'temperature_celsius', sql: 'temperature_celsius REAL' },
  { name: 'altitude_meters', sql: 'altitude_meters REAL' },
  { name: 'season', sql: 'season TEXT' },
  { name: 'emotion_note', sql: 'emotion_note TEXT' },
  { name: 'country', sql: 'country TEXT' },
  { name: 'city', sql: 'city TEXT' },
  { name: 'photo_color_palettes', sql: 'photo_color_palettes TEXT' },
  { name: 'thumb_paths', sql: 'thumb_paths TEXT' },
  { name: 'photo_widths', sql: 'photo_widths TEXT' },
  { name: 'photo_heights', sql: 'photo_heights TEXT' },
];

// Lazy-load SQLite only when needed
let SQLite: any = null;
let db: any = null;
let dbInitialized = false;
let dbInitPromise: Promise<void> | null = null;
/** In-flight open + migrate; prevents parallel `openDatabaseAsync` from `Promise.all` data loads. */
let dbOpeningPromise: Promise<void> | null = null;

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
  await database.execAsync('DROP TABLE IF EXISTS postcards;');
  await database.execAsync('DROP TABLE IF EXISTS user_profile;');
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
      emotion_labels TEXT,
      emotion_note TEXT,
      timestamp TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      album_id TEXT,
      journal_id TEXT,
      weather TEXT,
      temperature_celsius REAL,
      altitude_meters REAL,
      season TEXT,
      country TEXT,
      city TEXT,
      photo_color_palettes TEXT,
      thumb_paths TEXT,
      photo_widths TEXT,
      photo_heights TEXT,
      is_draft INTEGER NOT NULL DEFAULT 0,
      is_bookmarked INTEGER,
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
      linked_entry_id TEXT,
      emotion_responses TEXT,
      ai_prompts TEXT,
      latitude REAL,
      longitude REAL,
      country TEXT,
      city TEXT,
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
  
  // Create postcards table
  await database.execAsync(`
    CREATE TABLE postcards (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      template_id TEXT NOT NULL,
      aspect_ratio TEXT NOT NULL DEFAULT '4:5',
      top_photo_path TEXT,
      bottom_photo_path TEXT,
      top_label TEXT NOT NULL DEFAULT '',
      bottom_label TEXT NOT NULL DEFAULT '',
      downloaded INTEGER NOT NULL DEFAULT 0,
      top_photo_transform TEXT,
      bottom_photo_transform TEXT,
      photo3_path TEXT,
      photo3_transform TEXT,
      photo4_path TEXT,
      photo4_transform TEXT,
      template_data TEXT
    );
  `);

  // Create user_profile table
  await database.execAsync(`
    CREATE TABLE user_profile (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      traveler_tier TEXT,
      intent TEXT,
      email TEXT,
      phone TEXT,
      onboarding_completed_at TEXT,
      onboarding_path_taken TEXT,
      tried_travel_mode INTEGER NOT NULL DEFAULT 0,
      tried_journal_entry INTEGER NOT NULL DEFAULT 0,
      tried_gallery_sync INTEGER NOT NULL DEFAULT 0,
      tried_trip_album INTEGER NOT NULL DEFAULT 0,
      tried_journey_recap INTEGER NOT NULL DEFAULT 0,
      tried_postcards INTEGER NOT NULL DEFAULT 0,
      created_at TEXT,
      updated_at TEXT
    );
  `);

  await setSchemaVersion(database, 17);
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
              storage_urls, emotion_labels, emotion_note,
              timestamp, latitude, longitude, album_id, journal_id,
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
      emotion_labels TEXT,
      emotion_note TEXT,
      timestamp TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
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
      is_bookmarked INTEGER,
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
          storage_urls, emotion_labels, emotion_note,
          timestamp, latitude, longitude, album_id, journal_id,
          weather, temperature_celsius, altitude_meters, season, country, city,
          photo_color_palettes, is_draft, is_bookmarked, created_at, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          row.id, row.type, row.title ?? null, row.description,
          row.media_type, row.photo_paths, row.media_paths, row.storage_urls,
          row.emotion_labels, row.emotion_note ?? null,
          row.timestamp, row.latitude ?? null, row.longitude ?? null,
          row.album_id ?? null, row.journal_id ?? null,
          row.weather ?? null, row.temperature_celsius ?? null,
          row.altitude_meters ?? null, row.season ?? null,
          row.country ?? null,
          row.city ?? null,
          null, // photo_color_palettes — not in legacy schema
          row.is_draft ?? 0, row.is_awe ?? null, // is_awe read from legacy, stored as is_bookmarked
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

    if (currentVersion === 7) {
      const hasJournalCountry = await columnExists(database, 'journals', 'country');
      if (!hasJournalCountry) {
        await database.execAsync('ALTER TABLE journals ADD COLUMN country TEXT;');
        logger.log('Migration 7→8: Added country column to journals');
      }
      const hasJournalCity = await columnExists(database, 'journals', 'city');
      if (!hasJournalCity) {
        await database.execAsync('ALTER TABLE journals ADD COLUMN city TEXT;');
        logger.log('Migration 7→8: Added city column to journals');
      }
      await setSchemaVersion(database, 8);
      currentVersion = 8;
      logger.log('Migration 7→8 completed');
      continue;
    }

    if (currentVersion === 8) {
      await database.execAsync(`
        CREATE TABLE IF NOT EXISTS postcards (
          id TEXT PRIMARY KEY,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          template_id TEXT NOT NULL,
          aspect_ratio TEXT NOT NULL DEFAULT '4:5',
          top_photo_path TEXT,
          bottom_photo_path TEXT,
          top_label TEXT NOT NULL DEFAULT '',
          bottom_label TEXT NOT NULL DEFAULT '',
          downloaded INTEGER NOT NULL DEFAULT 0,
          top_photo_transform TEXT,
          bottom_photo_transform TEXT
        );
      `);
      await setSchemaVersion(database, 9);
      currentVersion = 9;
      logger.log('Migration 8→9 completed');
      continue;
    }

    if (currentVersion === 9) {
      const hasTopTransform = await columnExists(database, 'postcards', 'top_photo_transform');
      if (!hasTopTransform) {
        await database.execAsync('ALTER TABLE postcards ADD COLUMN top_photo_transform TEXT;');
        logger.log('Migration 9→10: Added top_photo_transform to postcards');
      }
      const hasBottomTransform = await columnExists(database, 'postcards', 'bottom_photo_transform');
      if (!hasBottomTransform) {
        await database.execAsync('ALTER TABLE postcards ADD COLUMN bottom_photo_transform TEXT;');
        logger.log('Migration 9→10: Added bottom_photo_transform to postcards');
      }
      await setSchemaVersion(database, 10);
      currentVersion = 10;
      logger.log('Migration 9→10 completed');
      continue;
    }

    if (currentVersion === 10) {
      await database.execAsync(`
        CREATE TABLE IF NOT EXISTS entries_new (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          title TEXT,
          description TEXT,
          media_type TEXT,
          photo_paths TEXT,
          media_paths TEXT,
          storage_urls TEXT,
          emotion_labels TEXT,
          emotion_note TEXT,
          timestamp TEXT NOT NULL,
          latitude REAL,
          longitude REAL,
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
      await database.execAsync(`
        INSERT INTO entries_new (
          id, type, title, description, media_type, photo_paths, media_paths, storage_urls,
          emotion_labels, emotion_note, timestamp, latitude, longitude, album_id,
          journal_id, weather, temperature_celsius, altitude_meters, season, country, city,
          photo_color_palettes, is_draft, is_awe, created_at, updated_at
        )
        SELECT
          id, type, title, description, media_type, photo_paths, media_paths, storage_urls,
          emotion_labels, emotion_note, timestamp, latitude, longitude, album_id,
          journal_id, weather, temperature_celsius, altitude_meters, season, country, city,
          photo_color_palettes, is_draft, is_awe, created_at, updated_at
        FROM entries;
      `);
      await database.execAsync('DROP TABLE entries;');
      await database.execAsync('ALTER TABLE entries_new RENAME TO entries;');
      await setSchemaVersion(database, 11);
      currentVersion = 11;
      logger.log('Migration 10→11 completed (removed valence/arousal)');
      continue;
    }

    if (currentVersion === 11) {
      await database.execAsync(`
        CREATE TABLE IF NOT EXISTS entries_new (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          title TEXT,
          description TEXT,
          media_type TEXT,
          photo_paths TEXT,
          media_paths TEXT,
          storage_urls TEXT,
          emotion_labels TEXT,
          emotion_note TEXT,
          timestamp TEXT NOT NULL,
          latitude REAL,
          longitude REAL,
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
      await database.execAsync(`
        INSERT INTO entries_new (
          id, type, title, description, media_type, photo_paths, media_paths, storage_urls,
          emotion_labels, emotion_note, timestamp, latitude, longitude, album_id,
          journal_id, weather, temperature_celsius, altitude_meters, season, country, city,
          photo_color_palettes, is_draft, is_awe, created_at, updated_at
        )
        SELECT
          id, type, title, description, media_type, photo_paths, media_paths, storage_urls,
          emotion_labels, emotion_note, timestamp, latitude, longitude, album_id,
          journal_id, weather, temperature_celsius, altitude_meters, season, country, city,
          photo_color_palettes, is_draft, is_awe, created_at, updated_at
        FROM entries;
      `);
      await database.execAsync('DROP TABLE entries;');
      await database.execAsync('ALTER TABLE entries_new RENAME TO entries;');

      await database.execAsync(`
        CREATE TABLE IF NOT EXISTS journals_new (
          id TEXT PRIMARY KEY,
          title TEXT,
          content TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          linked_entry_id TEXT,
          emotion_responses TEXT,
          ai_prompts TEXT,
          latitude REAL,
          longitude REAL,
          country TEXT,
          city TEXT,
          album_id TEXT,
          created_at TEXT,
          updated_at TEXT
        );
      `);
      await database.execAsync(`
        INSERT INTO journals_new (
          id, title, content, timestamp, linked_entry_id,
          emotion_responses, ai_prompts, latitude, longitude, country, city, album_id, created_at, updated_at
        )
        SELECT
          id, title, content, timestamp, linked_entry_id,
          emotion_responses, ai_prompts, latitude, longitude, country, city, album_id, created_at, updated_at
        FROM journals;
      `);
      await database.execAsync('DROP TABLE journals;');
      await database.execAsync('ALTER TABLE journals_new RENAME TO journals;');

      await setSchemaVersion(database, 12);
      currentVersion = 12;
      logger.log('Migration 11→12 completed (removed cycle_type)');
      continue;
    }

    if (currentVersion === 12) {
      await database.execAsync(`
        CREATE TABLE IF NOT EXISTS user_profile (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          traveler_tier TEXT,
          intent TEXT,
          email TEXT,
          phone TEXT,
          onboarding_completed_at TEXT,
          onboarding_path_taken TEXT,
          tried_travel_mode INTEGER NOT NULL DEFAULT 0,
          tried_journal_entry INTEGER NOT NULL DEFAULT 0,
          tried_gallery_sync INTEGER NOT NULL DEFAULT 0,
          tried_trip_album INTEGER NOT NULL DEFAULT 0,
          tried_journey_recap INTEGER NOT NULL DEFAULT 0,
          tried_postcards INTEGER NOT NULL DEFAULT 0,
          created_at TEXT,
          updated_at TEXT
        );
      `);
      await setSchemaVersion(database, 13);
      currentVersion = 13;
      logger.log('Migration 12→13 completed (added user_profile table)');
      continue;
    }

    if (currentVersion === 13) {
      const hasThumbPaths = await columnExists(database, 'entries', 'thumb_paths');
      if (!hasThumbPaths) {
        await database.execAsync('ALTER TABLE entries ADD COLUMN thumb_paths TEXT;');
        logger.log('Migration 13→14: Added thumb_paths column to entries');
      }
      await setSchemaVersion(database, 14);
      currentVersion = 14;
      logger.log('Migration 13→14 completed');
      continue;
    }

    if (currentVersion === 14) {
      const newPostcardColumns: Array<{ name: string; sql: string }> = [
        { name: 'photo3_path', sql: 'photo3_path TEXT' },
        { name: 'photo3_transform', sql: 'photo3_transform TEXT' },
        { name: 'photo4_path', sql: 'photo4_path TEXT' },
        { name: 'photo4_transform', sql: 'photo4_transform TEXT' },
        { name: 'template_data', sql: 'template_data TEXT' },
      ];
      for (const col of newPostcardColumns) {
        const exists = await columnExists(database, 'postcards', col.name);
        if (!exists) {
          await database.execAsync(`ALTER TABLE postcards ADD COLUMN ${col.sql};`);
          logger.log(`Migration 14→15: Added ${col.name} to postcards`);
        }
      }
      await setSchemaVersion(database, 15);
      currentVersion = 15;
      logger.log('Migration 14→15 completed');
      continue;
    }

    if (currentVersion === 15) {
      const hasIsAwe = await columnExists(database, 'entries', 'is_awe');
      if (hasIsAwe) {
        await database.execAsync('ALTER TABLE entries RENAME COLUMN is_awe TO is_bookmarked;');
        logger.log('Migration 15→16: Renamed is_awe to is_bookmarked in entries');
      }
      await setSchemaVersion(database, 16);
      currentVersion = 16;
      logger.log('Migration 15→16 completed');
      continue;
    }

    if (currentVersion === 16) {
      const photoDimColumns: Array<{ name: string; sql: string }> = [
        { name: 'photo_widths', sql: 'photo_widths TEXT' },
        { name: 'photo_heights', sql: 'photo_heights TEXT' },
      ];
      for (const col of photoDimColumns) {
        const exists = await columnExists(database, 'entries', col.name);
        if (!exists) {
          await database.execAsync(`ALTER TABLE entries ADD COLUMN ${col.sql};`);
          logger.log(`Migration 16→17: Added ${col.name} column to entries`);
        }
      }
      await setSchemaVersion(database, 17);
      currentVersion = 17;
      logger.log('Migration 16→17 completed');
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
  await database.execAsync('PRAGMA journal_mode=WAL;');
  await database.execAsync('PRAGMA synchronous=NORMAL;');
  await migrateDatabase(database);
  try {
    await database.execAsync('CREATE INDEX IF NOT EXISTS idx_entries_timestamp ON entries(timestamp);');
    await database.execAsync('CREATE INDEX IF NOT EXISTS idx_entries_album_id ON entries(album_id);');
    await database.execAsync('CREATE INDEX IF NOT EXISTS idx_entries_is_draft ON entries(is_draft);');
    // Composite index for all backfill queries that filter media_type + is_draft before ordering by timestamp.
    await database.execAsync('CREATE INDEX IF NOT EXISTS idx_entries_media_draft_ts ON entries(media_type, is_draft, timestamp);');
  } catch (e) {
    logger.warn('initializeDatabase: failed to create performance indices', e);
  }
  if (!dbInitialized) {
    dbInitialized = true;
  }
};

const getDatabase = async () => {
  if (db) {
    return db;
  }

  if (!dbOpeningPromise) {
    dbOpeningPromise = (async () => {
      // Local handle only — do not assign module `db` until migrations finish, otherwise
      // concurrent `getDatabase()` can return the connection while migrateDatabase is still running.
      let opened: any = null;
      try {
        const sqlite = await loadSQLite();
        // Close any existing connection and reset in-memory init flags (db is usually null here).
        resetDatabaseConnection();

        opened = await sqlite.openDatabaseAsync('journeyon.db');
        dbInitPromise = initializeDatabase(opened);
        await dbInitPromise;
        db = opened;
        opened = null;
      } catch (error) {
        logger.error('Error initializing database:', error);
        if (opened) {
          try {
            await opened.closeAsync?.();
          } catch {
            /* ignore close errors on failed init */
          }
          opened = null;
        }
        resetDatabaseConnection();
        throw error;
      } finally {
        dbOpeningPromise = null;
      }
    })();
  }

  await dbOpeningPromise;
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

export const upsertOnboardingCompletion = async (path: 'unpack' | 'trip_album' | 'explore'): Promise<void> => {
  const database = await getDatabase();
  const now = new Date().toISOString();
  await database.runAsync(
    `INSERT INTO user_profile (id, name, onboarding_completed_at, onboarding_path_taken, created_at, updated_at)
     VALUES ('local_user', '', ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       onboarding_completed_at = excluded.onboarding_completed_at,
       onboarding_path_taken = excluded.onboarding_path_taken,
       updated_at = excluded.updated_at`,
    [now, path, now, now],
  );
};

/**
 * Clears all app data (entries, journals, trip albums, user_profile). Used for "Restart app".
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

const parsePhotoDimensionArray = (value: string | null | undefined): number[] | undefined => {
  const parsed = parse(value ?? null);
  if (!Array.isArray(parsed) || parsed.length === 0) return undefined;
  const nums = parsed.map((v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0));
  return nums.some((n) => n > 0) ? nums : undefined;
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
    const database = await getDatabase();
    const albumId = album.id;
    const now = new Date().toISOString();

    // Replicate isTimestampInAlbumRange local-day boundaries expressed as UTC ISO strings
    // so they compare correctly against stored entry timestamps (which are also UTC ISO).
    const sd = new Date(album.startDate);
    const startBound = new Date(sd.getFullYear(), sd.getMonth(), sd.getDate(), 0, 0, 0, 0).toISOString();

    let endBound: string;
    if (album.endDate && album.endDate.trim() !== '') {
      const ed = new Date(album.endDate);
      endBound = new Date(ed.getFullYear(), ed.getMonth(), ed.getDate(), 23, 59, 59, 999).toISOString();
    } else {
      endBound = '9999-12-31T23:59:59.999Z';
    }

    await database.runAsync(
      `UPDATE entries SET album_id = ?, updated_at = ? WHERE album_id IS NULL AND timestamp >= ? AND timestamp <= ?`,
      [albumId, now, startBound, endBound]
    );
    await database.runAsync(
      `UPDATE journals SET album_id = ?, updated_at = ? WHERE album_id IS NULL AND timestamp >= ? AND timestamp <= ?`,
      [albumId, now, startBound, endBound]
    );
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
        id, type, title, description, media_type, photo_paths, media_paths,
        emotion_labels, emotion_note, timestamp, latitude, longitude,
        album_id, journal_id, weather, temperature_celsius, altitude_meters, season, country, city,
        photo_color_palettes, thumb_paths, photo_widths, photo_heights, is_draft, is_bookmarked, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        entry.type,
        entry.title || null,
        entry.description,
        entry.mediaType,
        stringify(toRelativePathArray(entry.photoPaths)),
        stringify(toRelativePathArray(entry.mediaPaths)),
        stringify(entry.emotionLabels),
        entry.emotionNote ?? null,
        entry.timestamp,
        entry.latitude || null,
        entry.longitude || null,
        entry.albumId || null,
        entry.journalId || null,
        entry.weather ?? null,
        entry.temperatureCelsius ?? null,
        entry.altitudeMeters ?? null,
        entry.season ?? null,
        entry.country?.trim() || null,
        entry.city?.trim() || null,
        stringify(entry.colorPalettes),
        stringify(toRelativePathArray(entry.thumbPaths ?? [])),
        stringify(entry.photoWidths),
        stringify(entry.photoHeights),
        entry.isDraft ? 1 : 0,
        entry.isBookmarked ? 1 : 0,
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
      emotionLabels: parse(row.emotion_labels),
      emotionNote: row.emotion_note ?? undefined,
      timestamp: row.timestamp,
      latitude: row.latitude !== null ? row.latitude : undefined,
      longitude: row.longitude !== null ? row.longitude : undefined,
      albumId: row.album_id || undefined,
      journalId: row.journal_id || undefined,
      weather: row.weather ?? undefined,
      temperatureCelsius: row.temperature_celsius != null ? row.temperature_celsius : undefined,
      altitudeMeters: row.altitude_meters != null ? row.altitude_meters : undefined,
      season: row.season ?? undefined,
      country: row.country != null && String(row.country).trim() !== '' ? String(row.country).trim() : undefined,
      city: row.city != null && String(row.city).trim() !== '' ? String(row.city).trim() : undefined,
      colorPalettes: parse(row.photo_color_palettes) ?? undefined,
      thumbPaths: (parse(row.thumb_paths) || []).map(resolveMediaPath).filter(Boolean),
      photoWidths: parsePhotoDimensionArray(row.photo_widths),
      photoHeights: parsePhotoDimensionArray(row.photo_heights),
      isDraft: row.is_draft === 1,
      isBookmarked: row.is_bookmarked === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  } catch (error) {
    logger.error('Error getting entries:', error);
    return [];
  }
};

/** Returns a page of entries by recency. Used for tiered initial load. */
export const getEntriesPaged = async (limit: number, offset: number = 0): Promise<Entry[]> => {
  try {
    const database = await getDatabase();
    const result = await database.getAllAsync(
      'SELECT * FROM entries ORDER BY timestamp DESC LIMIT ? OFFSET ?',
      [limit, offset]
    );
    return (result as any[]).map(rowToEntry);
  } catch (error) {
    logger.error('Error getting paged entries:', error);
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
  emotionLabels: parse(row.emotion_labels),
  emotionNote: row.emotion_note ?? undefined,
  timestamp: row.timestamp,
  latitude: row.latitude !== null ? row.latitude : undefined,
  longitude: row.longitude !== null ? row.longitude : undefined,
  albumId: row.album_id || undefined,
  journalId: row.journal_id || undefined,
  weather: row.weather ?? undefined,
  temperatureCelsius: row.temperature_celsius != null ? row.temperature_celsius : undefined,
  altitudeMeters: row.altitude_meters != null ? row.altitude_meters : undefined,
  season: row.season ?? undefined,
  country: row.country != null && String(row.country).trim() !== '' ? String(row.country).trim() : undefined,
  city: row.city != null && String(row.city).trim() !== '' ? String(row.city).trim() : undefined,
  colorPalettes: parse(row.photo_color_palettes) ?? undefined,
  thumbPaths: (parse(row.thumb_paths) || []).map(resolveMediaPath).filter(Boolean),
  photoWidths: parsePhotoDimensionArray(row.photo_widths),
  photoHeights: parsePhotoDimensionArray(row.photo_heights),
  isDraft: row.is_draft === 1,
  isBookmarked: row.is_bookmarked === 1,
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
      photoPaths: (parse(row.photo_paths) || []).map(resolveMediaPath),
      mediaPaths: (parse(row.media_paths) || []).map(resolveMediaPath),
      emotionLabels: parse(row.emotion_labels),
      emotionNote: row.emotion_note ?? undefined,
      timestamp: row.timestamp,
      latitude: row.latitude !== null ? row.latitude : undefined,
      longitude: row.longitude !== null ? row.longitude : undefined,
      albumId: row.album_id || undefined,
      journalId: row.journal_id || undefined,
      weather: row.weather ?? undefined,
      temperatureCelsius: row.temperature_celsius != null ? row.temperature_celsius : undefined,
      altitudeMeters: row.altitude_meters != null ? row.altitude_meters : undefined,
      season: row.season ?? undefined,
      country: row.country != null && String(row.country).trim() !== '' ? String(row.country).trim() : undefined,
      city: row.city != null && String(row.city).trim() !== '' ? String(row.city).trim() : undefined,
      colorPalettes: parse(row.photo_color_palettes) ?? undefined,
      thumbPaths: (parse(row.thumb_paths) || []).map(resolveMediaPath).filter(Boolean),
      photoWidths: parsePhotoDimensionArray(row.photo_widths),
      photoHeights: parsePhotoDimensionArray(row.photo_heights),
      isDraft: row.is_draft === 1,
      isBookmarked: row.is_bookmarked === 1,
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
        media_paths = ?, emotion_labels = ?, emotion_note = ?,
        timestamp = ?, latitude = ?, longitude = ?, album_id = ?,
        journal_id = ?, weather = ?, temperature_celsius = ?, altitude_meters = ?, season = ?, country = ?, city = ?,
        photo_color_palettes = ?, thumb_paths = ?, photo_widths = ?, photo_heights = ?, is_draft = ?, is_bookmarked = ?, updated_at = ?
      WHERE id = ?`,
      [
        entry.type,
        entry.title || null,
        entry.description,
        entry.mediaType,
        stringify(toRelativePathArray(entry.photoPaths)),
        stringify(toRelativePathArray(entry.mediaPaths)),
        stringify(entry.emotionLabels),
        entry.emotionNote ?? null,
        entry.timestamp,
        entry.latitude || null,
        entry.longitude || null,
        entry.albumId || null,
        entry.journalId || null,
        entry.weather ?? null,
        entry.temperatureCelsius ?? null,
        entry.altitudeMeters ?? null,
        entry.season ?? null,
        entry.country?.trim() || null,
        entry.city?.trim() || null,
        stringify(entry.colorPalettes),
        stringify(toRelativePathArray(entry.thumbPaths ?? [])),
        stringify(entry.photoWidths),
        stringify(entry.photoHeights),
        entry.isDraft ? 1 : 0,
        entry.isBookmarked ? 1 : 0,
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

/** Updates only weather data for one entry. Never reads or writes photo paths. */
export const updateEntryWeather = async (
  id: string,
  weather: string,
  temperatureCelsius: number | null
): Promise<void> => {
  try {
    const database = await getDatabase();
    await database.runAsync(
      'UPDATE entries SET weather = ?, temperature_celsius = ?, updated_at = ? WHERE id = ?',
      [weather, temperatureCelsius ?? null, new Date().toISOString(), id]
    );
  } catch (error) {
    logger.error('Error updating entry weather:', error);
    throw error;
  }
};

/** Updates only country/city for one entry. Never reads or writes photo paths. */
export const updateEntryLocationText = async (
  id: string,
  country: string | null,
  city: string | null
): Promise<void> => {
  try {
    const database = await getDatabase();
    await database.runAsync(
      'UPDATE entries SET country = ?, city = ?, updated_at = ? WHERE id = ?',
      [country?.trim() ?? null, city?.trim() ?? null, new Date().toISOString(), id]
    );
  } catch (error) {
    logger.error('Error updating entry location text:', error);
    throw error;
  }
};

/** Updates only color palettes for one entry. Never reads or writes photo paths. */
export const updateEntryColorPalettes = async (
  id: string,
  colorPalettes: string[][]
): Promise<void> => {
  try {
    const database = await getDatabase();
    await database.runAsync(
      'UPDATE entries SET photo_color_palettes = ?, updated_at = ? WHERE id = ?',
      [stringify(colorPalettes), new Date().toISOString(), id]
    );
  } catch (error) {
    logger.error('Error updating entry color palettes:', error);
    throw error;
  }
};

/** Photo entries that have no thumbnail paths yet. Used by the thumbnail backfill service. */
export const getEntriesMissingThumbs = async (limit = 10): Promise<Entry[]> => {
  try {
    const database = await getDatabase();
    const result = await database.getAllAsync(
      `SELECT * FROM entries
       WHERE (
         thumb_paths IS NULL OR thumb_paths = '' OR thumb_paths = '[]'
         OR (thumb_paths NOT LIKE '%_thumb2.jpg%')
       )
       AND photo_paths IS NOT NULL AND photo_paths != '' AND photo_paths != '[]'
       AND media_type = 'photo' AND is_draft = 0
       ORDER BY timestamp DESC
       LIMIT ?`,
      [limit]
    );
    return (result as any[]).map(rowToEntry);
  } catch (error) {
    logger.error('Error getting entries missing thumbs:', error);
    return [];
  }
};

export const getEntriesByIds = async (ids: string[]): Promise<Entry[]> => {
  if (ids.length === 0) return [];
  try {
    const database = await getDatabase();
    const placeholders = ids.map(() => '?').join(',');
    const result = await database.getAllAsync(
      `SELECT * FROM entries WHERE id IN (${placeholders})`,
      ids
    );
    return (result as any[]).map(rowToEntry);
  } catch (error) {
    logger.error('Error getting entries by ids:', error);
    return [];
  }
};

/** Updates only thumb_paths for one entry. Used by thumbnail backfill and capture flow. */
export const updateEntryThumbPaths = async (id: string, thumbPaths: string[]): Promise<void> => {
  try {
    const database = await getDatabase();
    await database.runAsync(
      'UPDATE entries SET thumb_paths = ?, updated_at = ? WHERE id = ?',
      [stringify(toRelativePathArray(thumbPaths)), new Date().toISOString(), id]
    );
  } catch (error) {
    logger.error('Error updating entry thumb paths:', error);
    throw error;
  }
};

/** Photo entries missing stored pixel dimensions. Used by photo dimension backfill. */
export const getEntriesMissingPhotoDimensions = async (limit = 10): Promise<Entry[]> => {
  try {
    const database = await getDatabase();
    const result = await database.getAllAsync(
      `SELECT * FROM entries
       WHERE media_type = 'photo'
         AND photo_paths IS NOT NULL AND photo_paths != '' AND photo_paths != '[]'
         AND (photo_widths IS NULL OR photo_widths = '' OR photo_widths = '[]')
         AND is_draft = 0
       ORDER BY timestamp DESC
       LIMIT ?`,
      [limit]
    );
    return (result as any[]).map(rowToEntry);
  } catch (error) {
    logger.error('Error getting entries missing photo dimensions:', error);
    return [];
  }
};

/** Updates only photo_widths / photo_heights for one entry. */
export const updateEntryPhotoDimensions = async (
  id: string,
  photoWidths: number[],
  photoHeights: number[]
): Promise<void> => {
  try {
    const database = await getDatabase();
    await database.runAsync(
      'UPDATE entries SET photo_widths = ?, photo_heights = ?, updated_at = ? WHERE id = ?',
      [stringify(photoWidths), stringify(photoHeights), new Date().toISOString(), id]
    );
  } catch (error) {
    logger.error('Error updating entry photo dimensions:', error);
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
        id, title, content, timestamp, linked_entry_id,
        emotion_responses, ai_prompts, latitude, longitude, country, city, album_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        journal.id,
        journal.title || null,
        journal.content,
        journal.timestamp,
        journal.linkedEntryId || null,
        stringify(journal.emotionResponses),
        stringify(journal.aiPrompts),
        journal.latitude || null,
        journal.longitude || null,
        journal.country?.trim() || null,
        journal.city?.trim() || null,
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
      linkedEntryId: row.linked_entry_id || undefined,
      emotionResponses: parse(row.emotion_responses),
      aiPrompts: parse(row.ai_prompts),
      latitude: row.latitude !== null ? row.latitude : undefined,
      longitude: row.longitude !== null ? row.longitude : undefined,
      country: row.country != null && String(row.country).trim() !== '' ? String(row.country).trim() : undefined,
      city: row.city != null && String(row.city).trim() !== '' ? String(row.city).trim() : undefined,
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
      linkedEntryId: row.linked_entry_id || undefined,
      emotionResponses: parse(row.emotion_responses),
      aiPrompts: parse(row.ai_prompts),
      latitude: row.latitude !== null ? row.latitude : undefined,
      longitude: row.longitude !== null ? row.longitude : undefined,
      country: row.country != null && String(row.country).trim() !== '' ? String(row.country).trim() : undefined,
      city: row.city != null && String(row.city).trim() !== '' ? String(row.city).trim() : undefined,
      albumId: row.album_id || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  } catch (error) {
    logger.error('Error getting journal by id:', error);
    return null;
  }
};

/** Journals with coords but missing either persisted country or city/locality text. */
export const getJournalsMissingLocationText = async (limit = 40): Promise<Journal[]> => {
  try {
    const database = await getDatabase();
    const result = await database.getAllAsync(
      `SELECT * FROM journals
       WHERE latitude IS NOT NULL AND longitude IS NOT NULL
         AND (
           country IS NULL OR country = '' OR
           city IS NULL OR city = ''
         )
       ORDER BY timestamp DESC
       LIMIT ?`,
      [limit]
    );

    return (result as any[]).map((row) => ({
      id: row.id,
      title: row.title || undefined,
      content: row.content,
      timestamp: row.timestamp,
      linkedEntryId: row.linked_entry_id || undefined,
      emotionResponses: parse(row.emotion_responses),
      aiPrompts: parse(row.ai_prompts),
      latitude: row.latitude !== null ? row.latitude : undefined,
      longitude: row.longitude !== null ? row.longitude : undefined,
      country: row.country != null && String(row.country).trim() !== '' ? String(row.country).trim() : undefined,
      city: row.city != null && String(row.city).trim() !== '' ? String(row.city).trim() : undefined,
      albumId: row.album_id || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  } catch (error) {
    logger.error('Error getting journals missing location text:', error);
    return [];
  }
};

export const updateJournal = async (journal: Journal): Promise<void> => {
  try {
    const database = await getDatabase();
    const now = new Date().toISOString();
    
    await database.runAsync(
      `UPDATE journals SET
        title = ?, content = ?, timestamp = ?, linked_entry_id = ?,
        emotion_responses = ?, ai_prompts = ?, latitude = ?, longitude = ?, country = ?, city = ?,
        album_id = ?, updated_at = ?
      WHERE id = ?`,
      [
        journal.title || null,
        journal.content,
        journal.timestamp,
        journal.linkedEntryId || null,
        stringify(journal.emotionResponses),
        stringify(journal.aiPrompts),
        journal.latitude || null,
        journal.longitude || null,
        journal.country?.trim() || null,
        journal.city?.trim() || null,
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
// ---------------------------------------------------------------------------
// Postcards
// ---------------------------------------------------------------------------

const parsePostcardPhotoTransform = (raw: string | null | undefined): PostcardPhotoTransform | undefined => {
  if (raw == null || raw === '') return undefined;
  const obj = parse(raw);
  if (!obj || typeof obj !== 'object') return undefined;
  const o = obj as Record<string, unknown>;
  const scale = typeof o.scale === 'number' && Number.isFinite(o.scale) ? o.scale : 1;
  const translateX = typeof o.translateX === 'number' && Number.isFinite(o.translateX) ? o.translateX : 0;
  const translateY = typeof o.translateY === 'number' && Number.isFinite(o.translateY) ? o.translateY : 0;
  return { scale, translateX, translateY };
};

export const createPostcard = async (postcard: Postcard): Promise<void> => {
  try {
    const database = await getDatabase();
    await database.runAsync(
      `INSERT INTO postcards (id, created_at, updated_at, template_id, aspect_ratio,
        top_photo_path, bottom_photo_path, top_label, bottom_label, downloaded,
        top_photo_transform, bottom_photo_transform,
        photo3_path, photo3_transform, photo4_path, photo4_transform, template_data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        postcard.id,
        postcard.createdAt,
        postcard.updatedAt,
        postcard.templateId,
        postcard.aspectRatio,
        postcard.photo1Path ?? null,
        postcard.photo2Path ?? null,
        postcard.label1,
        postcard.label2,
        postcard.downloaded ? 1 : 0,
        postcard.photo1Transform != null ? stringify(postcard.photo1Transform) : null,
        postcard.photo2Transform != null ? stringify(postcard.photo2Transform) : null,
        postcard.photo3Path ?? null,
        postcard.photo3Transform != null ? stringify(postcard.photo3Transform) : null,
        postcard.photo4Path ?? null,
        postcard.photo4Transform != null ? stringify(postcard.photo4Transform) : null,
        postcard.templateData != null ? stringify(postcard.templateData) : null,
      ]
    );
  } catch (error) {
    logger.error('Error creating postcard:', error);
    throw error;
  }
};

export const updatePostcard = async (postcard: Postcard): Promise<void> => {
  try {
    const database = await getDatabase();
    await database.runAsync(
      `UPDATE postcards SET updated_at = ?, template_id = ?, aspect_ratio = ?,
        top_photo_path = ?, bottom_photo_path = ?, top_label = ?, bottom_label = ?,
        downloaded = ?, top_photo_transform = ?, bottom_photo_transform = ?,
        photo3_path = ?, photo3_transform = ?, photo4_path = ?, photo4_transform = ?,
        template_data = ?
       WHERE id = ?`,
      [
        postcard.updatedAt,
        postcard.templateId,
        postcard.aspectRatio,
        postcard.photo1Path ?? null,
        postcard.photo2Path ?? null,
        postcard.label1,
        postcard.label2,
        postcard.downloaded ? 1 : 0,
        postcard.photo1Transform != null ? stringify(postcard.photo1Transform) : null,
        postcard.photo2Transform != null ? stringify(postcard.photo2Transform) : null,
        postcard.photo3Path ?? null,
        postcard.photo3Transform != null ? stringify(postcard.photo3Transform) : null,
        postcard.photo4Path ?? null,
        postcard.photo4Transform != null ? stringify(postcard.photo4Transform) : null,
        postcard.templateData != null ? stringify(postcard.templateData) : null,
        postcard.id,
      ]
    );
  } catch (error) {
    logger.error('Error updating postcard:', error);
    throw error;
  }
};

export const getPostcards = async (): Promise<Postcard[]> => {
  try {
    const database = await getDatabase();
    const rows = await database.getAllAsync(
      'SELECT * FROM postcards ORDER BY updated_at DESC'
    );
    return (rows as any[]).map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      templateId: row.template_id,
      aspectRatio: row.aspect_ratio as Postcard['aspectRatio'],
      photo1Path: row.top_photo_path ?? null,
      photo2Path: row.bottom_photo_path ?? null,
      label1: row.top_label ?? '',
      label2: row.bottom_label ?? '',
      downloaded: row.downloaded === 1,
      photo1Transform: parsePostcardPhotoTransform(row.top_photo_transform),
      photo2Transform: parsePostcardPhotoTransform(row.bottom_photo_transform),
      photo3Path: row.photo3_path ?? null,
      photo3Transform: parsePostcardPhotoTransform(row.photo3_transform),
      photo4Path: row.photo4_path ?? null,
      photo4Transform: parsePostcardPhotoTransform(row.photo4_transform),
      templateData: row.template_data != null ? (parse(row.template_data) as Record<string, unknown> | null) : null,
    }));
  } catch (error) {
    logger.error('Error fetching postcards:', error);
    return [];
  }
};

export const deletePostcard = async (id: string): Promise<void> => {
  try {
    const database = await getDatabase();
    await database.runAsync('DELETE FROM postcards WHERE id = ?', [id]);
  } catch (error) {
    logger.error('Error deleting postcard:', error);
    throw error;
  }
};

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
