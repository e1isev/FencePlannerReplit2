export type ShapeType = "square" | "rectangle" | "triangle";

export type BoardDirection = "horizontal" | "vertical";

export type DeckColor =
  | "storm-granite"
  | "mallee-bark"
  | "ironbark-ember"
  | "saltbush-veil"
  | "outback"
  | "coastal-spiniflex"
  | "wild-shore"
  | "coastal-sandstone";

export interface Point {
  x: number;
  y: number;
}

export interface DeckShape {
  id: string;
  type: ShapeType;
  position: Point;
  width: number;
  height: number;
  rotation: number;
}

export interface Board {
  id: string;
  start: Point;
  end: Point;
  length: number;
}

export interface Clip {
  id: string;
  position: Point;
  boardCount: number; // 3 or 2.5 if snapped
}

export interface DeckingCuttingList {
  boards: {
    length: number;
    count: number;
  }[];
  clips: number;
  totalBoardLength: number;
}
