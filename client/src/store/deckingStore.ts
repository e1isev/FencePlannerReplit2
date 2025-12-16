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
  CornerConstraint,
  DeckColor,
  DeckingBoardPlan,
  DeckingCuttingList,
  Point,
} from "@/types/decking";
import { applyCornerAngleRotateForward } from "@/geometry/deckingAngles";
import {
  findBottomEdgeIndex,
  rotatePolygonToHorizontalBaseline,
} from "@/geometry/deckingBaseline";

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

interface DeckingState {
  polygon: Point[];
  boards: Board[];
  selectedColor: DeckColor;
  boardDirection: BoardDirection;
  boardPlan: DeckingBoardPlan | null;
  cornerConstraints: Record<number, CornerConstraint>;
  baselineEdgeIndex: number | null;
  history: Array<{
    polygon: Point[];
    boardDirection: BoardDirection;
    cornerConstraints: Record<number, CornerConstraint>;
    baselineEdgeIndex: number | null;
  }>;
  historyIndex: number;

  setSelectedColor: (color: DeckColor) => void;
  toggleBoardDirection: () => void;
  setPolygon: (points: Point[]) => void;
  calculateBoards: () => void;
  getCuttingList: () => DeckingCuttingList;
  updateEdgeLength: (edgeIndex: number, lengthMm: number) => void;
  setCornerAngle: (vertexIndex: number, angleDeg: number) => void;
  clearCornerAngle: (vertexIndex: number) => void;
  clear: () => void;
  undo: () => void;
  redo: () => void;
  saveHistory: () => void;
}

