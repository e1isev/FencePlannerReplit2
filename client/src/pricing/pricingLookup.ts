import type { FenceCategoryId } from "@/types/models";

export type PricingCatalogItem = {
  name: string;
  sku: string;
  unitPrice: number;
  category?: FenceCategoryId | null;
};

export type PricingIndex = {
  items: PricingCatalogItem[];
  bySku: Map<string, PricingCatalogItem[]>;
  byName: Map<string, PricingCatalogItem[]>;
  tokenEntries: Array<{ item: PricingCatalogItem; tokens: string[] }>;
};

export type PriceMatchCandidate = {
  sku: string;
  name: string;
  unitPrice: number;
  score: number;
  category?: FenceCategoryId | null;
};

export type PriceLookupDiagnostics = {
  normalizedSku?: string;
  normalizedName?: string;
  exactSkuMatch: boolean;
  exactNameMatch: boolean;
  candidates?: PriceMatchCandidate[];
};

export type PriceLookupResult =
  | {
      status: "matched";
      match: PricingCatalogItem;
      source: "sku" | "name" | "token";
      diagnostics: PriceLookupDiagnostics;
    }
  | {
      status: "missing" | "ambiguous";
      match: null;
      source: "sku" | "name" | "token" | "none";
      diagnostics: PriceLookupDiagnostics;
    };

