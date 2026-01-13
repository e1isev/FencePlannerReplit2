import type { FenceCategoryId, FenceStyleId } from "@/types/models";
import { residentialStyles } from "@/data/fenceStyles/residential";
import { ruralStyles } from "@/data/fenceStyles/rural";
import type { FenceStyleCatalogItem } from "@/data/fenceStyles/types";

export type { FenceStyleCatalogItem } from "@/data/fenceStyles/types";

export const getStylesByCategory = (
  category: FenceCategoryId
): FenceStyleCatalogItem[] =>
  category === "rural" ? ruralStyles : residentialStyles;

export const getStyleById = (styleId: FenceStyleId): FenceStyleCatalogItem | undefined =>
  [...residentialStyles, ...ruralStyles].find((style) => style.id === styleId);
