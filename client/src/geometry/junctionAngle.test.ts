import { getJunctionAngleDeg } from "@/geometry/posts";
import type { Point } from "@/types/models";

const makePoint = (x: number, y: number): Point => ({ x, y });

const approxEqual = (a: number, b: number, eps = 0.1) => Math.abs(a - b) <= eps;

const classifyLine = (angleDeg: number) =>
  (angleDeg >= 160 && angleDeg <= 190) || (360 - angleDeg >= 160 && 360 - angleDeg <= 190);

const runTests = () => {
  const origin = makePoint(0, 0);

  const ninety = getJunctionAngleDeg(origin, makePoint(1, 0), makePoint(0, 1));
  if (ninety === null || !approxEqual(ninety, 90)) {
    throw new Error(`Expected 90°, got ${ninety}`);
  }

  const straight = getJunctionAngleDeg(origin, makePoint(1, 0), makePoint(-1, 0));
  if (straight === null || !approxEqual(straight, 180)) {
    throw new Error(`Expected 180°, got ${straight}`);
  }

  const angle165 = getJunctionAngleDeg(origin, makePoint(1, 0), makePoint(-0.9659, 0.2588));
  if (angle165 === null || !approxEqual(angle165, 165, 0.2) || !classifyLine(angle165)) {
    throw new Error(`Expected 165° line classification, got ${angle165}`);
  }

  const angle150 = getJunctionAngleDeg(origin, makePoint(1, 0), makePoint(-0.866, 0.5));
  if (angle150 === null || !approxEqual(angle150, 150, 0.2) || classifyLine(angle150)) {
    throw new Error(`Expected 150° corner classification, got ${angle150}`);
  }
};

runTests();
