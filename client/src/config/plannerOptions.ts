import { FENCE_CATEGORIES } from "@/config/fenceStyles";
import { FENCE_COLORS } from "@/config/fenceColors";
import { FENCE_HEIGHTS_M } from "@/config/fenceHeights";
import type { FenceCategoryId, ProductKind } from "@/types/models";
import type { ProjectType } from "@shared/projectSnapshot";

export type FencingMode = "residential" | "rural";

export const projectTypeFromProduct = (kind: ProductKind): ProjectType => {
  switch (kind) {
    case "Decking":
      return "decking";
    case "Rural fencing":
      return "rural";
    case "Titan rail":
      return "titan_rail";
    case "Residential fencing":
    default:
      return "residential";
  }
};

export const fencingModeFromProjectType = (type: ProjectType): FencingMode => {
  switch (type) {
    case "residential":
      return "residential";
    case "rural":
      return "rural";
    default:
      if (import.meta.env.DEV) {
        console.warn(`Unknown project type "${type}", falling back to residential.`);
      }
      return "residential";
  }
};

export const plannerOptions = {
  residential: {
    fenceCategories: ["residential"] as FenceCategoryId[],
    fenceStyles: FENCE_CATEGORIES.filter((category) => category.id === "residential"),
    heights: FENCE_HEIGHTS_M,
    colors: FENCE_COLORS,
  },
  rural: {
    fenceCategories: ["rural"] as FenceCategoryId[],
    fenceStyles: FENCE_CATEGORIES.filter((category) => category.id === "rural"),
    heights: FENCE_HEIGHTS_M,
    colors: FENCE_COLORS,
  },
};
