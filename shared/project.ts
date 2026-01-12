export type ProjectSchemaVersion = "1.0.0";

export type ProjectDependencies = {
  catalogVersion: string;
  ruleSetVersion: string;
};

export type ProjectMeta = {
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectUiState = {
  selectedDeckId: string | null;
  selectedBreakerId: string | null;
  editingBreakerId: string | null;
};

export type ProjectExportPreview = {
  bomLines?: Array<{
    sku: string;
    qty: number;
    uom: string;
    attributes?: Record<string, unknown>;
  }>;
  pricingTotals?: {
    subtotal: number;
    tax: number;
    total: number;
    currency: string;
  };
  warnings?: string[];
};

export type Point = {
  x: number;
  y: number;
};

export type JoistSpacingMode = "commercial" | "residential";

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

export type EdgeConstraint = {
  mode: "free" | "locked";
  lengthMm?: number;
};

export type BreakerLine = {
  id: string;
  axis: "horizontal" | "vertical";
  posMm: number;
};

export type DeckInput = {
  id: string;
  name: string;
  polygon: Point[];
  selectedColor: DeckColor;
  boardDirection: BoardDirection;
  finishes: {
    pictureFrameEnabled: boolean;
    fasciaEnabled: boolean;
    breakerBoardsEnabled: boolean;
  };
  pictureFrameBoardWidthMm: number;
  pictureFrameGapMm: number;
  fasciaThicknessMm: number;
  edgeConstraints: Record<number, EdgeConstraint>;
  baselineEdgeIndex: number | null;
  breakerLines: BreakerLine[];
  joistSpacingMode: JoistSpacingMode;
};

export type ProjectInputs = {
  geometry: {
    decks: DeckInput[];
  };
  selections: {
    activeDeckId: string | null;
  };
  constraints: {
    joistSpacingMode: JoistSpacingMode;
    showClips: boolean;
  };
};

export type ProjectSnapshot = {
  schemaVersion: ProjectSchemaVersion;
  projectId?: string;
  revisionId?: string;
  projectMeta: ProjectMeta;
  dependencies: ProjectDependencies;
  inputs: ProjectInputs;
  uiState?: ProjectUiState;
  exports?: ProjectExportPreview;
};
