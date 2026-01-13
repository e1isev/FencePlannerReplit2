import type { FenceCategoryId, FenceColourMode, FenceStyleId } from "@/types/models";
import { FENCE_HEIGHTS_M } from "@/config/fenceHeights";

export type LineItemType =
  | "panel"
  | "gate"
  | "post_end"
  | "post_corner"
  | "post_line"
  | "post_t"
  | "post_blank"
  | "cap"
  | "bracket";

export type GateSkuType = "Single" | "Double";

export type SkuResolveReason = "NO_RULE" | "UNSUPPORTED_COMBINATION";

export type SkuResolution =
  | { ok: true; sku: string }
  | { ok: false; reason: SkuResolveReason };

export const formatHeightM = (heightM: number) => `${heightM.toFixed(1)}m`;

export const roundToTenth = (value: number) => Math.round(value * 10) / 10;

const PICKET_STYLES: FenceStyleId[] = [
  "jabiru",
  "kestrel",
  "kookaburra",
  "rosella",
  "wren",
];

const PANEL_HEIGHTS_BY_STYLE: Partial<
  Record<FenceStyleId, Record<FenceColourMode, number[]>>
> = {
  bellbrae: {
    White: [1.2, 1.4, 1.6, 1.8],
    Colour: [0.9, 1.2, 1.4, 1.6, 1.8],
  },
  jabiru: {
    White: [0.9, 1.2, 1.4, 1.6, 1.8],
    Colour: [0.9, 1.2, 1.4, 1.6, 1.8],
  },
  kestrel: {
    White: [0.9, 1.2, 1.4, 1.6, 1.8],
    Colour: [0.9, 1.2, 1.4, 1.6, 1.8],
  },
  kookaburra: {
    White: [0.9, 1.2, 1.4, 1.6, 1.8],
    Colour: [0.9, 1.2, 1.4, 1.6, 1.8],
  },
  rosella: {
    White: [0.9, 1.2, 1.4, 1.6, 1.8],
    Colour: [0.9, 1.2, 1.4, 1.6, 1.8],
  },
  wren: {
    White: [1.2],
    Colour: [1.2],
  },
  mystique_solid: {
    White: [1.2, 1.4, 1.6, 1.8, 2.0, 2.1],
    Colour: [1.2, 1.4, 1.6, 1.8, 2.0],
  },
  mystique_lattice: {
    White: [1.2, 1.4, 1.6, 1.8, 2.0],
    Colour: [1.2, 1.4, 1.6, 1.8, 2.0],
  },
};

const RESIDENTIAL_PANEL_SKU_BASE: Partial<Record<FenceStyleId, string>> = {
  bellbrae: "Bellbrae",
};

export const getSupportedPanelHeights = (
  styleId: FenceStyleId,
  colourMode: FenceColourMode
) => PANEL_HEIGHTS_BY_STYLE[styleId]?.[colourMode] ?? [...FENCE_HEIGHTS_M];

const supportsPanelHeight = (
  styleId: FenceStyleId,
  colourMode: FenceColourMode,
  heightM: number
) => getSupportedPanelHeights(styleId, colourMode).includes(heightM);

const formatGateWidth = (widthM: number) => {
  const rounded = Math.round(widthM * 100) / 100;
  const hasTwoDecimals = Math.abs(rounded * 10 - Math.round(rounded * 10)) > 0.001;
  return rounded.toFixed(hasTwoDecimals ? 2 : 1);
};

const PICKET_GATE_WIDTHS: Record<GateSkuType, number[]> = {
  Single: [0.9, 1.2, 1.4, 1.6, 1.8, 2.35],
  Double: [1.8, 2.35, 2.4, 3.0, 4.0, 4.7],
};

const RURAL_STYLE_SKUS: Partial<
  Record<FenceStyleId, Record<FenceColourMode, string>>
> = {
  "1_rail_140x40": {
    White: "Timberline-140x40mm-White",
    Colour: "Israel 140x40 Colour",
  },
  "2_rails_140x40": {
    White: "Timberline-140x40mm-White",
    Colour: "Israel 140x40 Colour",
  },
  "3_rails_140x40": {
    White: "Timberline-140x40mm-White",
    Colour: "Israel 140x40 Colour",
  },
  "4_rails_140x40": {
    White: "Timberline-140x40mm-White",
    Colour: "Israel 140x40 Colour",
  },
  "1_rail_150x50": {
    White: "Timberline-150x50mm-White",
    Colour: "Timberline-150x50mm-Colour",
  },
  "2_rails_150x50": {
    White: "Timberline-150x50mm-White",
    Colour: "Timberline-150x50mm-Colour",
  },
  "3_rails_150x50": {
    White: "Timberline-150x50mm-White",
    Colour: "Timberline-150x50mm-Colour",
  },
  "4_rails_150x50": {
    White: "Timberline-150x50mm-White",
    Colour: "Timberline-150x50mm-Colour",
  },
  caviar_150x50: {
    White: "Caviar",
    Colour: "Caviar",
  },
  crossbuck_150x50: {
    White: "Crossbuck-150x50mm-White",
    Colour: "Crossbuck-150x50mm-Colour",
  },
  mesh_150x50: {
    White: "MeshPanel-White-150x50mm",
    Colour: "MeshPanel-Colour-150x50mm",
  },
};

