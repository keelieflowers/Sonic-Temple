import { Router } from "express";
import { z } from "zod";
import { buildArtistShowResults } from "../services/festivalService.js";
import { SetlistClient } from "../services/setlistClient.js";

const requestSchema = z.object({
  bandNames: z.array(z.string().trim().min(1)).min(1).max(25)
});

export function createFestivalRouter(setlistClient: SetlistClient): Router {
  const router = Router();

  router.post("/artist-shows", async (req, res) => {
    const parsed = requestSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid request body",
        issues: parsed.error.issues
      });
    }

    const results = await buildArtistShowResults(parsed.data.bandNames, setlistClient);
    return res.status(200).json({ results });
  });

  return router;
}
