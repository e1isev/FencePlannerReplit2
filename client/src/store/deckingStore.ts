import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  BOARD_GAP_MM,
  BREAKER_HALF_MM,
  BOARD_WIDTH_MM,
  JOIST_SPACING_MM,
  MAX_BOARD_LENGTH_MM,
  getHorizontalSpansMm,
  getVerticalSpansMm,
  Interval,
  planBoardsForRun,
} from "@/lib/deckingGeometry";
import type {
  Board,
  BoardDirection,
  Clip,
  DeckColor,
  DeckRenderModel,
  DeckEntity,
  DeckingBoardPlan,
  DeckingCuttingList,
  DeckReport,
  DeckReportTotals,
  DeckCutListItem,
  EdgeConstraint,
  CornerConstraint,
  Point,
  DeckingSelectionState,
  JoistSpacingMode,
  ClipSummary,
  BreakerLine,
  BreakerAxis,
} from "@/types/decking";
import {
  findBottomEdgeIndex,
  rotatePolygonToHorizontalBaseline,
} from "@/geometry/deckingBaseline";
import {
  edgeLengthMm,
  isEdgeLocked,
  lockEdge,
  unlockEdge,
} from "@/geometry/deckingEdges";
import { offsetPolygonMiter } from "@/geometry/pictureFrame";
import { buildFasciaPieces } from "@/geometry/fascia";
import { getClipsPerJoist, getFasciaClipCount, getJoistCount } from "@/geometry/clipCalc";
import { breakerAxisForDirection, generateDefaultBreakerLines } from "@/lib/deckingBreaker";

const DEFAULT_COLOR: DeckColor = "mallee-bark";
const DEFAULT_FASCIA_THICKNESS = 20;
const JOIST_SPACING: Record<JoistSpacingMode, number> = {
  commercial: 350,
  residential: 450,
};
const CLIP_SPACING_MM = 450;
const FASCIA_CLIP_SPACING_MM = 450;
const MAX_HISTORY_ENTRIES = 50;

function getJoistSpacingMm(mode: JoistSpacingMode): number {
  return JOIST_SPACING[mode];
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function polygonArea(points: Point[]): number {
  if (points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y - points[j].x * points[i].y;
  }
  return Math.abs(area) / 2;
}

function hasInvalidNumbers(points: Point[]): boolean {
  return points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y));
}

function hasDegenerateEdges(polygon: Point[]): boolean {
  if (polygon.length < 2) return false;

  return polygon.some((point, idx) => {
    const next = polygon[(idx + 1) % polygon.length];
    return point.x === next.x && point.y === next.y;
  });
}

function isPolygonValid(polygon: Point[]): boolean {
  if (polygon.length < 3) return false;
  if (hasInvalidNumbers(polygon) || hasDegenerateEdges(polygon)) return false;

  const area = polygonArea(polygon);
  return Number.isFinite(area) && area > 0;
}

function getBounds(points: Point[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  points.forEach((p) => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  });

  return { minX, minY, maxX, maxY };
}

function polygonPerimeter(points: Point[]): number {
  if (points.length < 2) return 0;
  let length = 0;
  for (let i = 0; i < points.length; i++) {
    const next = (i + 1) % points.length;
    const dx = points[next].x - points[i].x;
    const dy = points[next].y - points[i].y;
    length += Math.hypot(dx, dy);
  }
  return length;
}

function calculatePerimeterMm(polygon: Point[]): number {
  if (polygon.length < 2) return 0;
  let perimeter = 0;
  for (let i = 0; i < polygon.length; i++) {
    const next = (i + 1) % polygon.length;
    perimeter += Math.hypot(polygon[next].x - polygon[i].x, polygon[next].y - polygon[i].y);
  }
  return perimeter;
}

const MIN_SEGMENT_LENGTH_MM = 1;

function splitRunAroundBreakers(runStart: number, runEnd: number, breakerCenters: number[]): Interval[] {
  if (runEnd - runStart <= MIN_SEGMENT_LENGTH_MM) return [];

  const blockedBands = breakerCenters
    .map((center) => ({
      start: Math.max(runStart, center - BREAKER_HALF_MM),
      end: Math.min(runEnd, center + BREAKER_HALF_MM),
    }))
    .filter((band) => band.end > band.start)
    .sort((a, b) => a.start - b.start);

  const segments: Interval[] = [];
  let cursor = runStart;

  blockedBands.forEach((band) => {
    if (band.start - cursor > MIN_SEGMENT_LENGTH_MM) {
      segments.push({ start: cursor, end: band.start });
    }
    cursor = Math.max(cursor, band.end);
  });

  if (runEnd - cursor > MIN_SEGMENT_LENGTH_MM) {
    segments.push({ start: cursor, end: runEnd });
  }

  return segments;
}

function buildBoardsForSpan(params: {
  start: number;
  end: number;
  fixedAxis: number;
  direction: BoardDirection;
  rowIndex: number;
  breakerPositions: number[];
  breakersEnabled: boolean;
}) {
  const { start, end, fixedAxis, direction, rowIndex, breakerPositions, breakersEnabled } = params;
  const runLength = end - start;
  if (runLength <= MIN_SEGMENT_LENGTH_MM) {
    return { boards: [] as Board[], wasteMm: 0, overflowMm: 0 };
  }

  const runId = generateId("run");
  const segments = breakersEnabled
    ? splitRunAroundBreakers(
        start,
        end,
        breakerPositions.filter(
          (pos) => pos + BREAKER_HALF_MM > start && pos - BREAKER_HALF_MM < end
        )
      )
    : [{ start, end }];

  const boards: Board[] = [];
  let totalWasteMm = 0;
  let totalOverflowMm = 0;

  segments.forEach((segment) => {
    const plan = planBoardsForRun(segment.end - segment.start);
    let cursor = segment.start;
    plan.boardLengths.forEach((length) => {
      const startPoint = direction === "horizontal" ? { x: cursor, y: fixedAxis } : { x: fixedAxis, y: cursor };
      const endPoint =
        direction === "horizontal"
          ? { x: cursor + length, y: fixedAxis }
          : { x: fixedAxis, y: cursor + length };
      boards.push({
        id: generateId("board"),
        start: startPoint,
        end: endPoint,
        length,
        runId,
        segmentIndex: boards.length,
        segmentCount: 0,
        isRunStart: false,
        isRunEnd: false,
        kind: "field",
        rowIndex,
      });
      cursor += length;
    });
    totalWasteMm += plan.wasteMm;
    totalOverflowMm += plan.overflowMm;
  });

  const segmentCount = boards.length;
  boards.forEach((board, index) => {
    board.segmentIndex = index;
    board.segmentCount = segmentCount;
    board.isRunStart = index === 0;
    board.isRunEnd = index === segmentCount - 1;
  });

  return { boards, wasteMm: totalWasteMm, overflowMm: totalOverflowMm };
}

