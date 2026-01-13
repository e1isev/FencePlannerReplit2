import type { ProjectSnapshot } from "@shared/project";
import type { MapState, ProjectSnapshotV1, ProjectType } from "@shared/projectSnapshot";
import { deserializeProject, serializeProject } from "@/lib/projectSnapshot";
import { useDeckingStore } from "@/store/deckingStore";
import { useAppStore } from "@/store/appStore";
import type {
  FenceCategoryId,
  FenceStyleId,
  FenceLine,
  Gate,
  GateType,
  Leftover,
  PanelSegment,
  Post,
  ProductKind,
  WarningMsg,
} from "@/types/models";
import type { FenceHeightM } from "@/config/fenceHeights";
import type { FenceColorId } from "@/config/fenceColors";
import type { ProjectDependencies, ProjectMeta, ProjectUiState } from "@shared/project";
import { getDefaultFenceStyleId } from "@/config/fenceStyles";
import { DEFAULT_FENCE_HEIGHT_M } from "@/config/fenceHeights";
import { DEFAULT_FENCE_COLOR } from "@/config/fenceColors";
import { fencingModeFromProjectType } from "@/config/plannerOptions";
import { normalizeGateWidthMm } from "@/lib/gates/gateWidth";

const MAP_VIEW_STORAGE_KEY = "map-overlay-view";

type LegacyPlannerSnapshot = Partial<ProjectSnapshotV1> & {
  projectType?: unknown;
  type?: unknown;
  category?: unknown;
};

type FencingPlannerState = {
  productKind: ProductKind;
  fenceStyleId: FenceStyleId;
  fenceCategoryId: FenceCategoryId;
  fenceHeightM: FenceHeightM;
  fenceColorId: FenceColorId;
  selectedGateType: GateType;
  selectedGateId: string | null;
  drawingMode: boolean;
  mmPerPixel: number;
  selectedLineId: string | null;
  lines: FenceLine[];
  gates: Gate[];
  panels: PanelSegment[];
  posts: Post[];
  leftovers: Leftover[];
  warnings: WarningMsg[];
  panelPositionsMap: Record<string, number[]>;
};

const coerceProjectType = (value: unknown): ProjectType | null => {
  switch (value) {
    case "decking":
    case "residential":
    case "rural":
    case "titan_rail":
      return value;
    case "residential_fencing":
      return "residential";
    case "rural_fencing":
      return "rural";
    default:
      return null;
  }
};

export const normalizePlannerSnapshot = (
  snapshot: ProjectSnapshotV1 | LegacyPlannerSnapshot,
  fallbackProjectType?: ProjectType
): ProjectSnapshotV1 => {
  const legacy = snapshot as LegacyPlannerSnapshot;
  const resolvedProjectType =
    coerceProjectType(legacy.projectType) ??
    coerceProjectType(legacy.type) ??
    coerceProjectType(legacy.category) ??
    fallbackProjectType ??
    "residential";

  return {
    ...snapshot,
    projectType: resolvedProjectType,
  } as ProjectSnapshotV1;
};

const readMapState = (): MapState => {
  if (typeof window === "undefined") {
    return { center: [0, 0], zoom: 0, bearing: 0, pitch: 0 };
  }

  try {
    const stored = localStorage.getItem(MAP_VIEW_STORAGE_KEY);
    if (!stored) {
      return { center: [0, 0], zoom: 0, bearing: 0, pitch: 0 };
    }
    const parsed = JSON.parse(stored) as { center?: [number, number]; zoom?: number };
    if (!parsed.center || typeof parsed.zoom !== "number") {
      return { center: [0, 0], zoom: 0, bearing: 0, pitch: 0 };
    }
    return {
      center: parsed.center,
      zoom: parsed.zoom,
      bearing: 0,
      pitch: 0,
    };
  } catch {
    return { center: [0, 0], zoom: 0, bearing: 0, pitch: 0 };
  }
};

const writeMapState = (state?: MapState) => {
  if (!state || typeof window === "undefined") return;
  const payload = { center: state.center, zoom: state.zoom };
  localStorage.setItem(MAP_VIEW_STORAGE_KEY, JSON.stringify(payload));
};

const buildFencingPlannerState = (): FencingPlannerState => {
  const store = useAppStore.getState();
  return {
    productKind: store.productKind,
    fenceStyleId: store.fenceStyleId,
    fenceCategoryId: store.fenceCategoryId,
    fenceHeightM: store.fenceHeightM,
    fenceColorId: store.fenceColorId,
    selectedGateType: store.selectedGateType,
    selectedGateId: store.selectedGateId,
    drawingMode: store.drawingMode,
    mmPerPixel: store.mmPerPixel,
    selectedLineId: store.selectedLineId,
    lines: store.lines,
    gates: store.gates,
    panels: store.panels,
    posts: store.posts,
    leftovers: store.leftovers,
    warnings: store.warnings,
    panelPositionsMap: store.panelPositionsMap
      ? Object.fromEntries(store.panelPositionsMap)
      : {},
  };
};

