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

export type BreakerAxis = "x" | "y";

export interface BreakerLine {
  id: string;
  axis: BreakerAxis;
  posMm: number;
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
  rowIndex?: number;
  rowCount?: number;
}

export interface Clip {
  id: string;
  position: Point;
  boardCount: number; // 3 or 2.5 if snapped
}

export type DeckCutItemKind = "field" | "breaker" | "pictureFrame" | "fascia";

export interface DeckCutListItem {
  label: string;
  lengthMm: number;
  count: number;
  kind: DeckCutItemKind;
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
  starterClips: number;
  fasciaClips: number;
  deckClipsForFascia: number;
  totalBoardLength: number;
  totalFasciaLength: number;
}

export type JoistSpacingMode = "commercial" | "residential";

export interface ClipSummary {
  joistCount: number;
  rowCount: number;
  deckClips: number;
  starterClips: number;
  fasciaClips: number;
  deckClipsForFascia: number;
  joistSpacingMm: number;
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
  breakerLines: BreakerLine[];
  pictureFramePieces: Point[][];
  fasciaPieces: Point[][];
  selectedColor: DeckColor;
  boardDirection: BoardDirection;
  boardPlan: DeckingBoardPlan | null;
  rowCount: number;
  clipSummary: ClipSummary | null;
  joistSpacingMode: JoistSpacingMode;
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

export interface DeckRenderModel {
  id: string;
  name: string;
  polygon: Point[];
  infillPolygon: Point[];
  boards: Board[];
  breakerBoards: Board[];
  breakerLines: BreakerLine[];
  pictureFramePieces: Point[][];
  fasciaPieces: Point[][];
  clips: Clip[];
  selectedColor: DeckColor;
  boardDirection: BoardDirection;
  finishes: DeckEntity["finishes"];
}

export interface DeckReport {
  id: string;
  name: string;
  boardDirection: BoardDirection;
  selectedColor: DeckColor;
  finishes: DeckEntity["finishes"];
  boardPlan: DeckingBoardPlan | null;
  cuttingList: DeckCutListItem[];
  areaM2: number;
  perimeterMm: number;
  rowCount: number;
  joistCount: number;
  clipCount: number;
  fasciaClipCount: number;
  deckClipsSnappedForFascia: number;
  totals: {
    boardPieces: number;
    totalPieces: number;
    boardLinealMm: number;
    fasciaLinealMm: number;
    totalLinealMm: number;
  };
}

export interface DeckReportTotals {
  boardPieces: number;
  totalPieces: number;
  boardLinealMm: number;
  fasciaLinealMm: number;
  totalLinealMm: number;
  totalClips: number;
  totalFasciaClips: number;
  totalDeckClipsSnappedForFascia: number;
}
