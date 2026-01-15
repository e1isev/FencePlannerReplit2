import type {
  DeckInput,
  ProjectDependencies,
  ProjectExportPreview,
  ProjectMeta,
  ProjectSnapshot,
  ProjectUiState,
} from "@shared/project";
import type { DeckEntity } from "@/types/decking";
import type { ProjectState, ProjectSnapshotPayload } from "@/types/project";

const SCHEMA_VERSION: ProjectSnapshot["schemaVersion"] = "1.0.0";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export const buildDeckInput = (deck: DeckEntity): DeckInput => ({
  id: deck.id,
  name: deck.name,
  polygon: clone(deck.polygon),
  selectedColor: deck.selectedColor,
  boardDirection: deck.boardDirection,
  finishes: clone(deck.finishes),
  pictureFrameBoardWidthMm: deck.pictureFrameBoardWidthMm,
  pictureFrameGapMm: deck.pictureFrameGapMm,
  fasciaThicknessMm: deck.fasciaThicknessMm,
  edgeConstraints: clone(deck.edgeConstraints ?? {}),
  baselineEdgeIndex: deck.baselineEdgeIndex ?? null,
  breakerLines: clone(deck.breakerLines ?? []),
  joistSpacingMode: deck.joistSpacingMode ?? "residential",
});

export const serializeProject = (payload: ProjectSnapshotPayload): ProjectSnapshot => {
  const { meta, dependencies, state, projectId, revisionId, exports: preview } = payload;

  return {
    schemaVersion: SCHEMA_VERSION,
    projectId,
    revisionId,
    projectMeta: meta,
    dependencies,
    inputs: {
      geometry: {
        decks: state.decks,
      },
      selections: {
        activeDeckId: state.activeDeckId,
      },
      constraints: {
        joistSpacingMode: state.joistSpacingMode,
        showClips: state.showClips,
      },
    },
    uiState: state.uiState,
    exports: preview,
  };
};

const isSnapshot = (value: unknown): value is ProjectSnapshot =>
  Boolean(value && typeof value === "object" && "schemaVersion" in (value as ProjectSnapshot));

type DeserializedProject = {
  projectId?: string;
  revisionId?: string;
  meta: ProjectMeta;
  dependencies: ProjectDependencies;
  state: ProjectState;
  exports?: ProjectExportPreview;
};

const migrateSnapshot = (snapshot: ProjectSnapshot): ProjectSnapshot => {
  if (snapshot.schemaVersion === SCHEMA_VERSION) {
    return snapshot;
  }

  return {
    ...snapshot,
    schemaVersion: SCHEMA_VERSION,
  };
};

export const deserializeProject = (snapshot: ProjectSnapshot): DeserializedProject => {
  const normalized = migrateSnapshot(snapshot);
  const uiState: ProjectUiState = {
    selectedDeckId: normalized.uiState?.selectedDeckId ?? null,
    selectedBreakerId: normalized.uiState?.selectedBreakerId ?? null,
    editingBreakerId: normalized.uiState?.editingBreakerId ?? null,
  };

  return {
    projectId: normalized.projectId,
    revisionId: normalized.revisionId,
    meta: normalized.projectMeta,
    dependencies: normalized.dependencies,
    state: {
      decks: normalized.inputs.geometry.decks ?? [],
      activeDeckId: normalized.inputs.selections.activeDeckId ?? null,
      joistSpacingMode: normalized.inputs.constraints.joistSpacingMode ?? "residential",
      showClips: normalized.inputs.constraints.showClips ?? false,
      uiState,
    },
    exports: normalized.exports,
  };
};

const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => [key, sortKeys(val)]);
    return Object.fromEntries(entries);
  }

  return value;
};

export const stringifySnapshot = (snapshot: ProjectSnapshot): string => {
  const sorted = sortKeys(snapshot);
  return JSON.stringify(sorted, null, 2);
};

export const parseSnapshot = (jsonText: string): ProjectSnapshot => {
  const parsed = JSON.parse(jsonText) as unknown;
  if (!isSnapshot(parsed)) {
    throw new Error("Invalid project snapshot.");
  }
  return parsed;
};
