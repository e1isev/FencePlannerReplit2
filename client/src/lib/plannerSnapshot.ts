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
import { fencingModeFromProjectType } from "@/config/plannerOptions";

const MAP_VIEW_STORAGE_KEY = "map-overlay-view";

type FencingPlannerState = {
  productKind: ProductKind;
  fenceStyleId: FenceStyleId;
  fenceCategoryId: FenceCategoryId;
  fenceHeightM: FenceHeightM;
  fenceColorId: FenceColorId;
  selectedGateType: GateType;
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
  const map = new Map<string, number[]>(Object.entries(state.panelPositionsMap ?? {}));
  useAppStore.setState({
    productKind: state.productKind,
    fenceStyleId: state.fenceStyleId,
    fenceCategoryId: state.fenceCategoryId,
    fenceHeightM: state.fenceHeightM,
    fenceColorId: state.fenceColorId,
    selectedGateType: state.selectedGateType,
    drawingMode: state.drawingMode,
    mmPerPixel: state.mmPerPixel,
    selectedLineId: state.selectedLineId,
    lines: state.lines,
    gates: state.gates,
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
  type: ProjectType,
  name: string,
  dependencies: ProjectDependencies
): ProjectSnapshotV1 => {
  const nowIso = new Date().toISOString();
  if (type === "decking") {
    return {
      version: 1,
      type,
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
    type,
    name,
    plannerState: buildFencingPlannerState(),
    uiState: {},
    mapState: readMapState(),
    createdAt: nowIso,
    updatedAt: nowIso,
  };
};

export const hydratePlannerSnapshot = (snapshot: ProjectSnapshotV1) => {
  if (snapshot.type === "decking") {
    applyDeckingSnapshot(snapshot.plannerState as ProjectSnapshot);
    return;
  }

  applyFencingPlannerState(snapshot.plannerState as FencingPlannerState);
  writeMapState(snapshot.mapState);
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
