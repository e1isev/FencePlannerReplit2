import { describe, expect, it } from "vitest";
import {
  inferProductType,
  normCategory,
  normColour,
  normGateType,
  parseGateWidthM,
  parseGateWidthRange,
  parseHeightM,
  parsePrice,
} from "@/pricing/catalogParse";
import { buildKey } from "@/pricing/catalogKey";
import { buildCatalogIndex } from "@/pricing/catalogIndex";

describe("catalog parsing", () => {
  it("normalizes price and category", () => {
    expect(parsePrice("$1,234.50")).toBe(1234.5);
    expect(normCategory("RURAL")).toBe("rural");
    expect(normCategory("Residential")).toBe("residential");
  });

  it("normalizes colours and gate types", () => {
    expect(normColour("Wht")).toBe("white");
    expect(normColour("Colour")).toBe("colour");
    expect(normGateType("Single")).toBe("single");
    expect(normGateType("SLIDING")).toBe("sliding");
  });

  it("parses heights and gate widths from sku", () => {
    expect(parseHeightM(null, "Picket-Rosella-White-1.4m")).toBe(1.4);
    expect(parseGateWidthM(null, "Gate-Picket-Double-1.8H-4.7m")).toBe(4.7);
  });

  it("parses sliding gate width ranges", () => {
    expect(parseGateWidthRange("TLGATE-Sliding-3.1/3.5")).toBe("3.1/3.5");
  });

  it("infers product type", () => {
    expect(inferProductType("Bellbrae-White-1.2m")).toBe("panel");
    expect(inferProductType("ResPost-End-Wht-1.4m")).toBe("post");
    expect(inferProductType("TLGATE-3R-Double-4.0m")).toBe("gate");
  });
});

describe("catalog key building", () => {
  it("builds residential panel key", () => {
    const key = buildKey({
      category: "residential",
      productType: "panel",
      style: "Rosella",
      colour: "white",
      heightM: 1.4,
    });
    expect(key).toBe("residential|panel|Rosella|white|1.4");
  });

  it("builds residential post key", () => {
    const key = buildKey({
      category: "residential",
      productType: "post",
      style: "ResPost",
      postType: "corner",
      colour: "white",
      heightM: 1.4,
      sku: "ResPost-Corner-Wht-1.4m",
    });
    expect(key).toBe("residential|post|ResPost|corner|white|1.4");
  });

  it("builds rural sliding gate key with range", () => {
    const key = buildKey({
      category: "rural",
      productType: "gate",
      style: "Timberline",
      gateType: "sliding",
      gateWidthRange: "3.1/3.5",
      heightM: null,
    });
    expect(key).toBe("rural|gate|Timberline|sliding||3.1/3.5");
  });
});

describe("catalog index", () => {
  it("detects duplicate keys", () => {
    const index = buildCatalogIndex([
      {
        name: "Panel",
        sku: "Picket-Rosella-White-1.4m",
        unitPrice: "$100",
        category: "Residential",
        style: "Rosella",
        colour: "White",
        height: "1.4",
      },
      {
        name: "Panel duplicate",
        sku: "Picket-Rosella-White-1.4m-dup",
        unitPrice: "$110",
        category: "Residential",
        style: "Rosella",
        colour: "White",
        height: "1.4",
      },
    ]);

    expect(index.duplicates.size).toBe(1);
    const dupRows = Array.from(index.duplicates.values())[0] ?? [];
    expect(dupRows.length).toBe(2);
  });
});