function aggregateBoardsByLength(
  boards: Board[],
  kind: DeckCutListItem["kind"]
): { items: DeckCutListItem[]; totalLength: number; totalPieces: number } {
  const counts = new Map<number, number>();
  boards.forEach((board) => {
    const length = Math.round(board.length);
    counts.set(length, (counts.get(length) || 0) + 1);
  });

  const items = Array.from(counts.entries())
    .map(([length, count]) => ({
      label: kind === "breaker" ? "Breaker board" : "Board",
      lengthMm: length,
      count,
      kind,
    }))
    .sort((a, b) => b.lengthMm - a.lengthMm);

  const totalLength = Array.from(counts.entries()).reduce(
    (sum, [length, count]) => sum + length * count,
    0
  );

  return { items, totalLength, totalPieces: boards.length };
}

function aggregateLinearPieces(
  pieces: Point[][],
  kind: DeckCutListItem["kind"]
): { items: DeckCutListItem[]; totalLength: number; totalPieces: number } {
  const counts = new Map<number, number>();
  pieces.forEach((piece) => {
    if (piece.length < 2) return;
    const length = Math.round(Math.hypot(piece[1].x - piece[0].x, piece[1].y - piece[0].y));
    counts.set(length, (counts.get(length) || 0) + 1);
  });

  const items = Array.from(counts.entries())
    .map(([length, count]) => ({
      label: kind === "fascia" ? "Fascia run" : "Perimeter board",
      lengthMm: length,
      count,
      kind,
    }))
    .sort((a, b) => b.lengthMm - a.lengthMm);

  const totalLength = Array.from(counts.entries()).reduce(
    (sum, [length, count]) => sum + length * count,
    0
  );

  const totalPieces = Array.from(counts.values()).reduce((sum, count) => sum + count, 0);

  return { items, totalLength, totalPieces };
}

function calculateClipCountForLength(lengthMm: number, spacingMm: number): number {
  if (lengthMm <= 0 || spacingMm <= 0) return 0;
  return Math.max(2, Math.ceil(lengthMm / spacingMm) + 1);
}

function buildClipOverlays(boards: Board[]): Clip[] {
  const clips: Clip[] = [];
  boards.forEach((board, index) => {
    const dx = board.end.x - board.start.x;
    const dy = board.end.y - board.start.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) return;
    const unit = { x: dx / length, y: dy / length };
    const spacing = CLIP_SPACING_MM;
    for (let cursor = spacing; cursor < length; cursor += spacing) {
      clips.push({
        id: `clip-${board.id}-${cursor}-${index}`,
        position: {
          x: board.start.x + unit.x * cursor,
          y: board.start.y + unit.y * cursor,
        },
        boardCount: 2,
      });
    }
  });
  return clips;
}

const LOCKED_EDGE_TOLERANCE_MM = 0.5;

function findConflictingLockedEdge(
  polygon: Point[],
  edgeConstraints: Record<number, EdgeConstraint>
): number | null {
  for (const [lockedIndexStr, constraint] of Object.entries(edgeConstraints)) {
    const lockedIndex = Number(lockedIndexStr);
    if (constraint.mode !== "locked" || constraint.lengthMm === undefined) continue;

    const actualLength = edgeLengthMm(polygon, lockedIndex);
    if (Math.abs(actualLength - constraint.lengthMm) > LOCKED_EDGE_TOLERANCE_MM) {
      return lockedIndex;
    }
  }

  return null;
}

function deepCloneDecks(decks: DeckEntity[]): DeckEntity[] {
  return JSON.parse(JSON.stringify(decks));
}

function normalisePolygon(points: Point[]) {
  const baselineEdgeIndex = points.length >= 3 ? findBottomEdgeIndex(points) : null;
  const normalizedPolygon =
    baselineEdgeIndex === null ? points : rotatePolygonToHorizontalBaseline(points, baselineEdgeIndex);
  return { baselineEdgeIndex, normalizedPolygon };
}

function createDeckEntity(points: Point[], name: string): DeckEntity {
  const { baselineEdgeIndex, normalizedPolygon } = normalisePolygon(points);

  return {
    id: generateId("deck"),
    name,
    polygon: normalizedPolygon,
    infillPolygon: normalizedPolygon,
    boards: [],
    breakerBoards: [],
    breakerLines: [],
    pictureFramePieces: [],
    fasciaPieces: [],
    selectedColor: DEFAULT_COLOR,
    boardDirection: "horizontal",
    boardPlan: null,
    rowCount: 0,
    clipSummary: null,
    joistSpacingMode: "residential",
    finishes: {
      pictureFrameEnabled: false,
      fasciaEnabled: false,
      breakerBoardsEnabled: false,
    },
    pictureFrameBoardWidthMm: BOARD_WIDTH_MM,
    pictureFrameGapMm: BOARD_GAP_MM,
    pictureFrameWarning: null,
    fasciaThicknessMm: DEFAULT_FASCIA_THICKNESS,
    edgeConstraints: {},
    baselineEdgeIndex,
  };
}

function buildBoardPlan(
  deck: DeckEntity,
  finishes: DeckEntity["finishes"],
  infillPolygon: Point[],
  totalBoards: number,
  totalWasteMm: number,
  totalOverflowMm: number,
  rowsWithBoards: number
): DeckingBoardPlan {
  const areaMm2 = polygonArea(infillPolygon);
  return {
    boardLengthMm: MAX_BOARD_LENGTH_MM,
    boardWidthMm: BOARD_WIDTH_MM,
    numberOfRows: rowsWithBoards,
    averageBoardsPerRow: rowsWithBoards === 0 ? 0 : totalBoards / rowsWithBoards,
    totalBoards,
    totalWasteMm,
    averageOverflowMm: totalBoards === 0 ? 0 : totalOverflowMm / Math.max(totalBoards, 1),
    areaMm2,
    areaM2: areaMm2 / 1_000_000,
  };
}

