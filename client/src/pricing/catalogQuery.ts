import type { FenceCategoryId, FenceColourMode, FenceStyleId, Gate } from "@/types/models";
import type { CatalogIndex, CatalogLookupResult } from "@/pricing/catalogTypes";
import { buildKey } from "@/pricing/catalogKey";
import {
  getCatalogStyleForFenceStyle,
  getCatalogColourForFenceColourMode,
  getCatalogGateType,
} from "@/pricing/catalogStyle";
import { resolveCatalogKey } from "@/pricing/catalogIndex";

export type CatalogKeyInfo = {
  key: string;
  lookup: CatalogLookupResult;
};

const parseRange = (range: string) => {
  const match = range.split("/").map((part) => Number.parseFloat(part));
  if (match.length !== 2 || match.some((value) => !Number.isFinite(value))) {
    return null;
  }
  return { min: Math.min(match[0], match[1]), max: Math.max(match[0], match[1]) };
};

export const resolveSlidingGateRange = (
  index: CatalogIndex,
  category: FenceCategoryId,
  style: string,
  widthM: number
): { range: string | null; ambiguous: boolean } => {
  const key = `${category}|${style}`;
  const options = index.optionSets.gateOptionsByCategoryStyle[key];
  if (!options?.widthRanges?.length) {
    return { range: null, ambiguous: false };
  }
  const matches = options.widthRanges.filter((range) => {
    const parsed = parseRange(range);
    if (!parsed) return false;
    return widthM >= parsed.min && widthM <= parsed.max;
  });
  if (matches.length === 1) {
    return { range: matches[0], ambiguous: false };
  }
  if (matches.length > 1) {
    return { range: null, ambiguous: true };
  }
  return { range: null, ambiguous: false };
};

export const buildPanelKey = (args: {
  fenceCategoryId: FenceCategoryId;
  fenceStyleId: FenceStyleId;
  fenceColourMode: FenceColourMode;
  fenceHeightM: number;
}) => {
  const style = getCatalogStyleForFenceStyle(args.fenceStyleId, "panel");
  if (!style) return null;
  return buildKey({
    category: args.fenceCategoryId,
    productType: "panel",
    style,
    colour: getCatalogColourForFenceColourMode(args.fenceColourMode),
    heightM: args.fenceHeightM,
  });
};

export const buildPostKeys = (args: {
  fenceCategoryId: FenceCategoryId;
  fenceStyleId: FenceStyleId;
  fenceColourMode: FenceColourMode;
  fenceHeightM: number;
  postType: string;
}) => {
  const base = {
    category: args.fenceCategoryId,
    productType: "post" as const,
    postType: args.postType,
    colour: getCatalogColourForFenceColourMode(args.fenceColourMode),
    heightM: args.fenceHeightM,
  };

  const stylePrimary = getCatalogStyleForFenceStyle(args.fenceStyleId, "post");
  const keys = [
    buildKey({
      ...base,
      style: stylePrimary ?? "",
    }),
  ];

  if (stylePrimary !== "ResPost" && args.fenceCategoryId === "residential") {
    keys.push(
      buildKey({
        ...base,
        style: "ResPost",
      })
    );
  }

  return keys;
};

export const buildGateKey = (args: {
  index: CatalogIndex;
  fenceCategoryId: FenceCategoryId;
  fenceStyleId: FenceStyleId;
  fenceHeightM: number;
  gate: Gate;
}): { key: string | null; rangeUsed?: string | null; rangeAmbiguous?: boolean } => {
  const gateType = getCatalogGateType(args.gate.type);
  if (!gateType) return { key: null };

  const style = getCatalogStyleForFenceStyle(args.fenceStyleId, "gate");
  if (!style) return { key: null };

  const widthM = args.gate.opening_mm / 1000;

  let widthRange: string | null = null;
  let rangeAmbiguous = false;

  if (gateType === "sliding") {
    widthRange = args.gate.widthRange ?? null;
    if (!widthRange && Number.isFinite(widthM)) {
      const resolved = resolveSlidingGateRange(
        args.index,
        args.fenceCategoryId,
        style,
        widthM
      );
      widthRange = resolved.range;
      rangeAmbiguous = resolved.ambiguous;
    }
  }

  const key = buildKey({
    category: args.fenceCategoryId,
    productType: "gate",
    style,
    gateType,
    heightM: args.fenceHeightM,
    gateWidthM: gateType === "sliding" ? null : widthM,
    gateWidthRange: gateType === "sliding" ? widthRange : null,
  });

  return { key, rangeUsed: widthRange, rangeAmbiguous };
};

export const resolveKey = (index: CatalogIndex, key: string): CatalogKeyInfo => ({
  key,
  lookup: resolveCatalogKey(index, key),
});
