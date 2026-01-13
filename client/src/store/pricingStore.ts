import { create } from "zustand";
import { buildPricingIndex, type PricingIndex } from "@/pricing/catalogIndex";

export type PricingStatus = "idle" | "loading" | "ready" | "error";
export type PricingSource = "network" | "cache" | null;

export type PricingCatalogItem = {
  name: string;
  sku: string;
  unitPrice: number;
};

export type PricingCatalogStatus = {
  ok: boolean;
  source: "upstream" | "cache" | "local";
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorStatus: number | null;
  lastErrorMessage: string | null;
  catalogueRowCount: number;
};

type PricingState = {
  pricingIndex: PricingIndex | null;
  pricingStatus: PricingStatus;
  pricingSource: PricingSource;
  updatedAtIso: string | null;
  errorMessage: string | null;
  noticeMessage: string | null;
  catalogStatus: PricingCatalogStatus | null;
  loadPricingCatalog: () => Promise<void>;
};

export const usePricingStore = create<PricingState>((set, get) => ({
  pricingIndex: null,
  pricingStatus: "idle",
  pricingSource: null,
  updatedAtIso: null,
  errorMessage: null,
  noticeMessage: null,
  catalogStatus: null,
  loadPricingCatalog: async () => {
    const { pricingStatus } = get();
    if (pricingStatus === "loading") return;

    set({ pricingStatus: "loading", errorMessage: null, noticeMessage: null });

    try {
      const data = await fetchPricingCatalogWithRetry();
      const pricingIndex = buildPricingIndex(data.items);

      localStorage.setItem("pricingCatalogSnapshot", JSON.stringify(data));

      set({
        pricingIndex,
        pricingStatus: "ready",
        pricingSource: "network",
        updatedAtIso: data.updatedAtIso,
        noticeMessage: null,
      });
    } catch (error) {
      const cached = loadCachedCatalog();
      if (cached) {
        const pricingIndex = buildPricingIndex(cached.items);
        const formattedUpdatedAt = formatUpdatedAt(cached.updatedAtIso);
        set({
          pricingIndex,
          pricingStatus: "ready",
          pricingSource: "cache",
          updatedAtIso: cached.updatedAtIso,
          noticeMessage: `Pricing using cached catalogue, last updated ${formattedUpdatedAt}.`,
          errorMessage: null,
        });
      } else {
        set({
          pricingStatus: "error",
          pricingSource: null,
          errorMessage:
            error instanceof Error ? error.message : "Failed to load pricing catalog",
        });
      }
    } finally {
      const status = await fetchPricingCatalogStatus();
      if (status) {
        set({ catalogStatus: status });
      }
    }
  },
}));

const fetchPricingCatalogWithRetry = async () => {
  const maxAttempts = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch("/api/pricing/catalog");
      if (!response.ok) {
        const error = new Error(`Failed to load pricing catalog (${response.status})`) as Error & {
          status?: number;
          retryable?: boolean;
        };
        error.status = response.status;
        error.retryable = response.status >= 500;
        throw error;
      }
      return (await response.json()) as {
        updatedAtIso: string;
        items: PricingCatalogItem[];
      };
    } catch (error) {
      lastError = error;
      const retryable = isRetryableError(error);
      if (attempt < maxAttempts && retryable) {
        const delay = 300 * 3 ** (attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        break;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Failed to load pricing catalog");
};

const loadCachedCatalog = () => {
  const raw = localStorage.getItem("pricingCatalogSnapshot");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { updatedAtIso: string; items: PricingCatalogItem[] };
    if (!parsed?.items) return null;
    return parsed;
  } catch {
    return null;
  }
};

const fetchPricingCatalogStatus = async () => {
  try {
    const response = await fetch("/api/pricing-catalog/status");
    if (!response.ok) return null;
    return (await response.json()) as PricingCatalogStatus;
  } catch {
    return null;
  }
};

const formatUpdatedAt = (updatedAtIso: string | null) => {
  if (!updatedAtIso) return "unknown time";
  const parsed = Date.parse(updatedAtIso);
  if (Number.isNaN(parsed)) return "unknown time";
  return new Date(parsed).toLocaleString();
};

const isRetryableError = (error: unknown) => {
  if (error instanceof TypeError) {
    return true;
  }
  if (typeof error === "object" && error) {
    const retryable = (error as { retryable?: boolean }).retryable;
    if (typeof retryable === "boolean") return retryable;
    const status = (error as { status?: number }).status;
    if (typeof status === "number") {
      return status >= 500;
    }
  }
  return false;
};
