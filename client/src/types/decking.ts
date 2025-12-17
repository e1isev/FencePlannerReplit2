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

export type EdgeLockMode = "locked" | "unlocked";

export interface EdgeConstraint {
  mode: EdgeLockMode;
  lengthMm?: number;
}

export interface Board {
  id: string;
  start: Point;
  end: Point;
  length: number;
  kind?: "field" | "breaker" | "pictureFrame" | "fascia";
  runId?: string;
  segmentIndex?: number;
  segmentCount?: number;
  isRunStart?: boolean;
  isRunEnd?: boolean;
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
  pictureFrame: {
    length: number;
    count: number;
  }[];
  fascia: {
    length: number;
    count: number;
  }[];
  clips: number;
  totalBoardLength: number;
  totalFasciaLength: number;
}

export interface DeckingBoardPlan {
  boardLengthMm: number;
  boardWidthMm: number;
  numberOfRows: number;
  averageBoardsPerRow: number;
  totalBoards: number;
  totalWasteMm: number;
  averageOverflowMm: number;
  areaMm2: number;
  areaM2: number;
}

export interface PolygonBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface DeckingSelectionState {
  selectedDeckId: string | null;
  pendingDeleteDeckId: string | null;
}

export interface DeckEntity {
  id: string;
  name: string;
  polygon: Point[];
  infillPolygon: Point[];
  boards: Board[];
  breakerBoards: Board[];
  pictureFramePieces: Point[][];
  fasciaPieces: Point[][];
  selectedColor: DeckColor;
  boardDirection: BoardDirection;
  boardPlan: DeckingBoardPlan | null;
  finishes: {
    pictureFrameEnabled: boolean;
    fasciaEnabled: boolean;
    breakerBoardsEnabled: boolean;
  };
  pictureFrameBoardWidthMm: number;
  pictureFrameGapMm: number;
  pictureFrameWarning: string | null;
  fasciaThicknessMm: number;
  edgeConstraints: Record<number, EdgeConstraint>;
  baselineEdgeIndex: number | null;
}

export interface CornerConstraint {
  angleDeg: number;
}
