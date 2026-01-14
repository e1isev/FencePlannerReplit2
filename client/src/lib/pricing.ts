import type { FenceCategoryId, FenceColourMode, FenceStyleId, Gate, PanelSegment, Post } from "@/types/models";
import type { FenceLine } from "@/types/models";
import { countBoardsPurchased } from "@/geometry/panels";
import { formatHeightM, roundToTenth, type LineItemType } from "@/pricing/skuRules";
import { getFenceStyleLabel } from "@/config/fenceStyles";
import type { CatalogIndex, CatalogRow } from "@/pricing/catalogTypes";
import { resolveCatalogKey } from "@/pricing/catalogIndex";
import { buildGateKey, buildPanelKey, buildPostKeys } from "@/pricing/catalogQuery";

export type PricingCatalogEntry = { name: string; unitPrice: number; sku: string };

export type QuoteLineItem = {
  name: string;
  quantity: number;
  sku: string | null;
  unitPrice: number | null;
  lineTotal: number | null;
  missingReason?: MissingReason;
  missingDiagnostics?: CatalogDiagnostics;
  catalogKey?: string | null;
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

export type MissingReason =
  | "CATALOGUE_NOT_LOADED"
  | "NOT_FOUND"
  | "DUPLICATE"
  | "NO_PRICE"
  | "STYLE_NOT_MAPPED"
  | "AMBIGUOUS_RANGE";

export type CatalogDiagnostics = {
  key: string;
  reason: MissingReason;
  duplicates?: CatalogRow[];
};

const toCurrency = (value: number) => Math.round(value * 100) / 100;

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
  pricingIndex: CatalogIndex | null;
  catalogReady: boolean;
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
    catalogReady,
  } = args;

  const lineItems: QuoteLineItem[] = [];
  const canPrice = catalogReady && pricingIndex !== null;

  const totalLengthMm = lines.reduce((sum, line) => sum + line.length_mm, 0);

  const panelQuantity = countBoardsPurchased(panels);
  if (panelQuantity > 0) {
    const panelKey = buildPanelKey({
      fenceCategoryId,
      fenceStyleId,
      fenceColourMode,
      fenceHeightM,
    });
    let rowResult: ReturnType<typeof resolveCatalogKey> | null = null;
    if (panelKey && canPrice && pricingIndex) {
      rowResult = resolveCatalogKey(pricingIndex, panelKey);
    }
    const row = rowResult && rowResult.ok ? rowResult.row : null;
    const missingReason: MissingReason | undefined = !canPrice
      ? "CATALOGUE_NOT_LOADED"
      : !panelKey
      ? "STYLE_NOT_MAPPED"
      : rowResult && !rowResult.ok
        ? rowResult.reason
        : undefined;
    const diagnostics =
      panelKey && rowResult && !rowResult.ok
        ? { key: panelKey, reason: rowResult.reason, duplicates: rowResult.duplicates }
        : panelKey && missingReason === "STYLE_NOT_MAPPED"
          ? { key: panelKey, reason: missingReason }
          : undefined;
    lineItems.push({
      name: `${getFenceStyleLabel(fenceStyleId)} Panel ${formatHeightM(fenceHeightM)}`,
      quantity: panelQuantity,
      sku: row?.sku ?? null,
      unitPrice: row?.unitPrice ?? null,
      lineTotal: row?.unitPrice ? toCurrency(row.unitPrice * panelQuantity) : null,
      missingReason,
      missingDiagnostics: diagnostics,
      catalogKey: panelKey,
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
    const postType = postItem.itemType.replace("post_", "");
    const postKeys = buildPostKeys({
      fenceCategoryId,
      fenceStyleId,
      fenceColourMode,
      fenceHeightM,
      postType,
    });
    let resolvedRow: CatalogRow | null = null;
    let resolvedKey: string | null = null;
    let failure: MissingReason | undefined;
    let diagnostics: CatalogDiagnostics | undefined;

    if (!canPrice) {
      failure = "CATALOGUE_NOT_LOADED";
    } else {
      const results = postKeys.map((key) => ({
        key,
        result: resolveCatalogKey(pricingIndex, key),
      }));
      const okMatch = results.find((result) => result.result.ok);
      if (okMatch?.result.ok) {
        resolvedRow = okMatch.result.row;
        resolvedKey = okMatch.key;
      } else {
        const duplicateMatch = results.find((result) => !result.result.ok && result.result.reason === "DUPLICATE");
        if (duplicateMatch && !duplicateMatch.result.ok) {
          failure = "DUPLICATE";
          diagnostics = {
            key: duplicateMatch.key,
            reason: duplicateMatch.result.reason,
            duplicates: duplicateMatch.result.duplicates,
          };
          resolvedKey = duplicateMatch.key;
        } else {
          const noPriceMatch = results.find((result) => !result.result.ok && result.result.reason === "NO_PRICE");
          if (noPriceMatch && !noPriceMatch.result.ok) {
            failure = "NO_PRICE";
            diagnostics = {
              key: noPriceMatch.key,
              reason: noPriceMatch.result.reason,
              duplicates: noPriceMatch.result.duplicates,
            };
            resolvedKey = noPriceMatch.key;
          } else {
            const notFoundMatch = results[0];
            failure = "NOT_FOUND";
            diagnostics = {
              key: notFoundMatch.key,
              reason: "NOT_FOUND",
            };
            resolvedKey = notFoundMatch.key;
          }
        }
      }
    }

    lineItems.push({
      name: postItem.label,
      quantity: postItem.quantity,
      sku: resolvedRow?.sku ?? null,
      unitPrice: resolvedRow?.unitPrice ?? null,
      lineTotal: resolvedRow?.unitPrice
        ? toCurrency(resolvedRow.unitPrice * postItem.quantity)
        : null,
      missingReason: failure,
      missingDiagnostics: diagnostics,
      catalogKey: resolvedKey,
      itemType: postItem.itemType,
    });
  });

  const gateGroups = new Map<
    string,
    {
      quantity: number;
      skuResult: {
        sku: string | null;
        reason?: MissingReason;
        diagnostics?: CatalogDiagnostics;
        key?: string | null;
        widthRange?: string | null;
        unitPrice?: number | null;
      };
      name: string;
      gateWidthM: number;
    }
  >();

  gates.forEach((gate) => {
    const gateWidthM = gate.opening_mm / 1000;
    const gateKeyInfo = canPrice && pricingIndex
      ? buildGateKey({
          index: pricingIndex,
          fenceCategoryId,
          fenceStyleId,
          fenceHeightM,
          gate,
        })
      : { key: null, rangeAmbiguous: false };
    const gateKey = gateKeyInfo.key;
    const lookup = gateKey && canPrice ? resolveCatalogKey(pricingIndex, gateKey) : null;
    const gateRow = lookup && lookup.ok ? lookup.row : null;
    const missingReason: MissingReason | undefined = !canPrice
      ? "CATALOGUE_NOT_LOADED"
      : gateKeyInfo.rangeAmbiguous
        ? "AMBIGUOUS_RANGE"
        : !gateKey
          ? "STYLE_NOT_MAPPED"
          : lookup && !lookup.ok
            ? lookup.reason
            : undefined;
    const diagnostics =
      gateKey && lookup && !lookup.ok
        ? { key: gateKey, reason: lookup.reason, duplicates: lookup.duplicates }
        : gateKey && missingReason === "AMBIGUOUS_RANGE"
          ? { key: gateKey, reason: missingReason }
          : undefined;
    const name = formatGateLabel(gate, gateWidthM);
    const key = `${name}|${gateRow?.sku ?? missingReason ?? "missing"}`;
    const existing = gateGroups.get(key);
    if (existing) {
      existing.quantity += 1;
    } else {
      gateGroups.set(key, {
        quantity: 1,
        skuResult: {
          sku: gateRow?.sku ?? null,
          reason: missingReason,
          diagnostics,
          key: gateKey,
          widthRange: gateKeyInfo.rangeUsed ?? gate.widthRange ?? null,
          unitPrice: gateRow?.unitPrice ?? null,
        },
        name,
        gateWidthM,
      });
    }
  });

  gateGroups.forEach((group) => {
    lineItems.push({
      name: group.name,
      quantity: group.quantity,
      sku: group.skuResult.sku ?? null,
      unitPrice: group.skuResult.unitPrice ?? null,
      lineTotal: group.skuResult.unitPrice
        ? toCurrency(group.skuResult.unitPrice * group.quantity)
        : null,
      missingReason: group.skuResult.reason,
      missingDiagnostics: group.skuResult.diagnostics,
      catalogKey: group.skuResult.key,
      itemType: "gate",
      gateWidthM: group.gateWidthM,
      gateWidthRange: group.skuResult.widthRange,
    });
  });

  const pricedLineItems = lineItems.map((item) => {
    if (!canPrice) {
      return {
        ...item,
        unitPrice: null,
        lineTotal: null,
        missingReason: item.missingReason ?? "CATALOGUE_NOT_LOADED",
      };
    }
    if (!item.sku) {
      return item;
    }
    if (item.unitPrice !== null) {
      return {
        ...item,
        lineTotal: item.unitPrice ? toCurrency(item.unitPrice * item.quantity) : null,
      };
    }
    return item;
  });

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
        diagnostics: item.missingDiagnostics,
        key: item.catalogKey,
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
