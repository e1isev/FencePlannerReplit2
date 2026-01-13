import type { ProjectSnapshotV1, ProjectType } from "@shared/projectSnapshot";
import type { FenceCategoryId, FenceStyleId } from "@/types/models";

export type LocalProject = {
  id: string;
  name: string;
  type: ProjectType;
  category: FenceCategoryId | null;
  styleId: FenceStyleId | null;
  updatedAt: string;
  snapshot: ProjectSnapshotV1;
};

type PersistedProjectsState = {
  schemaVersion: number;
  projectsById: Record<string, LocalProject>;
  activeProjectId: string | null;
};

const PROJECTS_KEY = "fencePlanner.projectsById";
const ACTIVE_PROJECT_KEY = "fencePlanner.activeProjectId";
const SCHEMA_VERSION_KEY = "fencePlanner.schemaVersion";
const LEGACY_GUEST_PROJECTS_KEY = "guest-projects";
const LEGACY_LAST_PROJECT_KEY = "lastProject";
const CURRENT_SCHEMA_VERSION = 1;

const isProjectType = (value: unknown): value is ProjectType =>
  value === "decking" ||
  value === "residential_fencing" ||
  value === "rural_fencing" ||
  value === "titan_rail";

const ensureProjectType = (value: unknown): ProjectType =>
  isProjectType(value) ? value : "residential_fencing";

const inferCategory = (type: ProjectType): FenceCategoryId | null => {
  if (type === "rural_fencing") return "rural";
  if (type === "residential_fencing") return "residential";
  return null;
};

const normalizeProject = (project: Partial<LocalProject>): LocalProject | null => {
  if (!project.id || !project.snapshot) return null;
  const snapshot = project.snapshot as ProjectSnapshotV1;
  const type = ensureProjectType(project.type ?? snapshot.type);
  const plannerState = snapshot.plannerState as {
    fenceCategoryId?: FenceCategoryId;
    fenceStyleId?: FenceStyleId;
  };

  return {
    id: project.id,
    name: project.name ?? snapshot.name ?? "Untitled project",
    type,
    category: project.category ?? plannerState?.fenceCategoryId ?? inferCategory(type),
    styleId: project.styleId ?? plannerState?.fenceStyleId ?? null,
    updatedAt: project.updatedAt ?? snapshot.updatedAt ?? new Date().toISOString(),
    snapshot: {
      ...snapshot,
      type,
      name: project.name ?? snapshot.name ?? "Untitled project",
    },
  };
};

const toJsonSafe = (value: unknown, seen = new WeakSet<object>()): unknown => {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "undefined" || typeof value === "function" || typeof value === "symbol") {
    return undefined;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof Map) {
    return Array.from(value.entries())
      .map(([key, entry]) => [toJsonSafe(key, seen), toJsonSafe(entry, seen)])
      .filter(([key, entry]) => key !== undefined && entry !== undefined);
  }
  if (value instanceof Set) {
    return Array.from(value.values())
      .map((entry) => toJsonSafe(entry, seen))
      .filter((entry) => entry !== undefined);
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => toJsonSafe(entry, seen))
      .filter((entry) => entry !== undefined);
  }
  if (typeof value === "object") {
    if (seen.has(value)) return undefined;
    seen.add(value);
    const result: Record<string, unknown> = {};
    Object.entries(value).forEach(([key, entry]) => {
      const safeEntry = toJsonSafe(entry, seen);
      if (safeEntry !== undefined) {
        result[key] = safeEntry;
      }
    });
    return result;
  }
  return undefined;
};

