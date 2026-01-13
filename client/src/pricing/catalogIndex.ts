import type { PricingCatalogItem } from "@/store/pricingStore";

export type PricingCatalogEntry = {
  name: string;
  unitPrice: number;
  sku: string;
};

export type PricingIndex = {
  raw: Record<string, PricingCatalogEntry>;
  dash: Map<string, string[]>;
  compact: Map<string, string[]>;
};

export type PricingLookupDiagnostics = {
  dashKey: string;
  compactKey: string;
  dashCandidates?: string[];
  compactCandidates?: string[];
};

export type PricingLookupResult =
  | { entry: PricingCatalogEntry; diagnostics: PricingLookupDiagnostics }
  | { entry: null; reason: "SKU_NOT_FOUND" | "AMBIGUOUS_MATCH"; diagnostics: PricingLookupDiagnostics };

export const normalizeSkuDash = (sku: string) => {
  const trimmed = sku.trim().toLowerCase();
  const dashed = trimmed.replace(/[\s_]+/g, "-");
  const filtered = dashed.replace(/[^a-z0-9./-]+/g, "");
  const collapsed = filtered.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  return collapsed;
};

export const normalizeSkuCompact = (sku: string) => {
  return sku.toLowerCase().replace(/[^a-z0-9.]+/g, "");
};

const pushKey = (map: Map<string, string[]>, key: string, sku: string) => {
  const existing = map.get(key);
  if (existing) {
    existing.push(sku);
  } else {
    map.set(key, [sku]);
  }
};

export const buildPricingIndex = (items: PricingCatalogItem[]): PricingIndex => {
  const raw: Record<string, PricingCatalogEntry> = {};
  const dash = new Map<string, string[]>();
  const compact = new Map<string, string[]>();

  items.forEach((item) => {
    const entry: PricingCatalogEntry = {
      name: item.name,
      unitPrice: item.unitPrice,
      sku: item.sku,
    };
    raw[item.sku] = entry;
    pushKey(dash, normalizeSkuDash(item.sku), item.sku);
    pushKey(compact, normalizeSkuCompact(item.sku), item.sku);
  });

  return { raw, dash, compact };
};

export const lookupPricingEntry = (
  index: PricingIndex,
  sku: string
): PricingLookupResult => {
  const diagnostics: PricingLookupDiagnostics = {
    dashKey: normalizeSkuDash(sku),
    compactKey: normalizeSkuCompact(sku),
  };

  const rawMatch = index.raw[sku];
  if (rawMatch) {
    return { entry: rawMatch, diagnostics };
  }

  const dashCandidates = index.dash.get(diagnostics.dashKey) ?? [];
  if (dashCandidates.length === 1) {
    return { entry: index.raw[dashCandidates[0]], diagnostics };
  }
  if (dashCandidates.length > 1) {
    diagnostics.dashCandidates = dashCandidates.slice(0, 5);
  }

  const compactCandidates = index.compact.get(diagnostics.compactKey) ?? [];
  if (compactCandidates.length === 1) {
    return { entry: index.raw[compactCandidates[0]], diagnostics };
  }
  if (compactCandidates.length > 1) {
    diagnostics.compactCandidates = compactCandidates.slice(0, 5);
  }

  if (dashCandidates.length > 1 || compactCandidates.length > 1) {
    return { entry: null, reason: "AMBIGUOUS_MATCH", diagnostics };
  }

  return { entry: null, reason: "SKU_NOT_FOUND", diagnostics };
};
