import { Point } from "@/types/decking";

export function findBottomEdgeIndex(polygonMm: Point[]): number {
  if (polygonMm.length < 2) return 0;

  let bottomEdgeIndex = 0;
  let maxMidY = -Infinity;

  for (let i = 0; i < polygonMm.length; i++) {
    const a = polygonMm[i];
    const b = polygonMm[(i + 1) % polygonMm.length];
    const midY = (a.y + b.y) / 2;

    if (midY > maxMidY) {
      maxMidY = midY;
      bottomEdgeIndex = i;
    }
  }

  return bottomEdgeIndex;
}

export function rotatePointAroundMm(
  point: Point,
  pivot: Point,
  angleRad: number
): Point {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const translatedX = point.x - pivot.x;
  const translatedY = point.y - pivot.y;

  return {
    x: pivot.x + translatedX * cos - translatedY * sin,
    y: pivot.y + translatedX * sin + translatedY * cos,
  };
}

export function rotatePolygonToHorizontalBaseline(
  polygonMm: Point[],
  baselineEdgeIndex: number
): Point[] {
  if (polygonMm.length < 2) return polygonMm;

  const normalizedIndex = ((baselineEdgeIndex % polygonMm.length) + polygonMm.length) %
    polygonMm.length;
  const a = polygonMm[normalizedIndex];
  const b = polygonMm[(normalizedIndex + 1) % polygonMm.length];

  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const rotation = -angle;
  const pivot = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

  return polygonMm.map((point) => rotatePointAroundMm(point, pivot, rotation));
}
