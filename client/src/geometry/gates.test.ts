import { test } from "node:test";
import assert from "node:assert/strict";

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

test("computeSlidingGateReturn anchors to side A and extends away from the opening", () => {
  const result = computeSlidingGateReturn(baseLine, "a", 10);
  assert.deepEqual(result.start, baseLine.a);
  assert.equal(result.end.x, -10);
  assert.equal(result.end.y, 0);
  assert.equal(result.center.x, -5);
});

test("computeSlidingGateReturn anchors to side B and extends away from the opening", () => {
  const result = computeSlidingGateReturn(baseLine, "b", 10);
  assert.deepEqual(result.start, baseLine.b);
  assert.equal(result.end.x, 20);
  assert.equal(result.end.y, 0);
  assert.equal(result.center.x, 15);
});
