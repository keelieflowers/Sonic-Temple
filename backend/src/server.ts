import "dotenv/config";
import { createApp } from "./app.js";
import { SetlistClient } from "./services/setlistClient.js";

const apiKey = process.env.SETLIST_API_KEY;
if (!apiKey) {
  throw new Error("Missing SETLIST_API_KEY. Add it to backend/.env.");
}

const port = Number(process.env.PORT ?? 3001);
const setlistClient = new SetlistClient(apiKey, {
  minRequestIntervalMs: Number(process.env.SETLIST_MIN_REQUEST_INTERVAL_MS ?? 600),
  requestTimeoutMs: Number(process.env.SETLIST_REQUEST_TIMEOUT_MS ?? 10000),
  retryCount: Number(process.env.SETLIST_RETRY_COUNT ?? 2),
  retryBaseDelayMs: Number(process.env.SETLIST_RETRY_BASE_DELAY_MS ?? 750)
});
const app = createApp(setlistClient);

app.listen(port, () => {
  console.log(`Festival backend listening on http://localhost:${port}`);
});
