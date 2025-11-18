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
} from "@/types/decking";
import {
  BOARD_WIDTH_MM,
  BOARD_GAP_MM,
  JOIST_SPACING_MM,
  MAX_BOARD_LENGTH_MM,
  doRectanglesOverlap,
  findSnapPosition,
  shapeToRect,
  mmToPx,
} from "@/lib/deckingGeometry";

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

interface DeckingState {
  shapes: DeckShape[];
  selectedShapeType: ShapeType | null;
  selectedShapeId: string | null;
  selectedColor: DeckColor;
  boardDirection: BoardDirection;
  boards: Board[];
  clips: Clip[];
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

        let finalPosition = position;

        const tempShape = {
          position,
          width,
          height,
        };

        const snapPos = findSnapPosition(
          shapeToRect(tempShape),
          shapes.map(shapeToRect)
        );
        if (snapPos) {
          finalPosition = snapPos;
        }

        const newShape: DeckShape = {
          id: generateId("shape"),
          type: selectedShapeType,
          position: finalPosition,
          width,
          height,
          rotation: 0,
        };

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
        const updatedShapes = get().shapes.map((shape) =>
          shape.id === id ? { ...shape, ...updates } : shape
        );

        const updatedShape = updatedShapes.find((s) => s.id === id);
        if (updatedShape && updates.position) {
          const tempRect = shapeToRect(updatedShape);
          const otherShapes = updatedShapes.filter((s) => s.id !== id);
          
          const snapPos = findSnapPosition(tempRect, otherShapes.map(shapeToRect));
          if (snapPos) {
            updatedShape.position = snapPos;
            updatedShapes[updatedShapes.findIndex((s) => s.id === id)] = updatedShape;
          }

          const finalRect = shapeToRect(updatedShape);
          const hasOverlap = otherShapes.some((existing) =>
            doRectanglesOverlap(finalRect, shapeToRect(existing))
          );

          if (hasOverlap) {
            console.warn("Cannot update shape: would overlap with existing shape");
            return;
          }
        }

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

        const isShapeAdjacent = (shape1: DeckShape, shape2: DeckShape, isHorizontal: boolean): boolean => {
          const tolerance = 10;
          if (isHorizontal) {
            const rightEdge1 = shape1.position.x + shape1.width;
            const leftEdge2 = shape2.position.x;
            const edgesTouch = Math.abs(rightEdge1 - leftEdge2) < tolerance;
            
            const top1 = shape1.position.y;
            const bottom1 = shape1.position.y + shape1.height;
            const top2 = shape2.position.y;
            const bottom2 = shape2.position.y + shape2.height;
            const verticalOverlap = !(bottom1 < top2 || bottom2 < top1);
            
            return edgesTouch && verticalOverlap;
          } else {
            const bottomEdge1 = shape1.position.y + shape1.height;
            const topEdge2 = shape2.position.y;
            const edgesTouch = Math.abs(bottomEdge1 - topEdge2) < tolerance;
            
            const left1 = shape1.position.x;
            const right1 = shape1.position.x + shape1.width;
            const left2 = shape2.position.x;
            const right2 = shape2.position.x + shape2.width;
            const horizontalOverlap = !(right1 < left2 || right2 < left1);
            
            return edgesTouch && horizontalOverlap;
          }
        };

        const findAdjacentShape = (currentShape: DeckShape, isHorizontal: boolean): DeckShape | null => {
          for (const otherShape of shapes) {
            if (otherShape.id !== currentShape.id && 
                (otherShape.type === "rectangle" || otherShape.type === "square") &&
                (currentShape.type === "rectangle" || currentShape.type === "square")) {
              if (isShapeAdjacent(currentShape, otherShape, isHorizontal)) {
                return otherShape;
              }
            }
          }
          return null;
        };

        const processedBoards = new Set<string>();

