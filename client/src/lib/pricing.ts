import { FenceStyleId, PanelSegment, Post, Gate } from "@/types/models";
import pricingData from "@/data/samplePricing.json";

const END_POST_EXTRA_MM = 63.5;

export function getPricing(styleId: FenceStyleId) {
  return pricingData.styles.find((s) => s.id === styleId)!;
}

export interface CostBreakdown {
  panels: { quantity: number; unitPrice: number; total: number };
  posts: {
    end: { quantity: number; unitPrice: number; total: number };
    corner: { quantity: number; unitPrice: number; total: number };
    line: { quantity: number; unitPrice: number; total: number };
  };
  gates: {
    single_900: { quantity: number; unitPrice: number; total: number };
    single_1800: { quantity: number; unitPrice: number; total: number };
    double_900: { quantity: number; unitPrice: number; total: number };
    double_1800: { quantity: number; unitPrice: number; total: number };
    sliding_4800: { quantity: number; unitPrice: number; total: number };
    opening_custom: { quantity: number; unitPrice: number; total: number };
  };
  grandTotal: number;
  totalLength_mm: number;
}

export function calculateCosts(
  styleId: FenceStyleId,
  panels: PanelSegment[],
  posts: Post[],
  gates: Gate[],
  lines: any[]
): CostBreakdown {
  const pricing = getPricing(styleId);

  const toCurrency = (value: number) => Math.round(value * 100) / 100;
  
  const numPanels = panels.filter((p) => {
    if (p.uses_leftover_id) return false;
    return true;
  }).length;
  
  const endPosts = posts.filter((p) => p.category === "end").length;
  const cornerPosts = posts.filter((p) => p.category === "corner").length;
  const linePosts = posts.filter((p) => p.category === "line").length;
  
  const gatesByType = {
    single_900: gates.filter((g) => g.type === "single_900").length,
    single_1800: gates.filter((g) => g.type === "single_1800").length,
    double_900: gates.filter((g) => g.type === "double_900").length,
    double_1800: gates.filter((g) => g.type === "double_1800").length,
    sliding_4800: gates.filter((g) => g.type === "sliding_4800").length,
    opening_custom: gates.filter((g) => g.type === "opening_custom").length,
  };
  
  const totalFenceLength = lines.reduce(
    (sum, line) => sum + line.length_mm,
    0
  ) + endPosts * END_POST_EXTRA_MM;
  
  const panelCost = toCurrency(numPanels * pricing.panel_unit_price);
  const endPostCost = toCurrency(endPosts * pricing.post_unit_price);
  const cornerPostCost = toCurrency(cornerPosts * pricing.post_unit_price);
  const linePostCost = toCurrency(linePosts * pricing.post_unit_price);

  const gateCosts = {
    single_900: toCurrency(
      gatesByType.single_900 * pricing.gate_prices.single_900
    ),
    single_1800: toCurrency(
      gatesByType.single_1800 * pricing.gate_prices.single_1800
    ),
    double_900: toCurrency(
      gatesByType.double_900 * pricing.gate_prices.double_900
    ),
    double_1800: toCurrency(
      gatesByType.double_1800 * pricing.gate_prices.double_1800
    ),
    sliding_4800: toCurrency(
      gatesByType.sliding_4800 * pricing.gate_prices.sliding_4800
    ),
    opening_custom: toCurrency(gatesByType.opening_custom * 500),
  };

  const grandTotal = toCurrency(
    panelCost +
      endPostCost +
      cornerPostCost +
      linePostCost +
      Object.values(gateCosts).reduce((sum, cost) => sum + cost, 0)
  );
  
  return {
    panels: { quantity: numPanels, unitPrice: pricing.panel_unit_price, total: panelCost },
    posts: {
      end: { quantity: endPosts, unitPrice: pricing.post_unit_price, total: endPostCost },
      corner: { quantity: cornerPosts, unitPrice: pricing.post_unit_price, total: cornerPostCost },
      line: { quantity: linePosts, unitPrice: pricing.post_unit_price, total: linePostCost },
    },
    gates: {
      single_900: { quantity: gatesByType.single_900, unitPrice: pricing.gate_prices.single_900, total: gateCosts.single_900 },
      single_1800: { quantity: gatesByType.single_1800, unitPrice: pricing.gate_prices.single_1800, total: gateCosts.single_1800 },
      double_900: { quantity: gatesByType.double_900, unitPrice: pricing.gate_prices.double_900, total: gateCosts.double_900 },
      double_1800: { quantity: gatesByType.double_1800, unitPrice: pricing.gate_prices.double_1800, total: gateCosts.double_1800 },
      sliding_4800: { quantity: gatesByType.sliding_4800, unitPrice: pricing.gate_prices.sliding_4800, total: gateCosts.sliding_4800 },
      opening_custom: { quantity: gatesByType.opening_custom, unitPrice: 500, total: gateCosts.opening_custom },
    },
    grandTotal,
    totalLength_mm: totalFenceLength,
  };
}
