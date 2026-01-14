import { describe, expect, it } from "vitest";
import { getJunctionAngleDeg } from "@/geometry/posts";
import type { Point } from "@/types/models";

const makePoint = (x: number, y: number): Point => ({ x, y });

const approxEqual = (a: number, b: number, eps = 0.5) => Math.abs(a - b) <= eps;

const classifyLine = (angleDeg: number | null) =>
  angleDeg !== null && (angleDeg <= 30.5 || angleDeg >= 159.5);

describe("getJunctionAngleDeg", () => {
  it("classifies common junctions", () => {
    const origin = makePoint(0, 0);

    const straight = getJunctionAngleDeg(origin, makePoint(-1, 0), makePoint(1, 0));
    expect(straight).not.toBeNull();
    expect(approxEqual(straight ?? 0, 180)).toBe(true);

    const slightBend = getJunctionAngleDeg(
      origin,
      makePoint(1, 0),
      makePoint(0.9848, 0.1736)
    );
    expect(slightBend).not.toBeNull();
    expect(approxEqual(slightBend ?? 0, 10, 0.5)).toBe(true);
    expect(classifyLine(slightBend)).toBe(true);

    const threshold = getJunctionAngleDeg(origin, makePoint(1, 0), makePoint(0.866, 0.5));
    expect(threshold).not.toBeNull();
    expect(approxEqual(threshold ?? 0, 30, 0.5)).toBe(true);
    expect(classifyLine(threshold)).toBe(true);

    const overThreshold = getJunctionAngleDeg(
      origin,
      makePoint(1, 0),
      makePoint(0.8572, 0.515)
    );
    expect(overThreshold).not.toBeNull();
    expect(approxEqual(overThreshold ?? 0, 31, 0.5)).toBe(true);
    expect(classifyLine(overThreshold)).toBe(false);

    const ninety = getJunctionAngleDeg(origin, makePoint(1, 0), makePoint(0, 1));
    expect(ninety).not.toBeNull();
    expect(approxEqual(ninety ?? 0, 90)).toBe(true);
    expect(classifyLine(ninety)).toBe(false);

    const nearlyStraight = getJunctionAngleDeg(
      origin,
      makePoint(1, 0),
      makePoint(-0.9397, 0.342)
    );
    expect(nearlyStraight).not.toBeNull();
    expect(approxEqual(nearlyStraight ?? 0, 160, 0.5)).toBe(true);
    expect(classifyLine(nearlyStraight)).toBe(true);
  });
});
