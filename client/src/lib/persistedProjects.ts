import type { ProjectSnapshotV1, ProjectType } from "@shared/projectSnapshot";
import type { FenceStyleId } from "@/types/models";
import { normalizePlannerSnapshot } from "@/lib/plannerSnapshot";

export type LocalProject = {
  id: string;
  name: string;
  projectType: ProjectType;
  styleId: FenceStyleId | null;
  updatedAt: string;
  snapshot: ProjectSnapshotV1;
};

type PersistedProjectsState = {
  schemaVersion: number;
  projectsById: Record<string, LocalProject>;
  activeProjectId: string | null;
};

const PROJECTS_KEY = "fencePlanner.persistedProjects";
const LEGACY_PROJECTS_KEY = "fencePlanner.projectsById";
const LEGACY_ACTIVE_PROJECT_KEY = "fencePlanner.activeProjectId";
const LEGACY_SCHEMA_VERSION_KEY = "fencePlanner.schemaVersion";
const LEGACY_GUEST_PROJECTS_KEY = "guest-projects";
const LEGACY_LAST_PROJECT_KEY = "lastProject";
const CURRENT_SCHEMA_VERSION = 2;

const isProjectType = (value: unknown): value is ProjectType =>
  value === "decking" ||
  value === "residential" ||
  value === "rural" ||
  value === "titan_rail";

const ensureProjectType = (value: unknown): ProjectType => {
  if (isProjectType(value)) return value;
  if (value === "residential_fencing") return "residential";
  if (value === "rural_fencing") return "rural";
  return "residential";
};

const normalizeProject = (project: Partial<LocalProject>): LocalProject | null => {
  if (!project.id || !project.snapshot) return null;
  const legacyProject = project as Partial<LocalProject> & { type?: unknown; category?: unknown };
  const normalizedSnapshot = normalizePlannerSnapshot(
    project.snapshot as ProjectSnapshotV1,
    ensureProjectType(project.projectType ?? legacyProject.type ?? legacyProject.category)
  );
  const projectType = ensureProjectType(project.projectType ?? normalizedSnapshot.projectType);
  const plannerState = normalizedSnapshot.plannerState as {
    fenceStyleId?: FenceStyleId;
  };
  const resolvedSnapshot =
    normalizedSnapshot.projectType === projectType
      ? normalizedSnapshot
      : { ...normalizedSnapshot, projectType };

  return {
    id: project.id,
    name: project.name ?? normalizedSnapshot.name ?? "Untitled project",
    projectType,
    styleId: project.styleId ?? plannerState?.fenceStyleId ?? null,
    updatedAt: project.updatedAt ?? normalizedSnapshot.updatedAt ?? new Date().toISOString(),
    snapshot: {
      ...resolvedSnapshot,
      name: project.name ?? normalizedSnapshot.name ?? "Untitled project",
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
        type?: unknown;
        updatedAt?: string;
        snapshot?: ProjectSnapshotV1;
      }>;
      if (Array.isArray(legacyProjects) && legacyProjects.length > 0) {
        const projectsById = legacyProjects.reduce<Record<string, LocalProject>>((acc, item) => {
          const id = item.localId ?? `local-${crypto.randomUUID()}`;
          const normalized = normalizeProject({
            id,
            name: item.name ?? "Untitled project",
            projectType: ensureProjectType(item.type),
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
      const legacyProject = JSON.parse(legacyLast) as Partial<LocalProject> & {
        type?: unknown;
        category?: unknown;
        snapshot?: ProjectSnapshotV1;
      };
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

  const rawState = localStorage.getItem(PROJECTS_KEY);
  const rawProjects = localStorage.getItem(LEGACY_PROJECTS_KEY);
  const rawActiveId = localStorage.getItem(LEGACY_ACTIVE_PROJECT_KEY);
  const rawVersion = localStorage.getItem(LEGACY_SCHEMA_VERSION_KEY);

  let schemaVersion = rawVersion ? Number(rawVersion) || CURRENT_SCHEMA_VERSION : CURRENT_SCHEMA_VERSION;
  let projectsById: Record<string, LocalProject> = {};
  let activeProjectId: string | null = null;

  if (rawState) {
    try {
      const parsed = JSON.parse(rawState) as Partial<PersistedProjectsState> & {
        projectsById?: Record<string, Partial<LocalProject>>;
      };
      if (parsed.projectsById && typeof parsed.projectsById === "object") {
        schemaVersion = typeof parsed.schemaVersion === "number" ? parsed.schemaVersion : schemaVersion;
        activeProjectId = typeof parsed.activeProjectId === "string" ? parsed.activeProjectId : null;
        projectsById = Object.entries(parsed.projectsById ?? {}).reduce<Record<string, LocalProject>>(
          (acc, [id, project]) => {
            const normalized = normalizeProject({ ...project, id });
            if (normalized) {
              acc[id] = normalized;
            }
            return acc;
          },
          {}
        );
      }
    } catch {
      projectsById = {};
    }
  }

  if (!rawState && rawProjects) {
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

  if (!activeProjectId) {
    activeProjectId = rawActiveId && projectsById[rawActiveId] ? rawActiveId : null;
  }
  if (activeProjectId && !projectsById[activeProjectId]) {
    activeProjectId = null;
  }

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
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(safeState));
  localStorage.removeItem(LEGACY_PROJECTS_KEY);
  localStorage.removeItem(LEGACY_ACTIVE_PROJECT_KEY);
  localStorage.removeItem(LEGACY_SCHEMA_VERSION_KEY);
};
