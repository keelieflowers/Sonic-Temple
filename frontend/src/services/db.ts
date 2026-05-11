import * as SQLite from "expo-sqlite";

const DB_NAME = "sonic-temple.db";

let _db: SQLite.SQLiteDatabase | null = null;

function getDb(): SQLite.SQLiteDatabase {
  if (!_db) {
    _db = SQLite.openDatabaseSync(DB_NAME);
  }
  return _db;
}

export async function initDb(): Promise<void> {
  const db = getDb();

  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS selected_bands (
      name   TEXT PRIMARY KEY NOT NULL,
      hidden INTEGER NOT NULL DEFAULT 0,
      tier   TEXT
    );

    CREATE TABLE IF NOT EXISTS setlists (
      artist_name   TEXT PRIMARY KEY NOT NULL,
      data          TEXT NOT NULL,
      synced_at     TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS breakpoints (
      artist                    TEXT PRIMARY KEY NOT NULL,
      type                      TEXT NOT NULL,
      song_index                INTEGER,
      departure_time            TEXT,
      arrival_song_index        INTEGER,
      arrival_notification_time TEXT
    );

    CREATE TABLE IF NOT EXISTS partner_bands (
      name TEXT PRIMARY KEY NOT NULL
    );
  `);

  // Migrations — safe to run repeatedly, ignored if column already exists
  try {
    await db.execAsync(`ALTER TABLE breakpoints ADD COLUMN arrival_song_index INTEGER;`);
  } catch {}
  try {
    await db.execAsync(`ALTER TABLE breakpoints ADD COLUMN arrival_notification_time TEXT;`);
  } catch {}
  try {
    await db.execAsync(`ALTER TABLE selected_bands ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;`);
  } catch {}
  try {
    await db.execAsync(`ALTER TABLE selected_bands ADD COLUMN tier TEXT;`);
  } catch {}
}

// Selected bands

export type BandRow = {
  name: string;
  hidden: number;
  tier: string | null;
};

export async function getSelectedBands(): Promise<BandRow[]> {
  const db = getDb();
  return db.getAllAsync<BandRow>(
    "SELECT name, hidden, tier FROM selected_bands ORDER BY name"
  );
}

export async function upsertBand(name: string): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `INSERT INTO selected_bands (name, hidden, tier) VALUES (?, 0, NULL) ON CONFLICT(name) DO NOTHING`,
    [name]
  );
}

export async function setBandHidden(name: string, hidden: boolean): Promise<void> {
  const db = getDb();
  await db.runAsync(
    "UPDATE selected_bands SET hidden = ? WHERE name = ?",
    [hidden ? 1 : 0, name]
  );
}

export async function setBandTier(name: string, tier: string | null): Promise<void> {
  const db = getDb();
  await db.runAsync(
    "UPDATE selected_bands SET tier = ? WHERE name = ?",
    [tier, name]
  );
}

// Setlist cache

export type CachedSetlist = {
  artistName: string;
  data: string;
  syncedAt: string;
};

export async function getCachedSetlist(artistName: string): Promise<CachedSetlist | null> {
  const db = getDb();
  const row = await db.getFirstAsync<CachedSetlist>(
    "SELECT artist_name as artistName, data, synced_at as syncedAt FROM setlists WHERE artist_name = ?",
    [artistName]
  );
  return row ?? null;
}

export async function saveSetlist(artistName: string, data: string): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `INSERT INTO setlists (artist_name, data, synced_at)
     VALUES (?, ?, ?)
     ON CONFLICT(artist_name) DO UPDATE SET data = excluded.data, synced_at = excluded.synced_at`,
    [artistName, data, new Date().toISOString()]
  );
}

export async function getAllCachedSetlists(): Promise<CachedSetlist[]> {
  const db = getDb();
  return db.getAllAsync<CachedSetlist>(
    "SELECT artist_name as artistName, data, synced_at as syncedAt FROM setlists"
  );
}

export async function clearSetlistCache(): Promise<void> {
  const db = getDb();
  await db.runAsync("DELETE FROM setlists");
}

// Breakpoints

export type BreakpointRow = {
  artist: string;
  type: "song" | "time";
  songIndex: number | null;
  departureTime: string | null;
  arrivalSongIndex: number | null;
  arrivalNotificationTime: string | null;
};

export async function getBreakpoints(): Promise<BreakpointRow[]> {
  const db = getDb();
  return db.getAllAsync<BreakpointRow>(
    "SELECT artist, type, song_index as songIndex, departure_time as departureTime, arrival_song_index as arrivalSongIndex, arrival_notification_time as arrivalNotificationTime FROM breakpoints"
  );
}

export async function saveBreakpoint(bp: BreakpointRow): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `INSERT INTO breakpoints (artist, type, song_index, departure_time, arrival_song_index, arrival_notification_time)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(artist) DO UPDATE SET
       type = excluded.type,
       song_index = excluded.song_index,
       departure_time = excluded.departure_time,
       arrival_song_index = excluded.arrival_song_index,
       arrival_notification_time = excluded.arrival_notification_time`,
    [bp.artist, bp.type, bp.songIndex ?? null, bp.departureTime ?? null, bp.arrivalSongIndex ?? null, bp.arrivalNotificationTime ?? null]
  );
}

export async function deleteBreakpoint(artist: string): Promise<void> {
  const db = getDb();
  await db.runAsync("DELETE FROM breakpoints WHERE artist = ?", [artist]);
}

// Partner bands

export async function getPartnerBands(): Promise<string[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{ name: string }>("SELECT name FROM partner_bands");
  return rows.map((r) => r.name);
}

export async function setPartnerBands(names: string[]): Promise<void> {
  const db = getDb();
  await db.execAsync("DELETE FROM partner_bands");
  for (const name of names) {
    await db.runAsync("INSERT OR IGNORE INTO partner_bands (name) VALUES (?)", [name]);
  }
}

export async function clearPartnerBands(): Promise<void> {
  const db = getDb();
  await db.execAsync("DELETE FROM partner_bands");
}
