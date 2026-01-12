import { create } from "zustand";
import type {
  ProjectDependencies,
  ProjectExportPreview,
  ProjectMeta,
  ProjectSnapshot,
} from "@shared/project";
import { useDeckingStore } from "@/store/deckingStore";
import { buildDeckingBomLines } from "@/lib/deckingBom";
import {
  deserializeProject,
  parseSnapshot,
  serializeProject,
  stringifySnapshot,
} from "@/lib/projectSnapshot";
import type { ProjectState } from "@/types/project";

const DEFAULT_PROJECT_NAME = "Untitled deck";
const OFFLINE_QUEUE_KEY = "decking-pending-save";

type SaveStatus = "idle" | "saving" | "saved" | "error" | "offline" | "queued";

type ProjectListItem = {
  projectId: string;
  name: string;
  updatedAt: string;
  thumbnailUrl?: string | null;
};

type RevisionItem = {
  revisionId: string;
  savedAt: string;
  label?: string;
  author?: string;
};

type PricingTotals = {
  subtotal: number;
  tax: number;
  total: number;
  currency: string;
};

type PricingLine = {
  sku: string;
  qty: number;
  uom: string;
  unitPrice: number;
  lineTotal: number;
  warning?: string;
};

type PricingSummary = {
  lines: PricingLine[];
  totals: PricingTotals;
  warnings: string[];
};

type ProjectStoreState = {
  projectId: string | null;
  revisionId: string | null;
  projectMeta: ProjectMeta | null;
  dependencies: ProjectDependencies;
  saveStatus: SaveStatus;
  saveMessage: string | null;
  errorMessage: string | null;
  projectList: ProjectListItem[];
  revisionHistory: RevisionItem[];
  pricingSummary: PricingSummary | null;
  warnings: string[];
  setProjectName: (name: string) => void;
  fetchDependencies: () => Promise<void>;
  fetchProjectList: () => Promise<void>;
  fetchRevisionHistory: (projectId: string) => Promise<void>;
  saveCurrentProject: (options?: { manual?: boolean }) => Promise<void>;
  loadProject: (projectId: string, revisionId?: string) => Promise<void>;
  importSnapshot: (snapshotText: string) => Promise<void>;
  exportSnapshot: () => string;
  clearCacheAndReload: () => void;
  retryPendingSave: () => Promise<void>;
  resolvePricing: () => Promise<void>;
};

const ensureMeta = (current: ProjectMeta | null): ProjectMeta => {
  if (current) {
    return {
      ...current,
      name: current.name || DEFAULT_PROJECT_NAME,
    };
  }
  const nowIso = new Date().toISOString();
  return {
    name: DEFAULT_PROJECT_NAME,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
};

const buildProjectState = (): ProjectState => {
  const store = useDeckingStore.getState();
  return {
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
    uiState: {
      selectedDeckId: store.selectedDeckId ?? null,
      selectedBreakerId: store.selectedBreakerId ?? null,
      editingBreakerId: store.editingBreakerId ?? null,
    },
  };
};

const buildSnapshot = (
  meta: ProjectMeta,
  dependencies: ProjectDependencies,
  projectId?: string | null,
  revisionId?: string | null,
  preview?: ProjectExportPreview
): ProjectSnapshot => {
  const state = buildProjectState();
  return serializeProject({
    meta,
    dependencies,
    state,
    projectId: projectId ?? undefined,
    revisionId: revisionId ?? undefined,
    exports: preview,
  });
};

const queueOfflineSnapshot = (snapshot: ProjectSnapshot) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(OFFLINE_QUEUE_KEY, stringifySnapshot(snapshot));
};

const popOfflineSnapshot = (): ProjectSnapshot | null => {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(OFFLINE_QUEUE_KEY);
  if (!stored) return null;
  localStorage.removeItem(OFFLINE_QUEUE_KEY);
  return parseSnapshot(stored);
};

