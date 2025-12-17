import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  BOARD_GAP_MM,
  BOARD_WIDTH_MM,
  MAX_BOARD_LENGTH_MM,
  planBoardsForRun,
} from "@/lib/deckingGeometry";
import type {
  Board,
  BoardDirection,
  DeckColor,
  DeckEntity,
  DeckingBoardPlan,
  DeckingCuttingList,
  EdgeConstraint,
  Point,
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

const DEFAULT_COLOR: DeckColor = "mallee-bark";
const DEFAULT_FASCIA_THICKNESS = 20;

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

function getHorizontalIntersections(polygon: Point[], y: number): number[] {
  const intersections: number[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];

    if ((p1.y <= y && p2.y > y) || (p2.y <= y && p1.y > y)) {
      const t = (y - p1.y) / (p2.y - p1.y);
      const x = p1.x + t * (p2.x - p1.x);
      intersections.push(x);
    }
  }
  return intersections.sort((a, b) => a - b);
}

function getVerticalIntersections(polygon: Point[], x: number): number[] {
  const intersections: number[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];

    if ((p1.x <= x && p2.x > x) || (p2.x <= x && p1.x > x)) {
      const t = (x - p1.x) / (p2.x - p1.x);
      const y = p1.y + t * (p2.y - p1.y);
      intersections.push(y);
    }
  }
  return intersections.sort((a, b) => a - b);
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
    pictureFramePieces: [],
    fasciaPieces: [],
    selectedColor: DEFAULT_COLOR,
    boardDirection: "horizontal",
    boardPlan: null,
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
  const areaMm2 = polygonArea(finishes.pictureFrameEnabled ? deck.polygon : infillPolygon);
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

interface DeckingStoreState {
  decks: DeckEntity[];
  activeDeckId: string | null;
  history: Array<{ decks: DeckEntity[]; activeDeckId: string | null }>;
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
  getCuttingListForDeck: (deckId: string | null) => DeckingCuttingList;
  updateEdgeLength: (edgeIndex: number, lengthMm: number) => void;
  lockEdgeLength: (edgeIndex: number) => void;
  unlockEdgeLength: (edgeIndex: number) => void;
}

