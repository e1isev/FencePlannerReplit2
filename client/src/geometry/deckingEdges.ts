import { Point, EdgeConstraint } from "@/types/decking";

export function edgeLengthMm(polygonMm: Point[], edgeIndex: number): number {
  const n = polygonMm.length;
  if (n === 0) return 0;
  const start = polygonMm[edgeIndex % n];
  const end = polygonMm[(edgeIndex + 1) % n];
  return Math.hypot(end.x - start.x, end.y - start.y);
}

export function isEdgeLocked(
  edgeConstraints: Record<number, EdgeConstraint>,
  edgeIndex: number
): boolean {
  return edgeConstraints[edgeIndex]?.mode === "locked";
}

export function lockEdge(
  edgeConstraints: Record<number, EdgeConstraint>,
  edgeIndex: number,
  lengthMm: number
): Record<number, EdgeConstraint> {
  return {
    ...edgeConstraints,
    [edgeIndex]: { mode: "locked", lengthMm },
  };
}

export function unlockEdge(
  edgeConstraints: Record<number, EdgeConstraint>,
  edgeIndex: number
): Record<number, EdgeConstraint> {
  const next = { ...edgeConstraints };
  delete next[edgeIndex];
  return next;
}
