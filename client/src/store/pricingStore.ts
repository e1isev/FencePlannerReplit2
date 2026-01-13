import { create } from "zustand";
import { buildPricingIndex, type PricingIndex } from "@/pricing/catalogIndex";

export type PricingStatus = "idle" | "loading" | "ready" | "error";
export type PricingSource = "network" | "cache" | null;

export type PricingCatalogItem = {
  name: string;
  sku: string;
  unitPrice: number;
};

type PricingState = {
  pricingIndex: PricingIndex | null;
  pricingStatus: PricingStatus;
  pricingSource: PricingSource;
  updatedAtIso: string | null;
  errorMessage: string | null;
  noticeMessage: string | null;
  loadPricingCatalog: () => Promise<void>;
};

export const usePricingStore = create<PricingState>((set, get) => ({
  pricingIndex: null,
  pricingStatus: "idle",
  pricingSource: null,
  updatedAtIso: null,
  errorMessage: null,
  noticeMessage: null,
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
        set({
          pricingIndex,
          pricingStatus: "ready",
          pricingSource: "cache",
          updatedAtIso: cached.updatedAtIso,
          noticeMessage: "Using cached pricing.",
          errorMessage: null,
        });
        return;
      }

      set({
        pricingStatus: "error",
        pricingSource: null,
        errorMessage:
          error instanceof Error ? error.message : "Failed to load pricing catalog",
      });
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
        throw new Error(`Failed to load pricing catalog (${response.status})`);
      }
      return (await response.json()) as {
        updatedAtIso: string;
        items: PricingCatalogItem[];
      };
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        const delay = 300 * 2 ** (attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
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
