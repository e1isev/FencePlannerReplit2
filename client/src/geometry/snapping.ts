import { FenceLine, Point } from "@/types/models";

export const ENDPOINT_SNAP_RADIUS_MM = 250;
export const CLOSE_SHAPE_SNAP_RADIUS_MM = 350;

export function snapTo90Degrees(start: Point, end: Point): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  
  if (Math.abs(dx) > Math.abs(dy)) {
    return { x: end.x, y: start.y };
  } else {
    return { x: start.x, y: end.y };
  }
}

export function isOrthogonal(start: Point, end: Point, tolerance: number = 0.01): boolean {
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  return dx < tolerance || dy < tolerance;
}

export function findSnapPoint(
  point: Point,
  existingPoints: Point[],
  tolerance: number = ENDPOINT_SNAP_RADIUS_MM
): Point | null {
  for (const existing of existingPoints) {
    const distance = Math.sqrt(
      Math.pow(point.x - existing.x, 2) + Math.pow(point.y - existing.y, 2)
    );
    if (distance < tolerance) {
      return existing;
    }
  }
  return null;
}

const projectPointToSegment = (
  point: Point,
  a: Point,
  b: Point
): { t: number; proj: Point } => {
  const ab = { x: b.x - a.x, y: b.y - a.y };
  const abLenSq = ab.x * ab.x + ab.y * ab.y;
  if (abLenSq === 0) {
    return { t: 0, proj: a };
  }

  const ap = { x: point.x - a.x, y: point.y - a.y };
  let t = (ap.x * ab.x + ap.y * ab.y) / abLenSq;
  t = Math.max(0, Math.min(1, t));

  return { t, proj: { x: a.x + ab.x * t, y: a.y + ab.y * t } };
};

const endpointProximityEpsilon = (tolerance: number) =>
  Math.max(0.02, Math.min(0.1, tolerance * 0.1));

const lineHasBlockingFeatures = (line: FenceLine): boolean => {
  const segmentHasOpening = line.segments?.some(
    (segment) => segment?.type === "opening" || segment?.type === "gate"
  );

  return Boolean(
    line.isGateLine === true ||
      line.gateId ||
      (line.openings && line.openings.length > 0) ||
      (line.gates && line.gates.length > 0) ||
      segmentHasOpening
  );
};

export type SnapPointOnSegmentResult =
  | { point: Point; kind: "endpoint"; lineId?: string; t?: number }
  | { point: Point; kind: "segment"; lineId: string; t: number };

export function findSnapPointOnSegment(
  point: Point,
  lines: FenceLine[],
  tolerance: number
): SnapPointOnSegmentResult | null {
  let closest: SnapPointOnSegmentResult | null = null;
  let minDistance = tolerance;

  for (const line of lines) {
    if (lineHasBlockingFeatures(line)) continue;

    const { t, proj } = projectPointToSegment(point, line.a, line.b);
    const distance = Math.hypot(point.x - proj.x, point.y - proj.y);
    if (distance >= minDistance) continue;

    const epsilon = endpointProximityEpsilon(tolerance);
    const kind = t <= epsilon || t >= 1 - epsilon ? "endpoint" : "segment";

    minDistance = distance;
    closest =
      kind === "endpoint"
        ? { point: t < 0.5 ? line.a : line.b, kind, lineId: line.id, t }
        : { point: proj, kind, lineId: line.id, t };
  }

  return closest;
}

export function getDistance(start: Point, end: Point): number {
  return Math.sqrt(
    Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2)
  );
}

export function snapToAngle(
  anchor: Point,
  point: Point,
  stepDeg: number = 15
): Point {
  const dx = point.x - anchor.x;
  const dy = point.y - anchor.y;

  const angle = Math.atan2(dy, dx);
  const step = (stepDeg * Math.PI) / 180;
  const snappedAngle = Math.round(angle / step) * step;
  const distance = Math.hypot(dx, dy);

  if (distance === 0) {
    return point;
  }

  return {
    x: anchor.x + Math.cos(snappedAngle) * distance,
    y: anchor.y + Math.sin(snappedAngle) * distance,
  };
}

export function getAllLineEndpoints(lines: any[]): Point[] {
  const endpoints: Point[] = [];
  lines.forEach((line) => {
    endpoints.push(line.a, line.b);
  });
  return endpoints;
}
