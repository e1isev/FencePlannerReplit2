import type { Point } from "@/types/decking";
import { offsetPolygonMiter } from "./pictureFrame";

export function buildFasciaPieces(polygonMm: Point[], thicknessMm: number): Point[][] {
  if (polygonMm.length < 3 || thicknessMm <= 0) return [];

  const offsetPolygon = offsetPolygonMiter(polygonMm, thicknessMm, "outward");
  if (!offsetPolygon) return [];

  const pieces: Point[][] = [];
  for (let i = 0; i < polygonMm.length; i++) {
    const next = (i + 1) % polygonMm.length;
    const quad: Point[] = [polygonMm[i], polygonMm[next], offsetPolygon[next], offsetPolygon[i]];
    pieces.push(quad);
  }

  return pieces;
}
