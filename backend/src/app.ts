import express from "express";
import { createFestivalRouter } from "./routes/festival.js";
import { SetlistClient } from "./services/setlistClient.js";

export function createApp(setlistClient: SetlistClient) {
  const app = express();
  app.use(express.json());
  app.use("/api/festival", createFestivalRouter(setlistClient));
  return app;
}
