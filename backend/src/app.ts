import express from "express";
import { createFestivalRouter } from "./routes/festival.js";
import { FinalSetlistCacheStore } from "./services/finalSetlistCacheStore.js";
import { ArtistMbidStore } from "./services/artistMbidStore.js";
import { Logger } from "./services/logger.js";
import { ScheduleSource } from "./services/scheduleSource.js";
import { SetlistClient } from "./services/setlistClient.js";

export function createApp(
  setlistClient: SetlistClient,
  mbidStore: ArtistMbidStore,
  finalCacheStore: FinalSetlistCacheStore,
  scheduleSource: ScheduleSource,
  festivalVenueIds: string[],
  cacheTtlHours: number,
  logger: Logger
) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    logger.debug("Incoming request", { method: req.method, path: req.path });
    next();
  });
  app.use(
    "/api/festival",
    createFestivalRouter(
      setlistClient,
      mbidStore,
      finalCacheStore,
      scheduleSource,
      festivalVenueIds,
      cacheTtlHours,
      logger
    )
  );
  return app;
}
