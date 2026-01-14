import type { CatalogIndex, CatalogLookupResult, CatalogRow } from "@/pricing/catalogTypes";
import type { CatalogRawRow } from "@/pricing/catalogParse";
import { buildKey } from "@/pricing/catalogKey";
import {
  parsePrice,
  normCategory,
  normColour,
  normGateType,
  inferProductType,
  parseGateWidthM,
  parseGateWidthRange,
  parseHeightM,
  normStyle,
} from "@/pricing/catalogParse";

const addUnique = <T>(list: T[], value: T) => {
  if (!list.includes(value)) list.push(value);
};

const ensureList = <T>(map: Record<string, T[]>, key: string) => {
  if (!map[key]) map[key] = [] as T[];
  return map[key];
};

const normalizeStyleToken = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();

const normalizeGateTypeValue = (value: string | null) => value ?? "";

const rowFromRaw = (raw: CatalogRawRow): CatalogRow | null => {
  const sku = typeof raw.sku === "string" ? raw.sku.trim() : "";
  if (!sku) return null;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const category = normCategory(raw.category);
  if (!category) return null;
  const style = normStyle(raw.style);
  const colour = normColour(raw.colour);
  const gateType = normGateType(raw.gateType);
  const productType = inferProductType(sku);
  const heightM = parseHeightM(raw.height, sku);
  const gateWidthRange = parseGateWidthRange(sku);
  const gateWidthM = parseGateWidthM(raw.gateWidth, sku);
  const postType = typeof raw.postType === "string" && raw.postType.trim() ? raw.postType.trim().toLowerCase() : null;
  const unitPrice = parsePrice(raw.unitPrice);

  const baseRow = {
    name,
    sku,
    unitPrice,
    category,
    style,
    colour,
    heightM,
    postType,
    gateType,
    gateWidthM,
    gateWidthRange,
    productType,
  };

  return {
    ...baseRow,
    key: buildKey(baseRow),
  };
};

export const buildCatalogIndex = (rows: CatalogRawRow[]): CatalogIndex => {
  const byKey = new Map<string, CatalogRow>();
  const duplicates = new Map<string, CatalogRow[]>();
  const normalizedRows: CatalogRow[] = [];
  const optionSets: CatalogIndex["optionSets"] = {
    categories: [],
    stylesByCategory: { residential: [], rural: [] },
    coloursByCategoryStyle: {},
    heightsByCategoryStyleColourType: {},
    gateOptionsByCategoryStyle: {},
  };
  const rowsMissingCategory: CatalogRow[] = [];
  const rowsMissingPrice: CatalogRow[] = [];

  rows.forEach((raw) => {
    const row = rowFromRaw(raw);
    if (!row) {
      if (typeof raw.sku === "string" && raw.sku.trim()) {
        const placeholder = {
          name: typeof raw.name === "string" ? raw.name.trim() : "",
          sku: raw.sku.trim(),
          unitPrice: parsePrice(raw.unitPrice),
          category: "residential" as const,
          style: typeof raw.style === "string" ? raw.style.trim() : null,
          colour: normColour(raw.colour),
          heightM: parseHeightM(raw.height, raw.sku.trim()),
          postType: typeof raw.postType === "string" ? raw.postType.trim() : null,
          gateType: normGateType(raw.gateType),
          gateWidthM: parseGateWidthM(raw.gateWidth, raw.sku.trim()),
          gateWidthRange: parseGateWidthRange(raw.sku.trim()),
          productType: inferProductType(raw.sku.trim()),
          key: "",
        } satisfies CatalogRow;
        rowsMissingCategory.push(placeholder);
      }
      return;
    }

    normalizedRows.push(row);

    if (!Number.isFinite(row.unitPrice ?? NaN)) {
      rowsMissingPrice.push(row);
    }

    const key = row.key;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
    } else {
      const existingGroup = duplicates.get(key) ?? [existing];
      existingGroup.push(row);
      duplicates.set(key, existingGroup);
      byKey.set(key, row);
    }

    addUnique(optionSets.categories, row.category);

    if (row.style) {
      const styles = optionSets.stylesByCategory[row.category];
      const normalizedStyles = styles.map(normalizeStyleToken);
      if (!normalizedStyles.includes(normalizeStyleToken(row.style))) {
        styles.push(row.style);
      }

      if (row.colour) {
        const colourKey = `${row.category}|${row.style}`;
        addUnique(ensureList(optionSets.coloursByCategoryStyle, colourKey), row.colour);
      }
    }

    if (row.productType === "panel" && row.style && row.colour && row.heightM !== null) {
      const heightKey = `${row.category}|${row.style}|${row.colour}|${row.productType}`;
      addUnique(ensureList(optionSets.heightsByCategoryStyleColourType, heightKey), row.heightM);
    }

    if (row.productType === "gate" && row.style) {
      const gateKey = `${row.category}|${row.style}`;
      const gateOptions = optionSets.gateOptionsByCategoryStyle[gateKey] ?? {
        types: [],
        widths: [],
        widthRanges: [],
        heights: [],
      };
      const gateType = normalizeGateTypeValue(row.gateType);
      if (gateType) addUnique(gateOptions.types, gateType);
      if (row.heightM !== null) addUnique(gateOptions.heights, row.heightM);
      if (row.gateWidthRange) addUnique(gateOptions.widthRanges, row.gateWidthRange);
      if (row.gateWidthM !== null) addUnique(gateOptions.widths, row.gateWidthM);
      optionSets.gateOptionsByCategoryStyle[gateKey] = gateOptions;
    }
  });

  Object.values(optionSets.coloursByCategoryStyle).forEach((values) => values.sort());
  Object.values(optionSets.heightsByCategoryStyleColourType).forEach((values) =>
    values.sort((a, b) => a - b)
  );
  Object.values(optionSets.gateOptionsByCategoryStyle).forEach((gateOptions) => {
    gateOptions.widths.sort((a, b) => a - b);
    gateOptions.widthRanges.sort();
    gateOptions.heights.sort((a, b) => a - b);
  });

  return {
    byKey,
    duplicates,
    rows: normalizedRows,
    optionSets,
    diagnostics: {
      duplicateKeys: Array.from(duplicates.keys()),
      rowsMissingCategory,
      rowsMissingPrice,
    },
  };
};

export const resolveCatalogKey = (index: CatalogIndex, key: string): CatalogLookupResult => {
  if (index.duplicates.has(key)) {
    return { ok: false, reason: "DUPLICATE", key, duplicates: index.duplicates.get(key) };
  }

  const row = index.byKey.get(key);
  if (!row) {
    return { ok: false, reason: "NOT_FOUND", key };
  }

  if (!Number.isFinite(row.unitPrice ?? NaN)) {
    return { ok: false, reason: "NO_PRICE", key };
  }

  return { ok: true, row };
};
