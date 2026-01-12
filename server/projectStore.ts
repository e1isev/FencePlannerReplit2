import { randomUUID } from "crypto";
import type { ProjectSnapshot } from "@shared/project";

export type ProjectRecord = {
  projectId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  revisions: ProjectRevision[];
};

export type ProjectRevision = {
  revisionId: string;
  savedAt: string;
  snapshot: ProjectSnapshot;
  catalogVersion: string;
  ruleSetVersion: string;
};

class ProjectStore {
  private projects = new Map<string, ProjectRecord>();

  listProjects(): ProjectRecord[] {
    return Array.from(this.projects.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  createProject(name: string): ProjectRecord {
    const now = new Date().toISOString();
    const project: ProjectRecord = {
      projectId: randomUUID(),
      name,
      createdAt: now,
      updatedAt: now,
      revisions: [],
    };
    this.projects.set(project.projectId, project);
    return project;
  }

  getProject(projectId: string): ProjectRecord | undefined {
    return this.projects.get(projectId);
  }

  saveRevision(
    projectId: string,
    snapshot: ProjectSnapshot,
    catalogVersion: string,
    ruleSetVersion: string
  ): ProjectRevision {
    const project = this.projects.get(projectId);
    if (!project) {
      throw new Error("Project not found");
    }
    const savedAt = new Date().toISOString();
    const revision: ProjectRevision = {
      revisionId: randomUUID(),
      savedAt,
      snapshot: { ...snapshot, projectId, revisionId: undefined },
      catalogVersion,
      ruleSetVersion,
    };
    project.revisions.push(revision);
    project.updatedAt = savedAt;
    project.name = snapshot.projectMeta?.name ?? project.name;
    return revision;
  }
}

export const projectStore = new ProjectStore();
