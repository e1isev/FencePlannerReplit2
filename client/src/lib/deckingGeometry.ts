export const SCALE_FACTOR = 10; // 10 pixels = 1 millimeter
export const BOARD_WIDTH_MM = 140;
export const BOARD_GAP_MM = 3;
export const JOIST_SPACING_MM = 450;
export const MAX_BOARD_LENGTH_MM = 5400; // 5.4 meters
export const BREAKER_WIDTH_MM = BOARD_WIDTH_MM;
export const BREAKER_HALF_MM = BREAKER_WIDTH_MM / 2;

export const GRID_SIZE_MM = 100;
export const SNAP_TOLERANCE_PX = 8;
export const BOARD_OVERFLOW_ALLOWANCE_MM = 50;
export const MAX_OVERHANG_MM = BOARD_OVERFLOW_ALLOWANCE_MM;

export interface Point {
  x: number;
  y: number;
}

export function mmToPx(mm: number): number {
  return mm / SCALE_FACTOR;
}

export function pxToMm(px: number): number {
  return px * SCALE_FACTOR;
}

export function snapToGrid(
  valueMm: number,
  gridSizeMm: number = GRID_SIZE_MM,
  tolerancePx: number = SNAP_TOLERANCE_PX
): number {
  const toleranceMm = pxToMm(tolerancePx);
  const remainder = valueMm % gridSizeMm;

  if (remainder < toleranceMm) {
    return valueMm - remainder;
  }

  const distanceToNext = gridSizeMm - remainder;
  if (distanceToNext < toleranceMm) {
    return valueMm + distanceToNext;
  }

  return valueMm;
}

export function pointMmToPx(point: Point): Point {
  return {
    x: mmToPx(point.x),
    y: mmToPx(point.y),
  };
}

export function pointPxToMm(point: Point): Point {
  return {
    x: pxToMm(point.x),
    y: pxToMm(point.y),
  };
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SnapTarget {
  value: number;
  type: "grid" | "shape";
}

export interface SnapContext {
  xTargets: SnapTarget[];
  yTargets: SnapTarget[];
}

export function doRectanglesOverlap(rect1: Rect, rect2: Rect): boolean {
  return !(
    rect1.x + rect1.width < rect2.x ||
    rect2.x + rect2.width < rect1.x ||
    rect1.y + rect1.height < rect2.y ||
    rect2.y + rect2.height < rect1.y
  );
}

export function findSnapPosition(
  movingShape: Rect,
  existingShapes: Rect[],
  tolerancePx: number = SNAP_TOLERANCE_PX,
  gridSizeMm: number = GRID_SIZE_MM
): Point | null {
  const toleranceMm = pxToMm(tolerancePx);

  const candidates: Point[] = [];

  // Grid snapping for smooth alignment
  const snappedX = snapToGrid(movingShape.x, gridSizeMm, tolerancePx);
  const snappedY = snapToGrid(movingShape.y, gridSizeMm, tolerancePx);

  if (snappedX !== movingShape.x) {
    candidates.push({ x: snappedX, y: movingShape.y });
  }

  if (snappedY !== movingShape.y) {
    candidates.push({ x: movingShape.x, y: snappedY });
  }

  if (snappedX !== movingShape.x || snappedY !== movingShape.y) {
    candidates.push({ x: snappedX, y: snappedY });
  }

  for (const existing of existingShapes) {
    const movingRight = movingShape.x + movingShape.width;
    const movingBottom = movingShape.y + movingShape.height;
    const existingRight = existing.x + existing.width;
    const existingBottom = existing.y + existing.height;

    if (
      Math.abs(movingShape.y - existing.y) < toleranceMm ||
      Math.abs(movingBottom - existingBottom) < toleranceMm
    ) {
      if (Math.abs(movingRight - existing.x) < toleranceMm) {
        candidates.push({ x: existing.x - movingShape.width, y: movingShape.y });
      }
      if (Math.abs(movingShape.x - existingRight) < toleranceMm) {
        candidates.push({ x: existingRight, y: movingShape.y });
      }
    }

    if (
      Math.abs(movingShape.x - existing.x) < toleranceMm ||
      Math.abs(movingRight - existingRight) < toleranceMm
    ) {
      if (Math.abs(movingBottom - existing.y) < toleranceMm) {
        candidates.push({ x: movingShape.x, y: existing.y - movingShape.height });
      }
      if (Math.abs(movingShape.y - existingBottom) < toleranceMm) {
        candidates.push({ x: movingShape.x, y: existingBottom });
      }
    }
  }

  let bestCandidate: Point | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const dx = candidate.x - movingShape.x;
    const dy = candidate.y - movingShape.y;
    const distance = Math.hypot(dx, dy);

    if (distance <= toleranceMm && distance < bestDistance) {
      bestCandidate = candidate;
      bestDistance = distance;
    }
  }

  return bestCandidate;
}

export function shapeToRect(shape: {
  position: Point;
  width: number;
  height: number;
}): Rect {
  return {
    x: shape.position.x,
    y: shape.position.y,
    width: shape.width,
    height: shape.height,
  };
}

export interface Interval {
  start: number;
  end: number;
}

export function mergeIntervals(
  intervals: Interval[],
  toleranceMm: number
): Interval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: Interval[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    if (current.start - last.end <= toleranceMm) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}

export interface BoardRunPlan {
  boardLengths: number[];
  overflowMm: number;
  wasteMm: number;
}

export function planBoardsForRun(runLengthMm: number): BoardRunPlan {
  const boardLengths: number[] = [];

  if (runLengthMm <= 0) {
    return { boardLengths, overflowMm: 0, wasteMm: 0 };
  }

  const fullBoards = Math.floor(runLengthMm / MAX_BOARD_LENGTH_MM);
  const remainder = runLengthMm % MAX_BOARD_LENGTH_MM;

  if (fullBoards > 0) {
    boardLengths.push(...Array(fullBoards).fill(MAX_BOARD_LENGTH_MM));
  }

  if (remainder > 0) {
    boardLengths.push(remainder);
  }

  const wasteMm = remainder > 0 ? MAX_BOARD_LENGTH_MM - remainder : 0;

  return { boardLengths, overflowMm: 0, wasteMm };
}
