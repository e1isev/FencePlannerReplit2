import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPricingIndex,
  findPriceMatch,
  normalizePricingKey,
} from "../pricingLookup";
import { resolveSkuForLineItem } from "../skuResolver";

describe("pricing normalization", () => {
  it("normalizes casing and separators", () => {
    const normalized = normalizePricingKey("Bellbrae-Colour_1.8M");
    assert.equal(normalized, "bellbrae colour 1.8m");
  });
});

describe("pricing lookup", () => {
  it("matches via normalized SKU", () => {
    const index = buildPricingIndex([
      { name: "Bellbrae Panel", sku: "Bellbrae Colour 1.8m", unitPrice: 120 },
    ]);

    const result = findPriceMatch({
      index,
      sku: "Bellbrae-Colour-1.8m",
    });

    assert.equal(result.status, "matched");
    assert.equal(result.match?.unitPrice, 120);
  });

  it("matches via token set when ordering differs", () => {
    const index = buildPricingIndex([
      { name: "Bellbrae Panel", sku: "Bellbrae Colour 1.8m", unitPrice: 120 },
      { name: "Bellbrae Panel", sku: "Bellbrae Colour 2.1m", unitPrice: 130 },
    ]);

    const result = findPriceMatch({
      index,
      sku: "Colour Bellbrae 1.8m",
    });

    assert.equal(result.status, "matched");
    assert.equal(result.match?.unitPrice, 120);
  });

  it("flags ambiguity when token matches are too close", () => {
    const index = buildPricingIndex([
      { name: "Bellbrae Panel", sku: "Bellbrae Colour 1.8m", unitPrice: 120 },
      { name: "Bellbrae Panel", sku: "Bellbrae 1.8m Colour", unitPrice: 125 },
    ]);

    const result = findPriceMatch({
      index,
      sku: "Colour Bellbrae 1.8m",
    });

    assert.equal(result.status, "ambiguous");
  });
});

describe("SKU resolver", () => {
  it("returns SKUs for end and line posts", () => {
    const endPost = resolveSkuForLineItem({
      fenceStyleId: "bellbrae",
      fenceHeightM: 1.8,
      fenceColourMode: "Colour",
      lineItemType: "post_end",
    });
    const linePost = resolveSkuForLineItem({
      fenceStyleId: "bellbrae",
      fenceHeightM: 1.8,
      fenceColourMode: "Colour",
      lineItemType: "post_line",
    });

    assert.ok(endPost.sku);
    assert.ok(linePost.sku);
  });
});
