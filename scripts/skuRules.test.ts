import assert from "node:assert/strict";
import { buildPricingIndex, lookupPricingEntry, normalizeSkuCompact, normalizeSkuDash } from "../client/src/pricing/catalogIndex";
import { resolveSkuForLineItem } from "../client/src/pricing/skuRules";

const sampleItems = [
  { name: "Line Post", sku: "ResPost-Line-Wht- 0.9m", unitPrice: 10 },
  { name: "Gate", sku: "TLGATE-Mesh-SIngle-1.2m", unitPrice: 100 },
  { name: "Panel", sku: "Bellbrae-Colour-1.8m", unitPrice: 50 },
];

const index = buildPricingIndex(sampleItems);

assert.equal(normalizeSkuDash("ResPost-Line-Wht- 0.9m"), "respost-line-wht-0.9m");
assert.equal(normalizeSkuCompact("ResPost-Line-Wht- 0.9m"), "respostlinewht0.9m");

const linePostLookup = lookupPricingEntry(index, "ResPost-Line-Wht-0.9m");
assert.equal(linePostLookup.entry?.sku, "ResPost-Line-Wht- 0.9m");

const meshGateLookup = lookupPricingEntry(index, "TLGATE-Mesh-Single-1.2m");
assert.equal(meshGateLookup.entry?.sku, "TLGATE-Mesh-SIngle-1.2m");

const bellbraePanel = resolveSkuForLineItem({
  fenceCategoryId: "residential",
  fenceStyleId: "bellbrae",
  fenceHeightM: 1.8,
  fenceColourMode: "Colour",
  lineItemType: "panel",
});
assert.deepEqual(bellbraePanel, { sku: "Bellbrae-Colour-1.8m" });

const linePost = resolveSkuForLineItem({
  fenceCategoryId: "residential",
  fenceStyleId: "bellbrae",
  fenceHeightM: 0.9,
  fenceColourMode: "White",
  lineItemType: "post_line",
});
assert.deepEqual(linePost, { sku: "ResPost-Line-Wht-0.9m" });

console.log("skuRules.test.ts passed");
