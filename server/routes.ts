import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { handleNearmapTile } from "./nearmapTileProxy";
import { log } from "./vite";
import { handlePricingCatalog } from "./pricingCatalog";
import { handlePricingResolve } from "./pricingResolve";
import { projectStore } from "./projectStore";
import { getCatalogVersion, getRuleSetVersion, getSkuMappings } from "./versioning";
import type { ProjectSnapshot } from "@shared/project";

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
  app.get("/api/pricing/catalog", handlePricingCatalog);
  app.post("/api/pricing/resolve", handlePricingResolve);

  app.get("/api/catalog/version", (_req: Request, res: Response) => {
    res.status(200).json({ catalogVersion: getCatalogVersion() });
  });

  app.get("/api/rules/version", (_req: Request, res: Response) => {
    res.status(200).json({ ruleSetVersion: getRuleSetVersion() });
  });

  app.get("/api/catalog/mappings", (_req: Request, res: Response) => {
    res.status(200).json(getSkuMappings());
  });

  app.post("/api/projects", (req: Request, res: Response) => {
    const name = (req.body?.name as string | undefined) ?? "Untitled deck";
    const project = projectStore.createProject(name);
    res.status(201).json({ projectId: project.projectId });
  });

  app.get("/api/projects", (_req: Request, res: Response) => {
    const projects = projectStore.listProjects().map((project) => ({
      projectId: project.projectId,
      name: project.name,
      updatedAt: project.updatedAt,
      thumbnailUrl: null,
    }));
    res.status(200).json(projects);
  });

  app.get("/api/projects/:projectId", (req: Request, res: Response) => {
    const project = projectStore.getProject(req.params.projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found." });
    }
    const latestRevision = project.revisions[project.revisions.length - 1];
    if (!latestRevision) {
      return res.status(404).json({ message: "No revisions found." });
    }
    return res.status(200).json({
      ...latestRevision.snapshot,
      projectId: project.projectId,
      revisionId: latestRevision.revisionId,
    });
  });

  app.get("/api/projects/:projectId/revisions/:revisionId", (req: Request, res: Response) => {
    const project = projectStore.getProject(req.params.projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found." });
    }
    const revision = project.revisions.find((rev) => rev.revisionId === req.params.revisionId);
    if (!revision) {
      return res.status(404).json({ message: "Revision not found." });
    }
    return res.status(200).json({
      ...revision.snapshot,
      projectId: project.projectId,
      revisionId: revision.revisionId,
    });
  });

  app.get("/api/projects/:projectId/revisions", (req: Request, res: Response) => {
    const project = projectStore.getProject(req.params.projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found." });
    }
    const revisions = project.revisions
      .map((rev) => ({
        revisionId: rev.revisionId,
        savedAt: rev.savedAt,
      }))
      .reverse();
    return res.status(200).json(revisions);
  });

  app.post("/api/projects/:projectId/revisions", (req: Request, res: Response) => {
    const project = projectStore.getProject(req.params.projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found." });
    }
    const snapshot = req.body as ProjectSnapshot;
    const catalogVersion = getCatalogVersion();
    const ruleSetVersion = getRuleSetVersion();
    const revision = projectStore.saveRevision(project.projectId, snapshot, catalogVersion, ruleSetVersion);
    return res.status(201).json({
      revisionId: revision.revisionId,
      savedAt: revision.savedAt,
      catalogVersion,
      ruleSetVersion,
    });
  });

  const httpServer = createServer(app);

  return httpServer;
}
