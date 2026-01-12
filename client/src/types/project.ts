import type {
  DeckInput,
  ProjectDependencies,
  ProjectExportPreview,
  ProjectMeta,
  ProjectUiState,
  JoistSpacingMode,
} from "@shared/project";

export type ProjectState = {
  decks: DeckInput[];
  activeDeckId: string | null;
  joistSpacingMode: JoistSpacingMode;
  showClips: boolean;
  uiState: ProjectUiState;
};

export type ProjectSnapshotPayload = {
  projectId?: string;
  revisionId?: string;
  meta: ProjectMeta;
  dependencies: ProjectDependencies;
  state: ProjectState;
  exports?: ProjectExportPreview;
};
