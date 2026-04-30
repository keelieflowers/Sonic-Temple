import { ArtistShowResult, LatestSetlist, SongSection } from "../types.js";
import { SetlistApiArtist, SetlistApiSetlist, SetlistClient } from "./setlistClient.js";
import { ArtistMbidStore } from "./artistMbidStore.js";
import { Logger } from "./logger.js";
import { ScheduleSource } from "./scheduleSource.js";
import { FinalSetlistCacheStore } from "./finalSetlistCacheStore.js";

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

function getBestArtistCandidate(inputBandName: string, artists: SetlistApiArtist[]) {
  const normalizedInput = normalizeArtistName(inputBandName);
  const ranked = [...artists].sort((a, b) => {
    const aScore = similarityScore(normalizedInput, normalizeArtistName(a.name ?? ""));
    const bScore = similarityScore(normalizedInput, normalizeArtistName(b.name ?? ""));
    return bScore - aScore;
  });
  const best = ranked[0];
  const bestScore = best ? similarityScore(normalizedInput, normalizeArtistName(best.name ?? "")) : -Infinity;
  const second = ranked[1];
  const secondScore = second
    ? similarityScore(normalizedInput, normalizeArtistName(second.name ?? ""))
    : -Infinity;

  const ambiguous = !best || bestScore < 160 || bestScore - secondScore < 60;
  return { best, ambiguous, bestScore, secondScore };
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

function pickBestSetlistWithFestivalVenuePriority(
  setlists: SetlistApiSetlist[],
  festivalVenueIds: string[],
  now: Date = new Date()
): { setlist: SetlistApiSetlist | null; selectionMode: "festivalVenuePriority" | "recencyFallback" } {
  const latestValid = pickLatestCompletedSetlist(setlists, now);
  if (!latestValid) {
    return { setlist: null, selectionMode: "recencyFallback" };
  }

  if (festivalVenueIds.length === 0) {
    return { setlist: latestValid, selectionMode: "recencyFallback" };
  }

  const priority = new Map(festivalVenueIds.map((id, index) => [id, index]));
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
    .map((setlist) => ({
      setlist,
      date: parseSetlistDate(setlist.eventDate),
      priority: priority.get(setlist.venue?.id ?? "")
    }))
    .filter(
      (item): item is { setlist: SetlistApiSetlist; date: Date; priority: number } =>
        item.date !== null &&
        item.date.getTime() <= yesterdayUtc &&
        hasSongs(item.setlist) &&
        item.priority !== undefined
    )
    .sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return b.date.getTime() - a.date.getTime();
    });

  if (candidates.length > 0) {
    return { setlist: candidates[0].setlist, selectionMode: "festivalVenuePriority" };
  }
  return { setlist: latestValid, selectionMode: "recencyFallback" };
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
    venueId: input.venue?.id,
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
  mbidStore?: ArtistMbidStore,
  options?: {
    festivalVenueIds?: string[];
    logger?: Logger;
    appendOnlyMissingMbid?: boolean;
  }
): Promise<ArtistShowResult[]> {
  const logger = options?.logger?.child("festivalService");
  const festivalVenueIds = options?.festivalVenueIds ?? [];
  const results = await Promise.all(
    bandNames.map(async (inputBandName) => {
      try {
        const cached = await mbidStore?.get(inputBandName);
        logger?.debug("MBID cache lookup", {
          inputBandName,
          cacheHit: Boolean(cached)
        });
        let artist: SetlistApiArtist | undefined =
          cached === null || cached === undefined
            ? undefined
            : { mbid: cached.mbid, name: cached.matchedArtistName };

        if (!artist) {
          const artists = await client.searchArtistsByName(inputBandName);
          artist = pickBestArtistMatch(inputBandName, artists);
          if (artist?.mbid && artist?.name) {
            if (!options?.appendOnlyMissingMbid || !cached) {
              await mbidStore?.set(inputBandName, artist.mbid, artist.name);
            }
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
        const selected = pickBestSetlistWithFestivalVenuePriority(
          setlists,
          festivalVenueIds
        );
        const latest = selected.setlist;
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
            status: "no_setlist_found" as const,
            selectionMode: selected.selectionMode
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
          status: "ok" as const,
          selectionMode: selected.selectionMode
        };
      } catch (error) {
        logger?.warn("Failed to build artist show result", {
          inputBandName,
          error: error instanceof Error ? error.message : String(error)
        });
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
  logger?: Logger
) {
  const results = await Promise.all(
    bandNames.map(async (inputBandName) => {
      try {
        const existing = await mbidStore.get(inputBandName);
        if (existing) {
          return { inputBandName, status: "already_cached" as const, artistMatch: existing };
        }

        const artists = await client.searchArtistsByName(inputBandName);
        const candidate = getBestArtistCandidate(inputBandName, artists);
        const artist = candidate.best;
        if (!artist?.mbid || !artist?.name) {
          return { inputBandName, status: "no_artist_match" as const };
        }

        if (candidate.ambiguous) {
          logger?.warn("Skipping ambiguous MBID candidate", {
            inputBandName,
            candidateName: artist.name,
            bestScore: candidate.bestScore,
            secondScore: candidate.secondScore
          });
          return {
            inputBandName,
            status: "ambiguous_match" as const,
            candidate: { mbid: artist.mbid, name: artist.name }
          };
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
    checked: bandNames.length,
    added: results.filter((item) => item.status === "stored").length,
    alreadyCached: results.filter((item) => item.status === "already_cached").length,
    skippedAmbiguous: results.filter((item) => item.status === "ambiguous_match").length,
    noArtistMatch: results.filter((item) => item.status === "no_artist_match").length,
    errors: results.filter((item) => item.status === "api_error").length,
    addedBands: results
      .filter((item) => item.status === "stored")
      .map((item) => item.inputBandName),
    needsReview: results
      .filter((item) => item.status === "ambiguous_match")
      .map((item) => item.inputBandName),
    results
  };
}

export async function getArtistShowsWithCache(params: {
  bandNames: string[];
  forceRefresh?: boolean;
  client: SetlistClient;
  mbidStore: ArtistMbidStore;
  finalCacheStore: FinalSetlistCacheStore;
  festivalVenueIds: string[];
  cacheTtlHours: number;
  logger?: Logger;
}) {
  const logger = params.logger?.child("artistShowsCache");
  const cached = await params.finalCacheStore.get(params.bandNames);
  if (cached && !params.forceRefresh && !params.finalCacheStore.isExpired(cached)) {
    logger?.info("Serving artist shows from cache", {
      bandCount: params.bandNames.length,
      generatedAt: cached.generatedAt
    });
    return {
      results: cached.results,
      cache: { hit: true, generatedAt: cached.generatedAt, expiresAt: cached.expiresAt }
    };
  }

  const results = await buildArtistShowResults(params.bandNames, params.client, params.mbidStore, {
    festivalVenueIds: params.festivalVenueIds,
    logger
  });
  const entry = await params.finalCacheStore.set(params.bandNames, results, params.cacheTtlHours);
  logger?.info("Generated and cached artist shows", {
    bandCount: params.bandNames.length,
    expiresAt: entry.expiresAt
  });

  return {
    results,
    cache: { hit: false, generatedAt: entry.generatedAt, expiresAt: entry.expiresAt }
  };
}

export async function refreshFestivalData(params: {
  client: SetlistClient;
  mbidStore: ArtistMbidStore;
  finalCacheStore: FinalSetlistCacheStore;
  scheduleSource: ScheduleSource;
  festivalVenueIds: string[];
  cacheTtlHours: number;
  forceRefresh?: boolean;
  logger?: Logger;
}) {
  const logger = params.logger?.child("refreshFestivalData");
  const bandNames = await params.scheduleSource.getBandNames();
  logger?.info("Loaded schedule artist names", { count: bandNames.length });

  const mbidRefresh = await refreshArtistMbidCache(
    bandNames,
    params.client,
    params.mbidStore,
    logger
  );

  const cached = await params.finalCacheStore.get(bandNames);
  const cacheMissingArtists = cached
    ? bandNames.filter(
        (name) =>
          !cached.results.some(
            (result) => result.inputBandName.toLowerCase().trim() === name.toLowerCase().trim()
          )
      )
    : bandNames;

  const shouldRegenerate =
    params.forceRefresh ||
    !cached ||
    params.finalCacheStore.isExpired(cached) ||
    cacheMissingArtists.length > 0;

  let setlistCache = {
    regenerated: false,
    generatedAt: cached?.generatedAt ?? null,
    expiresAt: cached?.expiresAt ?? null
  };

  if (shouldRegenerate) {
    const results = await buildArtistShowResults(bandNames, params.client, params.mbidStore, {
      festivalVenueIds: params.festivalVenueIds,
      logger,
      appendOnlyMissingMbid: true
    });
    const entry = await params.finalCacheStore.set(bandNames, results, params.cacheTtlHours);
    setlistCache = {
      regenerated: true,
      generatedAt: entry.generatedAt,
      expiresAt: entry.expiresAt
    };
  }

  return {
    scheduleBands: bandNames.length,
    mbidRefresh,
    setlistCache,
    cacheMissingArtists
  };
}
