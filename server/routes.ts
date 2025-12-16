import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { handleNearmapTile } from "./nearmapTileProxy";
import { log } from "./vite";

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

  app.get("/api/nearmap/tiles/:z/:x/:y.:format", handleNearmapTile);

  const httpServer = createServer(app);

  return httpServer;
}
