import { Logger } from "./logger.js";

const BASE_URL = "https://api.setlist.fm/rest/1.0";
const ACCEPT = "application/json";
const API_VERSION = "1.0";
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;
const DEFAULT_RETRY_COUNT = 2;
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 600;
const DEFAULT_RETRY_BASE_DELAY_MS = 750;

export type SetlistApiArtist = {
  mbid?: string;
  name?: string;
  sortName?: string;
  disambiguation?: string;
  url?: string;
};

type ArtistSearchResponse = {
  artist?: SetlistApiArtist[];
};

type SetlistSong = { name?: string };
type SetlistSet = { name?: string; song?: SetlistSong[] };
type SetlistSets = { set?: SetlistSet[] };

export type SetlistApiSetlist = {
  id?: string;
  eventDate?: string;
  lastUpdated?: string;
  artist?: { name?: string };
  tour?: { name?: string };
  venue?: {
    id?: string;
    name?: string;
    city?: {
      name?: string;
      state?: string;
      country?: { code?: string; name?: string };
    };
  };
  sets?: SetlistSets;
};

type SetlistSearchResponse = {
  setlist?: SetlistApiSetlist[];
};

type SetlistClientOptions = {
  requestTimeoutMs?: number;
  retryCount?: number;
  minRequestIntervalMs?: number;
  retryBaseDelayMs?: number;
  logger?: Logger;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class SetlistClient {
  private readonly apiKey: string;
  private readonly requestTimeoutMs: number;
  private readonly retryCount: number;
  private readonly minRequestIntervalMs: number;
  private readonly retryBaseDelayMs: number;
  private readonly logger?: Logger;
  private queue: Promise<void> = Promise.resolve();
  private nextAllowedRequestAt = 0;

  constructor(apiKey: string, options: SetlistClientOptions = {}) {
    if (!apiKey) {
      throw new Error("SETLIST_API_KEY is required.");
    }

    this.apiKey = apiKey;
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.retryCount = options.retryCount ?? DEFAULT_RETRY_COUNT;
    this.minRequestIntervalMs = options.minRequestIntervalMs ?? DEFAULT_MIN_REQUEST_INTERVAL_MS;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;
    this.logger = options.logger?.child("setlistClient");
  }

  async searchArtistsByName(artistName: string): Promise<SetlistApiArtist[]> {
    const response = await this.request<ArtistSearchResponse>(
      `/search/artists?artistName=${encodeURIComponent(artistName)}&p=1`
    );
    return response.artist ?? [];
  }

  async searchSetlistsByArtistMbid(artistMbid: string): Promise<SetlistApiSetlist[]> {
    const response = await this.request<SetlistSearchResponse>(
      `/search/setlists?artistMbid=${encodeURIComponent(artistMbid)}&p=1`
    );
    return response.setlist ?? [];
  }

  private async waitForRequestSlot(): Promise<void> {
    const task = async () => {
      const now = Date.now();
      const waitMs = Math.max(0, this.nextAllowedRequestAt - now);
      if (waitMs > 0) {
        this.logger?.debug("Waiting for request slot", { waitMs });
        await sleep(waitMs);
      }
      this.nextAllowedRequestAt = Math.max(this.nextAllowedRequestAt, Date.now()) + this.minRequestIntervalMs;
    };

    const scheduled = this.queue.then(task, task);
    this.queue = scheduled.catch(() => undefined);
    await scheduled;
  }

  private getRetryDelayMs(response: Response, attempt: number): number {
    const retryAfter = response.headers.get("retry-after");
    if (retryAfter) {
      const numericSeconds = Number(retryAfter);
      if (!Number.isNaN(numericSeconds) && numericSeconds >= 0) {
        return Math.ceil(numericSeconds * 1000);
      }
    }

    return this.retryBaseDelayMs * (attempt + 1);
  }

  private async request<T>(path: string): Promise<T> {
    let lastError: unknown = undefined;

    for (let attempt = 0; attempt <= this.retryCount; attempt += 1) {
      await this.waitForRequestSlot();

    const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const response = await fetch(`${BASE_URL}${path}`, {
        method: "GET",
        headers: {
          "x-api-key": this.apiKey,
          Accept: ACCEPT,
          "x-api-version": API_VERSION
        },
        signal: controller.signal
      });

        if (response.status === 429 && attempt < this.retryCount) {
          const waitMs = this.getRetryDelayMs(response, attempt);
          this.logger?.warn("Setlist API rate limited; retrying", { attempt, waitMs, path });
          await sleep(waitMs);
          continue;
        }

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Setlist API ${response.status}: ${body || "Unknown error"}`);
      }

      return (await response.json()) as T;
    } catch (error) {
        lastError = error;
        if (attempt < this.retryCount) {
          const waitMs = this.retryBaseDelayMs * (attempt + 1);
          this.logger?.warn("Setlist API request failed; retrying", {
            attempt,
            waitMs,
            path,
            error: error instanceof Error ? error.message : String(error)
          });
          await sleep(waitMs);
          continue;
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Unknown Setlist API error");
  }
}
