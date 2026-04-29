const BASE_URL = "https://api.setlist.fm/rest/1.0";
const ACCEPT = "application/json";
const API_VERSION = "1.0";
const REQUEST_TIMEOUT_MS = 10000;
const RETRY_COUNT = 1;

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

export class SetlistClient {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("SETLIST_API_KEY is required.");
    }
    this.apiKey = apiKey;
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

  private async request<T>(path: string, attempt = 0): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

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

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Setlist API ${response.status}: ${body || "Unknown error"}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      if (attempt < RETRY_COUNT) {
        return this.request<T>(path, attempt + 1);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