function buildDeckCuttingSummary(deck: DeckEntity) {
  const fieldBoards = deck.boards.filter((board) => board.kind !== "breaker");
  const breakerBoards = deck.breakerBoards;
  const fieldSummary = aggregateBoardsByLength(fieldBoards, "field");
  const breakerSummary = aggregateBoardsByLength(breakerBoards, "breaker");
  const pictureFrameSummary = aggregateLinearPieces(deck.pictureFramePieces, "pictureFrame");
  const fasciaSummary = aggregateLinearPieces(deck.fasciaPieces, "fascia");

  const cuttingList = [
    ...fieldSummary.items,
    ...breakerSummary.items,
    ...pictureFrameSummary.items,
    ...fasciaSummary.items,
  ];

  const boardLinealMm =
    fieldSummary.totalLength + breakerSummary.totalLength + pictureFrameSummary.totalLength;

  return {
    cuttingList,
    boardLinealMm,
    fasciaLinealMm: fasciaSummary.totalLength,
    boardPieces: fieldSummary.totalPieces + breakerSummary.totalPieces + pictureFrameSummary.totalPieces,
    totalPieces:
      fieldSummary.totalPieces +
      breakerSummary.totalPieces +
      pictureFrameSummary.totalPieces +
      fasciaSummary.totalPieces,
    fieldSummary,
    breakerSummary,
    pictureFrameSummary,
    fasciaSummary,
  };
}

function buildDeckReport(deck: DeckEntity): DeckReport {
  const cuttingSummary = buildDeckCuttingSummary(deck);
  const areaM2 =
    deck.boardPlan?.areaM2 ?? (deck.polygon.length >= 3 ? polygonArea(deck.polygon) / 1_000_000 : 0);
  const perimeterMm = deck.polygon.length >= 2 ? calculatePerimeterMm(deck.polygon) : 0;
  const bounds = deck.polygon.length > 0 ? getBounds(deck.polygon) : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const spanForJoists =
    deck.boardDirection === "horizontal" ? bounds.maxY - bounds.minY : bounds.maxX - bounds.minX;
  const joistCount = Math.max(1, Math.ceil(spanForJoists / JOIST_SPACING_MM) + 1);

  const clipCount = [...deck.boards, ...deck.breakerBoards].reduce(
    (sum, board) => sum + calculateClipCountForLength(board.length, CLIP_SPACING_MM),
    0
  );

  const fasciaClipCount = deck.fasciaPieces.reduce((sum, piece) => {
    if (piece.length < 2) return sum;
    const length = Math.hypot(piece[1].x - piece[0].x, piece[1].y - piece[0].y);
    return sum + calculateClipCountForLength(length, FASCIA_CLIP_SPACING_MM);
  }, 0);

  const deckClipsSnappedForFascia = fasciaClipCount;

  return {
    id: deck.id,
    name: deck.name,
    boardDirection: deck.boardDirection,
    selectedColor: deck.selectedColor,
    finishes: deck.finishes,
    boardPlan: deck.boardPlan,
    cuttingList: cuttingSummary.cuttingList,
    areaM2,
    perimeterMm,
    rowCount: deck.boardPlan?.numberOfRows ?? 0,
    joistCount,
    clipCount,
    fasciaClipCount,
    deckClipsSnappedForFascia,
    totals: {
      boardPieces: cuttingSummary.boardPieces,
      totalPieces: cuttingSummary.totalPieces,
      boardLinealMm: cuttingSummary.boardLinealMm,
      fasciaLinealMm: cuttingSummary.fasciaLinealMm,
      totalLinealMm: cuttingSummary.boardLinealMm + cuttingSummary.fasciaLinealMm,
    },
  };
}

function buildDeckRenderModel(deck: DeckEntity): DeckRenderModel {
  return {
    id: deck.id,
    name: deck.name,
    polygon: deck.polygon,
    infillPolygon: deck.infillPolygon,
    boards: deck.boards,
    breakerBoards: deck.breakerBoards,
    breakerLines: deck.breakerLines,
    pictureFramePieces: deck.pictureFramePieces,
    fasciaPieces: deck.fasciaPieces,
    clips: buildClipOverlays([...deck.boards, ...deck.breakerBoards]),
    selectedColor: deck.selectedColor,
    boardDirection: deck.boardDirection,
    finishes: deck.finishes,
  };
}

function buildTotals(reports: DeckReport[]): DeckReportTotals {
  return reports.reduce<DeckReportTotals>(
    (acc, report) => ({
      boardPieces: acc.boardPieces + report.totals.boardPieces,
      totalPieces: acc.totalPieces + report.totals.totalPieces,
      boardLinealMm: acc.boardLinealMm + report.totals.boardLinealMm,
      fasciaLinealMm: acc.fasciaLinealMm + report.totals.fasciaLinealMm,
      totalLinealMm: acc.totalLinealMm + report.totals.totalLinealMm,
      totalClips: acc.totalClips + report.clipCount,
      totalFasciaClips: acc.totalFasciaClips + report.fasciaClipCount,
      totalDeckClipsSnappedForFascia:
        acc.totalDeckClipsSnappedForFascia + report.deckClipsSnappedForFascia,
    }),
    {
      boardPieces: 0,
      totalPieces: 0,
      boardLinealMm: 0,
      fasciaLinealMm: 0,
      totalLinealMm: 0,
      totalClips: 0,
      totalFasciaClips: 0,
      totalDeckClipsSnappedForFascia: 0,
    }
  );
}

