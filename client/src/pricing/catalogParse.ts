import type { Category, CatalogRow, GateType, ProductType } from "@/pricing/catalogTypes";
import { buildKey } from "@/pricing/catalogKey";
import { normalizeStyleValue } from "@/pricing/catalogStyle";

export type CatalogRawRow = {
  name?: string | null;
  sku?: string | null;
  unitPrice?: number | string | null;
  category?: string | null;
  style?: string | null;
  colour?: string | null;
  height?: string | number | null;
  postType?: string | null;
  gateType?: string | null;
  gateWidth?: string | number | null;
};

export const parsePrice = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[$,\s]/g, "");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

export const normCategory = (value: unknown): Category | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("rural")) return "rural";
  if (normalized.includes("residential")) return "residential";
  return null;
};

export const normColour = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (["wht", "white"].includes(normalized)) return "white";
  if (["col", "colour", "color"].includes(normalized)) return "colour";
  return normalized;
};

export const normGateType = (value: unknown): GateType | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized.startsWith("single")) return "single";
  if (normalized.startsWith("double")) return "double";
  if (normalized.startsWith("sliding")) return "sliding";
  return null;
};

export const normStyle = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = normalizeStyleValue(value);
  return normalized || null;
};

const parseHeightValue = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/m$/, "");
  if (!normalized) return null;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

export const parseHeightM = (value: unknown, sku: string): number | null => {
  const height = parseHeightValue(value);
  if (height !== null) return height;
  const match = sku.match(/-(\d+(?:\.\d+)?)m$/i);
  if (match) {
    const parsed = Number.parseFloat(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const parseGateWidthM = (value: unknown, sku: string): number | null => {
  const parsed = parseHeightValue(value);
  if (parsed !== null) return parsed;
  const match = sku.match(/-(\d+(?:\.\d+)?)m$/i);
  if (match) {
    const width = Number.parseFloat(match[1]);
    return Number.isFinite(width) ? width : null;
  }
  return null;
};

export const parseGateWidthRange = (sku: string): string | null => {
  const match = sku.match(/^TLGATE-Sliding-(.+)$/i);
  if (!match) return null;
  const range = match[1]?.trim();
  return range ? range : null;
};

export const inferProductType = (sku: string): ProductType => {
  if (/^(Bellbrae-|Picket-|Mystique-|Timberline-|Crossbuck-|MeshPanel-)/i.test(sku)) {
    return "panel";
  }
  if (/^(ResPost-|TLPOST-|B-)/i.test(sku)) {
    return "post";
  }
  if (/^(TLGATE-|Gate-)/i.test(sku)) {
    return "gate";
  }
  if (/^Mesh-/i.test(sku)) {
    return "mesh";
  }
  if (sku === "KESTRELrail") {
    return "rail";
  }
  return "other";
};

export const parseCatalogRow = (raw: CatalogRawRow): CatalogRow | null => {
  const sku = typeof raw.sku === "string" ? raw.sku.trim() : "";
  if (!sku) return null;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const unitPrice = parsePrice(raw.unitPrice);
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
  } as const;

  const key = buildKey(baseRow);

  return {
    ...baseRow,
    key,
  };
};

export const parseCatalogRows = (rows: CatalogRawRow[]) => {
  const parsed: CatalogRow[] = [];
  rows.forEach((row) => {
    const normalized = parseCatalogRow(row);
    if (normalized) {
      parsed.push(normalized);
    }
  });
  return parsed;
};
