import type { ProjectSnapshotV1 } from "@shared/projectSnapshot";

export type GuestProject = {
  localId: string;
  name: string;
  projectType: ProjectSnapshotV1["projectType"];
  updatedAt: string;
  snapshot: ProjectSnapshotV1;
};

const GUEST_PROJECTS_KEY = "guest-projects";

const loadAll = (): GuestProject[] => {
  if (typeof window === "undefined") return [];
  const stored = localStorage.getItem(GUEST_PROJECTS_KEY);
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored) as GuestProject[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const persistAll = (projects: GuestProject[]) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(GUEST_PROJECTS_KEY, JSON.stringify(projects));
};

export const listGuestProjects = () => loadAll();

export const saveGuestProject = (project: GuestProject) => {
  const projects = loadAll();
  const next = projects.filter((item) => item.localId !== project.localId);
  next.unshift(project);
  persistAll(next);
};

export const removeGuestProject = (localId: string) => {
  const projects = loadAll();
  persistAll(projects.filter((item) => item.localId !== localId));
};

export const getGuestProject = (localId: string) =>
  loadAll().find((item) => item.localId === localId) ?? null;