        shapes.forEach((shape) => {
          if (shape.type === "square" || shape.type === "rectangle") {
            const isHorizontal = boardDirection === "horizontal";
            const boardRunLength = isHorizontal ? shape.width : shape.height;
            const boardRunWidth = isHorizontal ? shape.height : shape.width;

            const boardWidthWithGap = BOARD_WIDTH_MM + BOARD_GAP_MM;
            const numBoards = Math.ceil(boardRunWidth / boardWidthWithGap);

            for (let i = 0; i < numBoards; i++) {
              const offset = i * boardWidthWithGap;
              const boardKey = `${shape.id}-${i}`;
              
              if (processedBoards.has(boardKey)) continue;
              processedBoards.add(boardKey);

              let totalLength = isHorizontal ? shape.width : shape.height;
              let endX = isHorizontal ? shape.position.x + shape.width : shape.position.x + offset;
              let endY = isHorizontal ? shape.position.y + offset : shape.position.y + shape.height;

              let currentShape: DeckShape | null = shape;
              const visitedShapes = new Set<string>([shape.id]);
              
              while (currentShape && totalLength < MAX_BOARD_LENGTH_MM) {
                const adjacentShape = findAdjacentShape(currentShape, isHorizontal);
                if (!adjacentShape || visitedShapes.has(adjacentShape.id)) break;
                
                visitedShapes.add(adjacentShape.id);
                const additionalLength = isHorizontal ? adjacentShape.width : adjacentShape.height;
                
                if (totalLength + additionalLength > MAX_BOARD_LENGTH_MM) {
                  const remainingLength = MAX_BOARD_LENGTH_MM - totalLength;
                  if (isHorizontal) {
                    endX += remainingLength;
                  } else {
                    endY += remainingLength;
                  }
                  totalLength = MAX_BOARD_LENGTH_MM;
                  break;
                } else {
                  totalLength += additionalLength;
                  if (isHorizontal) {
                    endX = adjacentShape.position.x + adjacentShape.width;
                  } else {
                    endY = adjacentShape.position.y + adjacentShape.height;
                  }
                  currentShape = adjacentShape;
                }
              }

              const finalLength = Math.min(totalLength, MAX_BOARD_LENGTH_MM);
              
              const boardId = generateId("board");
              if (isHorizontal) {
                boards.push({
                  id: boardId,
                  start: {
                    x: shape.position.x,
                    y: shape.position.y + offset,
                  },
                  end: {
                    x: shape.position.x + finalLength,
                    y: shape.position.y + offset,
                  },
                  length: finalLength,
                });
              } else {
                boards.push({
                  id: boardId,
                  start: {
                    x: shape.position.x + offset,
                    y: shape.position.y,
                  },
                  end: {
                    x: shape.position.x + offset,
                    y: shape.position.y + finalLength,
                  },
                  length: finalLength,
                });
              }
            }

            const effectiveBoardRunLength = Math.min(boardRunLength, MAX_BOARD_LENGTH_MM);
            const joistCount = Math.max(2, Math.ceil(effectiveBoardRunLength / JOIST_SPACING_MM) + 1);
            const joistSpacing = effectiveBoardRunLength / (joistCount - 1);

            for (let j = 0; j < joistCount; j++) {
              const joistOffset = j * joistSpacing;
              for (let b = 0; b < numBoards; b++) {
                const boardOffset = b * boardWidthWithGap;
                const isEdge = b === 0 || b === numBoards - 1;
                const boardCount = isEdge ? 2.5 : 3;

                if (isHorizontal) {
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
          } else if (shape.type === "triangle") {
            const isHorizontal = boardDirection === "horizontal";
            const boardWidthWithGap = BOARD_WIDTH_MM + BOARD_GAP_MM;
            const numBoards = Math.ceil((isHorizontal ? shape.height : shape.width) / boardWidthWithGap);

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
                }
              }
            }
          }
        });

        set({ boards, clips });
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
