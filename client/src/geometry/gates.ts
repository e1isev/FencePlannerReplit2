import { GateType, Gate, FenceLine, Point } from "@/types/models";

const GATE_SIZES_MM: Record<GateType, number> = {
  single_900: 900,
  single_1800: 1800,
  double_900: 900,
  double_1800: 1800,
  sliding_4800: 4800,
  opening_custom: 0,
};

export function getGateWidth(gate: Gate): number {
  if (gate.type === "opening_custom") {
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
  
  const requiredSpace = 4800;
  
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
  allLines: FenceLine[]
): { x: number; y: number; width: number; height: number } | null {
  if (!gate.type.startsWith("sliding")) {
    return null;
  }
  
  const returnLength_mm = 4800;
  const returnLength_px = returnLength_mm / 10;
  const gateWidth_px = 20;
  
  const gateDx = gateLine.b.x - gateLine.a.x;
  const gateDy = gateLine.b.y - gateLine.a.y;
  const gateLength = Math.sqrt(gateDx * gateDx + gateDy * gateDy);
  const gateNx = gateDx / gateLength;
  const gateNy = gateDy / gateLength;
  
  const leftPerpX = -gateNy;
  const leftPerpY = gateNx;
  const rightPerpX = gateNy;
  const rightPerpY = -gateNx;
  
  const desiredPerpX = gate.slidingReturnDirection === "left" ? leftPerpX : rightPerpX;
  const desiredPerpY = gate.slidingReturnDirection === "left" ? leftPerpY : rightPerpY;
  
  const endpointsToCheck = [gateLine.a, gateLine.b];
  
  let bestLine: FenceLine | null = null;
  let bestScore = -Infinity;
  let bestJunction: Point | null = null;
  
  for (const junction of endpointsToCheck) {
    const adjacentLines = allLines.filter(
      (l) =>
        l.id !== gateLine.id &&
        !l.gateId &&
        (pointsEqual(l.a, junction) || pointsEqual(l.b, junction))
    );
    
    for (const line of adjacentLines) {
      const lineStart = pointsEqual(line.a, junction) ? line.a : line.b;
      const lineEnd = pointsEqual(line.a, junction) ? line.b : line.a;
      
      const dx = lineEnd.x - lineStart.x;
      const dy = lineEnd.y - lineStart.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const nx = dx / len;
      const ny = dy / len;
      
      const dotProductGate = Math.abs(gateNx * nx + gateNy * ny);
      const angle = Math.acos(Math.min(1, dotProductGate));
      const angleDeg = (angle * 180) / Math.PI;
      
      if (angleDeg < 80 || angleDeg > 100) {
        continue;
      }
      
      const dotProductDirection = nx * desiredPerpX + ny * desiredPerpY;
      
      if (dotProductDirection > 0 && dotProductDirection > bestScore) {
        bestScore = dotProductDirection;
        bestLine = line;
        bestJunction = junction;
      }
    }
  }
  
  if (!bestLine || !bestJunction) {
    return null;
  }
  
  const lineStart = pointsEqual(bestLine.a, bestJunction)
    ? bestLine.a
    : bestLine.b;
  const lineEnd = pointsEqual(bestLine.a, bestJunction)
    ? bestLine.b
    : bestLine.a;
  
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const lineLength = Math.sqrt(dx * dx + dy * dy);
  
  const availableLength = Math.min(returnLength_px, lineLength);
  
  if (availableLength < returnLength_px) {
    return null;
  }
  
  const nx = dx / lineLength;
  const ny = dy / lineLength;
  
  const perpX = -ny;
  const perpY = nx;
  
  return {
    x: lineStart.x + perpX * (-gateWidth_px / 2),
    y: lineStart.y + perpY * (-gateWidth_px / 2),
    width: availableLength,
    height: gateWidth_px,
  };
}
