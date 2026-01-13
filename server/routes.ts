import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { handleNearmapTile } from "./nearmapTileProxy";
import { log } from "./vite";
import { handlePricingCatalog, handlePricingCatalogStatus } from "./pricingCatalog";
import { handlePricingResolve } from "./pricingResolve";
import { getCatalogVersion, getRuleSetVersion, getSkuMappings } from "./versioning";
import { z } from "zod";
import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { initDb, db } from "./db";
import { projects, users } from "./db/schema";
import {
  createSession,
  clearSession,
  getSessionCookieName,
  getSessionUser,
  hashPassword,
  pruneExpiredSessions,
  verifyPassword,
} from "./auth";
import {
  projectSnapshotV1Schema,
  projectTypeSchema,
  type ProjectType,
} from "@shared/projectSnapshot";

export async function registerRoutes(app: Express): Promise<Server> {
  // put application routes here
  // prefix all routes with /api

  // use storage to perform CRUD operations on the storage interface
  // e.g. storage.insertUser(user) or storage.getUserByUsername(username)
  initDb();
  void pruneExpiredSessions();

  app.get("/api/nearmap/health", (_req: Request, res: Response) => {
    if (!process.env.NEARMAP_API_KEY) {
      return res.status(503).json({ message: "NEARMAP_API_KEY not configured" });
    }

    return res.status(200).json({ status: "ok" });
  });

  app.get("/api/nearmap/tiles/:z/:x/:y.:format", handleNearmapTile);
  app.get("/api/pricing/catalog", handlePricingCatalog);
  app.get("/api/pricing-catalog/status", handlePricingCatalogStatus);
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

  const authSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
  });

  app.post("/api/auth/register", async (req: Request, res: Response) => {
    const parsed = authSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid registration details." });
    }

    const { email, password } = parsed.data;
    const existing = await db.select().from(users).where(eq(users.email, email)).get();
    if (existing) {
      return res.status(409).json({ message: "Email already registered." });
    }

    const now = Date.now();
    const userId = randomUUID();
    await db.insert(users).values({
      id: userId,
      email,
      passwordHash: hashPassword(password),
      createdAt: now,
      updatedAt: now,
    });

    const { token, expiresAt } = await createSession(userId);
    res.cookie(getSessionCookieName(), token, {
      httpOnly: true,
      sameSite: "lax",
      secure: app.get("env") === "production",
      maxAge: expiresAt - now,
    });

    return res.status(201).json({ id: userId, email });
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const parsed = authSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid login details." });
    }

    const { email, password } = parsed.data;
    const user = await db.select().from(users).where(eq(users.email, email)).get();
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const now = Date.now();
    const { token, expiresAt } = await createSession(user.id);
    res.cookie(getSessionCookieName(), token, {
      httpOnly: true,
      sameSite: "lax",
      secure: app.get("env") === "production",
      maxAge: expiresAt - now,
    });

    return res.status(200).json({ id: user.id, email: user.email });
  });

  app.post("/api/auth/logout", async (req: Request, res: Response) => {
    const session = await getSessionUser(req);
    if (session?.token) {
      await clearSession(session.token);
    }
    res.clearCookie(getSessionCookieName());
    return res.status(200).json({ ok: true });
  });

  app.get("/api/auth/me", async (req: Request, res: Response) => {
    const session = await getSessionUser(req);
    if (!session) {
      return res.status(401).json({ message: "Not authenticated." });
    }
    return res.status(200).json({ id: session.user.id, email: session.user.email });
  });

  const requireAuth = async (req: Request, res: Response, next: () => void) => {
    const session = await getSessionUser(req);
    if (!session) {
      return res.status(401).json({ message: "Authentication required." });
    }
    (req as Request & { userId?: string }).userId = session.user.id;
    return next();
  };

  const normalizeProjectType = (value: string): ProjectType => {
    switch (value) {
      case "residential_fencing":
        return "residential";
      case "rural_fencing":
        return "rural";
      case "decking":
      case "residential":
      case "rural":
      case "titan_rail":
        return value;
      default:
        return "residential";
    }
  };

  const createProjectSchema = z.object({
    name: z.string().min(1),
    projectType: projectTypeSchema,
    snapshot: projectSnapshotV1Schema,
  });

  const updateProjectSchema = z.object({
    name: z.string().min(1).optional(),
    snapshot: projectSnapshotV1Schema.optional(),
  });

  app.get("/api/projects", requireAuth, async (req: Request, res: Response) => {
    const userId = (req as Request & { userId?: string }).userId!;
    const items = await db
      .select()
      .from(projects)
      .where(eq(projects.userId, userId))
      .all();
    const response = items.map((project) => ({
      id: project.id,
      name: project.name,
      projectType: normalizeProjectType(project.type),
      updatedAt: new Date(project.updatedAt).toISOString(),
    }));
    return res.status(200).json(response);
  });

  app.post("/api/projects", requireAuth, async (req: Request, res: Response) => {
    const parsed = createProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid project payload." });
    }
    const userId = (req as Request & { userId?: string }).userId!;
    const now = Date.now();
    const projectId = randomUUID();
    await db.insert(projects).values({
      id: projectId,
      userId,
      name: parsed.data.name,
      type: parsed.data.projectType,
      dataJson: JSON.stringify(parsed.data.snapshot),
      createdAt: now,
      updatedAt: now,
    });
    return res.status(201).json({ id: projectId });
  });

  app.get("/api/projects/:projectId", requireAuth, async (req: Request, res: Response) => {
    const userId = (req as Request & { userId?: string }).userId!;
    const project = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, req.params.projectId), eq(projects.userId, userId)))
      .get();
    if (!project) {
      return res.status(404).json({ message: "Project not found." });
    }
    return res.status(200).json({
      id: project.id,
      name: project.name,
      projectType: normalizeProjectType(project.type),
      snapshot: JSON.parse(project.dataJson),
      updatedAt: new Date(project.updatedAt).toISOString(),
    });
  });

  app.put("/api/projects/:projectId", requireAuth, async (req: Request, res: Response) => {
    const parsed = updateProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid project payload." });
    }
    const userId = (req as Request & { userId?: string }).userId!;
    const project = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, req.params.projectId), eq(projects.userId, userId)))
      .get();
    if (!project) {
      return res.status(404).json({ message: "Project not found." });
    }
    const now = Date.now();
    await db
      .update(projects)
      .set({
        name: parsed.data.name ?? project.name,
        dataJson: parsed.data.snapshot ? JSON.stringify(parsed.data.snapshot) : project.dataJson,
        updatedAt: now,
      })
      .where(eq(projects.id, project.id));
    return res.status(200).json({ updatedAt: new Date(now).toISOString() });
  });

  app.delete("/api/projects/:projectId", requireAuth, async (req: Request, res: Response) => {
    const userId = (req as Request & { userId?: string }).userId!;
    const project = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, req.params.projectId), eq(projects.userId, userId)))
      .get();
    if (!project) {
      return res.status(404).json({ message: "Project not found." });
    }
    await db.delete(projects).where(eq(projects.id, project.id));
    return res.status(200).json({ ok: true });
  });

  const httpServer = createServer(app);

  return httpServer;
}
