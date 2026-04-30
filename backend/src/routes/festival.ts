import { Router } from "express";
import { z } from "zod";
import {
  getArtistShowsWithCache,
  refreshFestivalData
} from "../services/festivalService.js";
import { FinalSetlistCacheStore } from "../services/finalSetlistCacheStore.js";
import { ArtistMbidStore } from "../services/artistMbidStore.js";
import { Logger } from "../services/logger.js";
import { ScheduleSource } from "../services/scheduleSource.js";
import { SetlistClient } from "../services/setlistClient.js";

const requestSchema = z.object({
  bandNames: z.array(z.string().trim().min(1)).min(1).max(25),
  forceRefresh: z.boolean().optional().default(false)
});

const refreshSchema = z.object({
  forceRefresh: z.boolean().optional().default(false)
});

export function createFestivalRouter(
  setlistClient: SetlistClient,
  mbidStore: ArtistMbidStore,
  finalCacheStore: FinalSetlistCacheStore,
  scheduleSource: ScheduleSource,
  festivalVenueIds: string[],
  cacheTtlHours: number,
  logger: Logger
): Router {
  const router = Router();
  const routeLogger = logger.child("festivalRoutes");

  router.post("/artist-shows", async (req, res) => {
    const parsed = requestSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid request body",
        issues: parsed.error.issues
      });
    }

    const payload = await getArtistShowsWithCache({
      bandNames: parsed.data.bandNames,
      forceRefresh: parsed.data.forceRefresh,
      client: setlistClient,
      mbidStore,
      finalCacheStore,
      festivalVenueIds,
      cacheTtlHours,
      logger: routeLogger
    });
    return res.status(200).json(payload);
  });

  router.post("/artist-mbids/refresh", async (req, res) => {
    const parsed = refreshSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid request body",
        issues: parsed.error.issues
      });
    }

    const result = await refreshFestivalData({
      client: setlistClient,
      mbidStore,
      finalCacheStore,
      scheduleSource,
      festivalVenueIds,
      cacheTtlHours,
      forceRefresh: parsed.data.forceRefresh,
      logger: routeLogger
    });
    return res.status(200).json(result);
  });

  return router;
}
