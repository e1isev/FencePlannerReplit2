import type { FenceColorId } from "@/config/fenceColors";
import type { FenceHeightM } from "@/config/fenceHeights";
import type { FenceStyleId } from "@/types/models";

export type FenceStyleCatalogItem = {
  id: FenceStyleId;
  name: string;
  image: string;
  availableHeights: FenceHeightM[];
  availableColours: FenceColorId[];
  supportsGates: boolean;
};
