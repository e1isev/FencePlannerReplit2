import type { Request, Response } from "express";
import crypto from "node:crypto";
import { LRUCache } from "lru-cache";
import pLimit from "p-limit";
import { fetch } from "undici";
import { log } from "./vite";

const NEARMAP_TILE_BASE = "https://api.nearmap.com/tiles/v3/Vert";

const BLANK_TILE_JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCABAAEADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/AP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCj//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bj//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bj//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cj//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8Bj//Z";

const BLANK_TILE_JPEG = Buffer.from(BLANK_TILE_JPEG_BASE64, "base64");

const METRIC_LOG_INTERVAL_MS = 30_000;
const METRIC_WINDOW_MS = 60_000;

interface CachedTile {
  bytes: Buffer;
  etag: string;
  ttlSeconds: number;
}

const cache = new LRUCache<string, CachedTile>({
  maxSize: 150 * 1024 * 1024,
  sizeCalculation: (value: CachedTile) => value.bytes.length,
  ttl: 24 * 60 * 60 * 1000,
});

const inFlight = new Map<string, Promise<CachedTile>>();
const limit = pLimit(8);

const metrics = {
  totalRequests: 0,
  upstreamFetches: 0,
  blankTiles: 0,
  upstreamErrors: 0,
};

let metricsWindowStart = Date.now();

setInterval(() => {
  const now = Date.now();
  const elapsedSeconds = Math.max(1, Math.floor((now - metricsWindowStart) / 1000));
  const minutes = elapsedSeconds / 60;

  const perMinute = (count: number) => Math.round(count / Math.max(minutes, 1 / 60));

  log(
    `[NearmapTileProxy] requests=${perMinute(metrics.totalRequests)}/min ` +
      `upstream=${perMinute(metrics.upstreamFetches)}/min blanks=${perMinute(metrics.blankTiles)}/min ` +
      `errors=${perMinute(metrics.upstreamErrors)}/min`,
    "nearmap"
  );

  if (now - metricsWindowStart >= METRIC_WINDOW_MS) {
    metrics.totalRequests = 0;
    metrics.upstreamFetches = 0;
    metrics.blankTiles = 0;
    metrics.upstreamErrors = 0;
    metricsWindowStart = now;
  }
}, METRIC_LOG_INTERVAL_MS);

function makeEtag(buf: Buffer) {
  const hash = crypto.createHash("sha1").update(buf).digest("hex");
  return `"${hash}"`;
}

function sendCachedTile(req: Request, res: Response, cached: CachedTile) {
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Cache-Control", `public, max-age=${cached.ttlSeconds}, immutable`);
  res.setHeader("ETag", cached.etag);

  const inm = req.headers["if-none-match"];
  if (inm && inm === cached.etag) {
    res.status(304).end();
    return;
  }

  res.status(200).send(cached.bytes);
}

async function fetchUpstreamTile(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (response.status === 404) {
      metrics.blankTiles += 1;
      const bytes = BLANK_TILE_JPEG;
      return {
        bytes,
        etag: makeEtag(bytes),
        ttlSeconds: 365 * 24 * 60 * 60,
      } satisfies CachedTile;
    }

    if (!response.ok) {
      throw new Error(`Nearmap upstream error, status ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const bytes = Buffer.from(arrayBuffer);

    return {
      bytes,
      etag: makeEtag(bytes),
      ttlSeconds: 24 * 60 * 60,
    } satisfies CachedTile;
  } finally {
    clearTimeout(timeout);
  }
}

export async function handleNearmapTile(req: Request, res: Response) {
  metrics.totalRequests += 1;

  const apiKey = process.env.NEARMAP_API_KEY;

  if (!apiKey) {
    res.status(503).json({ message: "Nearmap API key not configured" });
    return;
  }

  const { z, x, y, format } = req.params as Record<string, string>;
  const cacheKey = `${z}/${x}/${y}.${format}`;

  const cached = cache.get(cacheKey);
  if (cached) {
    sendCachedTile(req, res, cached);
    return;
  }

  const existing = inFlight.get(cacheKey);
  if (existing) {
    const tile = await existing;
    cache.set(cacheKey, tile, { ttl: tile.ttlSeconds * 1000 });
    sendCachedTile(req, res, tile);
    return;
  }

  const upstreamUrl = `${NEARMAP_TILE_BASE}/${z}/${x}/${y}.${format}?apikey=${encodeURIComponent(apiKey)}`;

  const upstreamPromise = limit(async () => {
    metrics.upstreamFetches += 1;
    return fetchUpstreamTile(upstreamUrl);
  })
    .then((tile) => {
      cache.set(cacheKey, tile, { ttl: tile.ttlSeconds * 1000 });
      return tile;
    })
    .catch((error) => {
      metrics.upstreamErrors += 1;
      throw error;
    })
    .finally(() => {
      inFlight.delete(cacheKey);
    });

  inFlight.set(cacheKey, upstreamPromise);

  try {
    const tile = await upstreamPromise;
    sendCachedTile(req, res, tile);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    log(`[Nearmap] Failed to proxy tile ${cacheKey}: ${message}`, "nearmap");
    res.status(502).json({ message: "Failed to fetch Nearmap tile" });
  }
}
