import "dotenv/config";
import { createApp } from "./app.js";
import { SetlistClient } from "./services/setlistClient.js";

const apiKey = process.env.SETLIST_API_KEY;
if (!apiKey) {
  throw new Error("Missing SETLIST_API_KEY. Add it to backend/.env.");
}

const port = Number(process.env.PORT ?? 3001);
const setlistClient = new SetlistClient(apiKey);
const app = createApp(setlistClient);

app.listen(port, () => {
  console.log(`Festival backend listening on http://localhost:${port}`);
});