const updateSaveMessage = (status: SaveStatus): string => {
  switch (status) {
    case "saving":
      return "Saving…";
    case "saved":
      return "All changes saved";
    case "offline":
      return "Offline: changes queued";
    case "queued":
      return "Save queued";
    default:
      return "";
  }
};

export const useProjectStore = create<ProjectStoreState>((set, get) => ({
  projectId: null,
  revisionId: null,
  projectMeta: null,
  dependencies: {
    catalogVersion: "unknown",
    ruleSetVersion: "unknown",
  },
  saveStatus: "idle",
  saveMessage: null,
  errorMessage: null,
  projectList: [],
  revisionHistory: [],
  pricingSummary: null,
  warnings: [],
  setProjectName: (name) => {
    const meta = ensureMeta(get().projectMeta);
    set({ projectMeta: { ...meta, name } });
  },
  fetchDependencies: async () => {
    try {
      const [catalogRes, rulesRes] = await Promise.all([
        fetch("/api/catalog/version"),
        fetch("/api/rules/version"),
      ]);
      if (!catalogRes.ok || !rulesRes.ok) {
        throw new Error("Unable to fetch dependency versions.");
      }
      const catalog = (await catalogRes.json()) as { catalogVersion: string };
      const rules = (await rulesRes.json()) as { ruleSetVersion: string };
      set({
        dependencies: {
          catalogVersion: catalog.catalogVersion,
          ruleSetVersion: rules.ruleSetVersion,
        },
      });
    } catch (error) {
      set({
        errorMessage:
          error instanceof Error ? error.message : "Unable to fetch dependency versions.",
      });
    }
  },
  fetchProjectList: async () => {
    const response = await fetch("/api/projects");
    if (!response.ok) {
      set({ errorMessage: "Unable to load projects." });
      return;
    }
    const items = (await response.json()) as ProjectListItem[];
    set({ projectList: items });
  },
  fetchRevisionHistory: async (projectId) => {
    const response = await fetch(`/api/projects/${projectId}/revisions`);
    if (!response.ok) {
      set({ errorMessage: "Unable to load revision history." });
      return;
    }
    const items = (await response.json()) as RevisionItem[];
    set({ revisionHistory: items });
  },
  saveCurrentProject: async (options) => {
    const { dependencies } = get();
    const meta = ensureMeta(get().projectMeta);
    if (!get().projectMeta) {
      set({ projectMeta: meta });
    }
    const bomLines = buildDeckingBomLines();
    const preview = bomLines.length ? { bomLines } : undefined;

    const snapshot = buildSnapshot(
      { ...meta, updatedAt: new Date().toISOString() },
      dependencies,
      get().projectId,
      get().revisionId,
      preview
    );

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      queueOfflineSnapshot(snapshot);
      set({
        saveStatus: "offline",
        saveMessage: updateSaveMessage("offline"),
        errorMessage: null,
      });
      return;
    }

    set({
      saveStatus: "saving",
      saveMessage: updateSaveMessage("saving"),
      errorMessage: null,
    });

    try {
      let projectId = get().projectId;
      if (!projectId) {
        const createRes = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: meta.name }),
        });
        if (!createRes.ok) {
          throw new Error("Unable to create project.");
        }
        const created = (await createRes.json()) as { projectId: string };
        projectId = created.projectId;
      }

      const saveRes = await fetch(`/api/projects/${projectId}/revisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: stringifySnapshot({ ...snapshot, projectId }),
      });
      if (!saveRes.ok) {
        throw new Error("Unable to save project.");
      }
      const saved = (await saveRes.json()) as {
        revisionId: string;
        savedAt: string;
        catalogVersion: string;
        ruleSetVersion: string;
      };

      set({
        projectId,
        revisionId: saved.revisionId,
        projectMeta: { ...meta, updatedAt: saved.savedAt },
        dependencies: {
          catalogVersion: saved.catalogVersion,
          ruleSetVersion: saved.ruleSetVersion,
        },
        saveStatus: "saved",
        saveMessage: updateSaveMessage("saved"),
        errorMessage: null,
      });

      if (options?.manual) {
        void get().fetchProjectList();
      }
    } catch (error) {
      set({
        saveStatus: "error",
        saveMessage: null,
        errorMessage: error instanceof Error ? error.message : "Unable to save project.",
      });
    }
  },
  loadProject: async (projectId, revisionId) => {
    const url = revisionId
      ? `/api/projects/${projectId}/revisions/${revisionId}`
      : `/api/projects/${projectId}`;
    const response = await fetch(url);
    if (!response.ok) {
      set({ errorMessage: "Unable to load project." });
      return;
    }
    const snapshot = (await response.json()) as ProjectSnapshot;
    const { meta, dependencies, state, revisionId: loadedRevisionId } =
      deserializeProject(snapshot);
    useDeckingStore.getState().applyProjectState(state);
    set({
      projectId,
      revisionId: loadedRevisionId ?? null,
      projectMeta: meta,
      dependencies,
      saveStatus: "saved",
      saveMessage: updateSaveMessage("saved"),
      errorMessage: null,
      warnings: snapshot.exports?.warnings ?? [],
    });
    await get().resolvePricing();
    void get().fetchRevisionHistory(projectId);
  },
  importSnapshot: async (snapshotText) => {
    const snapshot = parseSnapshot(snapshotText);
    const { meta, dependencies, state, revisionId, projectId } =
      deserializeProject(snapshot);
    useDeckingStore.getState().applyProjectState(state);
    set({
      projectId: projectId ?? null,
      revisionId: revisionId ?? null,
      projectMeta: meta,
      dependencies,
      saveStatus: "saved",
      saveMessage: updateSaveMessage("saved"),
      errorMessage: null,
      warnings: snapshot.exports?.warnings ?? [],
    });
    await get().resolvePricing();
  },
  exportSnapshot: () => {
    const meta = ensureMeta(get().projectMeta);
    const bomLines = buildDeckingBomLines();
    const snapshot = buildSnapshot(
      { ...meta, updatedAt: new Date().toISOString() },
      get().dependencies,
      get().projectId,
      get().revisionId,
      bomLines.length ? { bomLines } : undefined
    );
    return stringifySnapshot(snapshot);
  },
  clearCacheAndReload: () => {
    if (typeof window === "undefined") return;
    localStorage.removeItem("decking-storage");
    localStorage.removeItem(OFFLINE_QUEUE_KEY);
    window.location.reload();
  },
  retryPendingSave: async () => {
    const pending = popOfflineSnapshot();
    if (!pending) return;
    set({
      saveStatus: "queued",
      saveMessage: updateSaveMessage("queued"),
    });
    const restored = deserializeProject(pending);
    useDeckingStore.getState().applyProjectState(restored.state);
    set({
      projectMeta: restored.meta,
      dependencies: restored.dependencies,
    });
    await get().saveCurrentProject({ manual: true });
  },
  resolvePricing: async () => {
    const bomLines = buildDeckingBomLines();
    if (bomLines.length === 0) {
      set({ pricingSummary: null });
      return;
    }
    try {
      const response = await fetch("/api/pricing/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bomLines }),
      });
      if (!response.ok) {
        throw new Error("Unable to resolve pricing.");
      }
      const data = (await response.json()) as {
        pricedLines: PricingLine[];
        totals: PricingTotals;
        warnings: string[];
      };
      set({
        pricingSummary: {
          lines: data.pricedLines,
          totals: data.totals,
          warnings: data.warnings ?? [],
        },
        warnings: data.warnings ?? [],
      });
    } catch (error) {
      set({
        errorMessage: error instanceof Error ? error.message : "Unable to resolve pricing.",
      });
    }
  },
}));
