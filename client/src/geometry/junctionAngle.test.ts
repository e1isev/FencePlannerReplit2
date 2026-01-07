import { getJunctionAngleDeg } from "@/geometry/posts";
import type { Point } from "@/types/models";

const makePoint = (x: number, y: number): Point => ({ x, y });

const approxEqual = (a: number, b: number, eps = 0.1) => Math.abs(a - b) <= eps;

const classifyLine = (angleDeg: number | null) => angleDeg !== null && angleDeg <= 30;

const runTests = () => {
  const origin = makePoint(0, 0);

  const straight = getJunctionAngleDeg(origin, makePoint(-1, 0), makePoint(1, 0));
  if (straight === null || !approxEqual(straight, 0)) {
    throw new Error(`Expected 0°, got ${straight}`);
  }

  const slightBend = getJunctionAngleDeg(origin, makePoint(-1, 0), makePoint(0.9848, 0.1736));
  if (slightBend === null || !approxEqual(slightBend, 10, 0.2) || !classifyLine(slightBend)) {
    throw new Error(`Expected 10° line classification, got ${slightBend}`);
  }

  const threshold = getJunctionAngleDeg(origin, makePoint(-1, 0), makePoint(0.866, 0.5));
  if (threshold === null || !approxEqual(threshold, 30, 0.2) || !classifyLine(threshold)) {
    throw new Error(`Expected 30° line classification, got ${threshold}`);
  }

  const overThreshold = getJunctionAngleDeg(origin, makePoint(-1, 0), makePoint(0.8572, 0.515));
  if (
    overThreshold === null ||
    !approxEqual(overThreshold, 31, 0.3) ||
    classifyLine(overThreshold)
  ) {
    throw new Error(`Expected 31° corner classification, got ${overThreshold}`);
  }

  const ninety = getJunctionAngleDeg(origin, makePoint(-1, 0), makePoint(0, 1));
  if (ninety === null || !approxEqual(ninety, 90) || classifyLine(ninety)) {
    throw new Error(`Expected 90° corner classification, got ${ninety}`);
  }
};

runTests();
