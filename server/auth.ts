import { randomBytes, scryptSync, timingSafeEqual, createHash, randomUUID } from "crypto";
import type { Request } from "express";
import { and, eq, lt } from "drizzle-orm";
import { db } from "./db";
import { sessions, users } from "./db/schema";

const SESSION_COOKIE_NAME = "fp_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

const parseCookies = (header?: string) => {
  if (!header) return {} as Record<string, string>;
  return header.split(";").reduce<Record<string, string>>((acc, part) => {
    const [key, ...rest] = part.trim().split("=");
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});
};

const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export const hashPassword = (password: string) => {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
};

export const verifyPassword = (password: string, stored: string) => {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = scryptSync(password, salt, 64);
  const storedHash = Buffer.from(hash, "hex");
  if (storedHash.length !== derived.length) return false;
  return timingSafeEqual(storedHash, derived);
};

export const createSession = async (userId: string) => {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;

  await db.insert(sessions).values({
    id: randomUUID(),
    userId,
    tokenHash,
    createdAt: now,
    expiresAt,
  });

  return { token, expiresAt };
};

export const clearSession = async (token?: string) => {
  if (!token) return;
  const tokenHash = hashToken(token);
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
};

export const getSessionUser = async (req: Request) => {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) return null;

  const tokenHash = hashToken(token);
  const now = Date.now();
  const session = await db
    .select()
    .from(sessions)
    .where(eq(sessions.tokenHash, tokenHash))
    .get();

  if (!session) return null;
  if (session.expiresAt < now) {
    await db.delete(sessions).where(eq(sessions.id, session.id));
    return null;
  }

  const user = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .get();
  if (!user) return null;

  return { user, token };
};

export const pruneExpiredSessions = async () => {
  const now = Date.now();
  await db.delete(sessions).where(lt(sessions.expiresAt, now));
};

export const getSessionCookieName = () => SESSION_COOKIE_NAME;

export const getSessionMaxAge = () => SESSION_TTL_MS;
