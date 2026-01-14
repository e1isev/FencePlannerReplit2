import { create } from "zustand";
import { shallow } from "zustand/shallow";
import type { ProjectSnapshotV1, ProjectType } from "@shared/projectSnapshot";
import { serializePlannerSnapshot, hydratePlannerSnapshot, initializePlannerState } from "@/lib/plannerSnapshot";
import {
  readPersistedProjects,
  writePersistedProjects,
  type LocalProject,
} from "@/lib/persistedProjects";
import { useAuthStore } from "@/store/authStore";

export type ProjectSummary = {
  id: string;
  name: string;
  projectType: ProjectType;
  updatedAt: string;
};

type ProjectSessionState = {
  projectId: string | null;
  localId: string | null;
  projectType: ProjectType | null;
  projectName: string;
  dependencies: { catalogVersion: string; ruleSetVersion: string };
  saveStatus: "idle" | "saving" | "saved" | "local" | "error";
  errorMessage: string | null;
  lastSavedAt: string | null;
  projectsById: Record<string, LocalProject>;
  activeProjectId: string | null;
  hasBootstrapped: boolean;
  sessionIntent: "new" | "restore" | null;
  setSessionIntent: (intent: "new" | "restore" | null) => void;
  setProjectName: (name: string) => void;
  refreshDependencies: () => Promise<void>;
  startNewProject: (projectType: ProjectType, name: string) => void;
  updateActiveProjectSnapshot: (snapshot: ProjectSnapshotV1) => void;
  restoreActiveProject: () => boolean;
  loadProject: (projectId: string) => Promise<void>;
  loadGuestProject: (localId: string) => void;
  saveProject: () => Promise<void>;
  saveGuestToAccount: (localId: string) => Promise<boolean>;
};

const DEFAULT_DEPENDENCIES = { catalogVersion: "unknown", ruleSetVersion: "unknown" };
const persistedState = readPersistedProjects();

const buildLocalProject = (
  snapshot: ProjectSnapshotV1,
  name: string,
  id: string,
  updatedAt: string
): LocalProject => {
  const plannerState = snapshot.plannerState as {
    fenceStyleId?: LocalProject["styleId"];
  };
  return {
    id,
    name,
    projectType: snapshot.projectType,
    styleId: plannerState?.fenceStyleId ?? null,
    updatedAt,
    snapshot,
  };
};

const debounce = (callback: () => void, delayMs: number) => {
  let timer: number | null = null;
  return () => {
    if (timer) {
      window.clearTimeout(timer);
    }
    timer = window.setTimeout(callback, delayMs);
  };
};

