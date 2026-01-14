import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  FenceCategoryId,
  FenceLine,
  FenceStyleId,
  Gate,
  GateType,
  Leftover,
  PanelSegment,
  Point,
  Post,
  ProductKind,
  WarningMsg,
} from "@/types/models";
import type { ProjectSnapshotV1 } from "@shared/projectSnapshot";
import {
  getDefaultFenceStyleId,
  getFenceStyleCategory,
  getFenceStylesByCategory,
} from "@/config/fenceStyles";
import { DEFAULT_FENCE_HEIGHT_M, FenceHeightM } from "@/config/fenceHeights";
import { DEFAULT_FENCE_COLOR, FenceColorId, getFenceColourMode } from "@/config/fenceColors";
import { getSupportedPanelHeights } from "@/pricing/skuRules";
import { usePricingStore } from "@/store/pricingStore";
import { generateId } from "@/lib/ids";
import { DEFAULT_POINT_QUANTIZE_STEP_MM, quantizePointMm } from "@/geometry/coordinates";
import { generatePosts } from "@/geometry/posts";
import { fitPanels, MIN_LEFTOVER_MM, PANEL_LENGTH_MM } from "@/geometry/panels";
import { validateSlidingReturn } from "@/geometry/gates";
import { MIN_LINE_LENGTH_MM } from "@/constants/geometry";
import {
  distanceMetersProjected,
  interpolateLngLat,
  lineLengthMeters,
  lngLatToMercatorMeters,
  mercatorMetersToLngLat,
  pointAlongLineByMeters,
} from "@/lib/geo";
import {
  clampGateWidthM,
  getDefaultGateWidthMm,
  getGateWidthRules,
  normalizeGateWidthMm,
} from "@/lib/gates/gateWidth";

const ENDPOINT_WELD_EPS_MM = 60; // physical tolerance for welding endpoints
const SEGMENT_INTERIOR_TOL_MM = 20;
const MERGE_ANGLE_TOL_DEG = 2;
export const MIN_RUN_MM = Math.max(50, MIN_LINE_LENGTH_MM);
export const MAX_RUN_MM = 200_000;
const HISTORY_LIMIT = 100;
const LEFTOVER_WARN_THRESHOLD = 1_000;
const heightEquals = (a: number, b: number) => Math.abs(a - b) < 1e-6;
const quantizePoint = (point: Point, mmPerPixel: number) =>
  quantizePointMm(point, DEFAULT_POINT_QUANTIZE_STEP_MM, mmPerPixel);

const mmToMeters = (mm: number) => mm / 1000;
const metersToMm = (meters: number) => meters * 1000;
const weldToleranceMeters = () => mmToMeters(ENDPOINT_WELD_EPS_MM);
const segmentInteriorToleranceMeters = () => mmToMeters(SEGMENT_INTERIOR_TOL_MM);

const lineLengthMm = (a: Point, b: Point) => metersToMm(lineLengthMeters([a, b]));

type FencingPlannerSnapshotState = {
  productKind?: ProductKind;
  fenceStyleId?: FenceStyleId;
  fenceCategoryId?: FenceCategoryId;
  fenceHeightM?: FenceHeightM;
  fenceColorId?: FenceColorId;
  selectedGateType?: GateType;
  selectedGateId?: string | null;
  drawingMode?: boolean;
  mmPerPixel?: number;
  selectedLineId?: string | null;
  lines?: FenceLine[];
  gates?: Gate[];
  panels?: PanelSegment[];
  posts?: Post[];
  leftovers?: Leftover[];
  warnings?: WarningMsg[];
  panelPositionsMap?: Record<string, number[]>;
};

const vectorMeters = (a: Point, b: Point) => {
  const aMeters = lngLatToMercatorMeters(a);
  const bMeters = lngLatToMercatorMeters(b);
  return { x: bMeters.x - aMeters.x, y: bMeters.y - aMeters.y };
};

const pointsMatch = (p1: Point, p2: Point, epsMeters: number) =>
  distanceMetersProjected(p1, p2) < epsMeters;

const degToRad = (deg: number) => (deg * Math.PI) / 180;

const normalise = (v: { x: number; y: number }) => {
  const mag = Math.hypot(v.x, v.y);
  if (mag === 0) return { x: 0, y: 0 };
  return { x: v.x / mag, y: v.y / mag };
};

const lineDirectionMeters = (a: Point, b: Point) => {
  const direction = vectorMeters(a, b);
  return normalise(direction);
};

const findAlignedBoundaryPoint = (
  lines: FenceLine[],
  gateLine: FenceLine,
  endpoint: Point
) => {
  const weldEpsPx = weldToleranceMeters();
  const gateDir = lineDirectionMeters(gateLine.a, gateLine.b);
  const candidates = lines.filter(
    (line) =>
      line.id !== gateLine.id &&
      (pointsMatch(line.a, endpoint, weldEpsPx) || pointsMatch(line.b, endpoint, weldEpsPx))
  );

  let bestMatch: { point: Point; dot: number } | null = null;
  candidates.forEach((line) => {
    const otherPoint = pointsMatch(line.a, endpoint, weldEpsPx) ? line.b : line.a;
    const candidateDir = lineDirectionMeters(endpoint, otherPoint);
    const dot = Math.abs(gateDir.x * candidateDir.x + gateDir.y * candidateDir.y);
    if (!bestMatch || dot > bestMatch.dot) {
      bestMatch = { point: otherPoint, dot };
    }
  });

  if (!bestMatch || bestMatch.dot < 0.5) {
    return endpoint;
  }

  return bestMatch.point;
};

