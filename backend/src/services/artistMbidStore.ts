import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type StoredArtist = {
  inputBandName: string;
  mbid: string;
  matchedArtistName: string;
  updatedAt: string;
};

type ArtistStoreFile = {
  version: "0.2.0";
  artists: Record<string, StoredArtist>;
};

function normalizeKey(inputBandName: string): string {
  return inputBandName.trim().toLowerCase().replace(/\s+/g, " ");
}

export class ArtistMbidStore {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async get(inputBandName: string): Promise<StoredArtist | null> {
    const data = await this.readStore();
    const key = normalizeKey(inputBandName);
    return data.artists[key] ?? null;
  }

  async set(inputBandName: string, mbid: string, matchedArtistName: string): Promise<void> {
    const data = await this.readStore();
    const key = normalizeKey(inputBandName);

    data.artists[key] = {
      inputBandName,
      mbid,
      matchedArtistName,
      updatedAt: new Date().toISOString()
    };

    await this.writeStore(data);
  }

  async clear(): Promise<void> {
    await this.writeStore({ version: "0.2.0", artists: {} });
  }

  private async readStore(): Promise<ArtistStoreFile> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<ArtistStoreFile>;
      return {
        version: "0.2.0",
        artists: parsed.artists ?? {}
      };
    } catch {
      return { version: "0.2.0", artists: {} };
    }
  }

  private async writeStore(data: ArtistStoreFile): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(data, null, 2), "utf8");
  }
}
