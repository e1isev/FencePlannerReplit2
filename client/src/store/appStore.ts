import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  FenceLine,
  Post,
  Gate,
  PanelSegment,
  Leftover,
  WarningMsg,
  FenceStyleId,
  ProductKind,
  Point,
  GateType,
} from "@/types/models";
import { generateId } from "@/lib/ids";
import { generatePosts } from "@/geometry/posts";
import { fitPanels, MIN_LEFTOVER_MM, PANEL_LENGTH_MM } from "@/geometry/panels";
import { validateSlidingReturn, getGateWidth } from "@/geometry/gates";
import { MIN_LINE_LENGTH_MM } from "@/constants/geometry";

const SNAP_TOLERANCE_PX = 0.1;
const MERGE_ANGLE_TOL_DEG = 2;
const MERGE_ENDPOINT_EPS_PX = 0.25;

const pointsMatch = (p1: Point, p2: Point) => {
  return Math.abs(p1.x - p2.x) < SNAP_TOLERANCE_PX && Math.abs(p1.y - p2.y) < SNAP_TOLERANCE_PX;
};

const degToRad = (deg: number) => (deg * Math.PI) / 180;

const normalise = (v: { x: number; y: number }) => {
  const mag = Math.hypot(v.x, v.y);
  if (mag === 0) return { x: 0, y: 0 };
  return { x: v.x / mag, y: v.y / mag };
};

const angleBetweenLinesAbs = (l1: FenceLine, l2: FenceLine) => {
  const d1 = normalise({ x: l1.b.x - l1.a.x, y: l1.b.y - l1.a.y });
  const d2 = normalise({ x: l2.b.x - l2.a.x, y: l2.b.y - l2.a.y });
  const dot = d1.x * d2.x + d1.y * d2.y;
  const clamped = Math.min(1, Math.max(-1, Math.abs(dot)));
  return Math.acos(clamped);
};

type SharedEndpointResult =
  | { shared: false }
  | {
      shared: true;
      sharedPoint: Point;
      line1End: "a" | "b";
      line2End: "a" | "b";
    };

const linesShareEndpoint = (l1: FenceLine, l2: FenceLine, epsPx: number): SharedEndpointResult => {
  const pairs: Array<{
    line1End: "a" | "b";
    line2End: "a" | "b";
    p1: Point;
    p2: Point;
  }> = [
    { line1End: "a", line2End: "a", p1: l1.a, p2: l2.a },
    { line1End: "a", line2End: "b", p1: l1.a, p2: l2.b },
    { line1End: "b", line2End: "a", p1: l1.b, p2: l2.a },
    { line1End: "b", line2End: "b", p1: l1.b, p2: l2.b },
  ];

  let bestMatch: SharedEndpointResult = { shared: false };
  let bestDist = Infinity;

  for (const pair of pairs) {
    const dist = Math.hypot(pair.p1.x - pair.p2.x, pair.p1.y - pair.p2.y);
    if (dist <= epsPx && dist < bestDist) {
      bestDist = dist;
      bestMatch = {
        shared: true,
        sharedPoint: pair.p1,
        line1End: pair.line1End,
        line2End: pair.line2End,
      };
    }
  }

  return bestMatch;
};

const isMergeBlocked = (l1: FenceLine, l2: FenceLine) => Boolean(l1.gateId || l2.gateId);

const segmentsOverlapOnLine = (l1: FenceLine, l2: FenceLine, tolPx: number) => {
  const direction = normalise({ x: l1.b.x - l1.a.x, y: l1.b.y - l1.a.y });
  if (direction.x === 0 && direction.y === 0) return false;

  const project = (p: Point) => p.x * direction.x + p.y * direction.y;
  const l1Proj = [project(l1.a), project(l1.b)];
  const l2Proj = [project(l2.a), project(l2.b)];

  const l1Min = Math.min(...l1Proj);
  const l1Max = Math.max(...l1Proj);
  const l2Min = Math.min(...l2Proj);
  const l2Max = Math.max(...l2Proj);

  return l1Max >= l2Min - tolPx && l2Max >= l1Min - tolPx;
};

