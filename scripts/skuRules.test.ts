import { describe, expect, it } from "vitest";
import { buildCatalogIndex, resolveCatalogKey } from "../client/src/pricing/catalogIndex";
import { buildKey } from "../client/src/pricing/catalogKey";

describe("catalog index query", () => {
  it("resolves keys from sample items", () => {
    const sampleItems = [
      {
        name: "Line Post",
        sku: "ResPost-Line-Wht-0.9m",
        unitPrice: "$10",
        category: "Residential",
        style: "ResPost",
        colour: "White",
        height: "0.9",
        postType: "line",
      },
      {
        name: "Gate",
        sku: "TLGATE-Mesh-Single-1.2m",
        unitPrice: "$100",
        category: "Rural",
        style: "Mesh",
        gateType: "Single",
        gateWidth: "1.2",
      },
      {
        name: "Panel",
        sku: "Bellbrae-Colour-1.8m",
        unitPrice: "$50",
        category: "Residential",
        style: "Bellbrae",
        colour: "Colour",
        height: "1.8",
      },
    ];

    const index = buildCatalogIndex(sampleItems);

    const postKey = buildKey({
      category: "residential",
      productType: "post",
      style: "ResPost",
      postType: "line",
      colour: "white",
      heightM: 0.9,
    });
    const postLookup = resolveCatalogKey(index, postKey);
    expect(postLookup.ok).toBe(true);
    if (postLookup.ok) {
      expect(postLookup.row.sku).toBe("ResPost-Line-Wht-0.9m");
    }

    const panelKey = buildKey({
      category: "residential",
      productType: "panel",
      style: "Bellbrae",
      colour: "colour",
      heightM: 1.8,
    });
    const panelLookup = resolveCatalogKey(index, panelKey);
    expect(panelLookup.ok).toBe(true);
    if (panelLookup.ok) {
      expect(panelLookup.row.sku).toBe("Bellbrae-Colour-1.8m");
    }
  });
});
