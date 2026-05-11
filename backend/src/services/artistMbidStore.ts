import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type StoredArtist = {
  inputBandName: string;
  mbid: string;
  matchedArtistName: string;
  disambiguation?: string;
  url?: string;
  updatedAt: string;
};

type ArtistStoreFile = {
  version: "0.3.0";
  artists: Record<string, StoredArtist>;
};

function normalizeKey(inputBandName: string): string {
  return inputBandName.trim().toLowerCase().replace(/\s+/g, " ");
}

export class ArtistMbidStore {
  private readonly filePath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async get(inputBandName: string): Promise<StoredArtist | null> {
    const data = await this.readStore();
    const key = normalizeKey(inputBandName);
    return data.artists[key] ?? null;
  }

  async set(
    inputBandName: string,
    mbid: string,
    matchedArtistName: string,
    extras?: { disambiguation?: string; url?: string }
  ): Promise<void> {
    const write = async () => {
      const data = await this.readStore();
      const key = normalizeKey(inputBandName);
      data.artists[key] = {
        inputBandName,
        mbid,
        matchedArtistName,
        ...(extras?.disambiguation !== undefined && { disambiguation: extras.disambiguation }),
        ...(extras?.url !== undefined && { url: extras.url }),
        updatedAt: new Date().toISOString()
      };
      await this.writeStore(data);
    };
    this.writeQueue = this.writeQueue.then(write, write);
    await this.writeQueue;
  }

  async clear(): Promise<void> {
    const write = () => this.writeStore({ version: "0.3.0", artists: {} });
    this.writeQueue = this.writeQueue.then(write, write);
    await this.writeQueue;
  }

  private async readStore(): Promise<ArtistStoreFile> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      // Accept both 0.2.0 (no disambiguation/url) and 0.3.0
      const parsed = JSON.parse(raw) as { version?: string; artists?: Record<string, StoredArtist> };
      return {
        version: "0.3.0",
        artists: parsed.artists ?? {}
      };
    } catch {
      return { version: "0.3.0", artists: {} };
    }
  }

  private async writeStore(data: ArtistStoreFile): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(data, null, 2), "utf8");
  }
}
