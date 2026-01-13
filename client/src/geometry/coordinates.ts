import { mercatorMetersToLngLat, lngLatToMercatorMeters } from "@/lib/geo";
import { Point } from "@/types/models";

export const DEFAULT_POINT_QUANTIZE_STEP_MM = 1;

export function quantizePointMm(point: Point, stepMm: number, mmPerPixel: number): Point {
  if (!Number.isFinite(stepMm) || stepMm <= 0 || !Number.isFinite(mmPerPixel) || mmPerPixel <= 0) {
    return point;
  }

  const stepMeters = stepMm / 1000;
  const meters = lngLatToMercatorMeters(point);
  const quantize = (value: number) => Math.round(value / stepMeters) * stepMeters;

  return {
    ...mercatorMetersToLngLat({
      x: quantize(meters.x),
      y: quantize(meters.y),
    }),
  };
}
