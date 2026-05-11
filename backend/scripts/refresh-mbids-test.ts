/**
 * Queries the Setlist.fm API for every artist in the festival lineup using the
 * updated disambiguation-aware matching logic, then saves results to
 * backend/data/artist-mbids-test.json WITHOUT touching the production cache.
 *
 * Run with:
 *   cd backend && npx tsx scripts/refresh-mbids-test.ts
 *
 * Requires SETLIST_API_KEY in the environment (or .env file).
 */

import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SetlistClient } from "../src/services/setlistClient.js";
import { getBestArtistCandidateExported } from "../src/services/festivalService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const LINEUP_PATH = path.join(DATA_DIR, "sonic-temple-2026-lineup.json");
const OUTPUT_PATH = path.join(DATA_DIR, "artist-mbids-test.json");

type LineupFile = { festival: string; year: number; bands: string[] };

type TestEntry = {
  inputBandName: string;
  mbid: string | null;
  matchedArtistName: string | null;
  disambiguation: string | null;
  url: string | null;
  bestScore: number;
  secondScore: number;
  status: "stored" | "ambiguous" | "no_match" | "api_error";
  updatedAt: string;
};

async function main() {
  const apiKey = process.env.SETLIST_API_KEY;
  if (!apiKey) {
    console.error("SETLIST_API_KEY env var is required.");
    process.exit(1);
  }

  const lineup: LineupFile = JSON.parse(await readFile(LINEUP_PATH, "utf8"));
  const bands = lineup.bands;
  console.log(`Querying ${bands.length} artists from ${lineup.festival} ${lineup.year} lineup...`);

  const client = new SetlistClient(apiKey);
  const results: Record<string, TestEntry> = {};
  const now = new Date().toISOString();

  for (let i = 0; i < bands.length; i++) {
    const inputBandName = bands[i];
    const key = inputBandName.trim().toLowerCase().replace(/\s+/g, " ");
    process.stdout.write(`  [${String(i + 1).padStart(3)}/${bands.length}] ${inputBandName} ... `);

    try {
      const artists = await client.searchArtistsByName(inputBandName);
      const candidate = getBestArtistCandidateExported(inputBandName, artists);
      const artist = candidate.best;

      if (!artist?.mbid || !artist?.name) {
        console.log("no match");
        results[key] = {
          inputBandName,
          mbid: null,
          matchedArtistName: null,
          disambiguation: null,
          url: null,
          bestScore: candidate.bestScore,
          secondScore: candidate.secondScore,
          status: "no_match",
          updatedAt: now
        };
        continue;
      }

      if (candidate.ambiguous) {
        console.log(`ambiguous (best="${artist.name}" score=${candidate.bestScore} vs ${candidate.secondScore})`);
        results[key] = {
          inputBandName,
          mbid: artist.mbid,
          matchedArtistName: artist.name,
          disambiguation: artist.disambiguation ?? null,
          url: artist.url ?? null,
          bestScore: candidate.bestScore,
          secondScore: candidate.secondScore,
          status: "ambiguous",
          updatedAt: now
        };
        continue;
      }

      console.log(`ok → "${artist.name}"${artist.disambiguation ? ` (${artist.disambiguation})` : ""}`);
      results[key] = {
        inputBandName,
        mbid: artist.mbid,
        matchedArtistName: artist.name,
        disambiguation: artist.disambiguation ?? null,
        url: artist.url ?? null,
        bestScore: candidate.bestScore,
        secondScore: candidate.secondScore,
        status: "stored",
        updatedAt: now
      };
    } catch (err) {
      console.log(`error: ${err instanceof Error ? err.message : String(err)}`);
      results[key] = {
        inputBandName,
        mbid: null,
        matchedArtistName: null,
        disambiguation: null,
        url: null,
        bestScore: 0,
        secondScore: 0,
        status: "api_error",
        updatedAt: now
      };
    }
  }

  const output = { version: "0.3.0-test", generatedAt: now, entries: results };
  await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n", "utf8");

  const stored = Object.values(results).filter((r) => r.status === "stored").length;
  const ambiguous = Object.values(results).filter((r) => r.status === "ambiguous").length;
  const noMatch = Object.values(results).filter((r) => r.status === "no_match").length;
  const errors = Object.values(results).filter((r) => r.status === "api_error").length;

  console.log(`\nDone. Saved to ${OUTPUT_PATH}`);
  console.log(`  stored: ${stored}  ambiguous: ${ambiguous}  no_match: ${noMatch}  errors: ${errors}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
