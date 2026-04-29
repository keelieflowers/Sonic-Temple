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
      name TEXT PRIMARY KEY NOT NULL
    );

    CREATE TABLE IF NOT EXISTS setlists (
      artist_name   TEXT PRIMARY KEY NOT NULL,
      data          TEXT NOT NULL,
      synced_at     TEXT NOT NULL
    );
  `);
}

// Selected bands

export async function getSelectedBands(): Promise<string[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM selected_bands ORDER BY name"
  );
  return rows.map((r) => r.name);
}

export async function saveSelectedBands(names: string[]): Promise<void> {
  const db = getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM selected_bands");
    for (const name of names) {
      await db.runAsync("INSERT INTO selected_bands (name) VALUES (?)", [name]);
    }
  });
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
