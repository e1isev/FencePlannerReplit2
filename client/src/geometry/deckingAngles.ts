import { Point } from "@/types/decking";

export function normalise(v: Point): Point {
  const mag = Math.hypot(v.x, v.y);
  if (mag === 0) return { x: 0, y: 0 };
  return { x: v.x / mag, y: v.y / mag };
}

export function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y;
}

export function cross(a: Point, b: Point): number {
  return a.x * b.y - a.y * b.x;
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

export function signedAngleRad(from: Point, to: Point): number {
  return Math.atan2(cross(from, to), dot(from, to));
}

export function rotatePointAroundMm(p: Point, centre: Point, angleRad: number): Point {
  const s = Math.sin(angleRad);
  const c = Math.cos(angleRad);

  const dx = p.x - centre.x;
  const dy = p.y - centre.y;

  return {
    x: centre.x + dx * c - dy * s,
    y: centre.y + dx * s + dy * c,
  };
}

export function applyCornerAngleRotateForward(
  polygonMm: Point[],
  vertexIndex: number,
  targetAngleDeg: number
): Point[] {
  const n = polygonMm.length;
  if (n < 3) return polygonMm;
  const i = ((vertexIndex % n) + n) % n;
  const curr = polygonMm[i];
  const prev = polygonMm[(i - 1 + n) % n];
  const nextIndex = (i + 1) % n;
  const next = polygonMm[nextIndex];

  const vPrev = normalise({ x: prev.x - curr.x, y: prev.y - curr.y });
  const vNext = normalise({ x: next.x - curr.x, y: next.y - curr.y });

  const currentAngle = signedAngleRad(vPrev, vNext);
  if (currentAngle === 0) return polygonMm;

  const sign = Math.sign(currentAngle) || 1;
  const targetAngleRad = (targetAngleDeg * Math.PI) / 180;
  const vNextTarget = rotatePointAroundMm(
    { x: vPrev.x, y: vPrev.y },
    { x: 0, y: 0 },
    sign * targetAngleRad
  );

  const deltaAngle = signedAngleRad(vNext, vNextTarget);
  if (deltaAngle === 0) return polygonMm;

  const newPolygon = polygonMm.map((p) => ({ ...p }));
  let k = nextIndex;
  while (k !== i) {
    newPolygon[k] = rotatePointAroundMm(newPolygon[k], curr, deltaAngle);
    k = (k + 1) % n;
  }

  return newPolygon;
}