const buildMergedLine = (
  baseLine: FenceLine,
  otherLine: FenceLine,
  sharedEndpoint: Extract<SharedEndpointResult, { shared: true }>,
  mmPerPixel: number
): FenceLine => {
  const baseOther = sharedEndpoint.line1End === "a" ? baseLine.b : baseLine.a;
  const otherOther = sharedEndpoint.line2End === "a" ? otherLine.b : otherLine.a;
  const mergedDx = otherOther.x - baseOther.x;
  const mergedDy = otherOther.y - baseOther.y;
  const mergedOrthogonal = Math.abs(mergedDx) < 0.01 || Math.abs(mergedDy) < 0.01;

  return {
    ...baseLine,
    a: baseOther,
    b: otherOther,
    length_mm: Math.hypot(mergedDx, mergedDy) * mmPerPixel,
    even_spacing: baseLine.even_spacing || otherLine.even_spacing,
    locked_90: mergedOrthogonal,
    gateId: undefined,
  };
};

const orderLinesForMerge = (
  lineA: FenceLine,
  lineB: FenceLine,
  primaryId: string,
  lineOrder: Map<string, number>
): [FenceLine, FenceLine] => {
  if (lineA.id === primaryId) return [lineA, lineB];
  if (lineB.id === primaryId) return [lineB, lineA];

  const orderA = lineOrder.get(lineA.id) ?? Infinity;
  const orderB = lineOrder.get(lineB.id) ?? Infinity;

  return orderA <= orderB ? [lineA, lineB] : [lineB, lineA];
};

const snapLineEndpoint = (
  line: FenceLine,
  end: "a" | "b",
  point: Point,
  mmPerPixel: number
): FenceLine => {
  const otherPoint = end === "a" ? line.b : line.a;
  const newA = end === "a" ? point : otherPoint;
  const newB = end === "b" ? point : otherPoint;
  const length_px = Math.hypot(newB.x - newA.x, newB.y - newA.y);

  return {
    ...line,
    a: newA,
    b: newB,
    length_mm: length_px * mmPerPixel,
  };
};

// Invariant: Lines containing any openings or gates are non-mergeable. Adjacent lines may align
// with them but must not merge into or through them.
export const lineHasGateOrOpening = (line: FenceLine): boolean => {
  const segmentHasOpening = line.segments?.some(
    (segment) => segment?.type === "opening" || segment?.type === "gate"
  );

  return Boolean(
    line.isGateLine === true ||
      line.gateId ||
      (line.openings && line.openings.length > 0) ||
      (line.gates && line.gates.length > 0) ||
      segmentHasOpening
  );
};

export const linesShareAnyGateOrOpening = (lineA: FenceLine, lineB: FenceLine): boolean => {
  const collectIds = (line: FenceLine): Set<string> => {
    const ids = new Set<string>();
    if (line.gateId) ids.add(line.gateId);
    line.gates?.forEach((gate) => {
      if (typeof gate === "string") ids.add(gate);
      else {
        if (gate.id) ids.add(gate.id);
        if (gate.gateId) ids.add(gate.gateId);
        if (gate.openingId) ids.add(gate.openingId);
      }
    });
    line.openings?.forEach((opening) => {
      if (typeof opening === "string") ids.add(opening);
      else {
        if (opening.id) ids.add(opening.id);
        if (opening.gateId) ids.add(opening.gateId);
        if (opening.openingId) ids.add(opening.openingId);
      }
    });
    line.segments?.forEach((segment) => {
      if (segment?.id) ids.add(segment.id);
      if (segment?.gateId) ids.add(segment.gateId);
      if (segment?.openingId) ids.add(segment.openingId);
    });
    return ids;
  };

  const aIds = collectIds(lineA);
  const bIds = collectIds(lineB);

  return Array.from(aIds).some((id) => bIds.has(id));
};

