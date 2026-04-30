import "dotenv/config";
import path from "node:path";
import { createApp } from "./app.js";
import { loadFestivalVenuePriorityIds } from "./services/festivalVenuePriority.js";
import { FinalSetlistCacheStore } from "./services/finalSetlistCacheStore.js";
import { ArtistMbidStore } from "./services/artistMbidStore.js";
import { Logger, parseLogLevel } from "./services/logger.js";
import { ScheduleSource } from "./services/scheduleSource.js";
import { SetlistClient } from "./services/setlistClient.js";

const apiKey = process.env.SETLIST_API_KEY;
if (!apiKey) {
  throw new Error("Missing SETLIST_API_KEY. Add it to backend/.env.");
}

const port = Number(process.env.PORT ?? 3001);
const logger = new Logger(parseLogLevel(process.env.LOG_LEVEL), "server");
const setlistClient = new SetlistClient(apiKey, {
  minRequestIntervalMs: Number(process.env.SETLIST_MIN_REQUEST_INTERVAL_MS ?? 600),
  requestTimeoutMs: Number(process.env.SETLIST_REQUEST_TIMEOUT_MS ?? 10000),
  retryCount: Number(process.env.SETLIST_RETRY_COUNT ?? 2),
  retryBaseDelayMs: Number(process.env.SETLIST_RETRY_BASE_DELAY_MS ?? 750),
  logger
});
const mbidStore = new ArtistMbidStore(
  process.env.ARTIST_MBID_STORE_PATH ?? path.resolve(process.cwd(), "data/artist-mbids.json")
);
const finalSetlistCacheStore = new FinalSetlistCacheStore(
  process.env.FINAL_SETLIST_CACHE_PATH ?? path.resolve(process.cwd(), "data/final-setlists-cache.json")
);
const scheduleSource = new ScheduleSource(
  process.env.SONIC_TEMPLE_SHOWS_URL ??
    "https://goeventweb-static.greencopper.com/9028b1e5d5e84d8c84958f978b2774f8/sonictemplewebproject-2026/data/eng/shows.json",
  process.env.LOCAL_SCHEDULE_PATH ?? path.resolve(process.cwd(), "data/sonic-temple-2026-schedule.json")
);
const festivalVenueIds = await loadFestivalVenuePriorityIds(
  process.env.FESTIVAL_VENUES_PATH ?? path.resolve(process.cwd(), "data/festival-venues.json")
);
const cacheTtlHours = Number(process.env.FINAL_SETLIST_CACHE_TTL_HOURS ?? 24);

const app = createApp(
  setlistClient,
  mbidStore,
  finalSetlistCacheStore,
  scheduleSource,
  festivalVenueIds,
  cacheTtlHours,
  logger
);

app.listen(port, () => {
  logger.info("Festival backend listening", {
    url: `http://localhost:${port}`,
    festivalVenueIds: festivalVenueIds.length,
    cacheTtlHours
  });
});
