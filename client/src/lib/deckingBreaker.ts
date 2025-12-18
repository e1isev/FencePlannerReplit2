import { BREAKER_HALF_MM, MAX_BOARD_LENGTH_MM } from "@/lib/deckingGeometry";
import type { BoardDirection, BreakerAxis, BreakerLine, DeckEntity, Point } from "@/types/decking";

export const BREAKER_SNAP_THRESHOLD_MM = 150;
export const BREAKER_CLAMP_MARGIN_MM = BREAKER_HALF_MM;

export function breakerAxisForDirection(direction: BoardDirection): BreakerAxis {
  return direction === "horizontal" ? "x" : "y";
}

export function createBreakerLineId() {
  return `breaker-line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getPolygonBounds(points: Point[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  points.forEach((p) => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  });

  return { minX, minY, maxX, maxY };
}

function getHorizontalIntersections(polygon: Point[], y: number): number[] {
  const intersections: number[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];

    if ((p1.y <= y && p2.y > y) || (p2.y <= y && p1.y > y)) {
      const t = (y - p1.y) / (p2.y - p1.y);
      const x = p1.x + t * (p2.x - p1.x);
      intersections.push(x);
    }
  }
  return intersections.sort((a, b) => a - b);
}

function getVerticalIntersections(polygon: Point[], x: number): number[] {
  const intersections: number[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];

    if ((p1.x <= x && p2.x > x) || (p2.x <= x && p1.x > x)) {
      const t = (x - p1.x) / (p2.x - p1.x);
      const y = p1.y + t * (p2.y - p1.y);
      intersections.push(y);
    }
  }
  return intersections.sort((a, b) => a - b);
}

export function generateDefaultBreakerLines(deck: DeckEntity, polygonOverride?: Point[]): BreakerLine[] {
  const polygon =
    polygonOverride?.length && polygonOverride.length >= 2
      ? polygonOverride
      : deck.infillPolygon.length >= 2
        ? deck.infillPolygon
        : deck.polygon;
  if (!polygon || polygon.length < 2) return [];

  const axis = breakerAxisForDirection(deck.boardDirection);
  const bounds = getPolygonBounds(polygon);
  const minCoord = axis === "x" ? bounds.minX : bounds.minY;
  const maxCoord = axis === "x" ? bounds.maxX : bounds.maxY;

  const lines: BreakerLine[] = [];
  for (let cursor = minCoord + MAX_BOARD_LENGTH_MM; cursor < maxCoord; cursor += MAX_BOARD_LENGTH_MM) {
    lines.push({
      id: createBreakerLineId(),
      axis,
      posMm: cursor,
    });
  }

  return lines;
}

export function getBreakerLineSegments(line: BreakerLine, polygon: Point[]): Array<{ start: Point; end: Point }> {
  if (polygon.length < 2) return [];
  const coords =
    line.axis === "x" ? getVerticalIntersections(polygon, line.posMm) : getHorizontalIntersections(polygon, line.posMm);
  const segments: Array<{ start: Point; end: Point }> = [];

  for (let k = 0; k < coords.length - 1; k += 2) {
    const start = coords[k];
    const end = coords[k + 1];
    if (end - start <= 0) continue;

    segments.push(
      line.axis === "x"
        ? { start: { x: line.posMm, y: start }, end: { x: line.posMm, y: end } }
        : { start: { x: start, y: line.posMm }, end: { x: end, y: line.posMm } }
    );
  }

  return segments;
}

export function snapBreakerPosition(
  axis: BreakerAxis,
  posMm: number,
  polygon: Point[],
  snapThresholdMm: number = BREAKER_SNAP_THRESHOLD_MM,
  marginMm: number = BREAKER_CLAMP_MARGIN_MM
) {
  if (polygon.length === 0) return posMm;
  const bounds = getPolygonBounds(polygon);
  const min = axis === "x" ? bounds.minX + marginMm : bounds.minY + marginMm;
  const max = axis === "x" ? bounds.maxX - marginMm : bounds.maxY - marginMm;

  const clamped = Math.min(max, Math.max(min, posMm));
  const candidates = polygon.map((p) => (axis === "x" ? p.x : p.y));
  if (candidates.length === 0) return clamped;

  const nearest = candidates.reduce(
    (closest, candidate) => {
      const distance = Math.abs(candidate - clamped);
      if (distance < closest.distance) {
        return { candidate, distance };
      }
      return closest;
    },
    { candidate: clamped, distance: Infinity }
  );

  if (nearest.distance <= snapThresholdMm) {
    return Math.min(max, Math.max(min, nearest.candidate));
  }

  return clamped;
}