export function pointOnSegmentInterior(p: Point, a: Point, b: Point, tolPx: number) {
  const ab = vectorMeters(a, b);
  const ap = vectorMeters(a, p);
  const ab2 = ab.x * ab.x + ab.y * ab.y;
  if (ab2 === 0) return { ok: false, t: 0, closest: a, dist2: Infinity };

  let t = (ap.x * ab.x + ap.y * ab.y) / ab2;
  t = Math.max(0, Math.min(1, t));
  const closest = interpolateLngLat(a, b, t);
  const dist = distanceMetersProjected(p, closest);
  const dist2 = dist * dist;

  const interior = t > 0.02 && t < 0.98;
  const ok = interior && dist2 <= tolPx * tolPx;
  return { ok, t, closest, dist2 };
}

const angleBetweenLinesAbs = (l1: FenceLine, l2: FenceLine) => {
  const d1 = normalise(vectorMeters(l1.a, l1.b));
  const d2 = normalise(vectorMeters(l2.a, l2.b));
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
    const dist = distanceMetersProjected(pair.p1, pair.p2);
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
  const direction = normalise(vectorMeters(l1.a, l1.b));
  if (direction.x === 0 && direction.y === 0) return false;

  const project = (p: Point) => {
    const meters = lngLatToMercatorMeters(p);
    return meters.x * direction.x + meters.y * direction.y;
  };
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
  const quantizedA = quantizePoint(baseOther, mmPerPixel);
  const quantizedB = quantizePoint(otherOther, mmPerPixel);
  const mergedVector = vectorMeters(quantizedA, quantizedB);
  const mergedOrthogonal = Math.abs(mergedVector.x) < 0.01 || Math.abs(mergedVector.y) < 0.01;

  return {
    ...baseLine,
    a: quantizedA,
    b: quantizedB,
    length_mm: lineLengthMm(quantizedA, quantizedB),
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
  const quantizedPoint = quantizePoint(point, mmPerPixel);
  const newA = end === "a" ? quantizedPoint : otherPoint;
  const newB = end === "b" ? quantizedPoint : otherPoint;

  return {
    ...line,
    a: newA,
    b: newB,
    length_mm: lineLengthMm(newA, newB),
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

const endpointConnectionCount = (lines: FenceLine[], point: Point, epsPx: number): number => {
  return lines.reduce((count, line) => {
    const atA = pointsMatch(line.a, point, epsPx);
    const atB = pointsMatch(line.b, point, epsPx);
    return count + (atA || atB ? 1 : 0);
  }, 0);
};

const splitLineAtPointImmutable = (
  lines: FenceLine[],
  targetId: string,
  p: Point,
  mmPerPixel: number
): { lines: FenceLine[]; junction: Point | null } => {
  const idx = lines.findIndex((l) => l.id === targetId);
  if (idx < 0) return { lines, junction: null };

  const line = lines[idx];
  if (lineHasGateOrOpening(line)) return { lines, junction: null };

  const interiorTolPx = segmentInteriorToleranceMeters();
  const hit = pointOnSegmentInterior(p, line.a, line.b, interiorTolPx);
  if (!hit.ok) return { lines, junction: null };

  const junction = quantizePoint(hit.closest, mmPerPixel);

  const lineA: FenceLine = {
    ...line,
    id: line.id,
    a: line.a,
    b: junction,
    length_mm: lineLengthMm(line.a, junction),
  };
  const lineB: FenceLine = {
    ...line,
    id: generateId("line"),
    a: junction,
    b: line.b,
    length_mm: lineLengthMm(junction, line.b),
  };

  const next = [...lines];
  next.splice(idx, 1, lineA, lineB);

  return { lines: next, junction };
};

const mergeCollinearLines = (
  lines: FenceLine[],
  primaryId: string,
  mmPerPixel: number
): { lines: FenceLine[]; merged: boolean; primaryId: string } => {
  const weldEpsPx = weldToleranceMeters();
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

      const sharedEndpoint = linesShareEndpoint(primary, candidate, weldEpsPx);
      if (!sharedEndpoint.shared) {
        continue;
      }

      const angle = angleBetweenLinesAbs(primary, candidate);
      if (angle > degToRad(MERGE_ANGLE_TOL_DEG)) {
        continue;
      }

      const sharedPoint = sharedEndpoint.sharedPoint;
      const junctionDegree = endpointConnectionCount(updatedLines, sharedPoint, weldEpsPx);
      const junctionHasBlockingLine = updatedLines.some(
        (line) =>
          (pointsMatch(line.a, sharedPoint, weldEpsPx) || pointsMatch(line.b, sharedPoint, weldEpsPx)) &&
          lineHasGateOrOpening(line)
      );
      if (junctionDegree !== 2 || junctionHasBlockingLine) {
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
  const weldEpsPx = weldToleranceMeters();
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
        const sharedEndpoint = linesShareEndpoint(baseLine, otherLine, weldEpsPx);
        if (!sharedEndpoint.shared) continue;

        if (angleBetweenLinesAbs(baseLine, otherLine) > degToRad(MERGE_ANGLE_TOL_DEG)) continue;
        if (!segmentsOverlapOnLine(baseLine, otherLine, weldEpsPx)) continue;
        const sharedPoint = sharedEndpoint.sharedPoint;
        const junctionDegree = endpointConnectionCount(updatedLines, sharedPoint, weldEpsPx);
        const junctionHasBlockingLine = updatedLines.some(
          (line) =>
            (pointsMatch(line.a, sharedPoint, weldEpsPx) || pointsMatch(line.b, sharedPoint, weldEpsPx)) &&
            lineHasGateOrOpening(line)
        );
        if (junctionDegree !== 2 || junctionHasBlockingLine) continue;

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
  const weldEpsPx = weldToleranceMeters();
  const lineLookup = new Map(lines.map((line) => [line.id, line]));
  const canonicalPoints: Array<{ point: Point; lineIds: Set<string> }> = [];
  const quantize = (point: Point) => quantizePoint(point, mmPerPixel);

  const canShareWith = (lineIds: Set<string>, line: FenceLine) => {
    let allowed = true;
    lineIds.forEach((otherId) => {
      if (!allowed) return;
      const otherLine = lineLookup.get(otherId);
      if (otherLine && isMergeBlocked(line, otherLine)) {
        allowed = false;
      }
    });
    return allowed;
  };

  const findOrCreateCanonical = (point: Point, line: FenceLine): Point => {
    const quantizedPoint = quantize(point);
    for (const canonical of canonicalPoints) {
      if (!canShareWith(canonical.lineIds, line)) continue;

      const dist = distanceMetersProjected(canonical.point, quantizedPoint);
      if (dist <= weldEpsPx) {
        canonical.lineIds.add(line.id);
        return canonical.point;
      }
    }

    const newCanonical = { point: quantizedPoint, lineIds: new Set<string>([line.id]) };
    canonicalPoints.push(newCanonical);
    return quantizedPoint;
  };

  const snappedLines = lines.map((line) => {
    const canonicalA = findOrCreateCanonical(line.a, line);
    const canonicalB = findOrCreateCanonical(line.b, line);
    const endpointsChanged = canonicalA !== line.a || canonicalB !== line.b;

    if (!endpointsChanged) return line;

    return {
      ...line,
      a: canonicalA,
      b: canonicalB,
      length_mm: lineLengthMm(canonicalA, canonicalB),
    };
  });

  return snappedLines;
};

interface AppState {
  productKind: ProductKind;
  fenceStyleId: FenceStyleId;
  fenceHeightM: FenceHeightM;
  fenceColorId: FenceColorId;
  fenceCategoryId: FenceCategoryId;
  lines: FenceLine[];
  posts: Post[];
  gates: Gate[];
  panels: PanelSegment[];
  leftovers: Leftover[];
  warnings: WarningMsg[];
  selectedGateType: GateType | null;
  selectedGateId: string | null;
  drawingMode: boolean;
  previewLine: { start: Point; end: Point } | null;
  panelPositionsMap: Map<string, number[]>;
  mmPerPixel: number;
  selectedLineId: string | null;

  history: {
    lines: FenceLine[];
    gates: Gate[];
  }[];
  historyIndex: number;
  
  setProductKind: (kind: ProductKind) => void;
  setFenceCategory: (categoryId: FenceCategoryId) => void;
  setFenceStyle: (styleId: FenceStyleId) => void;
  setFenceHeightM: (height: FenceHeightM) => void;
  setFenceColorId: (colorId: FenceColorId) => void;
  setSelectedGateType: (type: GateType | null) => void;
  setSelectedGateId: (id: string | null) => void;
  setSelectedLineId: (id: string | null) => void;
  setDrawingMode: (mode: boolean) => void;
  setPreviewLine: (line: { start: Point; end: Point } | null) => void;
  setMmPerPixel: (mmPerPixel: number) => void;

  splitLineAtPoint: (lineId: string, splitPoint: Point) => Point | null;
  addLine: (a: Point, b: Point) => void;
  updateLine: (
    id: string,
    length_mm: number,
    fromEnd?: "a" | "b",
    options?: { allowMerge?: boolean }
  ) => void;
  toggleEvenSpacing: (id: string) => void;
  deleteLine: (id: string) => void;
  
  addGate: (runId: string, clickPoint?: Point) => void;
  updateGateReturnDirection: (gateId: string, direction: "left" | "right") => void;
  updateGateReturnSide: (gateId: string, side: "a" | "b") => void;
  updateGateWidth: (
    gateId: string,
    widthMm: number,
    options?: { widthRange?: string | null }
  ) => { ok: boolean; widthMm: number; error?: string };
  
  recalculate: () => void;
  clear: () => void;
  resetPlannerState: () => void;
  hydrateFromSnapshot: (snapshot: ProjectSnapshotV1) => void;
  undo: () => void;
  redo: () => void;
  
  saveToHistory: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      productKind: "Residential fencing",
      fenceStyleId: getDefaultFenceStyleId("residential"),
      fenceHeightM: DEFAULT_FENCE_HEIGHT_M,
      fenceColorId: DEFAULT_FENCE_COLOR,
      fenceCategoryId: "residential",
      lines: [],
      posts: [],
      gates: [],
      panels: [],
      leftovers: [],
      warnings: [],
      selectedGateType: null,
      selectedGateId: null,
      drawingMode: false,
      previewLine: null,
      panelPositionsMap: new Map(),
      mmPerPixel: 10,
      selectedLineId: null,
      
      history: [],
      historyIndex: -1,
      
      setProductKind: (kind) => set({ productKind: kind }),

      setFenceCategory: (categoryId) => {
        const { fenceCategoryId, fenceStyleId, fenceColorId } = get();
        if (fenceCategoryId === categoryId) return;

        const stylesForCategory = getFenceStylesByCategory(categoryId);
        const hasStyleInCategory = stylesForCategory.some(
          (style) => style.id === fenceStyleId
        );
        const nextStyleId = hasStyleInCategory
          ? fenceStyleId
          : getDefaultFenceStyleId(categoryId);
        const nextColorId = DEFAULT_FENCE_COLOR;
        const nextColourMode = getFenceColourMode(nextColorId);
        const pricingIndex = usePricingStore.getState().pricingIndex;
        const supportedHeights = getSupportedPanelHeights(
          nextStyleId,
          nextColourMode,
          categoryId,
          pricingIndex
        );
        const nextHeight = supportedHeights[0] ?? DEFAULT_FENCE_HEIGHT_M;

        set({
          fenceCategoryId: categoryId,
          fenceStyleId: nextStyleId,
          fenceColorId: nextColorId,
          fenceHeightM: nextHeight,
          selectedGateType: null,
        });

        if (nextStyleId !== fenceStyleId || nextColorId !== fenceColorId) {
          get().recalculate();
        }
      },
      
      setFenceStyle: (styleId) => {
        const { fenceStyleId, fenceColorId, fenceHeightM } = get();
        if (fenceStyleId === styleId) return;

        const fenceColourMode = getFenceColourMode(fenceColorId);
        const pricingIndex = usePricingStore.getState().pricingIndex;
        const supportedHeights = getSupportedPanelHeights(
          styleId,
          fenceColourMode,
          getFenceStyleCategory(styleId),
          pricingIndex
        );
        const hasSupportedHeight = supportedHeights.some((height) =>
          heightEquals(height, fenceHeightM)
        );
        const nextHeight = hasSupportedHeight
          ? fenceHeightM
          : supportedHeights[0] ?? DEFAULT_FENCE_HEIGHT_M;

        set({
          fenceStyleId: styleId,
          fenceCategoryId: getFenceStyleCategory(styleId),
          fenceHeightM: nextHeight,
        });
        get().recalculate();
      },

      setFenceHeightM: (height) => {
        set((state) =>
          state.fenceHeightM !== undefined && heightEquals(state.fenceHeightM, height)
            ? state
            : { fenceHeightM: height }
        );
      },

      setFenceColorId: (colorId) => {
        set((state) => (state.fenceColorId === colorId ? state : { fenceColorId: colorId }));
      },
      
      setSelectedGateType: (type) =>
        set((state) => {
          // Keep the current gate selection when the same gate button is clicked again
          if (state.selectedGateType === type) return state;

          return { selectedGateType: type };
        }),

      setSelectedGateId: (id) => set({ selectedGateId: id, selectedLineId: null }),

      setSelectedLineId: (id) => set({ selectedLineId: id, selectedGateId: null }),
      
      setDrawingMode: (mode) => set({ drawingMode: mode }),

      setPreviewLine: (line) => set({ previewLine: line }),

      setMmPerPixel: (mmPerPixel) => {
        const previousMmPerPixel = get().mmPerPixel;
        if (Math.abs(previousMmPerPixel - mmPerPixel) < 0.0001) return;

        set((state) => ({
          mmPerPixel,
          lines: state.lines.map((line) => {
            return {
              ...line,
              length_mm: lineLengthMm(line.a, line.b),
            };
          }),
        }));

        get().recalculate();
      },

      splitLineAtPoint: (lineId, splitPoint) => {
        const { lines, mmPerPixel } = get();
        const targetIndex = lines.findIndex((line) => line.id === lineId);
        if (targetIndex === -1) return null;

        const target = lines[targetIndex];
        const quantizedSplit = quantizePoint(splitPoint, mmPerPixel);
        const weldEpsPx = weldToleranceMeters();

        const distToA = distanceMetersProjected(quantizedSplit, target.a);
        if (distToA <= weldEpsPx) {
          return target.a;
        }

        const distToB = distanceMetersProjected(quantizedSplit, target.b);
        if (distToB <= weldEpsPx) {
          return target.b;
        }

        const splitResult = splitLineAtPointImmutable(lines, lineId, quantizedSplit, mmPerPixel);
        if (!splitResult.junction) return null;

        set({ lines: splitResult.lines });

        return splitResult.junction;
      },

      addLine: (a, b) => {
        const mmPerPixel = get().mmPerPixel;
        let workingLines = get().lines;
        const interiorTolPx = segmentInteriorToleranceMeters();

        const applySplit = (point: Point): Point => {
          for (const candidate of workingLines) {
            const hit = pointOnSegmentInterior(point, candidate.a, candidate.b, interiorTolPx);
            if (!hit.ok) continue;

            const splitResult = splitLineAtPointImmutable(
              workingLines,
              candidate.id,
              hit.closest,
              mmPerPixel
            );
            if (splitResult.junction) {
              workingLines = splitResult.lines;
              return splitResult.junction;
            }
          }
          return point;
        };

        const snappedA = applySplit(a);
        const snappedB = applySplit(b);

        const quantizedA = quantizePoint(snappedA, mmPerPixel);
        const quantizedB = quantizePoint(snappedB, mmPerPixel);
        const length_mm = lineLengthMm(quantizedA, quantizedB);

        if (length_mm < MIN_LINE_LENGTH_MM) {
          const warning: WarningMsg = {
            id: generateId("warn"),
            text: `Line too short (${(length_mm / 1000).toFixed(2)}m). Minimum length is 0.3m.`,
            timestamp: Date.now(),
          };
          set({ warnings: [...get().warnings, warning] });
          return;
        }

        const direction = vectorMeters(quantizedA, quantizedB);
        const isOrthogonal = Math.abs(direction.x) < 0.01 || Math.abs(direction.y) < 0.01;

        const newLine: FenceLine = {
          id: generateId("line"),
          a: quantizedA,
          b: quantizedB,
          length_mm,
          locked_90: isOrthogonal,
          even_spacing: false,
        };

        const nextLines = [...workingLines, newLine];
        const mergeResult = mergeCollinearLines(nextLines, newLine.id, mmPerPixel);
        const mergedLines = mergeResult.lines;
        const selectedLineId = mergeResult.merged ? mergeResult.primaryId : newLine.id;

        set({ lines: mergedLines, selectedLineId });
        get().saveToHistory();
        get().recalculate();
      },
      
      updateLine: (id, length_mm, fromEnd = "b", options = {}) => {
        const { allowMerge = true } = options;
        if (!Number.isFinite(length_mm)) {
          throw new Error("Length must be a finite number.");
        }

        if (length_mm < MIN_RUN_MM) {
          const warning: WarningMsg = {
            id: generateId("warn"),
            text: `Line too short (${(length_mm / 1000).toFixed(2)}m). Minimum length is ${(MIN_RUN_MM / 1000).toFixed(2)}m.`,
            timestamp: Date.now(),
          };
          set({ warnings: [...get().warnings, warning] });
          throw new Error("Value below minimum length.");
        }

        if (length_mm > MAX_RUN_MM) {
          const warning: WarningMsg = {
            id: generateId("warn"),
            text: "Value too large, check units.",
            timestamp: Date.now(),
          };
          set({ warnings: [...get().warnings, warning] });
          throw new Error("Value exceeds maximum length.");
        }
        
        const isDev = process.env.NODE_ENV === "development";
        const mmPerPixel = get().mmPerPixel;
        const weldEpsPx = weldToleranceMeters();
        const existingLines = get().lines;
        const lineOrder = new Map(existingLines.map((line, index) => [line.id, index]));

        const targetLine = existingLines.find((l) => l.id === id);
        if (!targetLine || targetLine.gateId) return;
        
        const currentLength = distanceMetersProjected(targetLine.a, targetLine.b);
        if (currentLength === 0) return;

        const desiredLengthMeters = mmToMeters(length_mm);
        const quantize = (point: Point) => quantizePoint(point, mmPerPixel);

        let oldMovedPoint = targetLine.b;
        let newMovedPoint = pointAlongLineByMeters(
          targetLine.a,
          targetLine.b,
          desiredLengthMeters,
          { clamp: false }
        );

        const stationaryPoint = targetLine.a;
        let newA = quantize(stationaryPoint);
        let newB = quantize(newMovedPoint);

        if (fromEnd === "a") {
          oldMovedPoint = targetLine.a;
          newMovedPoint = pointAlongLineByMeters(
            targetLine.b,
            targetLine.a,
            desiredLengthMeters,
            { clamp: false }
          );
          newA = quantize(newMovedPoint);
          newB = quantize(targetLine.b);
        } else {
          newB = quantize(newMovedPoint);
        }

        const quantizedMovedPoint = quantize(newMovedPoint);

        const updatedLines = existingLines.map((line) => {
          if (line.id === id) {
            return {
              ...line,
              a: newA,
              b: newB,
              length_mm,
            };
          }

          const updatedLine = { ...line };
          if (pointsMatch(line.a, oldMovedPoint, weldEpsPx)) {
            updatedLine.a = quantizedMovedPoint;
          }
          if (pointsMatch(line.b, oldMovedPoint, weldEpsPx)) {
            updatedLine.b = quantizedMovedPoint;
          }

          if (updatedLine.a !== line.a || updatedLine.b !== line.b) {
            updatedLine.a = quantize(updatedLine.a);
            updatedLine.b = quantize(updatedLine.b);
            updatedLine.length_mm = lineLengthMm(updatedLine.a, updatedLine.b);
          }

          return updatedLine;
        });

        let nextLines = updatedLines;

        if (allowMerge) {
          const welded = weldSharedEndpoints(updatedLines, id, lineOrder, mmPerPixel);
          if (isDev) console.time("mergeConnectedLines");
          const connected = mergeConnectedLines(welded, id, lineOrder, mmPerPixel);
          if (isDev) console.timeEnd("mergeConnectedLines");
          const mergeResult = mergeCollinearLines(connected, id, mmPerPixel);
          nextLines = mergeResult.lines;
        }

        set({ lines: nextLines });
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
        const nextLines = get().lines.filter((l) => l.id !== id);
        const removedGateIds = get()
          .lines.filter((line) => line.id === id && line.gateId)
          .map((line) => line.gateId as string);
        const nextGates = get()
          .gates.filter((g) => g.runId !== id && !removedGateIds.includes(g.id));
        const selectedGateId = get().selectedGateId;

        set({
          lines: nextLines,
          gates: nextGates,
          selectedGateId: selectedGateId && removedGateIds.includes(selectedGateId)
            ? null
            : selectedGateId,
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
          opening_mm = getDefaultGateWidthMm(gateType);
        }
        
        const newGate: Gate = {
          id: generateId("gate"),
          type: gateType,
          opening_mm,
          runId,
          slidingReturnDirection: "left",
          slidingReturnSide: "a",
          widthRange: null,
          leaf_count: leafCount,
          leaf_width_mm: opening_mm / leafCount,
          panel_width_mm: opening_mm,
          returnLength_mm,
        };
        
        const totalLength_mm = line.length_mm;

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
          distanceMetersProjected(p1, p2) < weldToleranceMeters();

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
          const aMeters = lngLatToMercatorMeters(line.a);
          const bMeters = lngLatToMercatorMeters(line.b);
          const clickMeters = lngLatToMercatorMeters(clickPoint);
          const ab = { x: bMeters.x - aMeters.x, y: bMeters.y - aMeters.y };
          const ap = { x: clickMeters.x - aMeters.x, y: clickMeters.y - aMeters.y };
          const abLenSq = ab.x * ab.x + ab.y * ab.y;
          if (abLenSq > 0) {
            let t = (ap.x * ab.x + ap.y * ab.y) / abLenSq;
            t = Math.max(0, Math.min(1, t));

            const clickDist_mm = Math.sqrt(abLenSq) * t * 1000;
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

        const mmPerPixel = get().mmPerPixel;
        const beforeEndPoint = quantizePoint(
          pointAlongLineByMeters(line.a, line.b, mmToMeters(beforeLength_mm)),
          mmPerPixel
        );

        const gateEndPoint = quantizePoint(
          pointAlongLineByMeters(line.a, line.b, mmToMeters(beforeLength_mm + opening_mm)),
          mmPerPixel
        );
        
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
            a: quantizePoint(line.a, mmPerPixel),
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
            b: quantizePoint(line.b, mmPerPixel),
            length_mm: afterLength_mm,
            locked_90: line.locked_90,
            even_spacing: line.even_spacing,
          };
          newLines.push(afterLine);
        }
        
        set({
          gates: [...get().gates, newGate],
          lines: [...otherLines, ...newLines],
          selectedGateId: null,
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

      updateGateReturnSide: (gateId, side) => {
        set({
          gates: get().gates.map((g) =>
            g.id === gateId ? { ...g, slidingReturnSide: side } : g
          ),
        });
        get().recalculate();
      },

      updateGateWidth: (gateId, widthMm, options) => {
        const { gates, lines, mmPerPixel } = get();
        const gate = gates.find((g) => g.id === gateId);
        if (!gate) {
          return { ok: false, widthMm, error: "Gate not found." };
        }

        const gateLine = lines.find((line) => line.gateId === gateId);
        if (!gateLine) {
          return { ok: false, widthMm, error: "Gate line not found." };
        }

        const gateRules = getGateWidthRules(gate.type);
        const proposedWidthM = widthMm / 1000;
        const clampedWidthM = clampGateWidthM(proposedWidthM, gate.type);

        const boundaryA = findAlignedBoundaryPoint(lines, gateLine, gateLine.a);
        const boundaryB = findAlignedBoundaryPoint(lines, gateLine, gateLine.b);

        const aMeters = lngLatToMercatorMeters(gateLine.a);
        const bMeters = lngLatToMercatorMeters(gateLine.b);
        const centerMeters = {
          x: (aMeters.x + bMeters.x) / 2,
          y: (aMeters.y + bMeters.y) / 2,
        };

        const direction = lineDirectionMeters(gateLine.a, gateLine.b);
        const boundaryAMeters = lngLatToMercatorMeters(boundaryA);
        const boundaryBMeters = lngLatToMercatorMeters(boundaryB);
        const distToA = Math.abs(
          (boundaryAMeters.x - centerMeters.x) * direction.x +
            (boundaryAMeters.y - centerMeters.y) * direction.y
        );
        const distToB = Math.abs(
          (boundaryBMeters.x - centerMeters.x) * direction.x +
            (boundaryBMeters.y - centerMeters.y) * direction.y
        );
        const maxWidthM = Math.min(distToA, distToB) * 2;

        if (maxWidthM > 0 && maxWidthM < gateRules.minM - 0.0001) {
          return {
            ok: false,
            widthMm: gate.opening_mm,
            error: `Insufficient space for minimum width of ${gateRules.minM.toFixed(2)} m.`,
          };
        }

        const finalWidthM =
          maxWidthM > 0 ? Math.min(clampedWidthM, maxWidthM) : clampedWidthM;
        const finalWidthMm = Math.round(finalWidthM * 1000);

        const half = finalWidthM / 2;
        const newAMeters = {
          x: centerMeters.x - direction.x * half,
          y: centerMeters.y - direction.y * half,
        };
        const newBMeters = {
          x: centerMeters.x + direction.x * half,
          y: centerMeters.y + direction.y * half,
        };
        const newA = quantizePoint(
          mercatorMetersToLngLat(newAMeters),
          mmPerPixel
        );
        const newB = quantizePoint(
          mercatorMetersToLngLat(newBMeters),
          mmPerPixel
        );

        const weldEpsPx = weldToleranceMeters();
        const updatedLines = lines.map((line) => {
          if (line.id === gateLine.id) {
            return { ...line, a: newA, b: newB, length_mm: finalWidthMm };
          }

          let updatedLine = { ...line };
          let changed = false;
          if (pointsMatch(line.a, gateLine.a, weldEpsPx)) {
            updatedLine.a = newA;
            changed = true;
          }
          if (pointsMatch(line.b, gateLine.a, weldEpsPx)) {
            updatedLine.b = newA;
            changed = true;
          }
          if (pointsMatch(line.a, gateLine.b, weldEpsPx)) {
            updatedLine.a = newB;
            changed = true;
          }
          if (pointsMatch(line.b, gateLine.b, weldEpsPx)) {
            updatedLine.b = newB;
            changed = true;
          }

          if (changed) {
            updatedLine = {
              ...updatedLine,
              length_mm: lineLengthMm(updatedLine.a, updatedLine.b),
            };
          }

          return updatedLine;
        });

        const leafCount = gate.type.startsWith("double") ? 2 : 1;
        const updatedGates = gates.map((g) => {
          if (g.id !== gateId) return g;
          const nextWidthRange =
            g.type.startsWith("sliding") && options?.widthRange !== undefined
              ? options.widthRange
              : g.widthRange ?? null;
          return {
            ...g,
            opening_mm: finalWidthMm,
            widthRange: nextWidthRange,
            leaf_count: leafCount,
            leaf_width_mm: finalWidthMm / leafCount,
            panel_width_mm: finalWidthMm,
          };
        });

        set({
          lines: updatedLines,
          gates: updatedGates,
        });
        get().saveToHistory();
        get().recalculate();

        return { ok: true, widthMm: finalWidthMm };
      },
      
      recalculate: () => {
        const isDev = process.env.NODE_ENV === "development";
        if (isDev) {
          console.time("recalculate");
        }

        const { lines, gates, mmPerPixel } = get();

        let effectiveMmPerPixel = mmPerPixel;
        if (!Number.isFinite(effectiveMmPerPixel) || effectiveMmPerPixel <= 0) {
          console.warn("Invalid mmPerPixel detected, resetting to 1");
          effectiveMmPerPixel = 1;
          set({ mmPerPixel: effectiveMmPerPixel });
        }
        
        const allPanels: PanelSegment[] = [];
        const allNewLeftovers: Leftover[] = [];
        const allWarnings: WarningMsg[] = [];
        const panelPositionsMap = new Map<string, number[]>();
        
        if (isDev) {
          console.time("fitPanels");
        }

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

          if (isDev && line.length_mm > PANEL_LENGTH_MM * 1.5 && result.panelPositions.length === 0) {
            console.warn("No panel positions generated for long run", {
              runId: line.id,
              length_mm: line.length_mm,
              mmPerPixel: effectiveMmPerPixel,
            });
          }

          result.warnings.forEach((text) => {
            allWarnings.push({
              id: generateId("warn"),
              text,
              runId: line.id,
              timestamp: Date.now(),
            });
          });
        });
        
        if (isDev) {
          console.timeEnd("fitPanels");
        }
        
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
        
        if (isDev) {
          console.time("generatePosts");
        }
        const posts = generatePosts(lines, gates, panelPositionsMap, effectiveMmPerPixel);
        if (isDev) {
          console.timeEnd("generatePosts");
        }
        
        const tJunctions = posts.filter((post) => post.category === "t");
        
        tJunctions.forEach((post) => {
          allWarnings.push({
            id: generateId("warn"),
            text: "T-junction with more than 2 runs detected. This may require custom post configuration.",
            timestamp: Date.now(),
          });
        });
        
        if (isDev) {
          console.timeEnd("recalculate");
          console.debug("recalculate stats", {
            lines: lines.length,
            gates: gates.length,
            panels: allPanels.length,
            leftovers: allNewLeftovers.length,
          });
          if (allNewLeftovers.length > LEFTOVER_WARN_THRESHOLD) {
            console.warn(`Leftovers exceeded threshold: ${allNewLeftovers.length}`);
          }
        }

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
          selectedGateId: null,
          drawingMode: false,
          previewLine: null,
          panelPositionsMap: new Map(),
          history: [],
          historyIndex: -1,
        });
      },

      resetPlannerState: () => {
        set({
          productKind: "Residential fencing",
          fenceStyleId: getDefaultFenceStyleId("residential"),
          fenceHeightM: DEFAULT_FENCE_HEIGHT_M,
          fenceColorId: DEFAULT_FENCE_COLOR,
          fenceCategoryId: "residential",
          lines: [],
          posts: [],
          gates: [],
          panels: [],
          leftovers: [],
          warnings: [],
          selectedGateType: null,
          selectedGateId: null,
          drawingMode: false,
          previewLine: null,
          panelPositionsMap: new Map(),
          mmPerPixel: 10,
          selectedLineId: null,
          history: [],
          historyIndex: -1,
        });
      },

      hydrateFromSnapshot: (snapshot) => {
        if (snapshot.projectType === "decking") return;
        const state = snapshot.plannerState as FencingPlannerSnapshotState;
        const resolvedCategory =
          state.fenceCategoryId ?? (state.productKind === "Rural fencing" ? "rural" : "residential");
        const resolvedStyle = state.fenceStyleId ?? getDefaultFenceStyleId(resolvedCategory);
        const resolvedHeight = state.fenceHeightM ?? DEFAULT_FENCE_HEIGHT_M;
        const resolvedColor = state.fenceColorId ?? DEFAULT_FENCE_COLOR;
        const map = new Map<string, number[]>(Object.entries(state.panelPositionsMap ?? {}));
        const gates = (state.gates ?? []).map((gate) => {
          if (!gate.type.startsWith("sliding")) return gate;
          if (gate.slidingReturnSide) return gate;
          return {
            ...gate,
            slidingReturnSide: gate.slidingReturnDirection === "left" ? "a" : "b",
          };
        });
        const normalizedGates = gates.map((gate) => normalizeGateWidthMm(gate));

        set({
          productKind: state.productKind ?? "Residential fencing",
          fenceStyleId: resolvedStyle,
          fenceCategoryId: resolvedCategory,
          fenceHeightM: resolvedHeight,
          fenceColorId: resolvedColor,
          selectedGateType: state.selectedGateType ?? null,
          selectedGateId: state.selectedGateId ?? null,
          drawingMode: state.drawingMode ?? false,
          mmPerPixel: state.mmPerPixel ?? 10,
          selectedLineId: state.selectedLineId ?? null,
          lines: state.lines ?? [],
          gates: normalizedGates,
          panels: state.panels ?? [],
          posts: state.posts ?? [],
          leftovers: state.leftovers ?? [],
          warnings: state.warnings ?? [],
          panelPositionsMap: map,
          previewLine: null,
          history: [],
          historyIndex: -1,
        });
        get().recalculate();
      },
      
      undo: () => {
        const { history, historyIndex } = get();
        if (historyIndex > 0) {
          const prevState = history[historyIndex - 1];
          set({
            lines: structuredClone(prevState.lines),
            gates: structuredClone(prevState.gates),
            historyIndex: historyIndex - 1,
            selectedGateId: null,
          });
          get().recalculate();
        }
      },
      
      redo: () => {
        const { history, historyIndex } = get();
        if (historyIndex < history.length - 1) {
          const nextState = history[historyIndex + 1];
          set({
            lines: structuredClone(nextState.lines),
            gates: structuredClone(nextState.gates),
            historyIndex: historyIndex + 1,
            selectedGateId: null,
          });
          get().recalculate();
        }
      },
      
      saveToHistory: () => {
        const { lines, gates, history, historyIndex } = get();
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push({
          lines: structuredClone(lines),
          gates: structuredClone(gates),
        });

        if (newHistory.length > HISTORY_LIMIT) {
          newHistory.shift();
        }

        set({
          history: newHistory,
          historyIndex: newHistory.length - 1,
        });
      },
    }),
    {
      name: "fence-planner-storage",
      version: 6,
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          const parsed = JSON.parse(str) as any;
          if (parsed.state?.panelPositionsMap) {
            parsed.state.panelPositionsMap = new Map(Object.entries(parsed.state.panelPositionsMap));
          }
          return parsed;
        },
        setItem: (name, value: any) => {
          const serialized = {
            ...(value ?? {}),
            state: {
              ...(value?.state ?? {}),
              panelPositionsMap: value?.state?.panelPositionsMap instanceof Map
                ? Object.fromEntries(value.state.panelPositionsMap)
                : value?.state?.panelPositionsMap,
            },
          } as any;
          localStorage.setItem(name, JSON.stringify(serialized));
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
      migrate: (persistedState: any, version) => {
        if (version < 1) {
          return {
            ...persistedState,
            state: {
              ...persistedState.state,
              posts: [],
              panels: [],
              leftovers: [],
              warnings: [],
              panelPositionsMap: new Map<string, number[]>(),
              history: [],
              historyIndex: -1,
            },
          };
        }

        if (version < 2) {
          const fenceStyleId =
            persistedState?.state?.fenceStyleId ?? getDefaultFenceStyleId("residential");

          return {
            ...persistedState,
            state: {
              ...persistedState.state,
              fenceCategoryId: getFenceStyleCategory(fenceStyleId),
            },
          };
        }

        if (version < 3) {
          return {
            ...persistedState,
            state: {
              ...persistedState.state,
              fenceHeightM: DEFAULT_FENCE_HEIGHT_M,
            },
          };
        }

        if (version < 4) {
          return {
            ...persistedState,
            state: {
              ...persistedState.state,
              fenceColorId: DEFAULT_FENCE_COLOR,
            },
          };
        }

        if (version < 5) {
          const gates = (persistedState?.state?.gates ?? []).map((gate: Gate) => {
            if (!gate.type?.startsWith("sliding")) return gate;
            if (gate.slidingReturnSide) return gate;
            const inferredSide = gate.slidingReturnDirection === "left" ? "a" : "b";
            return { ...gate, slidingReturnSide: inferredSide };
          });

          return {
            ...persistedState,
            state: {
              ...persistedState.state,
              gates,
            },
          };
        }

        if (version < 6) {
          const gates = (persistedState?.state?.gates ?? []).map((gate: Gate) =>
            normalizeGateWidthMm(gate)
          );

          return {
            ...persistedState,
            state: {
              ...persistedState.state,
              gates,
              selectedGateId: null,
            },
          };
        }

        return persistedState;
      },
      partialize: (state) => ({
        productKind: state.productKind,
        fenceStyleId: state.fenceStyleId,
        fenceHeightM: state.fenceHeightM,
        fenceColorId: state.fenceColorId,
        fenceCategoryId: state.fenceCategoryId,
        lines: state.lines,
        gates: state.gates,
        selectedGateType: state.selectedGateType,
        selectedGateId: state.selectedGateId,
        drawingMode: state.drawingMode,
        mmPerPixel: state.mmPerPixel,
        selectedLineId: state.selectedLineId,
      }),
      onRehydrateStorage: () => (state: AppState | undefined, error?: unknown) => {
        if (error) return;
        state?.recalculate();
      },
    }
  )
);