const mergeCollinearLines = (
  lines: FenceLine[],
  primaryId: string,
  mmPerPixel: number
): { lines: FenceLine[]; merged: boolean; primaryId: string } => {
  let updatedLines = [...lines];
  let merged = true;
  let mergedAny = false;

  while (merged) {
    merged = false;
    const primary = updatedLines.find((l) => l.id === primaryId);
    if (!primary) break;

    if (lineHasGateOrOpening(primary) || isMergeBlocked(primary, primary)) {
      console.debug("mergeCollinearLines blocked - primary has gate/opening", {
        primaryId: primary.id,
      });
      break;
    }

    const candidates = updatedLines.filter((l) => l.id !== primaryId);

    for (const candidate of candidates) {
      if (lineHasGateOrOpening(candidate) || isMergeBlocked(primary, candidate)) {
        continue;
      }

      const sharedEndpoint = linesShareEndpoint(primary, candidate, MERGE_ENDPOINT_EPS_PX);
      if (!sharedEndpoint.shared) {
        continue;
      }

      const angle = angleBetweenLinesAbs(primary, candidate);
      if (angle > degToRad(MERGE_ANGLE_TOL_DEG)) {
        continue;
      }

      const mergedLine = buildMergedLine(primary, candidate, sharedEndpoint, mmPerPixel);

      updatedLines = updatedLines
        .filter((l) => l.id !== primary.id && l.id !== candidate.id)
        .concat(mergedLine);

      merged = true;
      mergedAny = true;
      break;
    }
  }

  return { lines: updatedLines, merged: mergedAny, primaryId };
};

const mergeConnectedLines = (
  lines: FenceLine[],
  primaryId: string,
  lineOrder: Map<string, number>,
  mmPerPixel: number
) => {
  let updatedLines = [...lines];
  let merged = true;

  while (merged) {
    merged = false;
    outer: for (let i = 0; i < updatedLines.length; i++) {
      for (let j = i + 1; j < updatedLines.length; j++) {
        const lineA = updatedLines[i];
        const lineB = updatedLines[j];

        if (isMergeBlocked(lineA, lineB) || lineHasGateOrOpening(lineA) || lineHasGateOrOpening(lineB)) {
          continue;
        }

        const [baseLine, otherLine] = orderLinesForMerge(lineA, lineB, primaryId, lineOrder);
        const sharedEndpoint = linesShareEndpoint(baseLine, otherLine, MERGE_ENDPOINT_EPS_PX);
        if (!sharedEndpoint.shared) continue;

        if (angleBetweenLinesAbs(baseLine, otherLine) > degToRad(MERGE_ANGLE_TOL_DEG)) continue;
        if (!segmentsOverlapOnLine(baseLine, otherLine, MERGE_ENDPOINT_EPS_PX)) continue;

        const mergedLine = buildMergedLine(baseLine, otherLine, sharedEndpoint, mmPerPixel);
        updatedLines = updatedLines
          .filter((line) => line.id !== baseLine.id && line.id !== otherLine.id)
          .concat(mergedLine);

        merged = true;
        break outer;
      }
    }
  }

  return updatedLines;
};

const weldSharedEndpoints = (
  lines: FenceLine[],
  primaryId: string,
  lineOrder: Map<string, number>,
  mmPerPixel: number
) => {
  let weldedLines = [...lines];
  let updated = true;

  while (updated) {
    updated = false;
    outer: for (let i = 0; i < weldedLines.length; i++) {
      for (let j = i + 1; j < weldedLines.length; j++) {
        const lineA = weldedLines[i];
        const lineB = weldedLines[j];

        if (isMergeBlocked(lineA, lineB)) continue;

        const [baseLine, otherLine] = orderLinesForMerge(lineA, lineB, primaryId, lineOrder);
        const sharedEndpoint = linesShareEndpoint(baseLine, otherLine, MERGE_ENDPOINT_EPS_PX);
        if (!sharedEndpoint.shared) continue;

        const canonicalPoint = sharedEndpoint.line1End === "a" ? baseLine.a : baseLine.b;
        const snappedBase = snapLineEndpoint(baseLine, sharedEndpoint.line1End, canonicalPoint, mmPerPixel);
        const snappedOther = snapLineEndpoint(
          otherLine,
          sharedEndpoint.line2End,
          canonicalPoint,
          mmPerPixel
        );

        weldedLines = weldedLines.map((line) => {
          if (line.id === snappedBase.id) return snappedBase;
          if (line.id === snappedOther.id) return snappedOther;
          return line;
        });

        updated = true;
        break outer;
      }
    }
  }

  return weldedLines;
};

