import { ArtistShowResult, LatestSetlist, SongSection } from "../types.js";
import { SetlistApiArtist, SetlistApiSetlist, SetlistClient } from "./setlistClient.js";
import { ArtistMbidStore } from "./artistMbidStore.js";

function normalizeArtistName(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function similarityScore(query: string, candidate: string): number {
  if (!query || !candidate) {
    return 0;
  }

  if (query === candidate) {
    return 1000;
  }

  const queryTokens = query.split(" ").filter(Boolean);
  const candidateTokens = candidate.split(" ").filter(Boolean);
  const queryTokenSet = new Set(queryTokens);
  const candidateTokenSet = new Set(candidateTokens);

  let overlap = 0;
  for (const token of queryTokenSet) {
    if (candidateTokenSet.has(token)) {
      overlap += 1;
    }
  }

  const overlapScore = overlap * 100;
  const containsScore = candidate.includes(query) ? 150 : 0;
  const lengthPenalty = Math.abs(candidateTokens.length - queryTokens.length) * 15;
  const featurePenalty = /\b(feat|featuring|with)\b/.test(candidate) ? 120 : 0;

  return overlapScore + containsScore - lengthPenalty - featurePenalty;
}

export function pickBestArtistMatch(
  inputBandName: string,
  artists: SetlistApiArtist[]
): SetlistApiArtist | undefined {
  const normalizedInput = normalizeArtistName(inputBandName);
  if (!normalizedInput) {
    return artists[0];
  }

  return [...artists].sort((a, b) => {
    const aScore = similarityScore(normalizedInput, normalizeArtistName(a.name ?? ""));
    const bScore = similarityScore(normalizedInput, normalizeArtistName(b.name ?? ""));
    return bScore - aScore;
  })[0];
}

function parseSetlistDate(dateText?: string): Date | null {
  if (!dateText) {
    return null;
  }
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(dateText.trim());
  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]) - 1;
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function hasSongs(setlist: SetlistApiSetlist): boolean {
  return (setlist.sets?.set ?? []).some((set) =>
    (set.song ?? []).some((song) => Boolean(song.name?.trim()))
  );
}

function pickLatestCompletedSetlist(setlists: SetlistApiSetlist[], now: Date = new Date()) {
  const yesterdayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - 1,
    23,
    59,
    59,
    999
  );

  const candidates = setlists
    .map((setlist) => ({ setlist, date: parseSetlistDate(setlist.eventDate) }))
    .filter(
      (item): item is { setlist: SetlistApiSetlist; date: Date } =>
        item.date !== null && item.date.getTime() <= yesterdayUtc && hasSongs(item.setlist)
    )
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  return candidates[0]?.setlist ?? null;
}

function normalizeSongSections(input: SetlistApiSetlist): SongSection[] {
  const sets = input.sets?.set ?? [];
  const sections: SongSection[] = [];

  sets.forEach((set, index) => {
    const songs = (set.song ?? [])
      .map((song) => song.name?.trim())
      .filter((songName): songName is string => Boolean(songName));

    if (songs.length === 0) {
      return;
    }

    sections.push({
      name: set.name?.trim() || `Set ${index + 1}`,
      songs
    });
  });

  return sections;
}

function normalizeLatestSetlist(input: SetlistApiSetlist): LatestSetlist | null {
  if (!input.id) {
    return null;
  }

  const sections = normalizeSongSections(input);
  const songCount = sections.reduce((total, section) => total + section.songs.length, 0);

  return {
    id: input.id,
    eventDate: input.eventDate,
    lastUpdated: input.lastUpdated,
    artistName: input.artist?.name,
    tourName: input.tour?.name,
    venueName: input.venue?.name,
    cityName: input.venue?.city?.name,
    state: input.venue?.city?.state,
    countryCode: input.venue?.city?.country?.code,
    countryName: input.venue?.city?.country?.name,
    sections,
    songCount
  };
}

export async function buildArtistShowResults(
  bandNames: string[],
  client: SetlistClient,
  mbidStore?: ArtistMbidStore
): Promise<ArtistShowResult[]> {
  const results = await Promise.all(
    bandNames.map(async (inputBandName) => {
      try {
        const cached = await mbidStore?.get(inputBandName);
        let artist: SetlistApiArtist | undefined =
          cached === null || cached === undefined
            ? undefined
            : { mbid: cached.mbid, name: cached.matchedArtistName };

        if (!artist) {
          const artists = await client.searchArtistsByName(inputBandName);
          artist = pickBestArtistMatch(inputBandName, artists);
          if (artist?.mbid && artist?.name) {
            await mbidStore?.set(inputBandName, artist.mbid, artist.name);
          }
        }

        if (!artist?.mbid || !artist.name) {
          return {
            inputBandName,
            artistMatch: null,
            latestSetlist: null,
            status: "no_artist_match" as const
          };
        }

        const setlists = await client.searchSetlistsByArtistMbid(artist.mbid);
        const latest = pickLatestCompletedSetlist(setlists);
        if (!latest) {
          return {
            inputBandName,
            artistMatch: {
              mbid: artist.mbid,
              name: artist.name,
              sortName: artist.sortName,
              disambiguation: artist.disambiguation,
              url: artist.url
            },
            latestSetlist: null,
            status: "no_setlist_found" as const
          };
        }

        return {
          inputBandName,
          artistMatch: {
            mbid: artist.mbid,
            name: artist.name,
            sortName: artist.sortName,
            disambiguation: artist.disambiguation,
            url: artist.url
          },
          latestSetlist: normalizeLatestSetlist(latest),
          status: "ok" as const
        };
      } catch (error) {
        return {
          inputBandName,
          artistMatch: null,
          latestSetlist: null,
          status: "api_error" as const,
          error: error instanceof Error ? error.message : "Unknown API error"
        };
      }
    })
  );

  return results;
}

export async function refreshArtistMbidCache(
  bandNames: string[],
  client: SetlistClient,
  mbidStore: ArtistMbidStore,
  mode: "append" | "refresh" = "append"
) {
  if (mode === "refresh") {
    await mbidStore.clear();
  }

  const results = await Promise.all(
    bandNames.map(async (inputBandName) => {
      try {
        const artists = await client.searchArtistsByName(inputBandName);
        const artist = pickBestArtistMatch(inputBandName, artists);
        if (!artist?.mbid || !artist?.name) {
          return { inputBandName, status: "no_artist_match" as const };
        }

        await mbidStore.set(inputBandName, artist.mbid, artist.name);
        return {
          inputBandName,
          status: "stored" as const,
          artistMatch: { mbid: artist.mbid, name: artist.name }
        };
      } catch (error) {
        return {
          inputBandName,
          status: "api_error" as const,
          error: error instanceof Error ? error.message : "Unknown API error"
        };
      }
    })
  );

  return {
    total: bandNames.length,
    stored: results.filter((item) => item.status === "stored").length,
    noArtistMatch: results.filter((item) => item.status === "no_artist_match").length,
    errors: results.filter((item) => item.status === "api_error").length,
    results
  };
}
