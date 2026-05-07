import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ArtistShowResult } from "../types.js";

// Public shape returned by get() — same as before so callers don't change
export type CacheEntry = {
  generatedAt: string;
  expiresAt: string;
  results: ArtistShowResult[];
};

// Internal per-artist storage unit
type PerArtistEntry = {
  generatedAt: string;
  expiresAt: string;
  result: ArtistShowResult;
};

type CacheFile = {
  version: "0.0.4";
  entries: Record<string, PerArtistEntry>;
};

function normalizeBandName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export class FinalSetlistCacheStore {
  constructor(private readonly filePath: string) {}

  // Returns results for all requested artists only when every artist is present
  // and none are expired. Returns null if any artist is missing or stale.
  async get(bandNames: string[]): Promise<CacheEntry | null> {
    const data = await this.readStore();
    const now = new Date();
    const perArtist: PerArtistEntry[] = [];

    for (const name of bandNames) {
      const entry = data.entries[normalizeBandName(name)];
      if (!entry || new Date(entry.expiresAt).getTime() <= now.getTime()) {
        return null;
      }
      perArtist.push(entry);
    }

    if (perArtist.length === 0) return null;

    // Synthesize a batch-shaped entry so callers don't need to change
    const generatedAt = perArtist.reduce(
      (latest, e) => (e.generatedAt > latest ? e.generatedAt : latest),
      perArtist[0].generatedAt
    );
    const expiresAt = perArtist.reduce(
      (soonest, e) => (e.expiresAt < soonest ? e.expiresAt : soonest),
      perArtist[0].expiresAt
    );

    return { generatedAt, expiresAt, results: perArtist.map((e) => e.result) };
  }

  // Stores each artist's result individually so no two queries can produce
  // conflicting copies of the same artist.
  async set(bandNames: string[], results: ArtistShowResult[], ttlHours: number): Promise<CacheEntry> {
    const data = await this.readStore();
    const now = new Date();
    const generatedAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000).toISOString();

    for (const result of results) {
      const key = normalizeBandName(result.inputBandName);
      data.entries[key] = { generatedAt, expiresAt, result };
    }

    await this.writeStore(data);
    return { generatedAt, expiresAt, results };
  }

  isExpired(entry: CacheEntry, now: Date = new Date()): boolean {
    return new Date(entry.expiresAt).getTime() <= now.getTime();
  }

  private async readStore(): Promise<CacheFile> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as { version?: string; entries?: unknown };
      if (parsed.version === "0.0.4") {
        return parsed as CacheFile;
      }
      // Unrecognized or old version — start fresh (migration script handles conversion)
      return { version: "0.0.4", entries: {} };
    } catch {
      return { version: "0.0.4", entries: {} };
    }
  }

  private async writeStore(data: CacheFile): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(data, null, 2), "utf8");
  }
}
