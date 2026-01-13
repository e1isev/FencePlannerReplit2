import { create } from "zustand";
import {
  buildPricingIndex,
  createEmptyPricingIndex,
  findPriceMatch,
  countPricingIndexKeys,
  type PricingIndex,
  type PricingCatalogItem,
} from "@/pricing/pricingLookup";

export type PricingStatus = "idle" | "loading" | "ready" | "error";

type PricingState = {
  pricingIndex: PricingIndex;
  pricingStatus: PricingStatus;
  updatedAtIso: string | null;
  errorMessage: string | null;
  warningMessage: string | null;
  pricingSource: "live" | "cache" | "stale" | "local" | null;
  loadPricingCatalog: (options?: { force?: boolean }) => Promise<void>;
};

type PricingCatalogResponse = {
  updatedAtIso: string;
  items: PricingCatalogItem[];
  source?: "live" | "cache" | "stale";
};

const PRICING_CACHE_KEY = "pricingCatalogCache";
const RETRY_DELAYS_MS = [300, 900, 2700];

const readCachedCatalog = (): PricingCatalogResponse | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PRICING_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PricingCatalogResponse;
    if (!parsed?.items?.length) return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeCachedCatalog = (catalog: PricingCatalogResponse) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PRICING_CACHE_KEY, JSON.stringify(catalog));
  } catch {
    // Ignore storage errors (quota or privacy mode).
  }
};

const delay = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const fetchPricingCatalog = async (): Promise<PricingCatalogResponse> => {
  const response = await fetch("/api/pricing/catalog");
  if (!response.ok) {
    let bodyMessage = "";
    try {
      const errorPayload = (await response.json()) as { message?: string };
      bodyMessage = errorPayload?.message ?? "";
    } catch {
      bodyMessage = "";
    }
    const suffix = bodyMessage ? `: ${bodyMessage}` : "";
    throw new Error(`Failed to load pricing catalog (${response.status})${suffix}`);
  }

  return (await response.json()) as PricingCatalogResponse;
};

const refreshPricingIndex = (
  catalog: PricingCatalogResponse,
  setState: (partial: Partial<PricingState>) => void,
  sourceOverride?: PricingState["pricingSource"],
  warningMessage?: string | null
) => {
  const pricingIndex = buildPricingIndex(catalog.items);
  setState({
    pricingIndex,
    pricingStatus: "ready",
    updatedAtIso: catalog.updatedAtIso,
    errorMessage: null,
    warningMessage: warningMessage ?? null,
    pricingSource: sourceOverride ?? catalog.source ?? "live",
  });

  if (import.meta.env.DEV) {
    const counts = countPricingIndexKeys(pricingIndex);
    const sampleLookup = findPriceMatch({
      index: pricingIndex,
      sku: "Bellbrae-Colour-1.8m",
    });
    // eslint-disable-next-line no-console
    console.info("Pricing catalog loaded", {
      rows: catalog.items.length,
      ...counts,
      sampleLookup,
    });
  }
};

export const usePricingStore = create<PricingState>((set, get) => ({
  pricingIndex: createEmptyPricingIndex(),
  pricingStatus: "idle",
  updatedAtIso: null,
  errorMessage: null,
  warningMessage: null,
  pricingSource: null,
  loadPricingCatalog: async (options) => {
    const { pricingStatus } = get();
    if (pricingStatus === "loading") return;
    if (!options?.force && pricingStatus === "ready") return;

    set({
      pricingStatus: "loading",
      errorMessage: null,
      warningMessage: null,
      pricingSource: null,
    });

    const cachedLocal = readCachedCatalog();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        if (attempt > 0) {
          await delay(RETRY_DELAYS_MS[attempt - 1]);
        }
        const catalog = await fetchPricingCatalog();
        writeCachedCatalog(catalog);
        refreshPricingIndex(catalog, set);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Failed to load pricing catalog");
      }
    }

    if (cachedLocal) {
      refreshPricingIndex(
        cachedLocal,
        set,
        "local",
        lastError ? `Using cached prices: ${lastError.message}` : "Using cached prices."
      );
      return;
    }

    set({
      pricingStatus: "error",
      errorMessage: lastError?.message ?? "Failed to load pricing catalog",
      pricingSource: null,
      warningMessage: null,
    });
  },
}));
