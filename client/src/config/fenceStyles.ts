import { FenceCategoryId, FenceStyleId } from "@/types/models";
import { getStylesByCategory } from "@/data/fenceStyles";

export type FenceStyle = {
  id: FenceStyleId;
  label: string;
  category: FenceCategoryId;
  imageSrc: string;
};

type FenceCategory = {
  id: FenceCategoryId;
  label: string;
  defaultStyleId: FenceStyleId;
};

export const FENCE_CATEGORIES: FenceCategory[] = [
  {
    id: "residential",
    label: "Residential",
    defaultStyleId: "bellbrae",
  },
  {
    id: "rural",
    label: "Rural",
    defaultStyleId: "1_rail_140x40",
  },
];

export const FENCE_STYLES: FenceStyle[] = [
  ...getStylesByCategory("residential").map((style) => ({
    id: style.id,
    label: style.name,
    category: "residential" as FenceCategoryId,
    imageSrc: style.image,
  })),
  ...getStylesByCategory("rural").map((style) => ({
    id: style.id,
    label: style.name,
    category: "rural" as FenceCategoryId,
    imageSrc: style.image,
  })),
];

const FENCE_STYLE_BY_ID = FENCE_STYLES.reduce<Record<FenceStyleId, FenceStyle>>(
  (acc, style) => {
    acc[style.id] = style;
    return acc;
  },
  {} as Record<FenceStyleId, FenceStyle>
);

const FENCE_STYLES_BY_CATEGORY = FENCE_STYLES.reduce<
  Record<FenceCategoryId, FenceStyle[]>
>(
  (acc, style) => {
    acc[style.category].push(style);
    return acc;
  },
  {
    residential: [],
    rural: [],
  }
);

export const getFenceStyleById = (styleId: FenceStyleId) =>
  FENCE_STYLE_BY_ID[styleId];

export const getFenceStylesByCategory = (categoryId: FenceCategoryId) =>
  FENCE_STYLES_BY_CATEGORY[categoryId];

export const getFenceStyleLabel = (styleId: FenceStyleId) =>
  getFenceStyleById(styleId)?.label ?? styleId;

export const getFenceStyleCategory = (styleId: FenceStyleId) =>
  getFenceStyleById(styleId)?.category ?? "residential";

export const getDefaultFenceStyleId = (categoryId: FenceCategoryId) =>
  FENCE_CATEGORIES.find((category) => category.id === categoryId)?.defaultStyleId ??
  "bellbrae";
