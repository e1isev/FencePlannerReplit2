import { BOARD_GAP_MM, BOARD_WIDTH_MM } from "@/lib/deckingGeometry";
import type { BoardDirection, Point } from "@/types/decking";

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function polygonPerimeter(points: Point[]): number {
  if (points.length < 2) return 0;
  let perimeter = 0;
  for (let i = 0; i < points.length; i++) {
    const next = (i + 1) % points.length;
    const dx = points[next].x - points[i].x;
    const dy = points[next].y - points[i].y;
    perimeter += Math.hypot(dx, dy);
  }
  return perimeter;
}

function getBounds(points: Point[]): Bounds {
  return points.reduce<Bounds>(
    (acc, point) => ({
      minX: Math.min(acc.minX, point.x),
      minY: Math.min(acc.minY, point.y),
      maxX: Math.max(acc.maxX, point.x),
      maxY: Math.max(acc.maxY, point.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  );
}

export function getJoistCount(
  deckPolygonMm: Point[],
  boardDirection: BoardDirection,
  joistSpacingMm: number
): number {
  if (deckPolygonMm.length === 0 || joistSpacingMm <= 0) return 0;
  const bounds = getBounds(deckPolygonMm);
  const span =
    boardDirection === "horizontal" ? bounds.maxX - bounds.minX : bounds.maxY - bounds.minY;
  return Math.ceil(span / joistSpacingMm) + 1;
}

export function getJoistPositions(
  deckPolygonMm: Point[],
  boardDirection: BoardDirection,
  joistSpacingMm: number
): number[] {
  if (deckPolygonMm.length === 0 || joistSpacingMm <= 0) return [];
  const bounds = getBounds(deckPolygonMm);
  const minAxis = boardDirection === "horizontal" ? bounds.minX : bounds.minY;
  const joistCount = getJoistCount(deckPolygonMm, boardDirection, joistSpacingMm);
  return Array.from({ length: joistCount }, (_, idx) => minAxis + idx * joistSpacingMm);
}

export function getClipsPerJoist(rowCount: number): {
  clipsPerJoist: number;
  starterClipsPerJoist: number;
} {
  if (rowCount <= 0) {
    return { clipsPerJoist: 0, starterClipsPerJoist: 0 };
  }

  const starterClipsPerJoist = 1;
  const remaining = Math.max(0, rowCount - 2.5);
  const extra = Math.ceil(remaining / 3);

  return {
    clipsPerJoist: starterClipsPerJoist + extra,
    starterClipsPerJoist,
  };
}

export function getFasciaClipCount(perimeterMm: number, joistSpacingMm: number): number {
  if (perimeterMm <= 0 || joistSpacingMm <= 0) return 0;
  return Math.ceil(perimeterMm / joistSpacingMm);
}

export function getFasciaClipPositions(polygon: Point[], joistSpacingMm: number): Point[] {
  if (polygon.length < 2 || joistSpacingMm <= 0) return [];

  const perimeter = polygonPerimeter(polygon);
  const clipCount = getFasciaClipCount(perimeter, joistSpacingMm);
  if (clipCount === 0) return [];

  const targetDistances = Array.from({ length: clipCount }, (_, idx) =>
    Math.min(perimeter, (idx + 1) * joistSpacingMm)
  );

  const positions: Point[] = [];
  let traversed = 0;
  let edgeIndex = 0;

  while (edgeIndex < polygon.length && positions.length < targetDistances.length) {
    const start = polygon[edgeIndex];
    const end = polygon[(edgeIndex + 1) % polygon.length];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const edgeLength = Math.hypot(dx, dy);
    if (edgeLength === 0) {
      edgeIndex += 1;
      continue;
    }

    const edgeEndDistance = traversed + edgeLength;
    while (positions.length < targetDistances.length && targetDistances[positions.length] <= edgeEndDistance) {
      const target = targetDistances[positions.length];
      const t = (target - traversed) / edgeLength;
      positions.push({ x: start.x + dx * t, y: start.y + dy * t });
    }

    traversed = edgeEndDistance;
    edgeIndex += 1;
  }

  return positions;
}

export function getRowAxisStart(bounds: Bounds, boardDirection: BoardDirection): number {
  return boardDirection === "horizontal" ? bounds.minY : bounds.minX;
}

export function getRowAxisLength(rowCount: number): number {
  const pitchMm = BOARD_WIDTH_MM + BOARD_GAP_MM;
  if (rowCount <= 0) return 0;
  return rowCount * pitchMm;
}

export function getJoistLineExtents(bounds: Bounds): { start: Point; end: Point } {
  return {
    start: { x: bounds.minX, y: bounds.minY },
    end: { x: bounds.maxX, y: bounds.maxY },
  };
}

export function getDeckBounds(points: Point[]): Bounds | null {
  if (points.length === 0) return null;
  return getBounds(points);
}
