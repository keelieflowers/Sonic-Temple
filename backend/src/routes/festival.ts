import { Router } from "express";
import { z } from "zod";
import { buildArtistShowResults, refreshArtistMbidCache } from "../services/festivalService.js";
import { ArtistMbidStore } from "../services/artistMbidStore.js";
import { SetlistClient } from "../services/setlistClient.js";

const requestSchema = z.object({
  bandNames: z.array(z.string().trim().min(1)).min(1).max(25)
});

const refreshSchema = z.object({
  bandNames: z.array(z.string().trim().min(1)).min(1).max(100),
  mode: z.enum(["append", "refresh"]).default("append")
});

export function createFestivalRouter(
  setlistClient: SetlistClient,
  mbidStore: ArtistMbidStore
): Router {
  const router = Router();

  router.post("/artist-shows", async (req, res) => {
    const parsed = requestSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid request body",
        issues: parsed.error.issues
      });
    }

    const results = await buildArtistShowResults(parsed.data.bandNames, setlistClient, mbidStore);
    return res.status(200).json({ results });
  });

  router.post("/artist-mbids/refresh", async (req, res) => {
    const parsed = refreshSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid request body",
        issues: parsed.error.issues
      });
    }

    const result = await refreshArtistMbidCache(
      parsed.data.bandNames,
      setlistClient,
      mbidStore,
      parsed.data.mode
    );
    return res.status(200).json(result);
  });

  return router;
}