interface AppState {
  productKind: ProductKind;
  fenceStyleId: FenceStyleId;
  lines: FenceLine[];
  posts: Post[];
  gates: Gate[];
  panels: PanelSegment[];
  leftovers: Leftover[];
  warnings: WarningMsg[];
  selectedGateType: GateType | null;
  drawingMode: boolean;
  previewLine: { start: Point; end: Point } | null;
  panelPositionsMap: Map<string, number[]>;
  mmPerPixel: number;
  selectedLineId: string | null;

  history: {
    lines: FenceLine[];
    gates: Gate[];
    panels: PanelSegment[];
    leftovers: Leftover[];
  }[];
  historyIndex: number;
  
  setProductKind: (kind: ProductKind) => void;
  setFenceStyle: (styleId: FenceStyleId) => void;
  setSelectedGateType: (type: GateType | null) => void;
  setSelectedLineId: (id: string | null) => void;
  setDrawingMode: (mode: boolean) => void;
  setPreviewLine: (line: { start: Point; end: Point } | null) => void;
  setMmPerPixel: (mmPerPixel: number) => void;

  addLine: (a: Point, b: Point) => void;
  updateLine: (id: string, length_mm: number) => void;
  toggleEvenSpacing: (id: string) => void;
  deleteLine: (id: string) => void;
  
  addGate: (runId: string, clickPoint?: Point) => void;
  updateGateReturnDirection: (gateId: string, direction: "left" | "right") => void;
  
  recalculate: () => void;
  clear: () => void;
  undo: () => void;
  redo: () => void;
  
  saveToHistory: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      productKind: "Residential fencing",
      fenceStyleId: "mystique_lattice",
      lines: [],
      posts: [],
      gates: [],
      panels: [],
      leftovers: [],
      warnings: [],
      selectedGateType: null,
      drawingMode: false,
      previewLine: null,
      panelPositionsMap: new Map(),
      mmPerPixel: 10,
      selectedLineId: null,
      
      history: [],
      historyIndex: -1,
      
      setProductKind: (kind) => set({ productKind: kind }),
      
      setFenceStyle: (styleId) => {
        set({ fenceStyleId: styleId });
        get().recalculate();
      },
      
      setSelectedGateType: (type) =>
        set((state) => {
          // Keep the current gate selection when the same gate button is clicked again
          if (type !== null && state.selectedGateType === type) return state;

          return { selectedGateType: type };
        }),

      setSelectedLineId: (id) => set({ selectedLineId: id }),
      
      setDrawingMode: (mode) => set({ drawingMode: mode }),

      setPreviewLine: (line) => set({ previewLine: line }),

      setMmPerPixel: (mmPerPixel) => {
        const previousMmPerPixel = get().mmPerPixel;
        if (Math.abs(previousMmPerPixel - mmPerPixel) < 0.0001) return;

        set((state) => ({
          mmPerPixel,
          lines: state.lines.map((line) => {
            const dx = line.b.x - line.a.x;
            const dy = line.b.y - line.a.y;
            const length_px = Math.hypot(dx, dy);

            return {
              ...line,
              length_mm: length_px * mmPerPixel,
            };
          }),
        }));

        get().recalculate();
      },

