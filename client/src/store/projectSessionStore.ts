import { create } from "zustand";
import type { ProjectSnapshotV1, ProjectType } from "@shared/projectSnapshot";
import { serializePlannerSnapshot, hydratePlannerSnapshot, initializePlannerState } from "@/lib/plannerSnapshot";
import { listGuestProjects, removeGuestProject, saveGuestProject, getGuestProject } from "@/lib/guestProjects";
import { useAuthStore } from "@/store/authStore";

export type ProjectSummary = {
  id: string;
  name: string;
  type: ProjectType;
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
  setProjectName: (name: string) => void;
  refreshDependencies: () => Promise<void>;
  startNewProject: (type: ProjectType, name: string) => void;
  loadProject: (projectId: string) => Promise<void>;
  loadGuestProject: (localId: string) => void;
  saveProject: () => Promise<void>;
  saveGuestToAccount: (localId: string) => Promise<boolean>;
};

const DEFAULT_DEPENDENCIES = { catalogVersion: "unknown", ruleSetVersion: "unknown" };

export const useProjectSessionStore = create<ProjectSessionState>((set, get) => ({
  projectId: null,
  localId: null,
  projectType: null,
  projectName: "Untitled project",
  dependencies: DEFAULT_DEPENDENCIES,
  saveStatus: "idle",
  errorMessage: null,
  lastSavedAt: null,
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
  startNewProject: (type, name) => {
    initializePlannerState(type);
    set({
      projectId: null,
      localId: null,
      projectType: type,
      projectName: name,
      saveStatus: "idle",
      errorMessage: null,
    });
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
      type: ProjectType;
      snapshot: ProjectSnapshotV1;
      updatedAt: string;
    };
    hydratePlannerSnapshot(payload.snapshot);
    set({
      projectId: payload.id,
      localId: null,
      projectType: payload.type,
      projectName: payload.name,
      lastSavedAt: payload.updatedAt,
      saveStatus: "idle",
      errorMessage: null,
    });
  },
  loadGuestProject: (localId) => {
    const project = getGuestProject(localId);
    if (!project) {
      set({ errorMessage: "Guest project not found." });
      return;
    }
    hydratePlannerSnapshot(project.snapshot);
    set({
      projectId: null,
      localId: project.localId,
      projectType: project.type,
      projectName: project.name,
      lastSavedAt: project.updatedAt,
      saveStatus: "local",
      errorMessage: null,
    });
  },
  saveProject: async () => {
    const { projectType, projectName, projectId, localId, dependencies } = get();
    if (!projectType) return;
    const snapshot = serializePlannerSnapshot(projectType, projectName, dependencies);
    const authUser = useAuthStore.getState().user;

    if (!authUser) {
      const resolvedLocalId = localId ?? `local-${crypto.randomUUID()}`;
      saveGuestProject({
        localId: resolvedLocalId,
        name: projectName,
        type: projectType,
        updatedAt: new Date().toISOString(),
        snapshot,
      });
      set({
        localId: resolvedLocalId,
        saveStatus: "local",
        lastSavedAt: new Date().toISOString(),
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
            type: projectType,
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
        removeGuestProject(localId);
        set({ localId: null });
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
    const project = getGuestProject(localId);
    if (!project) return false;
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: project.name,
        type: project.type,
        snapshot: project.snapshot,
      }),
    });
    if (!response.ok) {
      return false;
    }
    removeGuestProject(localId);
    return true;
  },
}));

export const loadGuestProjectSummaries = () =>
  listGuestProjects().map((project) => ({
    id: project.localId,
    name: project.name,
    type: project.type,
    updatedAt: project.updatedAt,
  }));
