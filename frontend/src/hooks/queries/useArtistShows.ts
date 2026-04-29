import { useQuery } from "@tanstack/react-query";
import { fetchArtistShows } from "@/src/services/api";
import { getCachedSetlist, saveSetlist } from "@/src/services/db";
import { ArtistShowResult } from "@/src/shared/Types";

async function getArtistShows(bandNames: string[]): Promise<ArtistShowResult[]> {
  const results: ArtistShowResult[] = [];
  const needsFetch: string[] = [];

  for (const name of bandNames) {
    const cached = await getCachedSetlist(name);
    if (cached) {
      results.push(JSON.parse(cached.data) as ArtistShowResult);
    } else {
      needsFetch.push(name);
    }
  }

  if (needsFetch.length > 0) {
    const fetched = await fetchArtistShows(needsFetch);
    for (const result of fetched) {
      if (result.status === "ok" || result.status === "no_setlist_found") {
        await saveSetlist(result.inputBandName, JSON.stringify(result));
      }
      results.push(result);
    }
  }

  return bandNames.map(
    (name) =>
      results.find((r) => r.inputBandName === name) ?? {
        inputBandName: name,
        artistMatch: null,
        latestSetlist: null,
        status: "api_error" as const,
        error: "Not cached and could not reach backend",
      }
  );
}

export const useArtistShows = (bandNames: string[]) =>
  useQuery({
    queryKey: ["artist-shows", bandNames],
    queryFn: () => getArtistShows(bandNames),
    enabled: bandNames.length > 0,
  });