      addLine: (a, b) => {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const length_px = Math.hypot(dx, dy);
        const length_mm = length_px * get().mmPerPixel;

        if (length_mm < MIN_LINE_LENGTH_MM) {
          const warning: WarningMsg = {
            id: generateId("warn"),
            text: `Line too short (${(length_mm / 1000).toFixed(2)}m). Minimum length is 0.3m.`,
            timestamp: Date.now(),
          };
          set({ warnings: [...get().warnings, warning] });
          return;
        }

        const isOrthogonal = Math.abs(dx) < 0.01 || Math.abs(dy) < 0.01;

        const newLine: FenceLine = {
          id: generateId("line"),
          a,
          b,
          length_mm,
          locked_90: isOrthogonal,
          even_spacing: false,
        };

        const nextLines = [...get().lines, newLine];
        const mergeResult = mergeCollinearLines(nextLines, newLine.id, get().mmPerPixel);
        const mergedLines = mergeResult.lines;
        const selectedLineId = mergeResult.merged ? mergeResult.primaryId : newLine.id;

        set({ lines: mergedLines, selectedLineId });
        get().saveToHistory();
        get().recalculate();
      },
      
      updateLine: (id, length_mm) => {
        if (length_mm < MIN_LINE_LENGTH_MM) {
          const warning: WarningMsg = {
            id: generateId("warn"),
            text: `Line too short (${(length_mm / 1000).toFixed(2)}m). Minimum length is 0.3m.`,
            timestamp: Date.now(),
          };
          set({ warnings: [...get().warnings, warning] });
          return;
        }
        
        const mmPerPixel = get().mmPerPixel;
        const existingLines = get().lines;
        const lineOrder = new Map(existingLines.map((line, index) => [line.id, index]));

        const targetLine = existingLines.find((l) => l.id === id);
        if (!targetLine || targetLine.gateId) return;
        
        const dx = targetLine.b.x - targetLine.a.x;
        const dy = targetLine.b.y - targetLine.a.y;
        const currentLength = Math.hypot(dx, dy);
        const scale = (length_mm / mmPerPixel) / currentLength;
        
        const oldEndpoint = targetLine.b;
        const newEndpoint = {
          x: targetLine.a.x + dx * scale,
          y: targetLine.a.y + dy * scale,
        };
        
        const pointKey = (p: Point) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
        const processedLines = new Set<string>();
        const movedPoints = new Map<string, Point>();
        movedPoints.set(pointKey(oldEndpoint), newEndpoint);
        
        let updatedLines = existingLines.map((line) => {
          if (line.id === id) {
            processedLines.add(line.id);
            return {
              ...line,
              b: newEndpoint,
              length_mm,
            };
          }
          return { ...line };
        });
        
        let hasChanges = true;
        while (hasChanges) {
          hasChanges = false;
          const newUpdatedLines = updatedLines.map((line) => {
            if (processedLines.has(line.id)) return line;

            let foundMatch = false;
            let newLine = { ...line };
            
            movedPoints.forEach((newPos, oldKey) => {
              if (foundMatch) return;
              
              const [oldX, oldY] = oldKey.split(',').map(parseFloat);
              const oldPos = { x: oldX, y: oldY };
              
              if (pointsMatch(line.a, oldPos)) {
                const deltaX = newPos.x - oldPos.x;
                const deltaY = newPos.y - oldPos.y;
                const newA = { x: line.a.x + deltaX, y: line.a.y + deltaY };
                const newB = { x: line.b.x + deltaX, y: line.b.y + deltaY };
                
                movedPoints.set(pointKey(line.b), newB);
                
                const dx = newB.x - newA.x;
                const dy = newB.y - newA.y;
                const length_px = Math.hypot(dx, dy);

                newLine = {
                  ...line,
                  a: newA,
                  b: newB,
                  length_mm: length_px * mmPerPixel,
                };
                processedLines.add(line.id);
                foundMatch = true;
                hasChanges = true;
              } else if (pointsMatch(line.b, oldPos)) {
                const deltaX = newPos.x - oldPos.x;
                const deltaY = newPos.y - oldPos.y;
                const newA = { x: line.a.x + deltaX, y: line.a.y + deltaY };
                const newB = { x: line.b.x + deltaX, y: line.b.y + deltaY };
                
                movedPoints.set(pointKey(line.a), newA);
                
                const dx = newB.x - newA.x;
                const dy = newB.y - newA.y;
                const length_px = Math.hypot(dx, dy);

                newLine = {
                  ...line,
                  a: newA,
                  b: newB,
                  length_mm: length_px * mmPerPixel,
                };
                processedLines.add(line.id);
                foundMatch = true;
                hasChanges = true;
              }
            });
            
            return newLine;
          });
          
          updatedLines = newUpdatedLines;
        }

        const globallyMerged = mergeConnectedLines(updatedLines, id, lineOrder, mmPerPixel);
        const mergeResult = mergeCollinearLines(globallyMerged, id, mmPerPixel);
        const weldedLines = weldSharedEndpoints(mergeResult.lines, id, lineOrder, mmPerPixel);

        set({ lines: weldedLines });
        get().saveToHistory();
        get().recalculate();
      },
      
