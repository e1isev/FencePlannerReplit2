import { resolveSkuForLineItem } from "../client/src/pricing/skuRules";

const examples = [
  {
    label: "Bellbrae panel",
    input: {
      fenceCategoryId: "residential",
      fenceStyleId: "bellbrae",
      fenceHeightM: 1.8,
      fenceColourMode: "Colour",
      lineItemType: "panel",
    } as const,
    expected: "Bellbrae-Colour-1.8m",
  },
  {
    label: "End post white 0.9",
    input: {
      fenceCategoryId: "residential",
      fenceStyleId: "bellbrae",
      fenceHeightM: 0.9,
      fenceColourMode: "White",
      lineItemType: "post_end",
    } as const,
    expected: "ResPost-End-Wht-0.9m",
  },
  {
    label: "Line post spacing issue",
    input: {
      fenceCategoryId: "residential",
      fenceStyleId: "bellbrae",
      fenceHeightM: 0.9,
      fenceColourMode: "White",
      lineItemType: "post_line",
    } as const,
    expected: "ResPost-Line-Wht-0.9m",
  },
];

let passed = 0;
examples.forEach((example) => {
  const result = resolveSkuForLineItem(example.input);
  const ok = result.sku === example.expected;
  if (ok) {
    passed += 1;
  }
  console.log(
    `${ok ? "✓" : "✗"} ${example.label}:`,
    result.sku ?? result.reason ?? "missing"
  );
});

if (passed !== examples.length) {
  throw new Error(`SKU harness failed (${passed}/${examples.length} passed).`);
}

console.log("skuRulesHarness.ts passed");
