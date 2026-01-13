import type { Request, Response } from "express";

type PricingCatalogItem = {
  name: string;
  sku: string;
  unitPrice: number;
  category?: "residential" | "rural" | null;
};

type PricingCatalogResponse = {
  updatedAtIso: string;
  items: PricingCatalogItem[];
  source?: "live" | "cache" | "stale";
};

const CACHE_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;

let cachedCatalog: PricingCatalogResponse | null = null;
let cachedAt = 0;
let lastGoodCatalog: PricingCatalogResponse | null = null;

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
      const category = (row[3] ?? "").trim().toLowerCase();
      const normalizedPrice = rawPrice.replace(/[$,\s]/g, "");
      const unitPrice = Number.parseFloat(normalizedPrice);

      if (!sku || !Number.isFinite(unitPrice)) {
        return null;
      }

      return {
        name,
        sku,
        unitPrice,
        category:
          category === "residential" || category === "rural"
            ? (category as "residential" | "rural")
            : null,
      };
    })
    .filter((item): item is PricingCatalogItem => item !== null);
};

const fetchPricingCatalog = async (): Promise<PricingCatalogResponse> => {
  const sheetId = process.env.PRICING_SHEET_ID;
  const sheetGid = process.env.PRICING_SHEET_GID;

  if (!sheetId || !sheetGid) {
    throw new Error("Pricing sheet environment variables are not configured.");
  }

  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${sheetGid}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let response: Response;

  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Pricing catalog request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    let bodySnippet = "";
    try {
      const body = await response.text();
      bodySnippet = body.slice(0, 200);
    } catch {
      bodySnippet = "";
    }
    console.error("Pricing catalog fetch failed", {
      url,
      status: response.status,
      bodySnippet,
    });
    throw new Error(`Failed to fetch pricing catalog (${response.status}).`);
  }

  const csvText = await response.text();
  const items = parsePricingItems(csvText);

  return {
    updatedAtIso: new Date().toISOString(),
    items,
    source: "live",
  };
};

export const getPricingCatalog = async (): Promise<PricingCatalogResponse> => {
  const now = Date.now();
  if (cachedCatalog && now - cachedAt < CACHE_TTL_MS) {
    return { ...cachedCatalog, source: "cache" };
  }

  try {
    const catalog = await fetchPricingCatalog();
    cachedCatalog = catalog;
    cachedAt = now;
    lastGoodCatalog = catalog;
    return catalog;
  } catch (error) {
    if (cachedCatalog) {
      return { ...cachedCatalog, source: "cache" };
    }
    if (lastGoodCatalog) {
      return { ...lastGoodCatalog, source: "stale" };
    }
    throw error;
  }
};

export const handlePricingCatalog = async (_req: Request, res: Response) => {
  try {
    const catalog = await getPricingCatalog();
    return res.status(200).json(catalog);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load pricing catalog.";
    return res.status(502).json({ message });
  }
};
