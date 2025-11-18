import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  ShapeType,
  BoardDirection,
  DeckColor,
  DeckShape,
  Board,
  Clip,
  DeckingCuttingList,
  Point,
  DeckingBoardPlan,
} from "@/types/decking";
import {
  BOARD_WIDTH_MM,
  BOARD_GAP_MM,
  JOIST_SPACING_MM,
  MAX_BOARD_LENGTH_MM,
  buildSnapContext,
  doRectanglesOverlap,
  type Rect,
  shapeToRect,
  mmToPx,
  pxToMm,
  GRID_SIZE_MM,
  SNAP_TOLERANCE_PX,
  BOARD_OVERFLOW_ALLOWANCE_MM,
  snapToGrid,
} from "@/lib/deckingGeometry";

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

const DEFAULT_TOLERANCE_MM = pxToMm(SNAP_TOLERANCE_PX);

interface DeckingState {
  shapes: DeckShape[];
  selectedShapeType: ShapeType | null;
  selectedShapeId: string | null;
  selectedColor: DeckColor;
  boardDirection: BoardDirection;
  boards: Board[];
  clips: Clip[];
  boardPlan: DeckingBoardPlan | null;
  history: Array<{
    shapes: DeckShape[];
    boardDirection: BoardDirection;
  }>;
  historyIndex: number;

  setSelectedShapeType: (type: ShapeType | null) => void;
  setSelectedShapeId: (id: string | null) => void;
  setSelectedColor: (color: DeckColor) => void;
  toggleBoardDirection: () => void;
  addShape: (position: Point, width: number, height: number) => void;
  updateShape: (id: string, updates: Partial<DeckShape>) => void;
  deleteShape: (id: string) => void;
  calculateBoards: () => void;
  getCuttingList: () => DeckingCuttingList;
  clear: () => void;
  undo: () => void;
  redo: () => void;
  saveHistory: () => void;
}

