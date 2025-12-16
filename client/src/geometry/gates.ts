import { GateType, Gate, FenceLine, Point } from "@/types/models";

const GATE_SIZES_MM: Record<GateType, number> = {
  single_900: 900,
  single_1800: 1800,
  double_900: 1800,
  double_1800: 3600,
  sliding_4800: 4800,
  opening_custom: 0,
};

export function getGateWidth(gate: Gate): number {
  if (gate.type === "opening_custom") {
    return gate.opening_mm;
  }

  if (gate.opening_mm > 0) {
    return gate.opening_mm;
  }

  return GATE_SIZES_MM[gate.type];
}

export function validateSlidingReturn(
  gate: Gate,
  line: FenceLine,
  allLines: FenceLine[]
): string | null {
  if (!gate.type.startsWith("sliding")) {
    return null;
  }
  
  const requiredSpace = gate.returnLength_mm ?? 4800;
  
  const connectedPoint =
    gate.slidingReturnDirection === "left" ? line.a : line.b;
  
  const adjacentLines = allLines.filter(
    (l) =>
      l.id !== line.id &&
      (pointsEqual(l.a, connectedPoint) || pointsEqual(l.b, connectedPoint))
  );
  
  for (const adjLine of adjacentLines) {
    if (adjLine.length_mm < requiredSpace) {
      return `Sliding gate requires ${(requiredSpace / 1000).toFixed(1)}m return space. Adjacent run is only ${(adjLine.length_mm / 1000).toFixed(2)}m.`;
    }
  }
  
  return null;
}

function pointsEqual(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1;
}

export function getSlidingReturnRect(
  gate: Gate,
  gateLine: FenceLine,
  mmPerPixel: number
): { points: [number, number, number, number]; strokeWidth: number } | null {
  if (!gate.type.startsWith("sliding")) {
    return null;
  }

  if (!isFinite(mmPerPixel) || mmPerPixel <= 0) {
    return null;
  }

  const returnLength_mm = gate.returnLength_mm ?? 4800;
  const returnLength_px = returnLength_mm / mmPerPixel;
  const gateThickness_px = Math.max(8, Math.min(30, 150 / mmPerPixel));

  const gateDx = gateLine.b.x - gateLine.a.x;
  const gateDy = gateLine.b.y - gateLine.a.y;
  const gateLength = Math.sqrt(gateDx * gateDx + gateDy * gateDy);
  const gateNx = gateDx / gateLength;
  const gateNy = gateDy / gateLength;
  
  const perpX = gate.slidingReturnDirection === "left" ? -gateNy : gateNy;
  const perpY = gate.slidingReturnDirection === "left" ? gateNx : -gateNx;

  const anchor = gate.slidingReturnDirection === "left" ? gateLine.a : gateLine.b;

  const endPoint: Point = {
    x: anchor.x + perpX * returnLength_px,
    y: anchor.y + perpY * returnLength_px,
  };

  return {
    points: [anchor.x, anchor.y, endPoint.x, endPoint.y],
    strokeWidth: gateThickness_px,
  };
}
