import { create } from "zustand";
import residentialRows from "@shared/pricing/residential_pricing_rows.json";
import residentialOptions from "@shared/pricing/residential_pricing_options.json";
import {
  buildResidentialIndex,
  resolveResidentialSkuAndPrice,
  type ResidentialPricingIndex,
  type ResidentialPricingRow,
  type ResidentialSelection,
} from "@shared/pricing/residentialPricing";
import type { FenceCategoryId, FenceColourMode, FenceStyleId } from "@/types/models";
import { FENCE_HEIGHTS_M } from "@/config/fenceHeights";
import { getFenceStyleLabel } from "@/config/fenceStyles";

const residentialIndex = buildResidentialIndex(residentialRows as ResidentialPricingRow[]);

type PricingState = {
  residentialRows: ResidentialPricingRow[];
  residentialIndex: ResidentialPricingIndex;
  resolveResidential: (selection: ResidentialSelection) => {
    sku: string;
    unit_price: number;
  } | null;
};

export const usePricingStore = create<PricingState>(() => ({
  residentialRows: residentialRows as ResidentialPricingRow[],
  residentialIndex,
  resolveResidential: (selection) =>
    resolveResidentialSkuAndPrice(residentialIndex, selection),
}));

export const getSupportedPanelHeights = (
  styleId: FenceStyleId,
  _colourMode: FenceColourMode,
  categoryId: FenceCategoryId,
  _pricingIndex: ResidentialPricingIndex | null
) => {
  if (categoryId !== "residential") return [...FENCE_HEIGHTS_M];

  const styleLabel = getFenceStyleLabel(styleId);
  if ((residentialOptions.panelStyles as string[]).includes(styleLabel)) {
    return (residentialOptions.heights as number[]).slice().sort((a, b) => a - b);
  }

  return [...FENCE_HEIGHTS_M];
};