export const useDeckingStore = create<DeckingState>()(
  persist(
    (set, get) => ({
      shapes: [],
      selectedShapeType: null,
      selectedShapeId: null,
      selectedColor: "mallee-bark",
      boardDirection: "horizontal",
      boards: [],
      clips: [],
      boardPlan: null,
      history: [],
      historyIndex: -1,

      setSelectedShapeType: (type) => set({ selectedShapeType: type }),
      setSelectedShapeId: (id) => set({ selectedShapeId: id }),
      setSelectedColor: (color) => set({ selectedColor: color }),

      toggleBoardDirection: () => {
        const current = get().boardDirection;
        const newDirection: BoardDirection =
          current === "horizontal" ? "vertical" : "horizontal";
        set({ boardDirection: newDirection });
        get().calculateBoards();
        get().saveHistory();
      },

      addShape: (position, width, height) => {
        const { selectedShapeType, shapes } = get();
        if (!selectedShapeType) return;

        const normalizedWidth = Math.max(MIN_SIZE_MM, snapToGrid(width, GRID_SIZE_MM));
        const normalizedHeight = Math.max(MIN_SIZE_MM, snapToGrid(height, GRID_SIZE_MM));

        const newShape: DeckShape = {
          id: generateId("shape"),
          type: selectedShapeType,
          position: {
            x: snapToGrid(position.x, GRID_SIZE_MM),
            y: snapToGrid(position.y, GRID_SIZE_MM),
          },
          width: normalizedWidth,
          height: normalizedHeight,
          rotation: 0,
        };

        const snappedRect = snapRectWithContext(
          shapeToRect(newShape),
          shapes.map(shapeToRect)
        );
        newShape.position = { x: snappedRect.x, y: snappedRect.y };
        newShape.width = snappedRect.width;
        newShape.height = snappedRect.height;

        const newRect = shapeToRect(newShape);
        const hasOverlap = shapes.some((existing) =>
          doRectanglesOverlap(newRect, shapeToRect(existing))
        );

        if (hasOverlap) {
          console.warn("Cannot place shape: would overlap with existing shape");
          return;
        }

        set({ shapes: [...shapes, newShape] });
        get().calculateBoards();
        get().saveHistory();
      },

      updateShape: (id, updates) => {
        const shapes = get().shapes;
        const shape = shapes.find((s) => s.id === id);
        if (!shape) return;

        const otherRects = shapes
          .filter((s) => s.id !== id)
          .map((other) => shapeToRect(other));

        const proposedRect: Rect = {
          x: snapToGrid(updates.position?.x ?? shape.position.x, GRID_SIZE_MM),
          y: snapToGrid(updates.position?.y ?? shape.position.y, GRID_SIZE_MM),
          width: snapToGrid(
            Math.max(MIN_SIZE_MM, updates.width ?? shape.width),
            GRID_SIZE_MM
          ),
          height: snapToGrid(
            Math.max(MIN_SIZE_MM, updates.height ?? shape.height),
            GRID_SIZE_MM
          ),
        };

        const mode: "move" | "resize" =
          typeof updates.width === "number" || typeof updates.height === "number"
            ? "resize"
            : "move";

        const snappedRect = snapRectWithContext(proposedRect, otherRects, mode);

        const hasOverlap = otherRects.some((existing) =>
          doRectanglesOverlap(snappedRect, existing)
        );

        if (hasOverlap) {
          console.warn("Cannot update shape: would overlap with existing shape");
          return;
        }

        const updatedShape: DeckShape = {
          ...shape,
          ...updates,
          position: { x: snappedRect.x, y: snappedRect.y },
          width: snappedRect.width,
          height: snappedRect.height,
        };

        const updatedShapes = shapes.map((s) => (s.id === id ? updatedShape : s));

        set({ shapes: updatedShapes });
        get().calculateBoards();
        get().saveHistory();
      },

      deleteShape: (id) => {
        const shapes = get().shapes.filter((shape) => shape.id !== id);
        set({ shapes });
        get().calculateBoards();
        get().saveHistory();
      },

      calculateBoards: () => {
        const { shapes, boardDirection } = get();
        const boards: Board[] = [];
        const clips: Clip[] = [];

        const toleranceMm = DEFAULT_TOLERANCE_MM;
        const boardWidthWithGap = BOARD_WIDTH_MM + BOARD_GAP_MM;
        const isHorizontalDirection = boardDirection === "horizontal";
        const lineIntervals = new Map<number, Interval[]>();

        const findLineKey = (value: number): number => {
          for (const key of lineIntervals.keys()) {
            if (Math.abs(key - value) <= toleranceMm) return key;
          }
          return value;
        };

        const registerInterval = (lineCoord: number, interval: Interval) => {
          const key = findLineKey(lineCoord);
          const intervals = lineIntervals.get(key) || [];
          intervals.push(interval);
          lineIntervals.set(key, intervals);
        };

        shapes.forEach((shape) => {
          if (shape.type === "rectangle" || shape.type === "square") {
            const spanLength = isHorizontalDirection ? shape.width : shape.height;
            const spanWidth = isHorizontalDirection ? shape.height : shape.width;
            const numBoards = Math.ceil(spanWidth / boardWidthWithGap);

            for (let i = 0; i < numBoards; i++) {
              const offset = i * boardWidthWithGap;
              const lineCoord = isHorizontalDirection
                ? shape.position.y + offset
                : shape.position.x + offset;
              const interval: Interval = isHorizontalDirection
                ? { start: shape.position.x, end: shape.position.x + spanLength }
                : { start: shape.position.y, end: shape.position.y + spanLength };

              registerInterval(lineCoord, interval);
              const intervals = lineIntervals.get(key) || [];
              intervals.push(interval);
              lineIntervals.set(key, intervals);
            }

            // Clip estimation remains per-shape for now
            const effectiveBoardRunLength = Math.min(spanLength, MAX_BOARD_LENGTH_MM);
            const joistCount = Math.max(2, Math.ceil(effectiveBoardRunLength / JOIST_SPACING_MM) + 1);
            const joistSpacing = effectiveBoardRunLength / (joistCount - 1);

            for (let j = 0; j < joistCount; j++) {
              const joistOffset = j * joistSpacing;
              for (let b = 0; b < numBoards; b++) {
                const boardOffset = b * boardWidthWithGap;
                const isEdge = b === 0 || b === numBoards - 1;
                const boardCount = isEdge ? 2.5 : 3;

                if (isHorizontalDirection) {
                  clips.push({
                    id: generateId("clip"),
                    position: {
                      x: shape.position.x + joistOffset,
                      y: shape.position.y + boardOffset,
                    },
                    boardCount,
                  });
                } else {
                  clips.push({
                    id: generateId("clip"),
                    position: {
                      x: shape.position.x + boardOffset,
                      y: shape.position.y + joistOffset,
                    },
                    boardCount,
                  });
                }
              }
            }
          }
        });

        let totalWasteMm = 0;
        let totalOverflowMm = 0;
        let totalBoards = 0;
        let triangleRows = 0;

        lineIntervals.forEach((intervals, lineKey) => {
          const mergedIntervals = mergeIntervals(intervals, toleranceMm);

          mergedIntervals.forEach((interval) => {
            const runLength = interval.end - interval.start;
            if (runLength <= 0) return;

            const plan = planBoardsForRun(runLength);
            totalWasteMm += plan.wasteMm;
            totalOverflowMm += plan.overflowMm;
            totalBoards += plan.boardLengths.length;

            let cursor = interval.start;

            plan.boardLengths.forEach((boardLength) => {
              const boardId = generateId("board");

              if (isHorizontalDirection) {
                boards.push({
                  id: boardId,
                  start: { x: cursor, y: lineKey },
                  end: { x: cursor + boardLength, y: lineKey },
                  length: boardLength,
                });
              } else {
                boards.push({
                  id: boardId,
                  start: { x: lineKey, y: cursor },
                  end: { x: lineKey, y: cursor + boardLength },
                  length: boardLength,
                });
              }

              cursor += boardLength;
            });
          });
        });

        // Triangles retain their bespoke layout logic
        shapes
          .filter((shape) => shape.type === "triangle")
          .forEach((shape) => {
            const isHorizontal = boardDirection === "horizontal";
            const numBoards = Math.ceil((isHorizontal ? shape.height : shape.width) / boardWidthWithGap);
            triangleRows += numBoards;

            for (let i = 0; i < numBoards; i++) {
              const offset = i * boardWidthWithGap;

              if (isHorizontal) {
                const yPos = shape.position.y + offset;
                const progress = offset / shape.height;
                const boardLength = Math.min(shape.width * (1 - progress), MAX_BOARD_LENGTH_MM);

                if (boardLength > 0) {
                  boards.push({
                    id: generateId("board"),
                    start: {
                      x: shape.position.x,
                      y: yPos,
                    },
                    end: {
                      x: shape.position.x + boardLength,
                      y: yPos,
                    },
                    length: boardLength,
                  });
                  totalBoards += 1;
                  totalWasteMm += Math.max(0, MAX_BOARD_LENGTH_MM - boardLength);
                }
              } else {
                const xPos = shape.position.x + shape.width - offset;
                const progress = offset / shape.width;
                const boardLength = Math.min(shape.height * (1 - progress), MAX_BOARD_LENGTH_MM);

                if (boardLength > 0) {
                  boards.push({
                    id: generateId("board"),
                    start: {
                      x: xPos,
                      y: shape.position.y + shape.height - boardLength,
                    },
                    end: {
                      x: xPos,
                      y: shape.position.y + shape.height,
                    },
                    length: boardLength,
                  });
                  totalBoards += 1;
                  totalWasteMm += Math.max(0, MAX_BOARD_LENGTH_MM - boardLength);
                }
              }
            }
          });

        const numberOfRows = lineIntervals.size + triangleRows;
        const boardPlan: DeckingBoardPlan = {
          boardLengthMm: MAX_BOARD_LENGTH_MM,
          boardWidthMm: BOARD_WIDTH_MM,
          numberOfRows,
          averageBoardsPerRow: numberOfRows ? totalBoards / numberOfRows : 0,
          totalBoards,
          totalWasteMm,
          averageOverflowMm: numberOfRows ? totalOverflowMm / Math.max(1, lineIntervals.size) : 0,
        };

        set({ boards, clips, boardPlan });
      },

      getCuttingList: () => {
        const { boards, clips } = get();

        const boardsByLength = new Map<number, number>();
        boards.forEach((board) => {
          const length = Math.round(board.length);
          boardsByLength.set(length, (boardsByLength.get(length) || 0) + 1);
        });

        const boardsList = Array.from(boardsByLength.entries())
          .map(([length, count]) => ({ length, count }))
          .sort((a, b) => b.length - a.length);

        const totalBoardLength = boards.reduce(
          (sum, board) => sum + board.length,
          0
        );

        let totalClipsNeeded = 0;
        clips.forEach((clip) => {
          totalClipsNeeded += Math.ceil(clip.boardCount / 3);
        });

        return {
          boards: boardsList,
          clips: totalClipsNeeded,
          totalBoardLength,
        };
      },

      clear: () => {
        set({
          shapes: [],
          boards: [],
          clips: [],
          selectedShapeType: null,
          boardPlan: null,
        });
        get().saveHistory();
      },

      undo: () => {
        const { history, historyIndex } = get();
        if (historyIndex > 0) {
          const newIndex = historyIndex - 1;
          const snapshot = history[newIndex];
          set({
            shapes: snapshot.shapes,
            boardDirection: snapshot.boardDirection,
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
            shapes: snapshot.shapes,
            boardDirection: snapshot.boardDirection,
            historyIndex: newIndex,
          });
          get().calculateBoards();
        }
      },

      saveHistory: () => {
        const { shapes, boardDirection, history, historyIndex } = get();
        const snapshot = {
          shapes: JSON.parse(JSON.stringify(shapes)),
          boardDirection,
        };
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(snapshot);
        set({
          history: newHistory,
          historyIndex: newHistory.length - 1,
        });
      },
    }),
    {
      name: "decking-storage",
    }
  )
);
