export const SCALE_FACTOR = 10; // 10 pixels = 1 millimeter
export const BOARD_WIDTH_MM = 140;
export const BOARD_GAP_MM = 3;
export const JOIST_SPACING_MM = 450;
export const MAX_BOARD_LENGTH_MM = 5400; // 5.4 meters

export const GRID_SIZE_MM = 100;
export const SNAP_TOLERANCE_PX = 8;
export const BOARD_OVERFLOW_ALLOWANCE_MM = 50;
export const MAX_OVERHANG_MM = 20;

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

const MIN_RECT_SIZE_MM = 10;

function buildGridTargets(value: number, gridSizeMm: number): SnapTarget[] {
  const gridIndex = Math.round(value / gridSizeMm);
  const targets: SnapTarget[] = [];
  for (const offset of [-1, 0, 1]) {
    targets.push({ value: (gridIndex + offset) * gridSizeMm, type: "grid" });
  }
  return targets;
}

export function buildSnapContext(
  movingRect: Rect,
  otherRects: Rect[],
  gridSizeMm: number = GRID_SIZE_MM
): SnapContext {
  const xTargets: SnapTarget[] = [];
  const yTargets: SnapTarget[] = [];

  const edgesX = [movingRect.x, movingRect.x + movingRect.width];
  const edgesY = [movingRect.y, movingRect.y + movingRect.height];

  edgesX.forEach((edge) => xTargets.push(...buildGridTargets(edge, gridSizeMm)));
  edgesY.forEach((edge) => yTargets.push(...buildGridTargets(edge, gridSizeMm)));

  otherRects.forEach((rect) => {
    xTargets.push({ value: rect.x, type: "shape" });
    xTargets.push({ value: rect.x + rect.width, type: "shape" });
    yTargets.push({ value: rect.y, type: "shape" });
    yTargets.push({ value: rect.y + rect.height, type: "shape" });
  });

  return {
    xTargets,
    yTargets,
  };
}

export function snapCoordinate(
  value: number,
  targets: SnapTarget[],
  tolerancePx: number = SNAP_TOLERANCE_PX
): number {
  const toleranceMm = pxToMm(tolerancePx);
  let snapped = value;
  let bestDelta = toleranceMm + 1;

  targets.forEach((target) => {
    const delta = Math.abs(value - target.value);
    if (delta <= toleranceMm && delta < bestDelta) {
      bestDelta = delta;
      snapped = target.value;
    }
  });

  return snapped;
}

function snapAxisMovement(
  start: number,
  end: number,
  targets: SnapTarget[],
  tolerancePx: number
): { start: number; end: number } {
  const toleranceMm = pxToMm(tolerancePx);
  let bestDelta = 0;
  let bestDistance = toleranceMm + 1;

  targets.forEach((target) => {
    const deltaStart = target.value - start;
    const deltaEnd = target.value - end;

    if (Math.abs(deltaStart) <= toleranceMm && Math.abs(deltaStart) < bestDistance) {
      bestDelta = deltaStart;
      bestDistance = Math.abs(deltaStart);
    }

    if (Math.abs(deltaEnd) <= toleranceMm && Math.abs(deltaEnd) < bestDistance) {
      bestDelta = deltaEnd;
      bestDistance = Math.abs(deltaEnd);
    }
  });

  return {
    start: start + bestDelta,
    end: end + bestDelta,
  };
}

export function snapRectToTargets(
  rect: Rect,
  snapContext: SnapContext,
  tolerancePx: number = SNAP_TOLERANCE_PX,
  mode: "move" | "resize" = "move"
): Rect {
  const left = rect.x;
  const right = rect.x + rect.width;
  const top = rect.y;
  const bottom = rect.y + rect.height;

  let newLeft = left;
  let newRight = right;
  let newTop = top;
  let newBottom = bottom;

  if (mode === "move") {
    const snappedX = snapAxisMovement(left, right, snapContext.xTargets, tolerancePx);
    const snappedY = snapAxisMovement(top, bottom, snapContext.yTargets, tolerancePx);
    newLeft = snappedX.start;
    newRight = snappedX.end;
    newTop = snappedY.start;
    newBottom = snappedY.end;
  } else {
    newLeft = snapCoordinate(left, snapContext.xTargets, tolerancePx);
    newRight = snapCoordinate(right, snapContext.xTargets, tolerancePx);
    newTop = snapCoordinate(top, snapContext.yTargets, tolerancePx);
    newBottom = snapCoordinate(bottom, snapContext.yTargets, tolerancePx);
  }

  const snappedWidth = Math.max(MIN_RECT_SIZE_MM, newRight - newLeft);
  const snappedHeight = Math.max(MIN_RECT_SIZE_MM, newBottom - newTop);

  return {
    x: newLeft,
    y: newTop,
    width: snappedWidth,
    height: snappedHeight,
  };
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
  let remaining = runLengthMm;
  let wasteMm = 0;
  let overflowMm = 0;

  while (remaining > 0) {
    if (remaining <= MAX_BOARD_LENGTH_MM) {
      const overhang = MAX_BOARD_LENGTH_MM - remaining;
      if (overhang <= MAX_OVERHANG_MM) {
        boardLengths.push(MAX_BOARD_LENGTH_MM);
        overflowMm += overhang;
      } else {
        boardLengths.push(remaining);
        wasteMm += overhang;
      }
      remaining = 0;
    } else {
      boardLengths.push(MAX_BOARD_LENGTH_MM);
      remaining -= MAX_BOARD_LENGTH_MM;
    }
  }

  return { boardLengths, overflowMm, wasteMm };
}