      toggleEvenSpacing: (id) => {
        const lines = get().lines.map((line) =>
          line.id === id ? { ...line, even_spacing: !line.even_spacing } : line
        );
        set({ lines });
        get().saveToHistory();
        get().recalculate();
      },
      
      deleteLine: (id) => {
        set({
          lines: get().lines.filter((l) => l.id !== id),
          gates: get().gates.filter((g) => g.runId !== id),
        });
        get().saveToHistory();
        get().recalculate();
      },
      
      addGate: (runId, clickPoint) => {
        const gateType = get().selectedGateType;
        if (!gateType) return;
        
        const line = get().lines.find((l) => l.id === runId);
        if (!line) return;
        
        let opening_mm = 0;
        const leafCount = gateType.startsWith("double") ? 2 : 1;
        const returnLength_mm = gateType.startsWith("sliding") ? 4800 : undefined;
        if (gateType === "opening_custom") {
          const input = prompt("Enter gate opening in metres:");
          if (!input) return;
          const metres = parseFloat(input);
          if (isNaN(metres) || metres <= 0) return;
          opening_mm = metres * 1000;
        } else {
          opening_mm = getGateWidth({
            id: "",
            type: gateType,
            opening_mm: 0,
            runId: "",
            slidingReturnDirection: "left",
          });
        }
        
        const newGate: Gate = {
          id: generateId("gate"),
          type: gateType,
          opening_mm,
          runId,
          slidingReturnDirection: "left",
          leaf_count: leafCount,
          leaf_width_mm: opening_mm / leafCount,
          panel_width_mm: opening_mm,
          returnLength_mm,
        };
        
        const dx = line.b.x - line.a.x;
        const dy = line.b.y - line.a.y;
        const totalLength_px = Math.sqrt(dx * dx + dy * dy);
        const mmPerPixel = get().mmPerPixel;
        const totalLength_mm = totalLength_px * mmPerPixel;

        const remainingLength_mm = totalLength_mm - opening_mm;
        if (remainingLength_mm < 0) {
          const warning: WarningMsg = {
            id: generateId("warn"),
            text: `Gate opening exceeds run length.`,
            timestamp: Date.now(),
          };
          set({ warnings: [...get().warnings, warning] });
          return;
        }

        const allLines = get().lines;

        const pointsEqual = (p1: Point, p2: Point) =>
          Math.abs(p1.x - p2.x) < 1 && Math.abs(p1.y - p2.y) < 1;

        const isEndpoint = (point: Point) => {
          const connectedLines = allLines.filter(
            (l) =>
              l.id !== runId &&
              !l.gateId &&
              (pointsEqual(l.a, point) || pointsEqual(l.b, point))
          );
          return connectedLines.length === 0;
        };

        const aIsEndpoint = isEndpoint(line.a);
        const bIsEndpoint = isEndpoint(line.b);

        const END_CLEARANCE_MM = 300;
        const requiresClearance = (aIsEndpoint && bIsEndpoint) || (!aIsEndpoint && !bIsEndpoint);
        const minStart = requiresClearance ? END_CLEARANCE_MM : 0;
        const maxStart = totalLength_mm - opening_mm - (requiresClearance ? END_CLEARANCE_MM : 0);

        if (maxStart < minStart) {
          const warning: WarningMsg = {
            id: generateId("warn"),
            text: `Insufficient space for gate with required clearance.`,
            timestamp: Date.now(),
          };
          set({ warnings: [...get().warnings, warning] });
          return;
        }

        let desiredStart_mm = (minStart + maxStart) / 2;

        if (clickPoint) {
          const abLenSq = dx * dx + dy * dy;
          if (abLenSq > 0) {
            const apX = clickPoint.x - line.a.x;
            const apY = clickPoint.y - line.a.y;
            let t = (apX * dx + apY * dy) / abLenSq;
            t = Math.max(0, Math.min(1, t));

            const clickDist_mm = Math.sqrt(abLenSq) * t * mmPerPixel;
            const placementMode: "center" | "start" = "center";
            desiredStart_mm =
              placementMode === "center"
                ? clickDist_mm - opening_mm / 2
                : clickDist_mm;
          }
        }

        const gateStart_mm = Math.max(minStart, Math.min(maxStart, desiredStart_mm));
        const beforeLength_mm = Math.max(0, gateStart_mm);
        const afterLength_mm = Math.max(0, totalLength_mm - gateStart_mm - opening_mm);

        const unitX = dx / totalLength_px;
        const unitY = dy / totalLength_px;

        const beforeEnd_px = beforeLength_mm / mmPerPixel;
        const gateEnd_px = (beforeLength_mm + opening_mm) / mmPerPixel;

        const beforeEndPoint = {
          x: line.a.x + unitX * beforeEnd_px,
          y: line.a.y + unitY * beforeEnd_px,
        };

        const gateEndPoint = {
          x: line.a.x + unitX * gateEnd_px,
          y: line.a.y + unitY * gateEnd_px,
        };
        
        const gateLine: FenceLine = {
          id: generateId("line"),
          a: beforeEndPoint,
          b: gateEndPoint,
          length_mm: opening_mm,
          locked_90: line.locked_90,
          even_spacing: false,
          gateId: newGate.id,
        };
        
        const otherLines = get().lines.filter((l) => l.id !== runId);
        const newLines = [gateLine];
        
        if (beforeLength_mm > 0) {
          const beforeLine: FenceLine = {
            id: generateId("line"),
            a: line.a,
            b: beforeEndPoint,
            length_mm: beforeLength_mm,
            locked_90: line.locked_90,
            even_spacing: line.even_spacing,
          };
          newLines.push(beforeLine);
        }
        
        if (afterLength_mm > 0) {
          const afterLine: FenceLine = {
            id: generateId("line"),
            a: gateEndPoint,
            b: line.b,
            length_mm: afterLength_mm,
            locked_90: line.locked_90,
            even_spacing: line.even_spacing,
          };
          newLines.push(afterLine);
        }
        
        set({
          gates: [...get().gates, newGate],
          lines: [...otherLines, ...newLines],
        });
        
        get().setSelectedGateType(null);
        get().saveToHistory();
        get().recalculate();
      },
      
