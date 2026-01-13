import { useEffect } from "react";
import { usePricingStore } from "@/store/pricingStore";

export const usePricingCatalog = () => {
  const pricingBySku = usePricingStore((state) => state.pricingBySku);
  const pricingStatus = usePricingStore((state) => state.pricingStatus);
  const updatedAtIso = usePricingStore((state) => state.updatedAtIso);
  const errorMessage = usePricingStore((state) => state.errorMessage);
  const loadPricingCatalog = usePricingStore((state) => state.loadPricingCatalog);

  useEffect(() => {
    if (pricingStatus === "idle") {
      void loadPricingCatalog();
    }
  }, [pricingStatus, loadPricingCatalog]);

  return {
    pricingBySku,
    pricingStatus,
    updatedAtIso,
    errorMessage,
    loadPricingCatalog,
  };
};
