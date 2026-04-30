import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ArtistShowResult } from "../types.js";

type CacheEntry = {
  generatedAt: string;
  expiresAt: string;
  results: ArtistShowResult[];
};

type CacheFile = {
  version: "0.0.3";
  entries: Record<string, CacheEntry>;
};

function normalizeBandName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function toCacheKey(bandNames: string[]): string {
  return [...new Set(bandNames.map((name) => normalizeBandName(name)).filter(Boolean))]
    .sort()
    .join("|");
}

export class FinalSetlistCacheStore {
  constructor(private readonly filePath: string) {}

  async get(bandNames: string[]): Promise<CacheEntry | null> {
    const key = toCacheKey(bandNames);
    const data = await this.readStore();
    return data.entries[key] ?? null;
  }

  async set(bandNames: string[], results: ArtistShowResult[], ttlHours: number): Promise<CacheEntry> {
    const key = toCacheKey(bandNames);
    const data = await this.readStore();
    const now = new Date();
    const expires = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);

    const entry: CacheEntry = {
      generatedAt: now.toISOString(),
      expiresAt: expires.toISOString(),
      results
    };

    data.entries[key] = entry;
    await this.writeStore(data);
    return entry;
  }

  isExpired(entry: CacheEntry, now: Date = new Date()): boolean {
    return new Date(entry.expiresAt).getTime() <= now.getTime();
  }

  private async readStore(): Promise<CacheFile> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<CacheFile>;
      return {
        version: "0.0.3",
        entries: parsed.entries ?? {}
      };
    } catch {
      return { version: "0.0.3", entries: {} };
    }
  }

  private async writeStore(data: CacheFile): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(data, null, 2), "utf8");
  }
}
