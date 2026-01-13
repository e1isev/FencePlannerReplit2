import length from "@turf/length";
import { lineString } from "@turf/helpers";
import type { Point } from "@/types/models";

const EARTH_RADIUS_M = 6378137;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export function lngLatToMercatorMeters(point: Point): Point {
  const x = EARTH_RADIUS_M * point.x * DEG_TO_RAD;
  const y =
    EARTH_RADIUS_M *
    Math.log(Math.tan(Math.PI / 4 + (point.y * DEG_TO_RAD) / 2));

  return { x, y };
}

export function mercatorMetersToLngLat(point: Point): Point {
  const lng = (point.x / EARTH_RADIUS_M) * RAD_TO_DEG;
  const lat = (2 * Math.atan(Math.exp(point.y / EARTH_RADIUS_M)) - Math.PI / 2) * RAD_TO_DEG;

  return { x: lng, y: lat };
}

export function distanceMetersProjected(a: Point, b: Point): number {
  const aMeters = lngLatToMercatorMeters(a);
  const bMeters = lngLatToMercatorMeters(b);

  return Math.hypot(bMeters.x - aMeters.x, bMeters.y - aMeters.y);
}

export function lineLengthMeters(points: Point[]): number {
  if (points.length < 2) return 0;
  const coordinates = points.map((point) => [point.x, point.y]);
  const km = length(lineString(coordinates), { units: "kilometers" });
  return km * 1000;
}

export function interpolateLngLat(a: Point, b: Point, t: number): Point {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

export function pointAlongLineByMeters(
  a: Point,
  b: Point,
  distanceMeters: number,
  options?: { clamp?: boolean }
): Point {
  const aMeters = lngLatToMercatorMeters(a);
  const bMeters = lngLatToMercatorMeters(b);
  const total = Math.hypot(bMeters.x - aMeters.x, bMeters.y - aMeters.y);

  if (!Number.isFinite(total) || total === 0) return a;

  const t = distanceMeters / total;
  const clampedT = options?.clamp === false ? t : Math.max(0, Math.min(1, t));
  const pointMeters = {
    x: aMeters.x + (bMeters.x - aMeters.x) * clampedT,
    y: aMeters.y + (bMeters.y - aMeters.y) * clampedT,
  };

  return mercatorMetersToLngLat(pointMeters);
}