const SPECIAL_POST_SKUS = {
  mystique_solid: {
    White: {
      1.8: {
        blank: "B-PSL-BNK-02-24",
        end: "B-MS-PSE-02-24",
        line: "B-MS-PSL-02-24",
        corner: "B-MS-PSC-02-24",
      },
    },
  },
  mystique_lattice: {
    White: {
      1.8: {
        end: "B-MC-PSE-02-24",
        line: "B-MC-PSL-02-24",
        corner: "B-MC-PSC-02-24",
      },
    },
  },
  wren: {
    White: {
      1.2: {
        blank: "B-PSL-BNK-02-12",
        end: "B-WR-PSE-02-18",
        line: "B-WR-PSL-02-18",
        corner: "B-WR-PSC-02-18",
      },
    },
  },
} as const;

const postTypeLabels: Record<LineItemType, string> = {
  post_end: "End",
  post_corner: "Corner",
  post_line: "Line",
  post_t: "T",
  post_blank: "Blank",
  panel: "",
  gate: "",
  cap: "",
  bracket: "",
};

const getSpecialPostSku = (
  styleId: FenceStyleId,
  colourMode: FenceColourMode,
  heightM: number,
  postKey: "blank" | "end" | "line" | "corner"
) => {
  const styleEntry = SPECIAL_POST_SKUS[styleId];
  const colourEntry = styleEntry?.[colourMode];
  const heightEntry = colourEntry?.[heightM as keyof typeof colourEntry];
  return heightEntry?.[postKey];
};

export const resolvePanelSku = (args: {
  fenceCategoryId: FenceCategoryId;
  fenceStyleId: FenceStyleId;
  fenceColourMode: FenceColourMode;
  fenceHeightM: number;
}): SkuResolution => {
  const { fenceCategoryId } = args;
  if (fenceCategoryId === "rural") {
    return resolveRuralSku(args);
  }

  const { fenceStyleId, fenceColourMode, fenceHeightM } = args;

  if (!supportsPanelHeight(fenceStyleId, fenceColourMode, fenceHeightM)) {
    return { ok: false, reason: "UNSUPPORTED_COMBINATION" };
  }

  if (fenceStyleId === "mystique_lattice") {
    return {
      ok: true,
      sku: `Mystique-Lattice-${fenceColourMode}-${formatHeightM(fenceHeightM)}`,
    };
  }

  if (fenceStyleId === "mystique_solid") {
    return {
      ok: true,
      sku: `Mystique-Solid-${fenceColourMode}-${formatHeightM(fenceHeightM)}`,
    };
  }

  if (PICKET_STYLES.includes(fenceStyleId)) {
    const label = fenceStyleId
      .split("_")
      .map((chunk) => chunk[0]?.toUpperCase() + chunk.slice(1))
      .join(" ");
    const skuStyle = label.replace(/\s+/g, "");
    return {
      ok: true,
      sku: `Picket-${skuStyle}-${fenceColourMode}-${formatHeightM(fenceHeightM)}`,
    };
  }

  const simpleSkuBase = RESIDENTIAL_PANEL_SKU_BASE[fenceStyleId];
  if (!simpleSkuBase) {
    return { ok: false, reason: "NO_RULE" };
  }

  return {
    ok: true,
    sku: `${simpleSkuBase}-${fenceColourMode}-${formatHeightM(fenceHeightM)}`,
  };
};

