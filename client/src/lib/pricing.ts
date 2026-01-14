import type { FenceCategoryId, FenceColourMode, FenceStyleId, Gate, PanelSegment, Post } from "@/types/models";
import type { FenceLine } from "@/types/models";
import { countBoardsPurchased } from "@/geometry/panels";
import { getFenceStyleLabel } from "@/config/fenceStyles";

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
  panels: PanelSegment[];
  posts: Post[];
  gates: Gate[];
  lines: FenceLine[];
}): QuoteSummary {
  const { fenceStyleId, fenceHeightM, panels, posts, gates, lines } = args;

  const lineItems: QuoteLineItem[] = [];

  const totalLengthMm = lines.reduce((sum, line) => sum + line.length_mm, 0);

  const addLineItem = (item: Omit<QuoteLineItem, "unitPrice" | "lineTotal" | "sku">) => {
    lineItems.push({
      ...item,
      sku: null,
      unitPrice: 0,
      lineTotal: 0,
    });
  };

  const panelQuantity = countBoardsPurchased(panels);
  if (panelQuantity > 0) {
    addLineItem({
      name: `${getFenceStyleLabel(fenceStyleId)} Panel ${formatHeightM(fenceHeightM)}`,
      quantity: panelQuantity,
      itemType: "panel",
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
    addLineItem({
      name: postItem.label,
      quantity: postItem.quantity,
      itemType: postItem.itemType,
    });
  });

  const gateGroups = new Map<string, { quantity: number; name: string; gateWidthM: number }>();

  gates.forEach((gate) => {
    const gateWidthM = gate.opening_mm / 1000;
    const name = formatGateLabel(gate, gateWidthM);
    const existing = gateGroups.get(name);
    if (existing) {
      existing.quantity += 1;
    } else {
      gateGroups.set(name, { quantity: 1, name, gateWidthM });
    }
  });

  gateGroups.forEach((group) => {
    addLineItem({
      name: group.name,
      quantity: group.quantity,
      itemType: "gate",
      gateWidthM: group.gateWidthM,
      gateWidthRange: null,
    });
  });

  const pricedTotal = lineItems.reduce((sum, item) => sum + (item.lineTotal ?? 0), 0);
  const grandTotal = pricedTotal;

  return {
    lineItems,
    missingItems: [],
    pricedTotal,
    grandTotal,
    totalLengthMm,
  };
}
