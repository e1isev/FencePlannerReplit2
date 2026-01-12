import type { FenceColourMode, FenceStyleId } from "@/types/models";

export type LineItemType =
  | "panel"
  | "gate"
  | "post_end"
  | "post_corner"
  | "post_line"
  | "post_t"
  | "cap"
  | "bracket";

export type GateSkuType = "Single" | "Double";

export type FenceStyleSkuSpec =
  | { kind: "simple"; skuBase: string }
  | { kind: "picket"; skuBase: string }
  | { kind: "mystique"; variant: "Solid" | "Lattice" };

const FENCE_STYLE_SKU_SPECS: Partial<Record<FenceStyleId, FenceStyleSkuSpec>> = {
  bellbrae: { kind: "simple", skuBase: "Bellbrae" },
  jabiru: { kind: "picket", skuBase: "Jabiru" },
  kestrel: { kind: "simple", skuBase: "Kestrel" },
  kookaburra: { kind: "simple", skuBase: "Kookaburra" },
  rosella: { kind: "simple", skuBase: "Rosella" },
  toucan: { kind: "simple", skuBase: "Toucan" },
  wren: { kind: "simple", skuBase: "Wren" },
  mystique_lattice: { kind: "mystique", variant: "Lattice" },
  mystique_solid: { kind: "mystique", variant: "Solid" },
};

export const formatHeightM = (heightM: number) => `${heightM.toFixed(1)}m`;

export const roundToTenth = (value: number) => Math.round(value * 10) / 10;

type ResolveSkuArgs = {
  fenceStyleId: FenceStyleId;
  fenceHeightM: number;
  fenceColourMode: FenceColourMode;
  lineItemType: LineItemType;
  gateWidthM?: number | null;
  gateType?: GateSkuType | null;
};

export const resolveSkuForLineItem = (
  args: ResolveSkuArgs
): { sku: string | null; reason?: string } => {
  const { fenceStyleId, fenceHeightM, fenceColourMode, lineItemType } = args;

  if (lineItemType === "panel") {
    const spec = FENCE_STYLE_SKU_SPECS[fenceStyleId];
    if (!spec) {
      return { sku: null, reason: "No panel SKU rule for selected style" };
    }

    const heightLabel = formatHeightM(fenceHeightM);
    switch (spec.kind) {
      case "simple":
        return {
          sku: `${spec.skuBase}-${fenceColourMode}-${heightLabel}`,
        };
      case "picket":
        return {
          sku: `Picket-${spec.skuBase}-${fenceColourMode}-${heightLabel}`,
        };
      case "mystique":
        return {
          sku: `Mystique-${spec.variant}-${fenceColourMode}-${heightLabel}`,
        };
      default:
        return { sku: null, reason: "Unsupported panel SKU rule" };
    }
  }

  if (lineItemType === "gate") {
    const spec = FENCE_STYLE_SKU_SPECS[fenceStyleId];
    if (!spec || spec.kind !== "picket") {
      return { sku: null, reason: "No gate SKU rule for selected style" };
    }

    const gateType = args.gateType ?? null;
    if (!gateType) {
      return { sku: null, reason: "Unsupported gate type" };
    }

    const gateWidthM = args.gateWidthM ?? null;
    if (!gateWidthM) {
      return { sku: null, reason: "Missing gate width" };
    }

    const roundedWidth = roundToTenth(gateWidthM);
    const heightLabel = `${fenceHeightM.toFixed(1)}H`;
    const widthLabel = `${roundedWidth.toFixed(1)}W`;

    return {
      sku: `Gate-Picket-${gateType}-${heightLabel}-${widthLabel}`,
    };
  }

  return { sku: null, reason: "No SKU rule for item type" };
};
