import { useEffect } from "react";
import { usePricingStore } from "@/store/pricingStore";

export const usePricingCatalog = () => {
  const pricingIndex = usePricingStore((state) => state.pricingIndex);
  const pricingStatus = usePricingStore((state) => state.pricingStatus);
  const pricingSource = usePricingStore((state) => state.pricingSource);
  const updatedAtIso = usePricingStore((state) => state.updatedAtIso);
  const errorMessage = usePricingStore((state) => state.errorMessage);
  const noticeMessage = usePricingStore((state) => state.noticeMessage);
  const catalogStatus = usePricingStore((state) => state.catalogStatus);
  const loadPricingCatalog = usePricingStore((state) => state.loadPricingCatalog);

  const catalogReady =
    pricingStatus === "ready" &&
    (!catalogStatus || (catalogStatus.ok && catalogStatus.catalogueRowCount > 0));

  useEffect(() => {
    if (pricingStatus === "idle") {
      void loadPricingCatalog();
    }
  }, [pricingStatus, loadPricingCatalog]);

  return {
    pricingIndex,
    pricingStatus,
    pricingSource,
    updatedAtIso,
    errorMessage,
    noticeMessage,
    catalogStatus,
    catalogReady,
    loadPricingCatalog,
  };
};
