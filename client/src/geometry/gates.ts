import { GateType, Gate, FenceLine, Point } from "@/types/models";

function gateAngleDeg(x1: number, y1: number, x2: number, y2: number) {
  return (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
}

function gateBasis(x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;

  // normal, rotate 90 degrees
  const nx = -uy;
  const ny = ux;

  return { ux, uy, nx, ny, len };
}

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
):
  | {
      center: Point;
      width: number;
      height: number;
      rotation: number;
    }
  | null {
  if (!gate.type.startsWith("sliding")) {
    return null;
  }

  if (!isFinite(mmPerPixel) || mmPerPixel <= 0) {
    return null;
  }

  const RETURN_THICKNESS_MM = 51;
  const RETURN_OFFSET_MM = 0;

  const returnLength_mm = gate.returnLength_mm ?? 4800;
  const returnLength_px = returnLength_mm / mmPerPixel;
  const returnThickness_px = Math.max(8, RETURN_THICKNESS_MM / mmPerPixel);
  const returnOffset_px = RETURN_OFFSET_MM / mmPerPixel;

  const { ux, uy, nx, ny } = gateBasis(
    gateLine.a.x,
    gateLine.a.y,
    gateLine.b.x,
    gateLine.b.y
  );

  const angle = gateAngleDeg(gateLine.a.x, gateLine.a.y, gateLine.b.x, gateLine.b.y);
  const anchor = gate.slidingReturnDirection === "left" ? gateLine.a : gateLine.b;
  const normalSign = gate.slidingReturnDirection === "left" ? -1 : 1;

  const center: Point = {
    x: anchor.x + ux * (returnLength_px / 2) + nx * (normalSign * returnOffset_px),
    y: anchor.y + uy * (returnLength_px / 2) + ny * (normalSign * returnOffset_px),
  };

  return {
    center,
    width: returnLength_px,
    height: returnThickness_px,
    rotation: angle,
  };
}