const hydrateFromLegacy = (): PersistedProjectsState | null => {
  if (typeof window === "undefined") return null;
  const legacyRaw = localStorage.getItem(LEGACY_GUEST_PROJECTS_KEY);
  if (legacyRaw) {
    try {
      const legacyProjects = JSON.parse(legacyRaw) as Array<{
        localId?: string;
        name?: string;
        type?: ProjectType;
        updatedAt?: string;
        snapshot?: ProjectSnapshotV1;
      }>;
      if (Array.isArray(legacyProjects) && legacyProjects.length > 0) {
        const projectsById = legacyProjects.reduce<Record<string, LocalProject>>((acc, item) => {
          const id = item.localId ?? `local-${crypto.randomUUID()}`;
          const normalized = normalizeProject({
            id,
            name: item.name ?? "Untitled project",
            type: item.type,
            updatedAt: item.updatedAt,
            snapshot: item.snapshot,
          });
          if (normalized) {
            acc[id] = normalized;
          }
          return acc;
        }, {});
        const activeProjectId = legacyProjects[0]?.localId ?? Object.keys(projectsById)[0] ?? null;
        localStorage.removeItem(LEGACY_GUEST_PROJECTS_KEY);
        return {
          schemaVersion: CURRENT_SCHEMA_VERSION,
          projectsById,
          activeProjectId,
        };
      }
    } catch {
      return null;
    }
  }

  const legacyLast = localStorage.getItem(LEGACY_LAST_PROJECT_KEY);
  if (legacyLast) {
    try {
      const legacyProject = JSON.parse(legacyLast) as Partial<LocalProject> & { snapshot?: ProjectSnapshotV1 };
      const id = legacyProject.id ?? `local-${crypto.randomUUID()}`;
      const normalized = normalizeProject({
        ...legacyProject,
        id,
        snapshot: legacyProject.snapshot,
      });
      localStorage.removeItem(LEGACY_LAST_PROJECT_KEY);
      if (normalized) {
        return {
          schemaVersion: CURRENT_SCHEMA_VERSION,
          projectsById: { [id]: normalized },
          activeProjectId: id,
        };
      }
    } catch {
      return null;
    }
  }

  return null;
};

export const readPersistedProjects = (): PersistedProjectsState => {
  if (typeof window === "undefined") {
    return { schemaVersion: CURRENT_SCHEMA_VERSION, projectsById: {}, activeProjectId: null };
  }

  const hydratedLegacy = hydrateFromLegacy();
  if (hydratedLegacy) return hydratedLegacy;

  const rawProjects = localStorage.getItem(PROJECTS_KEY);
  const rawActiveId = localStorage.getItem(ACTIVE_PROJECT_KEY);
  const rawVersion = localStorage.getItem(SCHEMA_VERSION_KEY);

  const schemaVersion = rawVersion ? Number(rawVersion) || CURRENT_SCHEMA_VERSION : CURRENT_SCHEMA_VERSION;
  let projectsById: Record<string, LocalProject> = {};

  if (rawProjects) {
    try {
      const parsed = JSON.parse(rawProjects) as Record<string, Partial<LocalProject>>;
      projectsById = Object.entries(parsed ?? {}).reduce<Record<string, LocalProject>>((acc, [id, project]) => {
        const normalized = normalizeProject({ ...project, id });
        if (normalized) {
          acc[id] = normalized;
        }
        return acc;
      }, {});
    } catch {
      projectsById = {};
    }
  }

  const activeProjectId = rawActiveId && projectsById[rawActiveId] ? rawActiveId : null;

  return {
    schemaVersion,
    projectsById,
    activeProjectId,
  };
};

export const writePersistedProjects = (input: {
  projectsById: Record<string, LocalProject>;
  activeProjectId: string | null;
}) => {
  if (typeof window === "undefined") return;
  const safeState = toJsonSafe({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    projectsById: input.projectsById,
    activeProjectId: input.activeProjectId,
  }) as PersistedProjectsState;
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(safeState.projectsById ?? {}));
  if (safeState.activeProjectId) {
    localStorage.setItem(ACTIVE_PROJECT_KEY, safeState.activeProjectId);
  } else {
    localStorage.removeItem(ACTIVE_PROJECT_KEY);
  }
  localStorage.setItem(SCHEMA_VERSION_KEY, String(safeState.schemaVersion ?? CURRENT_SCHEMA_VERSION));
};
