import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { Readable } from "stream";
import { log } from "./vite";

const NEARMAP_TILE_BASE = "https://api.nearmap.com/tiles/v3/Vert";

export async function registerRoutes(app: Express): Promise<Server> {
  // put application routes here
  // prefix all routes with /api

  // use storage to perform CRUD operations on the storage interface
  // e.g. storage.insertUser(user) or storage.getUserByUsername(username)

  app.get("/api/nearmap/health", (_req: Request, res: Response) => {
    if (!process.env.NEARMAP_API_KEY) {
      return res.status(503).json({ message: "NEARMAP_API_KEY not configured" });
    }

    return res.status(200).json({ status: "ok" });
  });

  app.get(
    "/api/nearmap/tiles/:z/:x/:y.:format",
    async (req: Request, res: Response): Promise<void> => {
      const apiKey = process.env.NEARMAP_API_KEY;

      if (!apiKey) {
        res.status(503).json({ message: "Nearmap API key not configured" });
        return;
      }

      const { z, x, y, format } = req.params;
      const tileUrl = `${NEARMAP_TILE_BASE}/${z}/${x}/${y}.${format}?apikey=${encodeURIComponent(apiKey)}`;

      try {
        const response = await fetch(tileUrl);

        if (!response.ok || !response.body) {
          const statusMessage = `Nearmap responded with status ${response.status}`;
          log(statusMessage, "nearmap");
          res.status(response.status).json({ message: statusMessage });
          return;
        }

        res.setHeader("Content-Type", response.headers.get("content-type") ?? "image/jpeg");
        const cacheControl =
          response.headers.get("cache-control") ?? "public, max-age=86400, stale-while-revalidate=43200";
        res.setHeader("Cache-Control", cacheControl);

        Readable.fromWeb(response.body as any).pipe(res);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        log(`[Nearmap] Failed to proxy tile ${z}/${x}/${y}: ${message}`, "nearmap");
        res.status(502).json({ message: "Failed to fetch Nearmap tile" });
      }
    }
  );

  const httpServer = createServer(app);

  return httpServer;
}
