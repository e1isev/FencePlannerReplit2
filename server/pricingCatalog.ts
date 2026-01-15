import type { Request, Response } from "express";
import { readFile } from "fs/promises";
import path from "path";

type PricingCatalogItem = {
  name: string;
  sku: string;
  unitPrice: number | string;
  category?: string;
  style?: string;
  colour?: string;
  height?: string | number;
  postType?: string;
  gateType?: string;
  gateWidth?: string | number;
};

type PricingCatalogResponse = {
  updatedAtIso: string;
  items: PricingCatalogItem[];
};

type PricingCatalogStatus = {
  ok: boolean;
  source: "upstream" | "cache" | "seed" | "none";
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorStatus: number | null;
  lastErrorMessage: string | null;
  lastValidationError: PricingCatalogValidationError | null;
  catalogueRowCount: number;
  upstreamHost: string | null;
};

type PricingCatalogFetchResult = {
  catalog: PricingCatalogResponse;
  source: "upstream" | "cache" | "seed";
};

type PricingCatalogError = Error & { status?: number };
type PricingCatalogValidationError = {
  ok: false;
  reason: "EMPTY" | "BAD_SHAPE" | "MISSING_FIELDS";
  details?: Record<string, unknown>;
};
type PricingCatalogValidationResult =
  | { ok: true; rows: number }
  | PricingCatalogValidationError;

const CACHE_TTL_MS = 10 * 60 * 1000;
const UPSTREAM_TIMEOUT_MS = 10 * 1000;
const SEED_CATALOG_PATH = path.resolve(
  process.cwd(),
  "server",
  "data",
  "pricingCatalogSeed.json"
);

