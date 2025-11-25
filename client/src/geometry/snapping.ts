import { Point } from "@/types/models";

const SNAP_TOLERANCE_PX = 40;

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

export function findSnapPoint(point: Point, existingPoints: Point[]): Point | null {
  for (const existing of existingPoints) {
    const distance = Math.sqrt(
      Math.pow(point.x - existing.x, 2) + Math.pow(point.y - existing.y, 2)
    );
    if (distance < SNAP_TOLERANCE_PX) {
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

export function getAllLineEndpoints(lines: any[]): Point[] {
  const endpoints: Point[] = [];
  lines.forEach((line) => {
    endpoints.push(line.a, line.b);
  });
  return endpoints;
}
