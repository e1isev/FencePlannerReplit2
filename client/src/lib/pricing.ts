import type {
  FenceCategoryId,
  FenceColourMode,
  FenceStyleId,
  Gate,
  PanelSegment,
  Post,
} from "@/types/models";
import type { FenceLine } from "@/types/models";
import { countBoardsPurchased } from "@/geometry/panels";
import { getFenceStyleLabel } from "@/config/fenceStyles";
import {
  resolveResidentialRow,
  resolveResidentialSkuAndPrice,
  type ResidentialPricingIndex,
  type ResidentialSelection,
} from "@shared/pricing/residentialPricing";

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

const formatHeightM = (heightM: number) => `${heightM.toFixed(1)}m`;
const roundToTenth = (value: number) => Math.round(value * 10) / 10;

export type QuoteLineItem = {
  name: string;
  quantity: number;
  sku: string | null;
  unitPrice: number | null;
  lineTotal: number | null;
  itemType: LineItemType;
  gateWidthM?: number;
  gateWidthRange?: string | null;
  debugInfo?: string;
};

export type QuoteSummary = {
  lineItems: QuoteLineItem[];
  missingItems: QuoteLineItem[];
  pricedTotal: number;
  grandTotal: number | null;
  totalLengthMm: number;
};

const formatGateLabel = (gate: Gate, widthM: number) => {
  const roundedWidth = roundToTenth(widthM).toFixed(1);
  if (gate.type.startsWith("double")) return `Double Gate ${roundedWidth}m`;
  if (gate.type.startsWith("single")) return `Single Gate ${roundedWidth}m`;
  if (gate.type.startsWith("sliding")) return `Sliding Gate ${roundedWidth}m`;
  return `Gate ${roundedWidth}m`;
};

export function calculateCosts(args: {
  fenceCategoryId: FenceCategoryId;
  fenceStyleId: FenceStyleId;
  fenceHeightM: number;
  fenceColourMode: FenceColourMode;
  residentialIndex?: ResidentialPricingIndex | null;
  panels: PanelSegment[];
  posts: Post[];
  gates: Gate[];
  lines: FenceLine[];
}): QuoteSummary {
  const { fenceCategoryId, fenceStyleId, fenceHeightM, panels, posts, gates, lines } =
    args;

  const lineItems: QuoteLineItem[] = [];
  const missingItems: QuoteLineItem[] = [];

  const totalLengthMm = lines.reduce((sum, line) => sum + line.length_mm, 0);

  const fenceStyleLabel = getFenceStyleLabel(fenceStyleId);
  const colourLabel = fenceColourMode === "Colour" ? "Coloured" : "White";

  const addLineItem = (
    item: Omit<QuoteLineItem, "unitPrice" | "lineTotal" | "sku">,
    selection?: ResidentialSelection
  ) => {
    let sku: string | null = null;
    let unitPrice: number | null = 0;
    let lineTotal: number | null = 0;
    let debugInfo: string | undefined;
    let gateWidthRange: string | null | undefined = item.gateWidthRange;

    if (fenceCategoryId === "residential" && selection) {
      const resolved = resolveResidentialSkuAndPrice(args.residentialIndex ?? null, selection);
      if (resolved) {
        sku = resolved.sku;
        unitPrice = resolved.unit_price;
        lineTotal = resolved.unit_price * item.quantity;
        if (selection.type === "Sliding Gate") {
          const row = resolveResidentialRow(args.residentialIndex ?? null, selection);
          if (row && row.width && typeof row.width !== "number") {
            gateWidthRange = `${row.width.min}-${row.width.max}`;
          }
        }
      } else {
        const key = [
          selection.type,
          selection.fenceStyle,
          selection.colour,
          selection.height_m,
          selection.gateWidth_m ?? "",
        ]
          .filter((value) => value !== "")
          .join("|");
        sku = "MISSING_SHEET_MATCH";
        unitPrice = 0;
        lineTotal = 0;
        debugInfo = `Missing residential pricing for ${key}`;
      }
    }

    const lineItem = {
      ...item,
      sku,
      unitPrice,
      lineTotal,
      gateWidthRange,
      debugInfo,
    };
    lineItems.push(lineItem);
    if (debugInfo) missingItems.push(lineItem);
  };

  const panelQuantity = countBoardsPurchased(panels);
  if (panelQuantity > 0) {
    addLineItem({
      name: `${getFenceStyleLabel(fenceStyleId)} Panel ${formatHeightM(fenceHeightM)}`,
      quantity: panelQuantity,
      itemType: "panel",
    },
    {
      type: "Panel",
      fenceStyle: fenceStyleLabel,
      colour: colourLabel,
      height_m: fenceHeightM,
    });
  }

  const postCounts = posts.reduce(
    (acc, post) => {
      acc[post.category] = (acc[post.category] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const postItems: Array<{ label: string; quantity: number; itemType: LineItemType }> = [
    { label: "End Posts", quantity: postCounts.end || 0, itemType: "post_end" },
    { label: "Corner Posts", quantity: postCounts.corner || 0, itemType: "post_corner" },
    { label: "T Posts", quantity: postCounts.t || 0, itemType: "post_t" },
    { label: "Line Posts", quantity: postCounts.line || 0, itemType: "post_line" },
  ];

  postItems.forEach((postItem) => {
    if (postItem.quantity <= 0) return;
    const typeMap: Record<LineItemType, ResidentialSelection["type"] | null> = {
      panel: "Panel",
      gate: "Single Gate",
      post_end: "End Post",
      post_corner: "Corner Post",
      post_line: "Line Post",
      post_t: "Corner Post",
      post_blank: "Blank Post",
      cap: null,
      bracket: null,
    };
    const selectionType = typeMap[postItem.itemType];
    addLineItem(
      {
        name: postItem.label,
        quantity: postItem.quantity,
        itemType: postItem.itemType,
      },
      selectionType
        ? {
            type: selectionType,
            fenceStyle: fenceStyleLabel,
            colour: colourLabel,
            height_m: fenceHeightM,
          }
        : undefined
    );
  });

  const gateGroups = new Map<
    string,
    { quantity: number; name: string; gateWidthM: number; gateType: Gate["type"] }
  >();

  gates.forEach((gate) => {
    const gateWidthM = gate.opening_mm / 1000;
    const name = formatGateLabel(gate, gateWidthM);
    const existing = gateGroups.get(name);
    if (existing) {
      existing.quantity += 1;
    } else {
      gateGroups.set(name, { quantity: 1, name, gateWidthM, gateType: gate.type });
    }
  });

  gateGroups.forEach((group) => {
    const selectionType: ResidentialSelection["type"] | null = group.gateType.startsWith(
      "single"
    )
      ? "Single Gate"
      : group.gateType.startsWith("double")
        ? "Double Gate"
        : group.gateType.startsWith("sliding")
          ? "Sliding Gate"
          : null;
    addLineItem(
      {
        name: group.name,
        quantity: group.quantity,
        itemType: "gate",
        gateWidthM: group.gateWidthM,
        gateWidthRange: null,
      },
      selectionType
        ? {
            type: selectionType,
            fenceStyle: fenceStyleLabel,
            colour: colourLabel,
            height_m: fenceHeightM,
            gateWidth_m: group.gateWidthM,
          }
        : undefined
    );
  });

  const pricedTotal = lineItems.reduce((sum, item) => sum + (item.lineTotal ?? 0), 0);
  const grandTotal = pricedTotal;

  return {
    lineItems,
    missingItems,
    pricedTotal,
    grandTotal,
    totalLengthMm,
  };
}
