import { useEffect } from "react";
import { usePricingStore } from "@/store/pricingStore";

export const usePricingCatalog = () => {
  const pricingIndex = usePricingStore((state) => state.pricingIndex);
  const pricingStatus = usePricingStore((state) => state.pricingStatus);
  const updatedAtIso = usePricingStore((state) => state.updatedAtIso);
  const errorMessage = usePricingStore((state) => state.errorMessage);
  const warningMessage = usePricingStore((state) => state.warningMessage);
  const pricingSource = usePricingStore((state) => state.pricingSource);
  const loadPricingCatalog = usePricingStore((state) => state.loadPricingCatalog);

  useEffect(() => {
    if (pricingStatus === "idle") {
      void loadPricingCatalog();
    }
  }, [pricingStatus, loadPricingCatalog]);

  return {
    pricingIndex,
    pricingStatus,
    updatedAtIso,
    errorMessage,
    warningMessage,
    pricingSource,
    loadPricingCatalog,
  };
};
