import type { Request, Response } from "express";
import crypto from "node:crypto";
import { LRUCache } from "lru-cache";
import pLimit from "p-limit";
import { fetch } from "undici";
import { log } from "./vite";

const NEARMAP_TILE_BASE = "https://api.nearmap.com/tiles/v3/Vert";
const NEARMAP_MIN_ZOOM = 3;
const NEARMAP_MAX_ZOOM = 21;
const MIN_VALID_IMAGE_BYTES = 1000;
const TRANSPARENT_TILE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAAABFUlEQVR4nO3BMQEAAADCoPVP7WsIoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAeAMBPAABPO1TCQAAAABJRU5ErkJggg==";

const TRANSPARENT_TILE_PNG = Buffer.from(TRANSPARENT_TILE_PNG_BASE64, "base64");
const TRANSPARENT_TILE_TTL_SECONDS = 24 * 60 * 60; // 1 day
const IMAGE_TILE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

const METRIC_LOG_INTERVAL_MS = 30_000;
const METRIC_WINDOW_MS = 60_000;

interface CachedTile {
  bytes: Buffer;
  contentType: string;
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

const loggedUpstreamFailures = new Set<string>();

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
  res.setHeader("Content-Type", cached.contentType);
  res.setHeader("Cache-Control", `public, max-age=${cached.ttlSeconds}, immutable`);
  res.setHeader("ETag", cached.etag);

  const inm = req.headers["if-none-match"];
  if (inm && inm === cached.etag) {
    res.status(304).end();
    return;
  }

  res.status(200).send(cached.bytes);
}

type TileFetchOutcome =
  | { type: "image"; tile: CachedTile }
  | { type: "missing"; tile: CachedTile };

type FetchFailureReason = "auth" | "rate-limit" | "server" | "invalid";

class TileFetchError extends Error {
  constructor(
    message: string,
    public readonly reason: FetchFailureReason,
    public readonly status: number,
    public readonly retryAfter?: string | null,
    public readonly bodySnippet?: string | null
  ) {
    super(message);
  }
}

