import type { Point } from "@/types/decking";

type OffsetDirection = "inward" | "outward";

function polygonArea(points: Point[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y - points[j].x * points[i].y;
  }
  return area / 2;
}

function lineIntersection(
  p1: Point,
  dir1: Point,
  p2: Point,
  dir2: Point
): Point | null {
  const cross = dir1.x * dir2.y - dir1.y * dir2.x;
  if (Math.abs(cross) < 1e-9) return null;

  const t = ((p2.x - p1.x) * dir2.y - (p2.y - p1.y) * dir2.x) / cross;
  return {
    x: p1.x + dir1.x * t,
    y: p1.y + dir1.y * t,
  };
}

export function offsetPolygonMiter(
  polygonMm: Point[],
  offsetMm: number,
  direction: OffsetDirection = "inward"
): Point[] | null {
  if (polygonMm.length < 3) return null;

  const orientation = Math.sign(polygonArea(polygonMm));
  if (orientation === 0) return null;

  const outwardSign = orientation > 0 ? 1 : -1;
  const normalSign = direction === "outward" ? outwardSign : -outwardSign;

  const offsetEdges = polygonMm.map((point, i) => {
    const next = polygonMm[(i + 1) % polygonMm.length];
    const dx = next.x - point.x;
    const dy = next.y - point.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) return null;

    const nx = (dy / length) * normalSign * offsetMm;
    const ny = (-dx / length) * normalSign * offsetMm;

    return {
      p: { x: point.x + nx, y: point.y + ny },
      dir: { x: dx, y: dy },
    };
  });

  if (offsetEdges.some((edge) => edge === null)) return null;

  const result: Point[] = [];
  for (let i = 0; i < polygonMm.length; i++) {
    const prevEdge = offsetEdges[(i - 1 + polygonMm.length) % polygonMm.length]!;
    const currEdge = offsetEdges[i]!;
    const intersection = lineIntersection(prevEdge.p, prevEdge.dir, currEdge.p, currEdge.dir);
    if (!intersection) return null;
    result.push(intersection);
  }

  if (Math.abs(polygonArea(result)) < 1e-3) return null;

  return result;
}
