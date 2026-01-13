import type { Request, Response } from "express";
import { readFile } from "fs/promises";
import path from "path";

type PricingCatalogItem = {
  name: string;
  sku: string;
  unitPrice: number;
};

type PricingCatalogResponse = {
  updatedAtIso: string;
  items: PricingCatalogItem[];
};

type PricingCatalogStatus = {
  ok: boolean;
  source: "upstream" | "cache" | "local";
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorStatus: number | null;
  lastErrorMessage: string | null;
  catalogueRowCount: number;
};

type PricingCatalogFetchResult = {
  catalog: PricingCatalogResponse;
  source: "upstream" | "cache" | "local";
};

type PricingCatalogError = Error & { status?: number };

const CACHE_TTL_MS = 10 * 60 * 1000;
const UPSTREAM_TIMEOUT_MS = 10 * 1000;
const LOCAL_CATALOG_PATH = path.resolve(process.cwd(), "pricing-catalog.local.json");

const catalogCache = {
  data: null as PricingCatalogResponse | null,
  fetchedAt: 0,
  lastSuccessAt: null as string | null,
  lastErrorAt: null as string | null,
  lastErrorStatus: null as number | null,
  lastErrorMessage: null as string | null,
  lastSource: null as PricingCatalogStatus["source"] | null,
};

const parseCsvRows = (csvText: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i += 1) {
    const char = csvText[i];
    const next = csvText[i + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        field += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      row.push(field);
      if (row.length > 1 || row.some((cell) => cell.trim().length > 0)) {
        rows.push(row);
      }
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
};

const parsePricingItems = (csvText: string): PricingCatalogItem[] => {
  const rows = parseCsvRows(csvText);

  return rows
    .map((row) => {
      const name = (row[0] ?? "").trim();
      const sku = (row[1] ?? "").trim();
      const rawPrice = (row[2] ?? "").trim();
      const normalizedPrice = rawPrice.replace(/[$,\s]/g, "");
      const unitPrice = Number.parseFloat(normalizedPrice);

      if (!sku || !Number.isFinite(unitPrice)) {
        return null;
      }

      return {
        name,
        sku,
        unitPrice,
      };
    })
    .filter((item): item is PricingCatalogItem => item !== null);
};

const normalizeCatalogItems = (items: PricingCatalogItem[]): PricingCatalogItem[] =>
  items.filter(
    (item) =>
      item &&
      typeof item.sku === "string" &&
      item.sku.trim().length > 0 &&
      typeof item.unitPrice === "number" &&
      Number.isFinite(item.unitPrice)
  );

const loadLocalCatalog = async (): Promise<PricingCatalogResponse | null> => {
  try {
    const raw = await readFile(LOCAL_CATALOG_PATH, "utf-8");
    const parsed = JSON.parse(raw) as PricingCatalogResponse;
    if (!parsed?.items || !Array.isArray(parsed.items)) {
      return null;
    }
    return {
      updatedAtIso: parsed.updatedAtIso ?? new Date().toISOString(),
      items: normalizeCatalogItems(parsed.items),
    };
  } catch (error) {
    if (typeof error === "object" && error && "code" in error) {
      const code = (error as { code?: string }).code;
      if (code === "ENOENT") {
        return null;
      }
    }
    console.warn("Failed to read local pricing catalog.", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return null;
  }
};

const buildUpstreamError = (message: string, status?: number): PricingCatalogError => {
  const error = new Error(message) as PricingCatalogError;
  if (status) {
    error.status = status;
  }
  return error;
};

const fetchPricingCatalog = async (): Promise<PricingCatalogResponse> => {
  const sheetId = process.env.PRICING_SHEET_ID;
  const sheetGid = process.env.PRICING_SHEET_GID;

  if (!sheetId || !sheetGid) {
    throw buildUpstreamError("Pricing sheet environment variables are not configured.", 503);
  }

  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${sheetGid}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  let response: globalThis.Response;

  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error while fetching catalog.";
    console.warn("Pricing catalog upstream request failed.", {
      url,
      message,
    });
    throw buildUpstreamError(message, 502);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    console.warn("Pricing catalog upstream returned error response.", {
      url,
      status: response.status,
      statusText: response.statusText,
    });
    throw buildUpstreamError(`Failed to fetch pricing catalog (${response.status}).`, response.status);
  }

  const csvText = await response.text();
  const items = parsePricingItems(csvText);

  return {
    updatedAtIso: new Date().toISOString(),
    items,
  };
};

export const getPricingCatalog = async (): Promise<PricingCatalogFetchResult> => {
  const now = Date.now();
  if (catalogCache.data && now - catalogCache.fetchedAt < CACHE_TTL_MS) {
    catalogCache.lastSource = "cache";
    return { catalog: catalogCache.data, source: "cache" };
  }

  try {
    const catalog = await fetchPricingCatalog();
    catalogCache.data = catalog;
    catalogCache.fetchedAt = now;
    catalogCache.lastSuccessAt = new Date().toISOString();
    catalogCache.lastErrorAt = null;
    catalogCache.lastErrorStatus = null;
    catalogCache.lastErrorMessage = null;
    catalogCache.lastSource = "upstream";
    return { catalog, source: "upstream" };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error while fetching catalog.";
    const status =
      typeof error === "object" && error && "status" in error
        ? Number((error as PricingCatalogError).status)
        : null;
    catalogCache.lastErrorAt = new Date().toISOString();
    catalogCache.lastErrorStatus = Number.isFinite(status ?? NaN) ? status : null;
    catalogCache.lastErrorMessage = message;
    console.warn("Pricing catalog fetch failed; attempting fallback.", {
      message,
      status: catalogCache.lastErrorStatus,
    });
    if (catalogCache.data) {
      catalogCache.lastSource = "cache";
      return { catalog: catalogCache.data, source: "cache" };
    }
    const localCatalog = await loadLocalCatalog();
    if (localCatalog) {
      catalogCache.data = localCatalog;
      catalogCache.fetchedAt = now;
      catalogCache.lastSuccessAt = new Date().toISOString();
      catalogCache.lastSource = "local";
      return { catalog: localCatalog, source: "local" };
    }
    throw error;
  }
};

export const handlePricingCatalog = async (_req: Request, res: Response) => {
  try {
    const { catalog } = await getPricingCatalog();
    return res.status(200).json(catalog);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load pricing catalog.";
    const status =
      typeof error === "object" && error && "status" in error
        ? Number((error as PricingCatalogError).status)
        : 502;
    const safeStatus = Number.isFinite(status) && status >= 500 ? status : 502;
    return res.status(safeStatus).json({ message });
  }
};

export const getPricingCatalogStatus = (): PricingCatalogStatus => ({
  ok: Boolean(catalogCache.data),
  source: catalogCache.lastSource ?? "cache",
  lastSuccessAt: catalogCache.lastSuccessAt,
  lastErrorAt: catalogCache.lastErrorAt,
  lastErrorStatus: catalogCache.lastErrorStatus,
  lastErrorMessage: catalogCache.lastErrorMessage,
  catalogueRowCount: catalogCache.data?.items.length ?? 0,
});

export const handlePricingCatalogStatus = (_req: Request, res: Response) => {
  res.status(200).json(getPricingCatalogStatus());
};
