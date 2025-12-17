import { Point } from "@/types/decking";

export function normalise(v: Point): Point {
  const mag = Math.hypot(v.x, v.y);
  if (mag === 0) return { x: 0, y: 0 };
  return { x: v.x / mag, y: v.y / mag };
}

export function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y;
}

export function clamp(x: number, min: number, max: number): number {
  return Math.min(Math.max(x, min), max);
}

export function angleDegAtVertex(polygonMm: Point[], i: number): number {
  const n = polygonMm.length;
  if (n < 3) return 0;

  const prev = polygonMm[(i - 1 + n) % n];
  const curr = polygonMm[i];
  const next = polygonMm[(i + 1) % n];

  const v1 = normalise({ x: prev.x - curr.x, y: prev.y - curr.y });
  const v2 = normalise({ x: next.x - curr.x, y: next.y - curr.y });

  const theta = Math.acos(clamp(dot(v1, v2), -1, 1));
  return (theta * 180) / Math.PI;
}
