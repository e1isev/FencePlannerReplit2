import { describe, expect, it } from "vitest";
import rows from "./residential_pricing_rows.json";
import {
  buildResidentialIndex,
  resolveResidentialSkuAndPrice,
  type ResidentialPricingRow,
} from "./residentialPricing";

describe("residential pricing resolver", () => {
  const index = buildResidentialIndex(rows as ResidentialPricingRow[]);

  it("resolves panel pricing for Bellbrae white 1.6m", () => {
    const resolved = resolveResidentialSkuAndPrice(index, {
      type: "Panel",
      fenceStyle: "Bellbrae",
      colour: "White",
      height_m: 1.6,
    });

    expect(resolved).toEqual({ sku: "Bellbrae-White-1.6m", unit_price: 303.88 });
  });

  it("uses picket grouping for single gates", () => {
    const resolved = resolveResidentialSkuAndPrice(index, {
      type: "Single Gate",
      fenceStyle: "Bellbrae",
      colour: "White",
      height_m: 1.6,
      gateWidth_m: 2.35,
    });

    expect(resolved).toEqual({
      sku: "Gate-Picket-Single-1.6H-2.35W",
      unit_price: 913.76,
    });
  });

  it("matches double gate widths exactly", () => {
    const resolved = resolveResidentialSkuAndPrice(index, {
      type: "Double Gate",
      fenceStyle: "Jabiru",
      colour: "Coloured",
      height_m: 1.6,
      gateWidth_m: 4.7,
    });

    expect(resolved).toEqual({
      sku: "Gate-Picket-Double-1.6H-4.7W",
      unit_price: 1768.36,
    });
  });

  it("matches sliding gate width buckets", () => {
    const resolved = resolveResidentialSkuAndPrice(index, {
      type: "Sliding Gate",
      fenceStyle: "Rosella",
      colour: "White",
      height_m: 1.6,
      gateWidth_m: 4.8,
    });

    expect(resolved).toEqual({
      sku: "Gate-Pick-Sliding-1.6H-4.6/5.0",
      unit_price: 5631.67,
    });
  });

  it("respects mystique style exceptions", () => {
    const resolved = resolveResidentialSkuAndPrice(index, {
      type: "Single Gate",
      fenceStyle: "Mystique Solid",
      colour: "White",
      height_m: 1.6,
      gateWidth_m: 2.35,
    });

    expect(resolved).toEqual({
      sku: "Gate-Mystique-Single-1.6H-2.35",
      unit_price: 996.82,
    });
  });
});