export const useDeckingStore = create<DeckingStoreState>()(
  persist(
    (set, get) => ({
      decks: [],
      activeDeckId: null,
      history: [],
      historyIndex: -1,

      addDeck: (polygon) => {
        if (!isPolygonValid(polygon)) return;
        const name = `Deck ${get().decks.length + 1}`;
        const newDeck = createDeckEntity(polygon, name);
        const nextDecks = [...get().decks, newDeck];
        set({ decks: nextDecks, activeDeckId: newDeck.id }, false);
        get().calculateBoardsForDeck(newDeck.id);
        get().saveHistory();
      },

      deleteDeck: (deckId) => {
        const remainingDecks = get().decks.filter((deck) => deck.id !== deckId);
        const nextActive =
          get().activeDeckId === deckId
            ? remainingDecks[remainingDecks.length - 1]?.id ?? null
            : get().activeDeckId;
        set({ decks: remainingDecks, activeDeckId: nextActive });
        get().saveHistory();
      },

      setActiveDeck: (deckId) => {
        const exists = get().decks.some((deck) => deck.id === deckId);
        if (!exists) return;
        set({ activeDeckId: deckId });
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

        let totalWasteMm = 0;
        let totalOverflowMm = 0;
        let totalBoards = 0;
        let rowsWithBoards = 0;

        const breakerPositions: number[] = [];
        if (deck.boardDirection === "horizontal") {
          let cursor = bounds.minX + MAX_BOARD_LENGTH_MM;
          while (cursor < bounds.maxX) {
            breakerPositions.push(cursor);
            cursor += MAX_BOARD_LENGTH_MM;
          }
        } else {
          let cursor = bounds.minY + MAX_BOARD_LENGTH_MM;
          while (cursor < bounds.maxY) {
            breakerPositions.push(cursor);
            cursor += MAX_BOARD_LENGTH_MM;
          }
        }

        if (deck.boardDirection === "horizontal") {
          const span = bounds.maxY - bounds.minY;
          const numRows = Math.ceil(span / boardWidthWithGap) + 1;
          for (let i = 0; i < numRows; i++) {
            const y = bounds.minY + i * boardWidthWithGap;
            const intersections = getHorizontalIntersections(infillPolygon, y);
            if (intersections.length < 2) continue;
            rowsWithBoards += 1;
            for (let j = 0; j < intersections.length - 1; j += 2) {
              const startX = intersections[j];
              const endX = intersections[j + 1];
              const runLength = endX - startX;
              if (runLength <= 0) continue;

              const runId = generateId("run");

              if (finishes.breakerBoardsEnabled) {
                const runBreakers = breakerPositions.filter((x) => x > startX && x < endX);
                const segmentPoints = [startX, ...runBreakers, endX];
                const segmentCount = segmentPoints.length - 1;
                segmentPoints.forEach((xPos, idx) => {
                  if (idx === segmentCount) return;
                  const nextX = segmentPoints[idx + 1];
                  const length = nextX - xPos;
                  boards.push({
                    id: generateId("board"),
                    start: { x: xPos, y },
                    end: { x: nextX, y },
                    length,
                    runId,
                    segmentIndex: idx,
                    segmentCount,
                    isRunStart: idx === 0,
                    isRunEnd: idx === segmentCount - 1,
                    kind: "field",
                  });
                  totalBoards += 1;
                });
              } else {
                const plan = planBoardsForRun(runLength);
                let cursorX = startX;
                plan.boardLengths.forEach((length, idx) => {
                  const segmentCount = plan.boardLengths.length;
                  boards.push({
                    id: generateId("board"),
                    start: { x: cursorX, y },
                    end: { x: cursorX + length, y },
                    length,
                    runId,
                    segmentIndex: idx,
                    segmentCount,
                    isRunStart: idx === 0,
                    isRunEnd: idx === segmentCount - 1,
                    kind: "field",
                  });
                  cursorX += length;
                });
                totalWasteMm += plan.wasteMm;
                totalOverflowMm += plan.overflowMm;
                totalBoards += plan.boardLengths.length;
              }
            }
          }

          if (finishes.breakerBoardsEnabled) {
            breakerPositions.forEach((xBreaker) => {
              const intersections = getVerticalIntersections(deck.polygon, xBreaker);
              for (let k = 0; k < intersections.length - 1; k += 2) {
                const yStart = intersections[k];
                const yEnd = intersections[k + 1];
                breakerBoards.push({
                  id: generateId("breaker"),
                  start: { x: xBreaker, y: yStart },
                  end: { x: xBreaker, y: yEnd },
                  length: yEnd - yStart,
                  kind: "breaker",
                });
              }
            });
          }
        } else {
          const span = bounds.maxX - bounds.minX;
          const numRows = Math.ceil(span / boardWidthWithGap) + 1;
          for (let i = 0; i < numRows; i++) {
            const x = bounds.minX + i * boardWidthWithGap;
            const intersections = getVerticalIntersections(infillPolygon, x);
            if (intersections.length < 2) continue;
            rowsWithBoards += 1;
            for (let j = 0; j < intersections.length - 1; j += 2) {
              const startY = intersections[j];
              const endY = intersections[j + 1];
              const runLength = endY - startY;
              if (runLength <= 0) continue;

              const runId = generateId("run");

              if (finishes.breakerBoardsEnabled) {
                const runBreakers = breakerPositions.filter((yPos) => yPos > startY && yPos < endY);
                const segmentPoints = [startY, ...runBreakers, endY];
                const segmentCount = segmentPoints.length - 1;
                segmentPoints.forEach((yPos, idx) => {
                  if (idx === segmentCount) return;
                  const nextY = segmentPoints[idx + 1];
                  const length = nextY - yPos;
                  boards.push({
                    id: generateId("board"),
                    start: { x, y: yPos },
                    end: { x, y: nextY },
                    length,
                    runId,
                    segmentIndex: idx,
                    segmentCount,
                    isRunStart: idx === 0,
                    isRunEnd: idx === segmentCount - 1,
                    kind: "field",
                  });
                  totalBoards += 1;
                });
              } else {
                const plan = planBoardsForRun(runLength);
                let cursorY = startY;
                plan.boardLengths.forEach((length, idx) => {
                  const segmentCount = plan.boardLengths.length;
                  boards.push({
                    id: generateId("board"),
                    start: { x, y: cursorY },
                    end: { x, y: cursorY + length },
                    length,
                    runId,
                    segmentIndex: idx,
                    segmentCount,
                    isRunStart: idx === 0,
                    isRunEnd: idx === segmentCount - 1,
                    kind: "field",
                  });
                  cursorY += length;
                });
                totalWasteMm += plan.wasteMm;
                totalOverflowMm += plan.overflowMm;
                totalBoards += plan.boardLengths.length;
              }
            }
          }

          if (finishes.breakerBoardsEnabled) {
            breakerPositions.forEach((yBreaker) => {
              const intersections = getHorizontalIntersections(deck.polygon, yBreaker);
              for (let k = 0; k < intersections.length - 1; k += 2) {
                const xStart = intersections[k];
                const xEnd = intersections[k + 1];
                breakerBoards.push({
                  id: generateId("breaker"),
                  start: { x: xStart, y: yBreaker },
                  end: { x: xEnd, y: yBreaker },
                  length: xEnd - xStart,
                  kind: "breaker",
                });
              }
            });
          }
        }

        const boardPlan: DeckingBoardPlan = buildBoardPlan(
          deck,
          finishes,
          infillPolygon,
          totalBoards,
          totalWasteMm,
          totalOverflowMm,
          rowsWithBoards
        );

        const updatedDeck: DeckEntity = {
          ...deck,
          finishes,
          infillPolygon,
          boards,
          breakerBoards,
          pictureFramePieces,
          fasciaPieces,
          pictureFrameWarning,
          boardPlan,
        };

        const nextDecks = [...decks];
        nextDecks[idx] = updatedDeck;
        set({ decks: nextDecks });
      },

      calculateBoardsForAllDecks: () => {
        const { decks } = get();
        decks.forEach((deck) => get().calculateBoardsForDeck(deck.id));
      },

      clearAllDecks: () => {
        set({ decks: [], activeDeckId: null });
        get().saveHistory();
      },

      getCuttingListForDeck: (deckId) => {
        const { decks, activeDeckId } = get();
        const id = deckId ?? activeDeckId;
        const deck = decks.find((d) => d.id === id);
        if (!deck) {
          return {
            boards: [],
            pictureFrame: [],
            fascia: [],
            clips: 0,
            totalBoardLength: 0,
            totalFasciaLength: 0,
          };
        }

        const allBoards = [...deck.boards, ...deck.breakerBoards];
        const boardLengthCounts = new Map<number, number>();
        allBoards.forEach((board) => {
          const length = Math.round(board.length);
          boardLengthCounts.set(length, (boardLengthCounts.get(length) || 0) + 1);
        });

        const pictureFrameLengthCounts = new Map<number, number>();
        if (deck.finishes.pictureFrameEnabled) {
          deck.pictureFramePieces.forEach((piece) => {
            if (piece.length < 2) return;
            const length = Math.round(
              Math.hypot(piece[1].x - piece[0].x, piece[1].y - piece[0].y)
            );
            pictureFrameLengthCounts.set(
              length,
              (pictureFrameLengthCounts.get(length) || 0) + 1
            );
          });
        }

        const fasciaLengthCounts = new Map<number, number>();
        if (deck.finishes.fasciaEnabled) {
          deck.fasciaPieces.forEach((piece) => {
            if (piece.length < 2) return;
            const length = Math.round(
              Math.hypot(piece[1].x - piece[0].x, piece[1].y - piece[0].y)
            );
            fasciaLengthCounts.set(length, (fasciaLengthCounts.get(length) || 0) + 1);
          });
        }

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
          allBoards.reduce((sum, board) => sum + board.length, 0) +
          Array.from(pictureFrameLengthCounts.entries()).reduce(
            (sum, [length, count]) => sum + length * count,
            0
          );

        const totalFasciaLength = Array.from(fasciaLengthCounts.entries()).reduce(
          (sum, [length, count]) => sum + length * count,
          0
        );

        return {
          boards: boardsList,
          pictureFrame: pictureFrameList,
          fascia: fasciaList,
          clips: 0,
          totalBoardLength,
          totalFasciaLength,
        };
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

      undo: () => {
        const { history, historyIndex } = get();
        if (historyIndex > 0) {
          const newIndex = historyIndex - 1;
          const snapshot = history[newIndex];
          set({
            decks: deepCloneDecks(snapshot.decks),
            activeDeckId: snapshot.activeDeckId,
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
            historyIndex: newIndex,
          });
        }
      },

      saveHistory: () => {
        const { decks, activeDeckId, history, historyIndex } = get();
        const snapshot = {
          decks: deepCloneDecks(decks),
          activeDeckId,
        };
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(snapshot);
        set({ history: newHistory, historyIndex: newHistory.length - 1 });
      },
    }),
    {
      name: "decking-storage",
      merge: (persistedState, currentState) => {
        const incomingState =
          (persistedState as { state?: Partial<DeckingStoreState> }).state ??
          (persistedState as Partial<DeckingStoreState>);

        if (!incomingState || typeof incomingState !== "object") {
          return currentState;
        }

        const history = Array.isArray(incomingState.history)
          ? incomingState.history
          : currentState.history;

        return {
          ...currentState,
          ...incomingState,
          history,
          historyIndex:
            typeof incomingState.historyIndex === "number"
              ? incomingState.historyIndex
              : currentState.historyIndex,
        };
      },
    }
  )
);