export const useProjectSessionStore = create<ProjectSessionState>((set, get) => ({
  projectId: null,
  localId: null,
  projectType: null,
  projectName: "Untitled project",
  dependencies: DEFAULT_DEPENDENCIES,
  saveStatus: "idle",
  errorMessage: null,
  lastSavedAt: null,
  projectsById: persistedState.projectsById,
  activeProjectId: persistedState.activeProjectId,
  hasBootstrapped: false,
  sessionIntent: null,
  setSessionIntent: (intent) => set({ sessionIntent: intent }),
  setProjectName: (name) => set({ projectName: name }),
  refreshDependencies: async () => {
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
      set({ dependencies: { catalogVersion: catalog.catalogVersion, ruleSetVersion: rules.ruleSetVersion } });
    } catch (error) {
      set({ errorMessage: error instanceof Error ? error.message : "Unable to fetch dependencies." });
    }
  },
  startNewProject: (projectType, name) => {
    const dependencies = get().dependencies;
    const nowIso = new Date().toISOString();
    const localId = `local-${crypto.randomUUID()}`;
    initializePlannerState(projectType);
    const snapshot = serializePlannerSnapshot(projectType, name, dependencies);
    const projectRecord = buildLocalProject(snapshot, name, localId, nowIso);
    set({
      projectId: null,
      localId,
      projectType,
      projectName: name,
      projectsById: {
        ...get().projectsById,
        [localId]: projectRecord,
      },
      activeProjectId: localId,
      saveStatus: "idle",
      errorMessage: null,
      lastSavedAt: null,
      sessionIntent: "new",
      hasBootstrapped: true,
    });
    if (projectType === "rural" && projectRecord.projectType !== "rural") {
      console.error(`Project type invariant failed for ${localId}.`);
    }
  },
  updateActiveProjectSnapshot: (snapshot) => {
    const { activeProjectId, projectsById, projectName, projectType } = get();
    if (!activeProjectId || !projectType) return;
    const existing = projectsById[activeProjectId];
    if (!existing) return;
    const updatedAt = new Date().toISOString();
    set({
      projectsById: {
        ...projectsById,
        [activeProjectId]: {
          ...existing,
          name: projectName,
          projectType,
          snapshot,
          updatedAt,
        },
      },
      lastSavedAt: updatedAt,
    });
  },
  restoreActiveProject: () => {
    const { activeProjectId, projectsById, sessionIntent, hasBootstrapped } = get();
    if (sessionIntent === "new" || hasBootstrapped) return false;
    if (!activeProjectId) return false;
    const project = projectsById[activeProjectId];
    if (!project) return false;
    hydratePlannerSnapshot(project.snapshot);
    set({
      projectId: null,
      localId: project.id,
      projectType: project.projectType,
      projectName: project.name,
      lastSavedAt: project.updatedAt,
      saveStatus: "local",
      errorMessage: null,
      sessionIntent: "restore",
      hasBootstrapped: true,
    });
    return true;
  },
  loadProject: async (projectId) => {
    const response = await fetch(`/api/projects/${projectId}`);
    if (!response.ok) {
      set({ errorMessage: "Unable to load project." });
      return;
    }
    const payload = (await response.json()) as {
      id: string;
      name: string;
      projectType: ProjectType;
      snapshot: ProjectSnapshotV1;
      updatedAt: string;
    };
    hydratePlannerSnapshot(payload.snapshot);
    set({
      projectId: payload.id,
      localId: null,
      projectType: payload.projectType,
      projectName: payload.name,
      lastSavedAt: payload.updatedAt,
      saveStatus: "idle",
      errorMessage: null,
      sessionIntent: "restore",
      hasBootstrapped: true,
    });
  },
  loadGuestProject: (localId) => {
    const project = get().projectsById[localId];
    if (!project) {
      set({ errorMessage: "Guest project not found." });
      return;
    }
    hydratePlannerSnapshot(project.snapshot);
    set({
      projectId: null,
      localId: project.id,
      projectType: project.projectType,
      projectName: project.name,
      lastSavedAt: project.updatedAt,
      saveStatus: "local",
      errorMessage: null,
      activeProjectId: project.id,
      sessionIntent: "restore",
      hasBootstrapped: true,
    });
  },
  saveProject: async () => {
    const {
      projectType,
      projectName,
      projectId,
      localId,
      dependencies,
      projectsById,
    } = get();
    if (!projectType) return;
    const snapshot = serializePlannerSnapshot(projectType, projectName, dependencies);
    const authUser = useAuthStore.getState().user;

    if (!authUser) {
      const resolvedLocalId = localId ?? `local-${crypto.randomUUID()}`;
        const updatedAt = new Date().toISOString();
        set({
          localId: resolvedLocalId,
          activeProjectId: resolvedLocalId,
          projectsById: {
            ...projectsById,
            [resolvedLocalId]: buildLocalProject(snapshot, projectName, resolvedLocalId, updatedAt),
          },
          saveStatus: "local",
        lastSavedAt: updatedAt,
        sessionIntent: "restore",
        hasBootstrapped: true,
      });
      return;
    }

    set({ saveStatus: "saving" });
    try {
      if (!projectId) {
        const createRes = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: projectName,
            projectType,
            snapshot,
          }),
        });
        if (!createRes.ok) {
          throw new Error("Unable to create project.");
        }
        const created = (await createRes.json()) as { id: string };
        set({
          projectId: created.id,
          saveStatus: "saved",
          lastSavedAt: new Date().toISOString(),
        });
      } else {
        const updateRes = await fetch(`/api/projects/${projectId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: projectName, snapshot }),
        });
        if (!updateRes.ok) {
          throw new Error("Unable to save project.");
        }
        const updated = (await updateRes.json()) as { updatedAt: string };
        set({ saveStatus: "saved", lastSavedAt: updated.updatedAt });
      }
      if (localId) {
        const nextProjects = { ...get().projectsById };
        delete nextProjects[localId];
        set({ localId: null, projectsById: nextProjects, activeProjectId: null });
      }
    } catch (error) {
      set({
        saveStatus: "error",
        errorMessage: error instanceof Error ? error.message : "Unable to save project.",
      });
    }
  },
  saveGuestToAccount: async (localId) => {
    const authUser = useAuthStore.getState().user;
    if (!authUser) return false;
    const project = get().projectsById[localId];
    if (!project) return false;
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: project.name,
        projectType: project.projectType,
        snapshot: project.snapshot,
      }),
    });
    if (!response.ok) {
      return false;
    }
    const nextProjects = { ...get().projectsById };
    delete nextProjects[localId];
    set({
      projectsById: nextProjects,
      activeProjectId: get().activeProjectId === localId ? null : get().activeProjectId,
    });
    return true;
  },
}));

const persistDebounced = debounce(() => {
  const { projectsById, activeProjectId } = useProjectSessionStore.getState();
  writePersistedProjects({ projectsById, activeProjectId });
}, 400);

useProjectSessionStore.subscribe(
  (state) => ({
    projectsById: state.projectsById,
    activeProjectId: state.activeProjectId,
  }),
  () => {
    if (typeof window === "undefined") return;
    persistDebounced();
  },
  {
    equalityFn: shallow,
  }
);

export const loadGuestProjectSummaries = () => {
  const { projectsById } = useProjectSessionStore.getState();
  return Object.values(projectsById).map((project) => ({
    id: project.id,
    name: project.name,
    projectType: project.projectType,
    updatedAt: project.updatedAt,
  }));
};