const catalogCache = {
  data: null as PricingCatalogResponse | null,
  fetchedAt: 0,
  lastAttemptAt: null as string | null,
  lastSuccessAt: null as string | null,
  lastErrorAt: null as string | null,
  lastErrorStatus: null as number | null,
  lastErrorMessage: null as string | null,
  lastValidationError: null as PricingCatalogValidationError | null,
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

const normalizeHeader = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const parsePricingItems = (csvText: string): PricingCatalogItem[] => {
  const rows = parseCsvRows(csvText);
  if (rows.length === 0) return [];

  const headerRow = rows[0] ?? [];
  const headers = headerRow.map((cell) => normalizeHeader(cell));
  const headerMap = new Map<string, number>();
  headers.forEach((header, index) => headerMap.set(header, index));

  const getCell = (row: string[], keys: string[]) => {
    for (const key of keys) {
      const normalizedKey = normalizeHeader(key);
      const idx = headerMap.get(normalizedKey);
      if (idx !== undefined) {
        return row[idx] ?? "";
      }
    }
    return "";
  };

  const items: PricingCatalogItem[] = [];
  rows.slice(1).forEach((row) => {
    const name = getCell(row, ["[Line Items] Name", "Line Items Name", "Name"]).trim();
    const sku = getCell(row, ["[Line Items] SKU", "Line Items SKU", "SKU"]).trim();
    const rawPrice = getCell(row, [
      "[Line Items] Unit price",
      "Line Items Unit price",
      "Unit price",
      "Unit Price",
      "Price",
    ]).trim();
    const unitPrice = rawPrice ? rawPrice : "";

    if (!sku && !rawPrice && !name) {
      return;
    }

    const item: PricingCatalogItem = {
      name,
      sku,
      unitPrice,
      category: getCell(row, ["Category"]),
      style: getCell(row, ["Style"]),
      colour: getCell(row, ["Colour", "Color"]),
      height: getCell(row, ["Height"]),
      postType: getCell(row, ["PostType", "Post Type"]),
      gateType: getCell(row, ["Gate type", "Gate Type", "GateType"]),
      gateWidth: getCell(row, ["Gate width", "Gate Width", "GateWidth"]),
    };

    if (!item.sku || item.unitPrice === "") {
      return;
    }

    items.push(item);
  });

  return items;
};

const validateCatalogue = (catalogue: unknown): PricingCatalogValidationResult => {
  if (!Array.isArray(catalogue)) {
    return { ok: false, reason: "BAD_SHAPE", details: { expected: "array" } };
  }

  let validRows = 0;
  let invalidRows = 0;
  let blankRows = 0;

  catalogue.forEach((row) => {
    if (!row || typeof row !== "object") {
      invalidRows += 1;
      return;
    }

    const sku = typeof row.sku === "string" ? row.sku.trim() : "";
    const rawUnitPrice = (row as { unitPrice?: unknown }).unitPrice;
    const rawUnitPriceText =
      typeof rawUnitPrice === "string" ? rawUnitPrice.trim() : rawUnitPrice;
    const normalizedUnitPrice =
      typeof rawUnitPrice === "string"
        ? rawUnitPrice.replace(/[$,\s]/g, "")
        : rawUnitPrice;
    const unitPrice = Number.parseFloat(String(normalizedUnitPrice ?? ""));
    const hasUnitPrice = Number.isFinite(
      typeof rawUnitPrice === "number" ? rawUnitPrice : unitPrice
    );
    const isBlank =
      !sku &&
      (rawUnitPriceText === undefined ||
        rawUnitPriceText === null ||
        rawUnitPriceText === "");

    if (isBlank) {
      blankRows += 1;
      return;
    }

    if (!sku || !hasUnitPrice) {
      invalidRows += 1;
      return;
    }

    validRows += 1;
  });

  if (invalidRows > 0) {
    return {
      ok: false,
      reason: "MISSING_FIELDS",
      details: { invalidRows, blankRows, validRows },
    };
  }

  if (validRows === 0) {
    return { ok: false, reason: "EMPTY", details: { blankRows } };
  }

  return { ok: true, rows: validRows };
};

const loadSeedCatalog = async (): Promise<PricingCatalogResponse | null> => {
  try {
    const raw = await readFile(SEED_CATALOG_PATH, "utf-8");
    const parsed = JSON.parse(raw) as PricingCatalogResponse;
    if (!parsed?.items || !Array.isArray(parsed.items)) {
      return null;
    }
    const normalizedItems = parsed.items.map((item) => {
      const rawUnitPrice = (item as { unitPrice?: unknown }).unitPrice;
      const normalizedUnitPrice =
        typeof rawUnitPrice === "string"
          ? rawUnitPrice.replace(/[$,\s]/g, "")
          : rawUnitPrice;
      return {
        name: typeof item.name === "string" ? item.name : "",
        sku: typeof item.sku === "string" ? item.sku.trim() : "",
        unitPrice: Number.parseFloat(String(normalizedUnitPrice ?? "")),
      };
    });
    const normalized = {
      updatedAtIso: parsed.updatedAtIso ?? new Date().toISOString(),
      items: normalizedItems,
    };
    const validation = validateCatalogue(normalizedItems);
    if (!validation.ok) {
      console.warn("Seed pricing catalog failed validation.", {
        reason: validation.reason,
        details: validation.details,
      });
      return null;
    }
    return normalized;
  } catch (error) {
    if (typeof error === "object" && error && "code" in error) {
      const code = (error as { code?: string }).code;
      if (code === "ENOENT") {
        return null;
      }
    }
    console.warn("Failed to read seed pricing catalog.", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return null;
  }
};

const getUpstreamHost = () => {
  const sheetId = process.env.PRICING_SHEET_ID;
  const sheetGid = process.env.PRICING_SHEET_GID;
  if (!sheetId || !sheetGid) {
    return null;
  }
  try {
    const url = new URL(
      `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${sheetGid}`
    );
    return url.host;
  } catch {
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
  const upstreamHost = new URL(url).host;
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
      upstreamHost,
      message,
    });
    throw buildUpstreamError(message, 502);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    console.warn("Pricing catalog upstream returned error response.", {
      url,
      upstreamHost,
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
  const nowIso = new Date(now).toISOString();
  catalogCache.lastAttemptAt = nowIso;

  if (catalogCache.data) {
    const cachedValidation = validateCatalogue(catalogCache.data.items);
    if (!cachedValidation.ok) {
      catalogCache.lastValidationError = cachedValidation;
      catalogCache.data = null;
    }
  }

  if (catalogCache.data && now - catalogCache.fetchedAt < CACHE_TTL_MS) {
    const source = catalogCache.lastSource === "seed" ? "seed" : "cache";
    catalogCache.lastSource = source;
    return { catalog: catalogCache.data, source };
  }

  try {
    const catalog = await fetchPricingCatalog();
    const validation = validateCatalogue(catalog.items);
    if (!validation.ok) {
      catalogCache.lastValidationError = validation;
      throw buildUpstreamError("Upstream returned invalid pricing catalog.", 502);
    }
    catalogCache.data = catalog;
    catalogCache.fetchedAt = now;
    catalogCache.lastSuccessAt = nowIso;
    catalogCache.lastErrorAt = null;
    catalogCache.lastErrorStatus = null;
    catalogCache.lastErrorMessage = null;
    catalogCache.lastValidationError = null;
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
      const source = catalogCache.lastSource === "seed" ? "seed" : "cache";
      catalogCache.lastSource = source;
      return { catalog: catalogCache.data, source };
    }
    const seedCatalog = await loadSeedCatalog();
    if (seedCatalog) {
      catalogCache.data = seedCatalog;
      catalogCache.fetchedAt = now;
      catalogCache.lastSuccessAt = nowIso;
      catalogCache.lastSource = "seed";
      return { catalog: seedCatalog, source: "seed" };
    }
    catalogCache.lastSource = "none";
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

export const getPricingCatalogStatus = (): PricingCatalogStatus => {
  const validation = catalogCache.data ? validateCatalogue(catalogCache.data.items) : null;
  const ok = validation?.ok ?? false;
  return {
    ok,
    source: ok ? (catalogCache.lastSource ?? "none") : "none",
    lastAttemptAt: catalogCache.lastAttemptAt,
    lastSuccessAt: catalogCache.lastSuccessAt,
    lastErrorAt: catalogCache.lastErrorAt,
    lastErrorStatus: catalogCache.lastErrorStatus,
    lastErrorMessage: catalogCache.lastErrorMessage,
    lastValidationError: catalogCache.lastValidationError,
    catalogueRowCount: validation && validation.ok ? validation.rows : 0,
    upstreamHost: getUpstreamHost(),
  };
};

export const handlePricingCatalogStatus = (_req: Request, res: Response) => {
  res.status(200).json(getPricingCatalogStatus());
};
