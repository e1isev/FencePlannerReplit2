import { Point } from "@/types/models";

export const DEFAULT_POINT_QUANTIZE_STEP_MM = 1;

export function quantizePointMm(point: Point, stepMm: number, mmPerPixel: number): Point {
  if (!Number.isFinite(stepMm) || stepMm <= 0 || !Number.isFinite(mmPerPixel) || mmPerPixel <= 0) {
    return point;
  }

  const stepPx = stepMm / mmPerPixel;
  const quantize = (value: number) => Math.round(value / stepPx) * stepPx;

  return {
    x: quantize(point.x),
    y: quantize(point.y),
  };
}
