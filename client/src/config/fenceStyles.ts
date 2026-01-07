import { FenceCategoryId, FenceStyleId } from "@/types/models";

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

const fenceIconDataUri = (label: string) => {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="160" height="96" viewBox="0 0 160 96">
      <defs>
        <linearGradient id="fence" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#e2e8f0"/>
          <stop offset="100%" stop-color="#cbd5f5"/>
        </linearGradient>
      </defs>
      <rect width="160" height="96" fill="#f8fafc"/>
      <rect x="8" y="28" width="144" height="6" rx="3" fill="url(#fence)"/>
      <rect x="8" y="58" width="144" height="6" rx="3" fill="url(#fence)"/>
      <g fill="#94a3b8">
        <rect x="20" y="20" width="10" height="54" rx="2"/>
        <rect x="48" y="20" width="10" height="54" rx="2"/>
        <rect x="76" y="20" width="10" height="54" rx="2"/>
        <rect x="104" y="20" width="10" height="54" rx="2"/>
        <rect x="132" y="20" width="10" height="54" rx="2"/>
      </g>
      <text x="80" y="88" font-family="Inter, Arial, sans-serif" font-size="10" fill="#475569" text-anchor="middle">
        ${label}
      </text>
    </svg>
  `;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

export const FENCE_STYLES: FenceStyle[] = [
  {
    id: "bellbrae",
    label: "Bellbrae",
    category: "residential",
    imageSrc: fenceIconDataUri("Bellbrae"),
  },
  {
    id: "jabiru",
    label: "Jabiru",
    category: "residential",
    imageSrc: fenceIconDataUri("Jabiru"),
  },
  {
    id: "kestrel",
    label: "Kestrel",
    category: "residential",
    imageSrc: fenceIconDataUri("Kestrel"),
  },
  {
    id: "kookaburra",
    label: "Kookaburra",
    category: "residential",
    imageSrc: fenceIconDataUri("Kookaburra"),
  },
  {
    id: "mystique_lattice",
    label: "Mystique Lattice",
    category: "residential",
    imageSrc: fenceIconDataUri("Mystique Lattice"),
  },
  {
    id: "mystique_solid",
    label: "Mystique Solid",
    category: "residential",
    imageSrc: fenceIconDataUri("Mystique Solid"),
  },
  {
    id: "rosella",
    label: "Rosella",
    category: "residential",
    imageSrc: fenceIconDataUri("Rosella"),
  },
  {
    id: "toucan",
    label: "Toucan",
    category: "residential",
    imageSrc: fenceIconDataUri("Toucan"),
  },
  {
    id: "wren",
    label: "Wren",
    category: "residential",
    imageSrc: fenceIconDataUri("Wren"),
  },
  {
    id: "1_rail_140x40",
    label: "1 Rail 140x40",
    category: "rural",
    imageSrc: fenceIconDataUri("1 Rail 140x40"),
  },
  {
    id: "1_rail_150x50",
    label: "1 Rail 150x50",
    category: "rural",
    imageSrc: fenceIconDataUri("1 Rail 150x50"),
  },
  {
    id: "2_rails_140x40",
    label: "2 Rails 140x40",
    category: "rural",
    imageSrc: fenceIconDataUri("2 Rails 140x40"),
  },
  {
    id: "2_rails_150x50",
    label: "2 Rails 150x50",
    category: "rural",
    imageSrc: fenceIconDataUri("2 Rails 150x50"),
  },
  {
    id: "3_rails_140x40",
    label: "3 Rails 140x40",
    category: "rural",
    imageSrc: fenceIconDataUri("3 Rails 140x40"),
  },
  {
    id: "3_rails_150x50",
    label: "3 Rails 150x50",
    category: "rural",
    imageSrc: fenceIconDataUri("3 Rails 150x50"),
  },
  {
    id: "4_rails_140x40",
    label: "4 Rails 140x40",
    category: "rural",
    imageSrc: fenceIconDataUri("4 Rails 140x40"),
  },
  {
    id: "4_rails_150x50",
    label: "4 Rails 150x50",
    category: "rural",
    imageSrc: fenceIconDataUri("4 Rails 150x50"),
  },
  {
    id: "caviar_150x50",
    label: "Caviar 150x50",
    category: "rural",
    imageSrc: fenceIconDataUri("Caviar 150x50"),
  },
  {
    id: "crossbuck_150x50",
    label: "Crossbuck 150x50",
    category: "rural",
    imageSrc: fenceIconDataUri("Crossbuck 150x50"),
  },
  {
    id: "mesh_150x50",
    label: "Mesh 150x50",
    category: "rural",
    imageSrc: fenceIconDataUri("Mesh 150x50"),
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