function transparentTile(): CachedTile {
  return {
    bytes: TRANSPARENT_TILE_PNG,
    contentType: "image/png",
    etag: makeEtag(TRANSPARENT_TILE_PNG),
    ttlSeconds: TRANSPARENT_TILE_TTL_SECONDS,
  } satisfies CachedTile;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchUpstreamTile(
  url: string,
  coords: { z: number; x: number; y: number }
): Promise<TileFetchOutcome> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

    log(
      `[NearmapTileProxy] z=${coords.z} x=${coords.x} y=${coords.y} status=${response.status} ` +
        `content-type=${contentType || "unknown"} url=${url}`,
      "nearmap"
    );

    if (response.status === 404) {
      metrics.blankTiles += 1;
      return { type: "missing", tile: transparentTile() };
    }

    if (response.status === 400) {
      metrics.blankTiles += 1;
      return { type: "missing", tile: transparentTile() };
    }

    if (response.status === 401 || response.status === 403) {
      throw new TileFetchError("Nearmap upstream auth failed", "auth", response.status);
    }

    if (response.status === 429) {
      throw new TileFetchError(
        "Nearmap rate limited",
        "rate-limit",
        response.status,
        response.headers.get("retry-after")
      );
    }

    if (response.status >= 500) {
      throw new TileFetchError("Nearmap upstream server error", "server", response.status);
    }

    if (!response.ok) {
      let bodySnippet: string | null = null;
      try {
        bodySnippet = (await response.text()).slice(0, 500);
      } catch {
        bodySnippet = null;
      }
      throw new TileFetchError(
        `Unexpected Nearmap status ${response.status}`,
        "invalid",
        response.status,
        undefined,
        bodySnippet
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const bytes = Buffer.from(arrayBuffer);
    const loggedContentType = contentType || "unknown";

    log(
      `[NearmapTileProxy] z=${coords.z} x=${coords.x} y=${coords.y} status=${response.status} ` +
        `content-type=${loggedContentType} bytes=${bytes.length} url=${url}`,
      "nearmap"
    );

    const isImage = contentType.startsWith("image/");
    if (!isImage || bytes.length < MIN_VALID_IMAGE_BYTES) {
      const snippet = isImage ? null : bytes.toString("utf-8").slice(0, 500);
      throw new TileFetchError(
        "Upstream tile content invalid",
        "invalid",
        response.status,
        undefined,
        snippet
      );
    }

    const etag = makeEtag(bytes);

    return {
      type: "image",
      tile: {
        bytes,
        contentType,
        etag,
        ttlSeconds: IMAGE_TILE_TTL_SECONDS,
      },
    } satisfies TileFetchOutcome;
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

  const zNum = Number(z);
  const xNum = Number(x);
  const yNum = Number(y);
  const normalizedFormat = (format ?? "jpg").toLowerCase();

  if (!Number.isInteger(zNum) || !Number.isInteger(xNum) || !Number.isInteger(yNum)) {
    res.status(400).json({ message: "Invalid tile coordinates" });
    return;
  }

  if (zNum < NEARMAP_MIN_ZOOM) {
    res
      .status(400)
      .json({ message: `Zoom level below Nearmap minimum ${NEARMAP_MIN_ZOOM}` });
    return;
  }

  if (zNum > NEARMAP_MAX_ZOOM) {
    res.status(400).json({ message: `Zoom level exceeds Nearmap max ${NEARMAP_MAX_ZOOM}` });
    return;
  }

  const maxIndex = Math.pow(2, zNum);
  if (xNum < 0 || yNum < 0 || xNum >= maxIndex || yNum >= maxIndex) {
    res.status(400).json({ message: "Tile coordinates out of range" });
    return;
  }

  if (!normalizedFormat.match(/^(jpg|jpeg|png)$/)) {
    res.status(400).json({ message: "Unsupported tile format" });
    return;
  }

  const cacheKey = `${zNum}/${xNum}/${yNum}.${normalizedFormat}`;

  const cached = cache.get(cacheKey);
  if (cached) {
    sendCachedTile(req, res, cached);
    return;
  }

  const existing = inFlight.get(cacheKey);
  if (existing) {
    try {
      const tile = await existing;
      cache.set(cacheKey, tile, { ttl: tile.ttlSeconds * 1000 });
      sendCachedTile(req, res, tile);
      return;
    } catch {
      // If the in-flight request failed, fall through to start a new fetch.
    }
  }

  const upstreamUrl = `${NEARMAP_TILE_BASE}/${zNum}/${xNum}/${yNum}.${normalizedFormat}?apikey=${encodeURIComponent(apiKey)}`;

  const upstreamPromise = limit(async () => {
    metrics.upstreamFetches += 1;

    const maxRetries = 2;
    const retryDelays = [200, 600];

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await fetchUpstreamTile(upstreamUrl, { z: zNum, x: xNum, y: yNum });
        cache.set(cacheKey, result.tile, { ttl: result.tile.ttlSeconds * 1000 });
        return result.tile;
      } catch (error) {
        if (
          error instanceof TileFetchError &&
          (error.reason === "rate-limit" || error.reason === "server") &&
          attempt < maxRetries
        ) {
          const delay = retryDelays[attempt] ?? retryDelays[retryDelays.length - 1];
          await wait(delay);
          continue;
        }
        throw error;
      }
    }

    throw new TileFetchError("Failed to fetch tile", "invalid", 500);
  }).finally(() => {
    inFlight.delete(cacheKey);
  });

  inFlight.set(cacheKey, upstreamPromise);

  try {
    const tile = await upstreamPromise;
    sendCachedTile(req, res, tile);
    return;
  } catch (error) {
    metrics.upstreamErrors += 1;
    const fetchError = error as TileFetchError;
    const message = fetchError instanceof Error ? fetchError.message : "Unknown error";

    const logKey = `${cacheKey}:${fetchError instanceof TileFetchError ? fetchError.status : "unknown"}`;
    if (!loggedUpstreamFailures.has(logKey)) {
      loggedUpstreamFailures.add(logKey);
      log(
        `[Nearmap] Failed to proxy tile ${cacheKey}: ${message} ` +
          `status=${fetchError instanceof TileFetchError ? fetchError.status : "n/a"} ` +
          `body=${fetchError instanceof TileFetchError ? fetchError.bodySnippet ?? "<empty>" : "n/a"} ` +
          `url=${upstreamUrl}`,
        "nearmap"
      );
    }

    if (fetchError instanceof TileFetchError) {
      if (fetchError.reason === "auth") {
        res.status(502).json({ error: "Upstream auth failed" });
        return;
      }

      if (fetchError.reason === "rate-limit") {
        if (fetchError.retryAfter) {
          res.setHeader("Retry-After", fetchError.retryAfter);
        }
        res.setHeader("Cache-Control", "no-store");
        res.status(503).json({ error: "Upstream rate limited" });
        return;
      }

      if (fetchError.reason === "server") {
        res.setHeader("Cache-Control", "no-store");
        res.status(502).json({ error: "Upstream server error" });
        return;
      }
    }

    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ error: "Failed to fetch Nearmap tile" });
  }
}
