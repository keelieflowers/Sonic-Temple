import { fetchArtistShows } from "@/src/services/api";
import { saveSetlist } from "@/src/services/db";
import { ArtistShowResult } from "@/src/shared/Types";

const BATCH_SIZE = 25;

export type SyncProgress = {
  total: number;
  completed: number;
  failed: number;
};

export type SyncResult = {
  synced: number;
  failed: number;
};

export async function syncArtistSetlists(
  bandNames: string[],
  onProgress?: (progress: SyncProgress) => void
): Promise<SyncResult> {
  const total = bandNames.length;
  let completed = 0;
  let failed = 0;

  const batches: string[][] = [];
  for (let i = 0; i < bandNames.length; i += BATCH_SIZE) {
    batches.push(bandNames.slice(i, i + BATCH_SIZE));
  }

  for (const batch of batches) {
    let results: ArtistShowResult[] = [];

    try {
      results = await fetchArtistShows(batch);
    } catch {
      failed += batch.length;
      completed += batch.length;
      onProgress?.({ total, completed, failed });
      continue;
    }

    for (const result of results) {
      if (result.status === "ok" || result.status === "no_setlist_found") {
        await saveSetlist(result.inputBandName, JSON.stringify(result));
        completed += 1;
      } else {
        failed += 1;
        completed += 1;
      }
      onProgress?.({ total, completed, failed });
    }
  }

  return { synced: completed - failed, failed };
}
