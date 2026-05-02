import { ArtistShowResult } from "@/src/shared/Types";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001";

export async function fetchArtistShows(bandNames: string[]): Promise<ArtistShowResult[]> {
  const response = await fetch(`${BASE_URL}/api/festival/artist-shows`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bandNames }),
  });

  if (!response.ok) {
    throw new Error(`API error ${response.status}`);
  }

  const data = await response.json();
  return data.results as ArtistShowResult[];
}

export async function refreshMbidCache(): Promise<void> {
  const response = await fetch(`${BASE_URL}/api/artist-mbids/refresh`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`API error ${response.status}`);
  }
}
