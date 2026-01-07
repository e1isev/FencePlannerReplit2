import { FenceCategoryId, FenceStyleId } from "@/types/models";
import { fenceStyleImages } from "./fenceStyleImages";

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
  {
    id: "bellbrae",
    label: "Bellbrae",
    category: "residential",
    imageSrc: fenceStyleImages.bellbrae,
  },
  {
    id: "jabiru",
    label: "Jabiru",
    category: "residential",
    imageSrc: fenceStyleImages.jabiru,
  },
  {
    id: "kestrel",
    label: "Kestrel",
    category: "residential",
    imageSrc: fenceStyleImages.kestrel,
  },
  {
    id: "kookaburra",
    label: "Kookaburra",
    category: "residential",
    imageSrc: fenceStyleImages.kookaburra,
  },
  {
    id: "mystique_lattice",
    label: "Mystique Lattice",
    category: "residential",
    imageSrc: fenceStyleImages.mystiqueLattice,
  },
  {
    id: "mystique_solid",
    label: "Mystique Solid",
    category: "residential",
    imageSrc: fenceStyleImages.mystiqueSolid,
  },
  {
    id: "rosella",
    label: "Rosella",
    category: "residential",
    imageSrc: fenceStyleImages.rosella,
  },
  {
    id: "toucan",
    label: "Toucan",
    category: "residential",
    imageSrc: fenceStyleImages.toucan,
  },
  {
    id: "wren",
    label: "Wren",
    category: "residential",
    imageSrc: fenceStyleImages.wren,
  },
  {
    id: "1_rail_140x40",
    label: "1 Rail 140x40",
    category: "rural",
    imageSrc: fenceStyleImages.rail1,
  },
  {
    id: "1_rail_150x50",
    label: "1 Rail 150x50",
    category: "rural",
    imageSrc: fenceStyleImages.rail1,
  },
  {
    id: "2_rails_140x40",
    label: "2 Rails 140x40",
    category: "rural",
    imageSrc: fenceStyleImages.rail2,
  },
  {
    id: "2_rails_150x50",
    label: "2 Rails 150x50",
    category: "rural",
    imageSrc: fenceStyleImages.rail2,
  },
  {
    id: "3_rails_140x40",
    label: "3 Rails 140x40",
    category: "rural",
    imageSrc: fenceStyleImages.rail3,
  },
  {
    id: "3_rails_150x50",
    label: "3 Rails 150x50",
    category: "rural",
    imageSrc: fenceStyleImages.rail3,
  },
  {
    id: "4_rails_140x40",
    label: "4 Rails 140x40",
    category: "rural",
    imageSrc: fenceStyleImages.rail4,
  },
  {
    id: "4_rails_150x50",
    label: "4 Rails 150x50",
    category: "rural",
    imageSrc: fenceStyleImages.rail4,
  },
  {
    id: "caviar_150x50",
    label: "Caviar 150x50",
    category: "rural",
    imageSrc: fenceStyleImages.caviar,
  },
  {
    id: "crossbuck_150x50",
    label: "Crossbuck 150x50",
    category: "rural",
    imageSrc: fenceStyleImages.crossbuck,
  },
  {
    id: "mesh_150x50",
    label: "Mesh 150x50",
    category: "rural",
    imageSrc: fenceStyleImages.mesh,
  },
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
