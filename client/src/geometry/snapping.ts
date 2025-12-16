import { DEFAULT_SNAP_TOLERANCE } from "@/constants/geometry";
import { Point } from "@/types/models";

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
  tolerance: number = DEFAULT_SNAP_TOLERANCE
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
