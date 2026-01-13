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
import {
  resolveSkuForLineItem,
  roundToTenth,
  formatHeightM,
  type LineItemType,
  type GateSkuType,
} from "@/pricing/skuResolver";
import { getFenceStyleLabel } from "@/config/fenceStyles";
import {
  findPriceMatch,
  type PricingIndex,
  type PriceLookupDiagnostics,
} from "@/pricing/pricingLookup";

export type QuoteLineItem = {
  name: string;
  quantity: number;
  sku: string | null;
  unitPrice: number | null;
  lineTotal: number | null;
  missingReason?: string;
  missingDetails?: PriceLookupDiagnostics;
  itemType: LineItemType;
};

export type QuoteSummary = {
  lineItems: QuoteLineItem[];
  missingItems: QuoteLineItem[];
  pricedTotal: number;
  grandTotal: number | null;
  totalLengthMm: number;
};

const toCurrency = (value: number) => Math.round(value * 100) / 100;

const getGateSkuType = (gate: Gate): GateSkuType | null => {
  if (gate.type.startsWith("double")) return "Double";
  if (gate.type.startsWith("single")) return "Single";
  return null;
};

const formatGateLabel = (gate: Gate, widthM: number) => {
  const roundedWidth = roundToTenth(widthM).toFixed(1);
  const gateType = getGateSkuType(gate);
  if (gateType) {
    return `${gateType} Gate ${roundedWidth}m`;
  }
  return `Gate ${roundedWidth}m`;
};

const resolveLineItemPricing = (
  item: QuoteLineItem,
  pricingIndex: PricingIndex,
  fenceCategoryId: FenceCategoryId
): QuoteLineItem => {
  if (!item.sku) {
    return item;
  }

  const matchResult = findPriceMatch({
    index: pricingIndex,
    sku: item.sku,
    name: item.name,
    category: fenceCategoryId,
  });

  if (matchResult.status !== "matched") {
    const reason =
      matchResult.status === "ambiguous"
        ? "Ambiguous price match"
        : item.missingReason ?? "No price found for SKU";
    return {
      ...item,
      unitPrice: null,
      lineTotal: null,
      missingReason: reason,
      missingDetails: matchResult.diagnostics,
    };
  }

  const unitPrice = matchResult.match.unitPrice;
  return {
    ...item,
    unitPrice,
    lineTotal: toCurrency(unitPrice * item.quantity),
  };
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
  pricingIndex: PricingIndex;
}): QuoteSummary {
  const {
    fenceCategoryId,
    fenceStyleId,
    fenceHeightM,
    fenceColourMode,
    panels,
    posts,
    gates,
    lines,
    pricingIndex,
  } = args;

  const lineItems: QuoteLineItem[] = [];

  const totalLengthMm = lines.reduce((sum, line) => sum + line.length_mm, 0);

  const panelQuantity = countBoardsPurchased(panels);
  if (panelQuantity > 0) {
    const skuResult = resolveSkuForLineItem({
      fenceStyleId,
      fenceHeightM,
      fenceColourMode,
      lineItemType: "panel",
    });
    lineItems.push({
      name: `${getFenceStyleLabel(fenceStyleId)} Panel ${formatHeightM(fenceHeightM)}`,
      quantity: panelQuantity,
      sku: skuResult.sku,
      unitPrice: null,
      lineTotal: null,
      missingReason: skuResult.reason,
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
    const skuResult = resolveSkuForLineItem({
      fenceStyleId,
      fenceHeightM,
      fenceColourMode,
      lineItemType: postItem.itemType,
    });
    lineItems.push({
      name: postItem.label,
      quantity: postItem.quantity,
      sku: skuResult.sku,
      unitPrice: null,
      lineTotal: null,
      missingReason: skuResult.reason,
      itemType: postItem.itemType,
    });
  });

  const gateGroups = new Map<
    string,
    { quantity: number; skuResult: { sku: string | null; reason?: string }; name: string }
  >();

  gates.forEach((gate) => {
    const gateWidthM = gate.opening_mm / 1000;
    const gateType = getGateSkuType(gate);
    const skuResult = resolveSkuForLineItem({
      fenceStyleId,
      fenceHeightM,
      fenceColourMode,
      lineItemType: "gate",
      gateWidthM,
      gateType,
    });
    const name = formatGateLabel(gate, gateWidthM);
    const key = `${name}|${skuResult.sku ?? skuResult.reason ?? "missing"}`;
    const existing = gateGroups.get(key);
    if (existing) {
      existing.quantity += 1;
    } else {
      gateGroups.set(key, { quantity: 1, skuResult, name });
    }
  });

  gateGroups.forEach((group) => {
    lineItems.push({
      name: group.name,
      quantity: group.quantity,
      sku: group.skuResult.sku,
      unitPrice: null,
      lineTotal: null,
      missingReason: group.skuResult.reason,
      itemType: "gate",
    });
  });

  const pricedLineItems = lineItems.map((item) =>
    resolveLineItemPricing(item, pricingIndex, fenceCategoryId)
  );

  const missingItems = pricedLineItems.filter(
    (item) => !item.sku || item.unitPrice === null
  );

  if (import.meta.env.DEV && missingItems.length > 0) {
    missingItems.forEach((item) => {
      // eslint-disable-next-line no-console
      console.warn("Missing pricing", {
        name: item.name,
        sku: item.sku,
        reason: item.missingReason,
      });
    });
  }

  const pricedTotal = pricedLineItems.reduce(
    (sum, item) => sum + (item.lineTotal ?? 0),
    0
  );
  const grandTotal = missingItems.length === 0 ? pricedTotal : null;

  return {
    lineItems: pricedLineItems,
    missingItems,
    pricedTotal,
    grandTotal,
    totalLengthMm,
  };
}