interface DeckingStoreState {
  decks: DeckEntity[];
  activeDeckId: string | null;
  selectedDeckId: string | null;
  pendingDeleteDeckId: string | null;
  hasHydrated: boolean;
  selectedBreakerId: string | null;
  editingBreakerId: string | null;
  breakerDraftPosMm: Record<string, number>;
  breakerConfirmId: string | null;
  breakerConfirmPosMm: number | null;
  joistSpacingMode: JoistSpacingMode;
  showClips: boolean;
  history: Array<{
    decks: DeckEntity[];
    activeDeckId: string | null;
    joistSpacingMode: JoistSpacingMode;
    showClips: boolean;
  }>;
  historyIndex: number;
  addDeck: (polygon: Point[]) => void;
  deleteDeck: (deckId: string) => void;
  setActiveDeck: (deckId: string) => void;
  updateActiveDeck: (patch: Partial<DeckEntity>) => void;
  calculateBoardsForDeck: (deckId: string) => void;
  calculateBoardsForAllDecks: () => void;
  clearAllDecks: () => void;
  undo: () => void;
  redo: () => void;
  saveHistory: () => void;
  getDeckRenderModel: (deckId: string) => DeckRenderModel | null;
  getReportData: () => { decks: DeckReport[]; projectTotals: DeckReportTotals };
  getCuttingListForDeck: (deckId: string | null) => DeckingCuttingList;
  getProjectCuttingTotals: () => { totalPieces: number; totalLinealMm: number; totalLinealMetres: number };
  getProjectClipTotals: () => ClipSummary;
  updateEdgeLength: (edgeIndex: number, lengthMm: number) => void;
  lockEdgeLength: (edgeIndex: number) => void;
  unlockEdgeLength: (edgeIndex: number) => void;
  setSelectedDeck: (deckId: DeckingSelectionState["selectedDeckId"]) => void;
  requestDeleteDeck: (deckId: string) => void;
  confirmDeleteDeck: () => void;
  cancelDeleteDeck: () => void;
  setJoistSpacingMode: (mode: JoistSpacingMode) => void;
  setShowClips: (show: boolean) => void;
  selectBreakerLine: (deckId: string, breakerId: string) => void;
  startEditBreakerLine: (deckId: string, breakerId: string) => void;
  setBreakerDraftPos: (deckId: string, breakerId: string, posMm: number) => void;
  requestConfirmBreaker: (deckId: string, breakerId: string, posMm: number) => void;
  confirmBreakerPlacement: (deckId: string, breakerId: string) => void;
  rejectBreakerPlacement: (deckId: string, breakerId: string) => void;
  exitEditBreakerLine: () => void;
}