      updateGateReturnDirection: (gateId, direction) => {
        set({
          gates: get().gates.map((g) =>
            g.id === gateId ? { ...g, slidingReturnDirection: direction } : g
          ),
        });
        get().recalculate();
      },
      
recalculate: () => {
        const { lines, gates, leftovers } = get();
        
        const allPanels: PanelSegment[] = [];
        const allNewLeftovers: Leftover[] = [...leftovers];
        const allWarnings: WarningMsg[] = [];
        const panelPositionsMap = new Map<string, number[]>();
        
        lines.forEach((line) => {
          if (line.gateId) return;

          const remainder = line.length_mm % PANEL_LENGTH_MM;
          const normalizedRemainder = remainder < 0.5 ? 0 : remainder;
          const autoEvenSpacing = normalizedRemainder > 0 && normalizedRemainder < MIN_LEFTOVER_MM;
          const shouldEvenSpace = line.even_spacing || autoEvenSpacing;

          const result = fitPanels(
            line.id,
            line.length_mm,
            shouldEvenSpace,
            allNewLeftovers
          );

          allPanels.push(...result.segments);
          allNewLeftovers.push(...result.newLeftovers);
          panelPositionsMap.set(line.id, result.panelPositions);
result.warnings.forEach((text) => {
            allWarnings.push({
              id: generateId("warn"),
              text,
              runId: line.id,
              timestamp: Date.now(),
            });
          });
        });
        
        gates.forEach((gate) => {
          const line = lines.find((l) => l.id === gate.runId);
          if (!line) return;
          
const warning = validateSlidingReturn(gate, line, lines);
          if (warning) {
            allWarnings.push({
              id: generateId("warn"),
              text: warning,
              runId: gate.runId,
              timestamp: Date.now(),
            });
          }
        });
        
        const posts = generatePosts(lines, gates, panelPositionsMap);
        
        const tJunctions = posts.filter((post) => {
          const connectingLines = lines.filter(
            (line) =>
              (Math.abs(line.a.x - post.pos.x) < 1 &&
                Math.abs(line.a.y - post.pos.y) < 1) ||
              (Math.abs(line.b.x - post.pos.x) < 1 &&
                Math.abs(line.b.y - post.pos.y) < 1)
          );
          return connectingLines.length > 2;
        });
        
tJunctions.forEach((post) => {
          allWarnings.push({
            id: generateId("warn"),
            text: "T-junction with more than 2 runs detected. This may require custom post configuration.",
            timestamp: Date.now(),
          });
        });
        
        set({
          posts,
          panels: allPanels,
          leftovers: allNewLeftovers,
          warnings: allWarnings,
          panelPositionsMap,
        });
      },
      
