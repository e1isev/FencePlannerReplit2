export type Category = "residential" | "rural";
export type ProductType = "panel" | "post" | "gate" | "mesh" | "rail" | "other";

export type GateType = "single" | "double" | "sliding";

export type CatalogRow = {
  name: string;
  sku: string;
  unitPrice: number | null;
  category: Category;
  style: string | null;
  colour: string | null;
  heightM: number | null;
  postType: string | null;
  gateType: GateType | null;
  gateWidthM: number | null;
  gateWidthRange: string | null;
  productType: ProductType;
  key: string;
};

export type CatalogIndex = {
  byKey: Map<string, CatalogRow>;
  duplicates: Map<string, CatalogRow[]>;
  rows: CatalogRow[];
  optionSets: {
    categories: Category[];
    stylesByCategory: Record<Category, string[]>;
    coloursByCategoryStyle: Record<string, string[]>;
    heightsByCategoryStyleColourType: Record<string, number[]>;
    gateOptionsByCategoryStyle: Record<
      string,
      {
        types: string[];
        widths: number[];
        widthRanges: string[];
        heights: number[];
      }
    >;
  };
  diagnostics: {
    duplicateKeys: string[];
    rowsMissingCategory: CatalogRow[];
    rowsMissingPrice: CatalogRow[];
  };
};

export type CatalogLookupResult =
  | { ok: true; row: CatalogRow }
  | {
      ok: false;
      reason: "NOT_FOUND" | "DUPLICATE" | "NO_PRICE";
      key: string;
      duplicates?: CatalogRow[];
    };
