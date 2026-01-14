import { describe, expect, it } from "vitest";

import { computeSlidingGateReturn } from "@/geometry/gates";
import type { FenceLine } from "@/types/models";

const baseLine: FenceLine = {
  id: "line-1",
  a: { x: 0, y: 0 },
  b: { x: 10, y: 0 },
  length_mm: 1000,
  locked_90: true,
  even_spacing: false,
};

describe("computeSlidingGateReturn", () => {
  it("anchors to side A and extends away from the opening", () => {
    const result = computeSlidingGateReturn(baseLine, "a", 10);
    expect(result.start).toEqual(baseLine.a);
    expect(result.end.x).toBe(-10);
    expect(result.end.y).toBe(0);
    expect(result.center.x).toBe(-5);
  });

  it("anchors to side B and extends away from the opening", () => {
    const result = computeSlidingGateReturn(baseLine, "b", 10);
    expect(result.start).toEqual(baseLine.b);
    expect(result.end.x).toBe(20);
    expect(result.end.y).toBe(0);
    expect(result.center.x).toBe(15);
  });
});