export const useDeckingStore = create<DeckingStoreState>()(
  persist(
    (set, get) => ({
      decks: [],
      activeDeckId: null,
      selectedDeckId: null,
      pendingDeleteDeckId: null,
      hasHydrated: false,
      selectedBreakerId: null,
      editingBreakerId: null,
      breakerDraftPosMm: {},
      breakerConfirmId: null,
      breakerConfirmPosMm: null,
      joistSpacingMode: "residential",
      showClips: false,
      history: [],
      historyIndex: -1,

      addDeck: (polygon) => {
        if (!isPolygonValid(polygon)) return;
        const name = `Deck ${get().decks.length + 1}`;
        const newDeck = {
          ...createDeckEntity(polygon, name),
          joistSpacingMode: get().joistSpacingMode,
        };
        const nextDecks = [...get().decks, newDeck];
        set({ decks: nextDecks, activeDeckId: newDeck.id, selectedDeckId: null }, false);
        get().calculateBoardsForDeck(newDeck.id);
        get().saveHistory();
      },

      deleteDeck: (deckId) => {
        const remainingDecks = get().decks.filter((deck) => deck.id !== deckId);
        const nextActive =
          get().activeDeckId === deckId
            ? remainingDecks[remainingDecks.length - 1]?.id ?? null
            : get().activeDeckId;
        const nextSelected = get().selectedDeckId === deckId ? null : get().selectedDeckId;
        const nextPending = get().pendingDeleteDeckId === deckId ? null : get().pendingDeleteDeckId;
        set({
          decks: remainingDecks,
          activeDeckId: nextActive,
          selectedDeckId: nextSelected,
          pendingDeleteDeckId: nextPending,
          selectedBreakerId: null,
          editingBreakerId: null,
          breakerConfirmId: null,
          breakerConfirmPosMm: null,
          breakerDraftPosMm: {},
        });
        get().saveHistory();
      },

      setActiveDeck: (deckId) => {
        const exists = get().decks.some((deck) => deck.id === deckId);
        if (!exists) return;
        set({ activeDeckId: deckId });
      },

      setJoistSpacingMode: (mode) => {
        if (mode !== "commercial" && mode !== "residential") return;
        const updatedDecks = get().decks.map((deck) => ({ ...deck, joistSpacingMode: mode }));
        set({ joistSpacingMode: mode, decks: updatedDecks });
        get().calculateBoardsForAllDecks();
        get().saveHistory();
      },

      setShowClips: (show) => {
        set({ showClips: show });
        get().saveHistory();
      },

      selectBreakerLine: (deckId, breakerId) => {
        const deck = get().decks.find((d) => d.id === deckId);
        if (!deck || !deck.finishes.breakerBoardsEnabled) return;
        const exists = deck.breakerLines?.some((line) => line.id === breakerId);
        if (!exists) return;
        set({
          selectedBreakerId: breakerId,
          editingBreakerId: null,
          breakerConfirmId: null,
          breakerConfirmPosMm: null,
        });
      },

      startEditBreakerLine: (deckId, breakerId) => {
        const deck = get().decks.find((d) => d.id === deckId);
        if (!deck || !deck.finishes.breakerBoardsEnabled) return;
        const exists = deck.breakerLines?.some((line) => line.id === breakerId);
        if (!exists) return;
        set({
          selectedBreakerId: breakerId,
          editingBreakerId: breakerId,
          breakerConfirmId: null,
          breakerConfirmPosMm: null,
        });
      },

      setBreakerDraftPos: (deckId, breakerId, posMm) => {
        const deck = get().decks.find((d) => d.id === deckId);
        if (!deck || !deck.finishes.breakerBoardsEnabled) return;
        set((state) => ({
          breakerDraftPosMm: { ...state.breakerDraftPosMm, [breakerId]: posMm },
        }));
      },

      requestConfirmBreaker: (deckId, breakerId, posMm) => {
        const deck = get().decks.find((d) => d.id === deckId);
        if (!deck || !deck.finishes.breakerBoardsEnabled) return;
        const exists = deck.breakerLines?.some((line) => line.id === breakerId);
        if (!exists) return;
        set((state) => ({
          breakerConfirmId: breakerId,
          breakerConfirmPosMm: posMm,
          breakerDraftPosMm: { ...state.breakerDraftPosMm, [breakerId]: posMm },
        }));
      },

      confirmBreakerPlacement: (deckId, breakerId) => {
        const { decks, breakerDraftPosMm } = get();
        const idx = decks.findIndex((d) => d.id === deckId);
        if (idx === -1) return;
        const posMm = breakerDraftPosMm[breakerId];
        if (!Number.isFinite(posMm)) return;

        const deck = decks[idx];
        const updatedLines =
          deck.breakerLines?.map((line) => (line.id === breakerId ? { ...line, posMm: posMm as number } : line)) ?? [];
        const nextDraft = { ...breakerDraftPosMm };
        delete nextDraft[breakerId];

        const nextDecks = [...decks];
        nextDecks[idx] = { ...deck, breakerLines: updatedLines };

        set({
          decks: nextDecks,
          breakerDraftPosMm: nextDraft,
          breakerConfirmId: null,
          breakerConfirmPosMm: null,
          editingBreakerId: null,
          selectedBreakerId: breakerId,
        });
        get().calculateBoardsForDeck(deckId);
      },

      rejectBreakerPlacement: (_deckId, _breakerId) => {
        set({ breakerConfirmId: null, breakerConfirmPosMm: null });
      },

      exitEditBreakerLine: () => {
        set({
          selectedBreakerId: null,
          editingBreakerId: null,
          breakerConfirmId: null,
          breakerConfirmPosMm: null,
          breakerDraftPosMm: {},
        });
      },

      updateActiveDeck: (patch) => {
        const { activeDeckId, decks } = get();
        if (!activeDeckId) return;
        const idx = decks.findIndex((d) => d.id === activeDeckId);
        if (idx === -1) return;
        const updated = { ...decks[idx], ...patch };
        const nextDecks = [...decks];
        nextDecks[idx] = updated;
        set({ decks: nextDecks });
      },

      calculateBoardsForDeck: (deckId) => {
        const { decks } = get();
        const idx = decks.findIndex((deck) => deck.id === deckId);
        if (idx === -1) return;
        const deck = decks[idx];

        if (deck.polygon.length < 3) {
          const cleared = {
            ...deck,
            infillPolygon: [],
            boards: [],
            breakerBoards: [],
            pictureFramePieces: [],
            fasciaPieces: [],
            boardPlan: null,
            pictureFrameWarning: null,
            rowCount: 0,
            clipSummary: null,
          };
          const nextDecks = [...decks];
          nextDecks[idx] = cleared;
          set({ decks: nextDecks });
          return;
        }

        let infillPolygon = deck.polygon;
        let finishes = { ...deck.finishes };
        let pictureFramePieces: Point[][] = [];
        let pictureFrameWarning: string | null = null;

        if (finishes.pictureFrameEnabled) {
          const offsetMm = deck.pictureFrameBoardWidthMm + deck.pictureFrameGapMm;
          const innerPolygon = offsetPolygonMiter(deck.polygon, offsetMm, "inward");
          if (!innerPolygon || innerPolygon.length < 3 || polygonArea(innerPolygon) < 1) {
            finishes.pictureFrameEnabled = false;
            pictureFrameWarning = "Deck too small for picture frame width";
            infillPolygon = deck.polygon;
          } else {
            infillPolygon = innerPolygon;
            for (let i = 0; i < deck.polygon.length; i++) {
              const next = (i + 1) % deck.polygon.length;
              pictureFramePieces.push([
                deck.polygon[i],
                deck.polygon[next],
                innerPolygon[next],
                innerPolygon[i],
              ]);
            }
          }
        }

        const fasciaPieces = finishes.fasciaEnabled
          ? buildFasciaPieces(deck.polygon, deck.fasciaThicknessMm)
          : [];

        const boards: Board[] = [];
        const breakerBoards: Board[] = [];
        const boardWidthWithGap = BOARD_WIDTH_MM + BOARD_GAP_MM;
        const bounds = getBounds(infillPolygon);

        const breakerAxis: BreakerAxis = breakerAxisForDirection(deck.boardDirection);
        const existingBreakerLines = deck.breakerLines ?? [];
        let activeBreakerLines = existingBreakerLines.filter((line) => line.axis === breakerAxis);
        let nextBreakerLines = existingBreakerLines;

        if (finishes.breakerBoardsEnabled && activeBreakerLines.length === 0) {
          const generated = generateDefaultBreakerLines(
            { ...deck, boardDirection: deck.boardDirection, infillPolygon },
            infillPolygon
          );
          activeBreakerLines = generated;
          nextBreakerLines = [...existingBreakerLines.filter((line) => line.axis !== breakerAxis), ...generated];
        }

        const breakerPositions: number[] = finishes.breakerBoardsEnabled
          ? activeBreakerLines.map((line) => line.posMm)
          : [];

        let totalWasteMm = 0;
        let totalOverflowMm = 0;
        let totalBoards = 0;
        let rowsWithBoards = 0;
        let currentRowIndex = 0;

        if (deck.boardDirection === "horizontal") {
          const overscanMm = boardWidthWithGap;
          const startY = bounds.minY - overscanMm;
          const endY = bounds.maxY + overscanMm;
          for (let y = startY; y <= endY; y += boardWidthWithGap) {
            const spans = getHorizontalSpansMm(infillPolygon, y);
            if (spans.length === 0) continue;
            const rowIndex = currentRowIndex++;
            rowsWithBoards = currentRowIndex;
            spans.forEach(([startX, endX]) => {
              const build = buildBoardsForSpan({
                start: startX,
                end: endX,
                fixedAxis: y,
                direction: "horizontal",
                rowIndex,
                breakerPositions,
                breakersEnabled: finishes.breakerBoardsEnabled,
              });
              boards.push(...build.boards);
              totalWasteMm += build.wasteMm;
              totalOverflowMm += build.overflowMm;
              totalBoards += build.boards.length;
            });
          }

          if (finishes.breakerBoardsEnabled) {
            breakerPositions.forEach((xBreaker) => {
              const spans = getVerticalSpansMm(infillPolygon, xBreaker);
              spans.forEach(([yStart, yEnd]) => {
                const height = yEnd - yStart;
                if (height <= MIN_SEGMENT_LENGTH_MM) continue;
                breakerBoards.push({
                  id: generateId("breaker"),
                  start: { x: xBreaker, y: yStart },
                  end: { x: xBreaker, y: yEnd },
                  length: height,
                  kind: "breaker",
                });
              });
            });
          }
        } else {
          const overscanMm = boardWidthWithGap;
          const startX = bounds.minX - overscanMm;
          const endX = bounds.maxX + overscanMm;
          for (let x = startX; x <= endX; x += boardWidthWithGap) {
            const spans = getVerticalSpansMm(infillPolygon, x);
            if (spans.length === 0) continue;
            const rowIndex = currentRowIndex++;
            rowsWithBoards = currentRowIndex;
            spans.forEach(([startY, endY]) => {
              const build = buildBoardsForSpan({
                start: startY,
                end: endY,
                fixedAxis: x,
                direction: "vertical",
                rowIndex,
                breakerPositions,
                breakersEnabled: finishes.breakerBoardsEnabled,
              });
              boards.push(...build.boards);
              totalWasteMm += build.wasteMm;
              totalOverflowMm += build.overflowMm;
              totalBoards += build.boards.length;
            });
          }

          if (finishes.breakerBoardsEnabled) {
            breakerPositions.forEach((yBreaker) => {
              const spans = getHorizontalSpansMm(infillPolygon, yBreaker);
              spans.forEach(([xStart, xEnd]) => {
                const width = xEnd - xStart;
                if (width <= MIN_SEGMENT_LENGTH_MM) continue;
                breakerBoards.push({
                  id: generateId("breaker"),
                  start: { x: xStart, y: yBreaker },
                  end: { x: xEnd, y: yBreaker },
                  length: width,
                  kind: "breaker",
                });
              });
            });
          }
        }

        boards.forEach((board) => {
          board.rowCount = rowsWithBoards;
        });

        const boardPlan: DeckingBoardPlan = buildBoardPlan(
          deck,
          finishes,
          infillPolygon,
          totalBoards,
          totalWasteMm,
          totalOverflowMm,
          rowsWithBoards
        );

        const joistSpacingMm = getJoistSpacingMm(deck.joistSpacingMode ?? get().joistSpacingMode);
        const joistCount = rowsWithBoards > 0
          ? getJoistCount(infillPolygon, deck.boardDirection, joistSpacingMm)
          : 0;
        const clipCounts = getClipsPerJoist(rowsWithBoards);
        const clipSummary: ClipSummary = {
          joistCount,
          rowCount: rowsWithBoards,
          deckClips: joistCount * clipCounts.clipsPerJoist,
          starterClips: joistCount * clipCounts.starterClipsPerJoist,
          fasciaClips: 0,
          deckClipsForFascia: 0,
          joistSpacingMm,
        };

        if (finishes.fasciaEnabled && clipSummary.joistSpacingMm > 0) {
          const fasciaClips = getFasciaClipCount(polygonPerimeter(deck.polygon), clipSummary.joistSpacingMm);
          clipSummary.fasciaClips = fasciaClips;
          clipSummary.deckClipsForFascia = Math.ceil(fasciaClips / 2);
        }

        if (rowsWithBoards === 0) {
          clipSummary.joistCount = 0;
          clipSummary.deckClips = 0;
          clipSummary.starterClips = 0;
          clipSummary.fasciaClips = finishes.fasciaEnabled ? clipSummary.fasciaClips : 0;
          clipSummary.deckClipsForFascia = finishes.fasciaEnabled ? clipSummary.deckClipsForFascia : 0;
        }

        const updatedDeck: DeckEntity = {
          ...deck,
          finishes,
          infillPolygon,
          boards,
          breakerBoards,
          breakerLines: nextBreakerLines,
          pictureFramePieces,
          fasciaPieces,
          pictureFrameWarning,
          boardPlan,
          rowCount: rowsWithBoards,
          clipSummary,
          joistSpacingMode: deck.joistSpacingMode ?? get().joistSpacingMode,
        };

        const nextDecks = [...decks];
        nextDecks[idx] = updatedDeck;
        set({ decks: nextDecks });
      },

      calculateBoardsForAllDecks: () => {
        const { decks } = get();
        decks.forEach((deck) => get().calculateBoardsForDeck(deck.id));
      },

      getDeckRenderModel: (deckId) => {
        const deck = get().decks.find((d) => d.id === deckId);
        if (!deck) return null;
        return buildDeckRenderModel(deck);
      },

      getReportData: () => {
        const reports = get().decks.map((deck) => buildDeckReport(deck));
        return { decks: reports, projectTotals: buildTotals(reports) };
      },

      clearAllDecks: () => {
        set({
          decks: [],
          activeDeckId: null,
          selectedDeckId: null,
          pendingDeleteDeckId: null,
          selectedBreakerId: null,
          editingBreakerId: null,
          breakerConfirmId: null,
          breakerConfirmPosMm: null,
          breakerDraftPosMm: {},
        });
        get().saveHistory();
      },

      getCuttingListForDeck: (deckId) => {
        const emptyList: DeckingCuttingList = {
          boards: [],
          pictureFrame: [],
          fascia: [],
          clips: 0,
          starterClips: 0,
          fasciaClips: 0,
          deckClipsForFascia: 0,
          totalBoardLength: 0,
          totalFasciaLength: 0,
        };

        const { activeDeckId } = get();
        const id = deckId ?? activeDeckId;
        if (!id) {
          return emptyList;
        }

        const deck = get().decks.find((d) => d.id === id);
        if (!deck) {
          return emptyList;
        }

        const boardLengthCounts = new Map<number, number>();
        const allBoards = [...deck.boards, ...deck.breakerBoards];
        allBoards.forEach((board) => {
          const length = Math.round(board.length);
          boardLengthCounts.set(length, (boardLengthCounts.get(length) ?? 0) + 1);
        });

        const pictureFrameLengthCounts = new Map<number, number>();
        deck.pictureFramePieces.forEach((piece) => {
          if (piece.length < 2) return;
          const length = Math.round(Math.hypot(piece[1].x - piece[0].x, piece[1].y - piece[0].y));
          pictureFrameLengthCounts.set(length, (pictureFrameLengthCounts.get(length) ?? 0) + 1);
        });

        const fasciaLengthCounts = new Map<number, number>();
        deck.fasciaPieces.forEach((piece) => {
          if (piece.length < 2) return;
          const length = Math.round(Math.hypot(piece[1].x - piece[0].x, piece[1].y - piece[0].y));
          fasciaLengthCounts.set(length, (fasciaLengthCounts.get(length) ?? 0) + 1);
        });

        const boardsList = Array.from(boardLengthCounts.entries())
          .map(([length, count]) => ({ length, count }))
          .sort((a, b) => b.length - a.length);

        const pictureFrameList = Array.from(pictureFrameLengthCounts.entries())
          .map(([length, count]) => ({ length, count }))
          .sort((a, b) => b.length - a.length);

        const fasciaList = Array.from(fasciaLengthCounts.entries())
          .map(([length, count]) => ({ length, count }))
          .sort((a, b) => b.length - a.length);

        const totalBoardLength =
          Array.from(boardLengthCounts.entries()).reduce(
            (sum, [length, count]) => sum + length * count,
            0
          ) +
          Array.from(pictureFrameLengthCounts.entries()).reduce(
            (sum, [length, count]) => sum + length * count,
            0
          );

        const totalFasciaLength = Array.from(fasciaLengthCounts.entries()).reduce(
          (sum, [length, count]) => sum + length * count,
          0
        );

        const clipSummary = deck.clipSummary;

        const clips = clipSummary?.deckClips ?? 0;
        const starterClips = clipSummary?.starterClips ?? 0;
        const fasciaClips = deck.finishes.fasciaEnabled ? clipSummary?.fasciaClips ?? 0 : 0;
        const deckClipsForFascia = deck.finishes.fasciaEnabled
          ? clipSummary?.deckClipsForFascia ?? 0
          : 0;

        return {
          boards: boardsList,
          pictureFrame: pictureFrameList,
          fascia: fasciaList,
          clips,
          starterClips,
          fasciaClips,
          deckClipsForFascia,
          totalBoardLength,
          totalFasciaLength,
        };
      },

      getProjectCuttingTotals: () => {
        const { decks } = get();

        const totals = decks.reduce(
          (acc, deck) => {
            const list = get().getCuttingListForDeck(deck.id);
            const allPieces = [...list.boards, ...list.pictureFrame, ...list.fascia];
            allPieces.forEach((piece) => {
              acc.totalPieces += piece.count;
              acc.totalLinealMm += piece.length * piece.count;
            });
            return acc;
          },
          { totalPieces: 0, totalLinealMm: 0 }
        );

        return {
          ...totals,
          totalLinealMetres: totals.totalLinealMm / 1000,
        };
      },

      getProjectClipTotals: () => {
        const { decks, joistSpacingMode } = get();
        const spacing = getJoistSpacingMm(joistSpacingMode);
        return decks.reduce<ClipSummary>(
          (acc, deck) => {
            const summary = deck.clipSummary;
            if (!summary) return acc;
            acc.joistCount += summary.joistCount;
            acc.rowCount += summary.rowCount;
            acc.deckClips += summary.deckClips;
            acc.starterClips += summary.starterClips;
            acc.fasciaClips += deck.finishes.fasciaEnabled ? summary.fasciaClips : 0;
            acc.deckClipsForFascia += deck.finishes.fasciaEnabled ? summary.deckClipsForFascia : 0;
            return acc;
          },
          {
            joistCount: 0,
            rowCount: 0,
            deckClips: 0,
            starterClips: 0,
            fasciaClips: 0,
            deckClipsForFascia: 0,
            joistSpacingMm: spacing,
          }
        );
      },

      updateEdgeLength: (edgeIndex, lengthMm) => {
        if (lengthMm <= 0) return;
        const { activeDeckId, decks } = get();
        if (!activeDeckId) return;
        const idx = decks.findIndex((d) => d.id === activeDeckId);
        if (idx === -1) return;

        const deck = decks[idx];
        const n = deck.polygon.length;
        if (n < 2) return;

        if (isEdgeLocked(deck.edgeConstraints, edgeIndex)) {
          window.alert("Edge length is locked, unlock to edit");
          return;
        }

        const startIndex = ((edgeIndex % n) + n) % n;
        const endIndex = (startIndex + 1) % n;

        const start = deck.polygon[startIndex];
        const end = deck.polygon[endIndex];

        const direction = { x: end.x - start.x, y: end.y - start.y };
        const currentLength = Math.hypot(direction.x, direction.y);
        if (currentLength === 0) return;

        const scale = lengthMm / currentLength;
        const newEnd = {
          x: start.x + direction.x * scale,
          y: start.y + direction.y * scale,
        };

        const delta = { x: newEnd.x - end.x, y: newEnd.y - end.y };
        const newPolygon = deck.polygon.map((point) => ({ ...point }));
        newPolygon[endIndex] = newEnd;

        let k = (endIndex + 1) % n;
        while (k !== startIndex) {
          newPolygon[k] = {
            x: newPolygon[k].x + delta.x,
            y: newPolygon[k].y + delta.y,
          };
          k = (k + 1) % n;
        }

        const { baselineEdgeIndex, normalizedPolygon } = normalisePolygon(newPolygon);

        if (!isPolygonValid(normalizedPolygon)) {
          console.warn("Aborting edge length update due to invalid geometry");
          return;
        }

        const conflictingEdge = findConflictingLockedEdge(normalizedPolygon, deck.edgeConstraints);
        if (conflictingEdge !== null) {
          window.alert(
            `This edit would change locked edge length on edge ${conflictingEdge + 1}, unlock that dimension to proceed.`
          );
          return;
        }

        const nextDeck: DeckEntity = {
          ...deck,
          polygon: normalizedPolygon,
          baselineEdgeIndex,
        };
        const nextDecks = [...decks];
        nextDecks[idx] = nextDeck;
        set({ decks: nextDecks });
        get().calculateBoardsForDeck(nextDeck.id);
        get().saveHistory();
      },

      lockEdgeLength: (edgeIndex) => {
        const { activeDeckId, decks } = get();
        if (!activeDeckId) return;
        const idx = decks.findIndex((d) => d.id === activeDeckId);
        if (idx === -1) return;
        const deck = decks[idx];
        if (deck.polygon.length < 2) return;
        const length = edgeLengthMm(deck.polygon, edgeIndex);
        const edgeConstraints = lockEdge(deck.edgeConstraints, edgeIndex, length);
        const nextDecks = [...decks];
        nextDecks[idx] = { ...deck, edgeConstraints };
        set({ decks: nextDecks });
        get().saveHistory();
      },

      unlockEdgeLength: (edgeIndex) => {
        const { activeDeckId, decks } = get();
        if (!activeDeckId) return;
        const idx = decks.findIndex((d) => d.id === activeDeckId);
        if (idx === -1) return;
        const deck = decks[idx];
        if (!deck.edgeConstraints[edgeIndex]) return;
        const edgeConstraints = unlockEdge(deck.edgeConstraints, edgeIndex);
        const nextDecks = [...decks];
        nextDecks[idx] = { ...deck, edgeConstraints };
        set({ decks: nextDecks });
        get().saveHistory();
      },

      setSelectedDeck: (deckId) => {
        if (deckId === null) {
          set({ selectedDeckId: null, pendingDeleteDeckId: null });
          return;
        }
        const exists = get().decks.some((deck) => deck.id === deckId);
        if (!exists) return;
        set({ selectedDeckId: deckId, pendingDeleteDeckId: null });
      },

      requestDeleteDeck: (deckId) => {
        const exists = get().decks.some((deck) => deck.id === deckId);
        if (!exists) return;
        set({ pendingDeleteDeckId: deckId });
      },

      confirmDeleteDeck: () => {
        const { pendingDeleteDeckId } = get();
        if (!pendingDeleteDeckId) return;
        get().deleteDeck(pendingDeleteDeckId);
        set({ pendingDeleteDeckId: null, selectedDeckId: null });
      },

      cancelDeleteDeck: () => {
        set({ pendingDeleteDeckId: null });
      },

      undo: () => {
        const { history, historyIndex } = get();
        if (historyIndex > 0) {
          const newIndex = historyIndex - 1;
          const snapshot = history[newIndex];
          set({
            decks: deepCloneDecks(snapshot.decks),
            activeDeckId: snapshot.activeDeckId,
            joistSpacingMode: snapshot.joistSpacingMode,
            showClips: snapshot.showClips,
            historyIndex: newIndex,
          });
        }
      },

      redo: () => {
        const { history, historyIndex } = get();
        if (historyIndex < history.length - 1) {
          const newIndex = historyIndex + 1;
          const snapshot = history[newIndex];
          set({
            decks: deepCloneDecks(snapshot.decks),
            activeDeckId: snapshot.activeDeckId,
            joistSpacingMode: snapshot.joistSpacingMode,
            showClips: snapshot.showClips,
            historyIndex: newIndex,
          });
        }
      },

      saveHistory: () => {
        const { decks, activeDeckId, history, historyIndex, joistSpacingMode, showClips } = get();
        const snapshot = {
          decks: deepCloneDecks(decks),
          activeDeckId,
          joistSpacingMode,
          showClips,
        };
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(snapshot);
        const cappedHistory =
          newHistory.length > MAX_HISTORY_ENTRIES
            ? newHistory.slice(newHistory.length - MAX_HISTORY_ENTRIES)
            : newHistory;
        set({ history: cappedHistory, historyIndex: cappedHistory.length - 1 });
      },
    }),
    {
      name: "decking-storage",
      merge: (persistedState, currentState) => {
        const incomingState =
          (persistedState as { state?: Partial<DeckingStoreState> }).state ??
          (persistedState as Partial<DeckingStoreState>);

        if (!incomingState || typeof incomingState !== "object") {
          return { ...currentState, hasHydrated: true };
        }

        const decks = Array.isArray(incomingState.decks)
          ? incomingState.decks.map((deck) => ({
              ...deck,
              breakerLines: Array.isArray((deck as DeckEntity).breakerLines)
                ? (deck as DeckEntity).breakerLines
                : [],
            }))
          : currentState.decks;

        const history = Array.isArray(incomingState.history)
          ? incomingState.history.map((entry) => ({
              decks: entry.decks,
              activeDeckId: entry.activeDeckId ?? null,
              joistSpacingMode: (entry as { joistSpacingMode?: JoistSpacingMode }).joistSpacingMode ?? "residential",
              showClips: (entry as { showClips?: boolean }).showClips ?? false,
            }))
          : currentState.history;

        return {
          ...currentState,
          ...incomingState,
          decks,
          hasHydrated: true,
          selectedBreakerId:
            (incomingState as Partial<DeckingStoreState>).selectedBreakerId ??
            currentState.selectedBreakerId ??
            null,
          editingBreakerId:
            (incomingState as Partial<DeckingStoreState>).editingBreakerId ??
            currentState.editingBreakerId ??
            null,
          breakerDraftPosMm:
            (incomingState as Partial<DeckingStoreState>).breakerDraftPosMm ??
            currentState.breakerDraftPosMm ??
            {},
          breakerConfirmId:
            (incomingState as Partial<DeckingStoreState>).breakerConfirmId ??
            currentState.breakerConfirmId ??
            null,
          breakerConfirmPosMm:
            (incomingState as Partial<DeckingStoreState>).breakerConfirmPosMm ??
            currentState.breakerConfirmPosMm ??
            null,
          history,
          historyIndex:
            typeof incomingState.historyIndex === "number"
              ? incomingState.historyIndex
              : currentState.historyIndex,
          joistSpacingMode:
            (incomingState as Partial<DeckingStoreState>).joistSpacingMode ??
            currentState.joistSpacingMode ??
            "residential",
          showClips:
            (incomingState as Partial<DeckingStoreState>).showClips ?? currentState.showClips ?? false,
        };
      },
    }
  )
);