const applyFencingPlannerState = (state: FencingPlannerState) => {
  const resolvedCategory =
    state.fenceCategoryId ?? (state.productKind === "Rural fencing" ? "rural" : "residential");
  const resolvedStyle = state.fenceStyleId ?? getDefaultFenceStyleId(resolvedCategory);
  const resolvedHeight = state.fenceHeightM ?? DEFAULT_FENCE_HEIGHT_M;
  const resolvedColor = state.fenceColorId ?? DEFAULT_FENCE_COLOR;
  const map = new Map<string, number[]>(Object.entries(state.panelPositionsMap ?? {}));
  const gates = (state.gates ?? []).map((gate) => {
    if (!gate.type.startsWith("sliding")) return gate;
    if (gate.slidingReturnSide) return gate;
    return {
      ...gate,
      slidingReturnSide: gate.slidingReturnDirection === "left" ? "a" : "b",
    };
  });
  const normalizedGates = gates.map((gate) => normalizeGateWidthMm(gate));
  useAppStore.setState({
    productKind: state.productKind ?? "Residential fencing",
    fenceStyleId: resolvedStyle,
    fenceCategoryId: resolvedCategory,
    fenceHeightM: resolvedHeight,
    fenceColorId: resolvedColor,
    selectedGateType: state.selectedGateType,
    selectedGateId: state.selectedGateId ?? null,
    drawingMode: state.drawingMode,
    mmPerPixel: state.mmPerPixel,
    selectedLineId: state.selectedLineId,
    lines: state.lines,
    gates: normalizedGates,
    panels: state.panels,
    posts: state.posts,
    leftovers: state.leftovers,
    warnings: state.warnings,
    panelPositionsMap: map,
  });
  useAppStore.getState().recalculate();
};

const buildDeckingSnapshot = (
  name: string,
  dependencies: ProjectDependencies
): ProjectSnapshot => {
  const store = useDeckingStore.getState();
  const nowIso = new Date().toISOString();
  const meta: ProjectMeta = {
    name,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  const uiState: ProjectUiState = {
    selectedDeckId: store.selectedDeckId ?? null,
    selectedBreakerId: store.selectedBreakerId ?? null,
    editingBreakerId: store.editingBreakerId ?? null,
  };

  return serializeProject({
    meta,
    dependencies,
    state: {
      decks: store.decks.map((deck) => ({
        id: deck.id,
        name: deck.name,
        polygon: JSON.parse(JSON.stringify(deck.polygon)),
        selectedColor: deck.selectedColor,
        boardDirection: deck.boardDirection,
        finishes: JSON.parse(JSON.stringify(deck.finishes)),
        pictureFrameBoardWidthMm: deck.pictureFrameBoardWidthMm,
        pictureFrameGapMm: deck.pictureFrameGapMm,
        fasciaThicknessMm: deck.fasciaThicknessMm,
        edgeConstraints: JSON.parse(JSON.stringify(deck.edgeConstraints ?? {})),
        baselineEdgeIndex: deck.baselineEdgeIndex ?? null,
        breakerLines: JSON.parse(JSON.stringify(deck.breakerLines ?? [])),
        joistSpacingMode: deck.joistSpacingMode ?? store.joistSpacingMode,
      })),
      activeDeckId: store.activeDeckId,
      joistSpacingMode: store.joistSpacingMode,
      showClips: store.showClips,
      uiState,
    },
  });
};

const applyDeckingSnapshot = (snapshot: ProjectSnapshot) => {
  const { state } = deserializeProject(snapshot);
  useDeckingStore.getState().applyProjectState(state);
};

export const serializePlannerSnapshot = (
  projectType: ProjectType,
  name: string,
  dependencies: ProjectDependencies
): ProjectSnapshotV1 => {
  const nowIso = new Date().toISOString();
  if (projectType === "decking") {
    return {
      version: 1,
      projectType,
      name,
      plannerState: buildDeckingSnapshot(name, dependencies),
      uiState: {},
      mapState: undefined,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  }

  return {
    version: 1,
    projectType,
    name,
    plannerState: buildFencingPlannerState(),
    uiState: {},
    mapState: readMapState(),
    createdAt: nowIso,
    updatedAt: nowIso,
  };
};

export const hydratePlannerSnapshot = (snapshot: ProjectSnapshotV1) => {
  const normalized = normalizePlannerSnapshot(snapshot);
  if (normalized.projectType === "decking") {
    applyDeckingSnapshot(normalized.plannerState as ProjectSnapshot);
    return;
  }

  applyFencingPlannerState(normalized.plannerState as FencingPlannerState);
  writeMapState(normalized.mapState);
};

export const initializePlannerState = (type: ProjectType) => {
  if (type === "decking") {
    useDeckingStore.getState().clearAllDecks();
    return;
  }

  const mode = fencingModeFromProjectType(type);
  const defaultCategory: FenceCategoryId = mode === "rural" ? "rural" : "residential";
  const defaultStyle = getDefaultFenceStyleId(defaultCategory);
  useAppStore.getState().clear();
  useAppStore.setState({
    productKind: mode === "rural" ? "Rural fencing" : "Residential fencing",
    fenceCategoryId: defaultCategory,
    fenceStyleId: defaultStyle,
  });
  useAppStore.getState().recalculate();
};
