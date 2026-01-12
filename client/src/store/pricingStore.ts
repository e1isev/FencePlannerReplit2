import { create } from "zustand";

export type PricingStatus = "idle" | "loading" | "ready" | "error";

export type PricingCatalogItem = {
  name: string;
  sku: string;
  unitPrice: number;
};

type PricingState = {
  pricingBySku: Record<string, { name: string; unitPrice: number }>;
  pricingStatus: PricingStatus;
  updatedAtIso: string | null;
  errorMessage: string | null;
  loadPricingCatalog: () => Promise<void>;
};

export const usePricingStore = create<PricingState>((set, get) => ({
  pricingBySku: {},
  pricingStatus: "idle",
  updatedAtIso: null,
  errorMessage: null,
  loadPricingCatalog: async () => {
    const { pricingStatus } = get();
    if (pricingStatus === "loading") return;

    set({ pricingStatus: "loading", errorMessage: null });

    try {
      const response = await fetch("/api/pricing/catalog");
      if (!response.ok) {
        let detail = "";
        try {
          const data = (await response.json()) as { message?: string };
          if (data?.message) {
            detail = data.message;
          }
        } catch {
          detail = "";
        }
        const suffix = detail ? `: ${detail}` : "";
        throw new Error(`Failed to load pricing catalog (${response.status})${suffix}`);
      }

      const data: { updatedAtIso: string; items: PricingCatalogItem[] } =
        await response.json();

      const pricingBySku = data.items.reduce(
        (acc, item) => {
          acc[item.sku] = { name: item.name, unitPrice: item.unitPrice };
          return acc;
        },
        {} as Record<string, { name: string; unitPrice: number }>
      );

      set({
        pricingBySku,
        pricingStatus: "ready",
        updatedAtIso: data.updatedAtIso,
      });
    } catch (error) {
      set({
        pricingStatus: "error",
        errorMessage:
          error instanceof Error ? error.message : "Failed to load pricing catalog",
      });
    }
  },
}));