const normalizeSpacing = (value: string) =>
  value
    .replace(/[_-]+/g, " ")
    .replace(/[^\p{L}\p{N}. ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

export const normalizePricingKey = (value: string) =>
  normalizeSpacing(value.toLowerCase());

export const tokenizePricingKey = (value: string) => {
  const normalized = normalizePricingKey(value);
  if (!normalized) return [] as string[];
  return normalized.split(" ").filter(Boolean);
};

const toTokenSetKey = (tokens: string[]) =>
  Array.from(new Set(tokens)).sort().join(" ");

export const buildPricingIndex = (items: PricingCatalogItem[]): PricingIndex => {
  const bySku = new Map<string, PricingCatalogItem[]>();
  const byName = new Map<string, PricingCatalogItem[]>();
  const tokenEntries: Array<{ item: PricingCatalogItem; tokens: string[] }> = [];

  items.forEach((item) => {
    const skuKey = normalizePricingKey(item.sku);
    if (skuKey) {
      const existing = bySku.get(skuKey) ?? [];
      existing.push(item);
      bySku.set(skuKey, existing);
      tokenEntries.push({ item, tokens: tokenizePricingKey(item.sku) });
    }

    const nameKey = normalizePricingKey(item.name);
    if (nameKey) {
      const existing = byName.get(nameKey) ?? [];
      existing.push(item);
      byName.set(nameKey, existing);
    }
  });

  return { items, bySku, byName, tokenEntries };
};

export const createEmptyPricingIndex = (): PricingIndex =>
  buildPricingIndex([]);

const selectByCategory = (
  items: PricingCatalogItem[],
  category?: FenceCategoryId | null
) => {
  if (items.length === 1) {
    return { status: "matched" as const, match: items[0] };
  }

  if (category) {
    const scoped = items.filter((item) => item.category === category);
    if (scoped.length === 1) {
      return { status: "matched" as const, match: scoped[0] };
    }
    if (scoped.length > 1) {
      return { status: "ambiguous" as const, match: null };
    }
  }

  return { status: "ambiguous" as const, match: null };
};

const scoreTokenSimilarity = (aTokens: string[], bTokens: string[]) => {
  if (!aTokens.length || !bTokens.length) return 0;
  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);
  let intersection = 0;
  aSet.forEach((token) => {
    if (bSet.has(token)) intersection += 1;
  });
  const union = new Set([...aSet, ...bSet]).size;
  return union === 0 ? 0 : intersection / union;
};

const getCandidates = (
  entries: Array<{ item: PricingCatalogItem; tokens: string[] }>,
  targetTokens: string[],
  category?: FenceCategoryId | null
): Array<PriceMatchCandidate & { item: PricingCatalogItem }> => {
  const relevant = category
    ? entries.filter((entry) => entry.item.category === category)
    : entries;
  const pool = relevant.length > 0 ? relevant : entries;

  return pool
    .map((entry) => ({
      item: entry.item,
      sku: entry.item.sku,
      name: entry.item.name,
      unitPrice: entry.item.unitPrice,
      category: entry.item.category,
      score: scoreTokenSimilarity(targetTokens, entry.tokens),
    }))
    .sort((a, b) => b.score - a.score);
};

export const findPriceMatch = (args: {
  index: PricingIndex;
  sku?: string | null;
  name?: string | null;
  category?: FenceCategoryId | null;
}): PriceLookupResult => {
  const { index, sku, name, category } = args;
  const normalizedSku = sku ? normalizePricingKey(sku) : "";
  const normalizedName = name ? normalizePricingKey(name) : "";

  const skuMatches = normalizedSku ? index.bySku.get(normalizedSku) ?? [] : [];
  const nameMatches = normalizedName ? index.byName.get(normalizedName) ?? [] : [];

  const exactSkuMatch = skuMatches.length > 0;
  const exactNameMatch = nameMatches.length > 0;

  if (exactSkuMatch) {
    const selection = selectByCategory(skuMatches, category);
    if (selection.status === "matched") {
      return {
        status: "matched",
        match: selection.match,
        source: "sku",
        diagnostics: {
          normalizedSku,
          normalizedName: normalizedName || undefined,
          exactSkuMatch,
          exactNameMatch,
        },
      };
    }

    return {
      status: "ambiguous",
      match: null,
      source: "sku",
      diagnostics: {
        normalizedSku,
        normalizedName: normalizedName || undefined,
        exactSkuMatch,
        exactNameMatch,
      },
    };
  }

  if (exactNameMatch) {
    const selection = selectByCategory(nameMatches, category);
    if (selection.status === "matched") {
      return {
        status: "matched",
        match: selection.match,
        source: "name",
        diagnostics: {
          normalizedSku: normalizedSku || undefined,
          normalizedName,
          exactSkuMatch,
          exactNameMatch,
        },
      };
    }

    return {
      status: "ambiguous",
      match: null,
      source: "name",
      diagnostics: {
        normalizedSku: normalizedSku || undefined,
        normalizedName,
        exactSkuMatch,
        exactNameMatch,
      },
    };
  }

  const tokens = normalizedSku
    ? tokenizePricingKey(normalizedSku)
    : normalizedName
      ? tokenizePricingKey(normalizedName)
      : [];

  if (!tokens.length || index.tokenEntries.length === 0) {
    return {
      status: "missing",
      match: null,
      source: "none",
      diagnostics: {
        normalizedSku: normalizedSku || undefined,
        normalizedName: normalizedName || undefined,
        exactSkuMatch,
        exactNameMatch,
      },
    };
  }

  const scoredCandidates = getCandidates(index.tokenEntries, tokens, category);
  const topCandidates = scoredCandidates.slice(0, 3);
  const best = scoredCandidates[0];
  const second = scoredCandidates[1];

  if (best && best.score >= 0.95) {
    const secondScore = second?.score ?? 0;
    if (best.score - secondScore >= 0.05) {
      return {
        status: "matched",
        match: best.item,
        source: "token",
        diagnostics: {
          normalizedSku: normalizedSku || undefined,
          normalizedName: normalizedName || undefined,
          exactSkuMatch,
          exactNameMatch,
          candidates: topCandidates,
        },
      };
    }

    return {
      status: "ambiguous",
      match: null,
      source: "token",
      diagnostics: {
        normalizedSku: normalizedSku || undefined,
        normalizedName: normalizedName || undefined,
        exactSkuMatch,
        exactNameMatch,
        candidates: topCandidates,
      },
    };
  }

  return {
    status: "missing",
    match: null,
    source: "token",
    diagnostics: {
      normalizedSku: normalizedSku || undefined,
      normalizedName: normalizedName || undefined,
      exactSkuMatch,
      exactNameMatch,
      candidates: topCandidates,
    },
  };
};

export const countPricingIndexKeys = (index: PricingIndex) => ({
  skuKeys: index.bySku.size,
  nameKeys: index.byName.size,
  tokenEntries: index.tokenEntries.length,
});

export const getTokenSetKey = (value: string) =>
  toTokenSetKey(tokenizePricingKey(value));