export const resolveGateSku = (args: {
  fenceCategoryId: FenceCategoryId;
  fenceStyleId: FenceStyleId;
  fenceColourMode: FenceColourMode;
  fenceHeightM: number;
  gateType?: GateSkuType | null;
  gateWidthM?: number | null;
}): SkuResolution => {
  const { fenceCategoryId, fenceStyleId, fenceColourMode, fenceHeightM } = args;

  if (fenceCategoryId === "rural") {
    return resolveRuralGateSku(args);
  }

  if (!PICKET_STYLES.includes(fenceStyleId)) {
    return { ok: false, reason: "NO_RULE" };
  }

  if (!supportsPanelHeight(fenceStyleId, fenceColourMode, fenceHeightM)) {
    return { ok: false, reason: "UNSUPPORTED_COMBINATION" };
  }

  const gateType = args.gateType ?? null;
  if (!gateType) {
    return { ok: false, reason: "NO_RULE" };
  }

  const gateWidthM = args.gateWidthM ?? null;
  if (!gateWidthM) {
    return { ok: false, reason: "UNSUPPORTED_COMBINATION" };
  }

  const roundedWidth = Math.round(gateWidthM * 100) / 100;
  const allowedWidths = PICKET_GATE_WIDTHS[gateType];
  if (!allowedWidths.includes(roundedWidth)) {
    return { ok: false, reason: "UNSUPPORTED_COMBINATION" };
  }

  const heightLabel = `${fenceHeightM.toFixed(1)}H`;
  const widthLabel = `${formatGateWidth(roundedWidth)}W`;

  return {
    ok: true,
    sku: `Gate-Picket-${gateType}-${heightLabel}-${widthLabel}`,
  };
};

export const resolvePostSku = (args: {
  fenceStyleId: FenceStyleId;
  fenceColourMode: FenceColourMode;
  fenceHeightM: number;
  lineItemType: LineItemType;
}): SkuResolution => {
  const { fenceStyleId, fenceColourMode, fenceHeightM, lineItemType } = args;
  const postLabel = postTypeLabels[lineItemType];
  if (!postLabel) {
    return { ok: false, reason: "NO_RULE" };
  }

  if (["post_end", "post_line", "post_corner", "post_blank"].includes(lineItemType)) {
    const postKey = postLabel.toLowerCase() as "blank" | "end" | "line" | "corner";
    const specialSku = getSpecialPostSku(fenceStyleId, fenceColourMode, fenceHeightM, postKey);
    if (specialSku) {
      return { ok: true, sku: specialSku };
    }
  }

  const colourCode = fenceColourMode === "White" ? "Wht" : "Col";
  return {
    ok: true,
    sku: `ResPost-${postLabel}-${colourCode}-${formatHeightM(fenceHeightM)}`,
  };
};

export const resolveRuralSku = (args: {
  fenceStyleId: FenceStyleId;
  fenceColourMode: FenceColourMode;
}): SkuResolution => {
  const { fenceStyleId, fenceColourMode } = args;
  const sku = RURAL_STYLE_SKUS[fenceStyleId]?.[fenceColourMode];
  if (!sku) {
    return { ok: false, reason: "NO_RULE" };
  }
  return { ok: true, sku };
};

const resolveRuralGateSku = (args: {
  fenceStyleId: FenceStyleId;
  gateType?: GateSkuType | null;
  gateWidthM?: number | null;
}): SkuResolution => {
  const { fenceStyleId } = args;
  const gateType = args.gateType ?? null;
  if (!gateType) {
    return { ok: false, reason: "NO_RULE" };
  }

  const gateWidthM = args.gateWidthM ?? null;
  if (!gateWidthM) {
    return { ok: false, reason: "UNSUPPORTED_COMBINATION" };
  }

  const widthLabel = `${formatGateWidth(gateWidthM)}m`;

  if (fenceStyleId === "mesh_150x50") {
    return {
      ok: true,
      sku: `TLGATE-Mesh-${gateType}-${widthLabel}`,
    };
  }

  const match = fenceStyleId.match(/^(\d)_rail/);
  const railCount = match ? match[1] : fenceStyleId.match(/^(\d)_rails/)?.[1];
  if (railCount) {
    return {
      ok: true,
      sku: `TLGATE-${railCount}R-${gateType}-${widthLabel}`,
    };
  }

  return { ok: false, reason: "NO_RULE" };
};

export const resolveSkuForLineItem = (args: {
  fenceCategoryId: FenceCategoryId;
  fenceStyleId: FenceStyleId;
  fenceHeightM: number;
  fenceColourMode: FenceColourMode;
  lineItemType: LineItemType;
  gateWidthM?: number | null;
  gateType?: GateSkuType | null;
}): { sku: string | null; reason?: SkuResolveReason } => {
  const { lineItemType } = args;

  if (lineItemType === "panel") {
    const panelResult = resolvePanelSku(args);
    return panelResult.ok
      ? { sku: panelResult.sku }
      : { sku: null, reason: panelResult.reason };
  }

  if (lineItemType === "gate") {
    const gateResult = resolveGateSku(args);
    return gateResult.ok
      ? { sku: gateResult.sku }
      : { sku: null, reason: gateResult.reason };
  }

  if (lineItemType.startsWith("post_")) {
    const postResult = resolvePostSku(args);
    return postResult.ok
      ? { sku: postResult.sku }
      : { sku: null, reason: postResult.reason };
  }

  return { sku: null, reason: "NO_RULE" };
};
