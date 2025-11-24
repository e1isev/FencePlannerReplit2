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
  DeckingBoardPlan,
  DeckingCuttingList,
  Point,
} from "@/types/decking";

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
  history: Array<{ polygon: Point[]; boardDirection: BoardDirection }>;
  historyIndex: number;

  setSelectedColor: (color: DeckColor) => void;
  toggleBoardDirection: () => void;
  setPolygon: (points: Point[]) => void;
  calculateBoards: () => void;
  getCuttingList: () => DeckingCuttingList;
  updateEdgeLength: (edgeIndex: number, lengthMm: number) => void;
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
        set({ polygon: points });
        get().calculateBoards();
        get().saveHistory();
      },

      updateEdgeLength: (edgeIndex, lengthMm) => {
        if (lengthMm <= 0) return;

        const { polygon } = get();
        if (polygon.length < 2) return;

        const startIndex = ((edgeIndex % polygon.length) + polygon.length) % polygon.length;
        const endIndex = (startIndex + 1) % polygon.length;

        const start = polygon[startIndex];
        const end = polygon[endIndex];

        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const currentLength = Math.sqrt(dx * dx + dy * dy);
        if (currentLength === 0) return;

        const scale = lengthMm / currentLength;
        const newEnd = {
          x: start.x + dx * scale,
          y: start.y + dy * scale,
        };

        const newPolygon = polygon.map((point, idx) => {
          if (idx === endIndex) return newEnd;
          if (endIndex === 0 && idx === 0) return newEnd;
          return point;
        });

        set({ polygon: newPolygon });
        get().calculateBoards();
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
        set({ polygon: [], boards: [], boardPlan: null });
        get().saveHistory();
      },

      undo: () => {
        const { history, historyIndex } = get();
        if (historyIndex > 0) {
          const newIndex = historyIndex - 1;
          const snapshot = history[newIndex];
          set({ polygon: snapshot.polygon, boardDirection: snapshot.boardDirection, historyIndex: newIndex });
          get().calculateBoards();
        }
      },

      redo: () => {
        const { history, historyIndex } = get();
        if (historyIndex < history.length - 1) {
          const newIndex = historyIndex + 1;
          const snapshot = history[newIndex];
          set({ polygon: snapshot.polygon, boardDirection: snapshot.boardDirection, historyIndex: newIndex });
          get().calculateBoards();
        }
      },

      saveHistory: () => {
        const { polygon, boardDirection, history, historyIndex } = get();
        const snapshot = {
          polygon: JSON.parse(JSON.stringify(polygon)),
          boardDirection,
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
