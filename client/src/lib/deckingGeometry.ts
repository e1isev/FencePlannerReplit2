export const SCALE_FACTOR = 10; // 10 pixels = 1 millimeter
export const BOARD_WIDTH_MM = 140;
export const BOARD_GAP_MM = 3;
export const JOIST_SPACING_MM = 450;
export const MAX_BOARD_LENGTH_MM = 5400; // 5.4 meters
export const SNAP_TOLERANCE_MM = 5;

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
  tolerance: number = SNAP_TOLERANCE_MM
): Point | null {
  for (const existing of existingShapes) {
    const movingRight = movingShape.x + movingShape.width;
    const movingBottom = movingShape.y + movingShape.height;
    const existingRight = existing.x + existing.width;
    const existingBottom = existing.y + existing.height;

    if (
      Math.abs(movingShape.y - existing.y) < tolerance ||
      Math.abs(movingBottom - existingBottom) < tolerance
    ) {
      if (Math.abs(movingRight - existing.x) < tolerance) {
        return { x: existing.x - movingShape.width, y: movingShape.y };
      }
      if (Math.abs(movingShape.x - existingRight) < tolerance) {
        return { x: existingRight, y: movingShape.y };
      }
    }

    if (
      Math.abs(movingShape.x - existing.x) < tolerance ||
      Math.abs(movingRight - existingRight) < tolerance
    ) {
      if (Math.abs(movingBottom - existing.y) < tolerance) {
        return { x: movingShape.x, y: existing.y - movingShape.height };
      }
      if (Math.abs(movingShape.y - existingBottom) < tolerance) {
        return { x: movingShape.x, y: existingBottom };
      }
    }
  }

  return null;
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
