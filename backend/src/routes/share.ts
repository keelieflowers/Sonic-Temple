import { Router } from "express";
import { z } from "zod";
import { createShare, getShare } from "../services/shareStore.js";

const createShareSchema = z.object({
  bands: z.array(z.string().trim().min(1)).min(1).max(200),
});

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function createShareRouter(baseUrl: string): Router {
  const router = Router();

  // POST /share — create a share, return its public URL
  router.post("/", (req, res) => {
    const result = createShareSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    const id = createShare(result.data.bands);
    res.json({ url: `${baseUrl}/api/share/${id}` });
  });

  // GET /share/:id — serve an OG preview page that redirects to the deep link
  router.get("/:id", (req, res) => {
    const bands = getShare(req.params.id);
    if (!bands) {
      res.status(404).send("Share not found or expired.");
      return;
    }

    // Encode as standard base64 — matches the atob() decode path in the app.
    const encoded = Buffer.from(JSON.stringify({ bands }), "utf8").toString("base64");
    const deepLink = `frontend://import?d=${encoded}`;
    const count = bands.length;
    const description = escapeHtml(
      `${count} artist${count === 1 ? "" : "s"} · tap to load in Sonic Temple`
    );

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Sonic Temple lineup</title>
    <meta property="og:title" content="Sonic Temple lineup" />
    <meta property="og:description" content="${description}" />
    <meta property="og:type" content="website" />
    <script>window.location.replace("${deepLink}");</script>
  </head>
  <body>
    <p>Opening Sonic Temple…</p>
    <p><a href="${deepLink}">Tap here if it doesn't open automatically.</a></p>
  </body>
</html>`);
  });

  return router;
}