      clear: () => {
        set({
          lines: [],
          posts: [],
          gates: [],
          panels: [],
          leftovers: [],
          warnings: [],
          selectedGateType: null,
          drawingMode: false,
          previewLine: null,
          panelPositionsMap: new Map(),
          history: [],
          historyIndex: -1,
        });
      },
      
      undo: () => {
        const { history, historyIndex } = get();
        if (historyIndex > 0) {
          const prevState = history[historyIndex - 1];
          set({
            ...prevState,
            historyIndex: historyIndex - 1,
          });
          get().recalculate();
        }
      },
      
      redo: () => {
        const { history, historyIndex } = get();
        if (historyIndex < history.length - 1) {
          const nextState = history[historyIndex + 1];
          set({
            ...nextState,
            historyIndex: historyIndex + 1,
          });
          get().recalculate();
        }
      },
      
      saveToHistory: () => {
        const { lines, gates, panels, leftovers, history, historyIndex } = get();
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push({ lines, gates, panels, leftovers });
        set({
          history: newHistory,
          historyIndex: newHistory.length - 1,
        });
      },
    }),
    {
      name: "fence-planner-storage",
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          const parsed = JSON.parse(str);
          if (parsed.state?.panelPositionsMap) {
            parsed.state.panelPositionsMap = new Map(Object.entries(parsed.state.panelPositionsMap));
          }
          return parsed;
        },
        setItem: (name, value) => {
          const serialized = {
            ...value,
            state: {
              ...value.state,
              panelPositionsMap: value.state.panelPositionsMap instanceof Map
                ? Object.fromEntries(value.state.panelPositionsMap)
                : value.state.panelPositionsMap,
            },
          };
          localStorage.setItem(name, JSON.stringify(serialized));
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    }
  )
);