export const useDeckingStore = create<DeckingState>()(
  persist(
    (set, get) => ({
      polygon: [],
      boards: [],
      selectedColor: "mallee-bark",
      boardDirection: "horizontal",
      boardPlan: null,
      cornerConstraints: {},
      baselineEdgeIndex: null,
      history: [],
      historyIndex: -1,

      setSelectedColor: (color) => set({ selectedColor: color }),

      toggleBoardDirection: () => {
        const current = get().boardDirection;
        const next: BoardDirection = current === "horizontal" ? "vertical" : "horizontal";
        set({ boardDirection: next });
        get().calculateBoards();
        get().saveHistory();
      },

      setPolygon: (points) => {
        const baselineEdgeIndex =
          points.length >= 3 ? findBottomEdgeIndex(points) : null;
        const normalizedPolygon =
          baselineEdgeIndex === null
            ? points
            : rotatePolygonToHorizontalBaseline(points, baselineEdgeIndex);

        set({
          polygon: normalizedPolygon,
          cornerConstraints: {},
          baselineEdgeIndex,
        });
        get().calculateBoards();
        get().saveHistory();
      },

      updateEdgeLength: (edgeIndex, lengthMm) => {
        if (lengthMm <= 0) return;

        const { polygon, baselineEdgeIndex } = get();
        const n = polygon.length;
        if (n < 2) return;

        const startIndex = ((edgeIndex % n) + n) % n;
        const endIndex = (startIndex + 1) % n;

        const start = polygon[startIndex];
        const end = polygon[endIndex];

        const direction = { x: end.x - start.x, y: end.y - start.y };
        const currentLength = Math.hypot(direction.x, direction.y);
        if (currentLength === 0) return;

        const scale = lengthMm / currentLength;
        const newEnd = {
          x: start.x + direction.x * scale,
          y: start.y + direction.y * scale,
        };

        const delta = { x: newEnd.x - end.x, y: newEnd.y - end.y };
        const newPolygon = polygon.map((point) => ({ ...point }));
        newPolygon[endIndex] = newEnd;

        let k = (endIndex + 1) % n;
        while (k !== startIndex) {
          newPolygon[k] = {
            x: newPolygon[k].x + delta.x,
            y: newPolygon[k].y + delta.y,
          };
          k = (k + 1) % n;
        }

        let nextBaselineEdgeIndex = baselineEdgeIndex;
        if (nextBaselineEdgeIndex === null && newPolygon.length >= 3) {
          nextBaselineEdgeIndex = findBottomEdgeIndex(newPolygon);
        }

        const normalizedPolygon =
          nextBaselineEdgeIndex === null
            ? newPolygon
            : rotatePolygonToHorizontalBaseline(newPolygon, nextBaselineEdgeIndex);

        set({ polygon: normalizedPolygon, baselineEdgeIndex: nextBaselineEdgeIndex });
        get().calculateBoards();
        get().saveHistory();
      },

      setCornerAngle: (vertexIndex, angleDeg) => {
        const { polygon, cornerConstraints, baselineEdgeIndex } = get();
        if (polygon.length < 3) return;
        if (angleDeg <= 0 || angleDeg >= 360) return;

        let newPolygon = applyCornerAngleRotateForward(polygon, vertexIndex, angleDeg);
        const newConstraints = {
          ...cornerConstraints,
          [vertexIndex]: { locked: true, angleDeg },
        };

        let nextBaselineEdgeIndex = baselineEdgeIndex;
        if (nextBaselineEdgeIndex === null && newPolygon.length >= 3) {
          nextBaselineEdgeIndex = findBottomEdgeIndex(newPolygon);
        }

        newPolygon =
          nextBaselineEdgeIndex === null
            ? newPolygon
            : rotatePolygonToHorizontalBaseline(newPolygon, nextBaselineEdgeIndex);

        set({
          polygon: newPolygon,
          cornerConstraints: newConstraints,
          baselineEdgeIndex: nextBaselineEdgeIndex,
        });
        get().calculateBoards();
        get().saveHistory();
      },

      clearCornerAngle: (vertexIndex) => {
        const { cornerConstraints } = get();
        if (!cornerConstraints[vertexIndex]) return;
        const newConstraints = { ...cornerConstraints };
        delete newConstraints[vertexIndex];
        set({ cornerConstraints: newConstraints });
        get().saveHistory();
      },

      calculateBoards: () => {
        const { polygon, boardDirection } = get();
        if (polygon.length < 3) {
          set({ boards: [], boardPlan: null });
          return;
        }

        const boards: Board[] = [];
        const boardWidthWithGap = BOARD_WIDTH_MM + BOARD_GAP_MM;
        const bounds = getBounds(polygon);

        let totalWasteMm = 0;
        let totalOverflowMm = 0;
        let totalBoards = 0;
        let rowsWithBoards = 0;

        if (boardDirection === "horizontal") {
          const span = bounds.maxY - bounds.minY;
          const numRows = Math.ceil(span / boardWidthWithGap) + 1;
          for (let i = 0; i < numRows; i++) {
            const y = bounds.minY + i * boardWidthWithGap;
            const intersections = getHorizontalIntersections(polygon, y);
            if (intersections.length < 2) continue;
            rowsWithBoards += 1;
            for (let j = 0; j < intersections.length - 1; j += 2) {
              const startX = intersections[j];
              const endX = intersections[j + 1];
              const runLength = endX - startX;
              if (runLength <= 0) continue;

              const plan = planBoardsForRun(runLength);
              let cursor = startX;
              plan.boardLengths.forEach((length) => {
                boards.push({
                  id: generateId("board"),
                  start: { x: cursor, y },
                  end: { x: cursor + length, y },
                  length,
                });
                cursor += length;
              });

              totalWasteMm += plan.wasteMm;
              totalOverflowMm += plan.overflowMm;
              totalBoards += plan.boardLengths.length;
            }
          }
        } else {
          const span = bounds.maxX - bounds.minX;
          const numRows = Math.ceil(span / boardWidthWithGap) + 1;
          for (let i = 0; i < numRows; i++) {
            const x = bounds.minX + i * boardWidthWithGap;
            const intersections = getVerticalIntersections(polygon, x);
            if (intersections.length < 2) continue;
            rowsWithBoards += 1;
            for (let j = 0; j < intersections.length - 1; j += 2) {
              const startY = intersections[j];
              const endY = intersections[j + 1];
              const runLength = endY - startY;
              if (runLength <= 0) continue;

              const plan = planBoardsForRun(runLength);
              let cursor = startY;
              plan.boardLengths.forEach((length) => {
                boards.push({
                  id: generateId("board"),
                  start: { x, y: cursor },
                  end: { x, y: cursor + length },
                  length,
                });
                cursor += length;
              });

              totalWasteMm += plan.wasteMm;
              totalOverflowMm += plan.overflowMm;
              totalBoards += plan.boardLengths.length;
            }
          }
        }

        const areaMm2 = polygonArea(polygon);
        const boardPlan: DeckingBoardPlan = {
          boardLengthMm: MAX_BOARD_LENGTH_MM,
          boardWidthMm: BOARD_WIDTH_MM,
          numberOfRows: rowsWithBoards,
          averageBoardsPerRow: rowsWithBoards === 0 ? 0 : totalBoards / rowsWithBoards,
          totalBoards,
          totalWasteMm,
          averageOverflowMm: totalBoards === 0 ? 0 : totalOverflowMm / totalBoards,
          areaMm2,
          areaM2: areaMm2 / 1_000_000,
        };

        set({ boards, boardPlan });
      },

      getCuttingList: () => {
        const { boards } = get();

        const boardsByLength = new Map<number, number>();
        boards.forEach((board) => {
          const length = Math.round(board.length);
          boardsByLength.set(length, (boardsByLength.get(length) || 0) + 1);
        });

        const boardsList = Array.from(boardsByLength.entries())
          .map(([length, count]) => ({ length, count }))
          .sort((a, b) => b.length - a.length);

        const totalBoardLength = boards.reduce((sum, board) => sum + board.length, 0);

        return {
          boards: boardsList,
          clips: 0,
          totalBoardLength,
        };
      },

      clear: () => {
        set({
          polygon: [],
          boards: [],
          boardPlan: null,
          cornerConstraints: {},
          baselineEdgeIndex: null,
        });
        get().saveHistory();
      },

      undo: () => {
        const { history, historyIndex } = get();
        if (historyIndex > 0) {
          const newIndex = historyIndex - 1;
          const snapshot = history[newIndex];
          set({
            polygon: snapshot.polygon,
            boardDirection: snapshot.boardDirection,
            cornerConstraints: snapshot.cornerConstraints,
            baselineEdgeIndex: snapshot.baselineEdgeIndex,
            historyIndex: newIndex,
          });
          get().calculateBoards();
        }
      },

      redo: () => {
        const { history, historyIndex } = get();
        if (historyIndex < history.length - 1) {
          const newIndex = historyIndex + 1;
          const snapshot = history[newIndex];
          set({
            polygon: snapshot.polygon,
            boardDirection: snapshot.boardDirection,
            cornerConstraints: snapshot.cornerConstraints,
            baselineEdgeIndex: snapshot.baselineEdgeIndex,
            historyIndex: newIndex,
          });
          get().calculateBoards();
        }
      },

      saveHistory: () => {
        const {
          polygon,
          boardDirection,
          history,
          historyIndex,
          cornerConstraints,
          baselineEdgeIndex,
        } = get();
        const snapshot = {
          polygon: JSON.parse(JSON.stringify(polygon)),
          boardDirection,
          cornerConstraints: JSON.parse(JSON.stringify(cornerConstraints)),
          baselineEdgeIndex,
        };
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(snapshot);
        set({ history: newHistory, historyIndex: newHistory.length - 1 });
      },
    }),
    {
      name: "decking-storage",
    }
  )
);
