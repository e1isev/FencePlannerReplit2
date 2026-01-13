import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/store/authStore";
import { loadGuestProjectSummaries, useProjectSessionStore } from "@/store/projectSessionStore";
import type { ProjectType } from "@shared/projectSnapshot";

type ProjectSummary = {
  id: string;
  name: string;
  projectType: ProjectType;
  updatedAt: string;
};

const formatType = (projectType: ProjectType) =>
  ({
    decking: "Decking",
    residential: "Residential fencing",
    rural: "Rural fencing",
    titan_rail: "Titan Rail",
  })[projectType];

export default function ProjectsDashboard() {
  const [, setLocation] = useLocation();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<Record<string, string>>({});
  const saveGuestToAccount = useProjectSessionStore((state) => state.saveGuestToAccount);

  const [guestProjects, setGuestProjects] = useState(loadGuestProjectSummaries());

  const loadProjects = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/projects");
      if (!response.ok) throw new Error("Unable to load projects.");
      const data = (await response.json()) as ProjectSummary[];
      setProjects(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load projects.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProjects();
  }, [user]);

  useEffect(() => {
    setGuestProjects(loadGuestProjectSummaries());
  }, [user]);

  const openProject = (project: ProjectSummary) => {
    if (project.projectType === "decking") {
      setLocation(`/decking/${project.id}`);
      return;
    }
    if (project.projectType === "titan_rail") {
      setLocation("/coming-soon/titan-rail");
      return;
    }
    setLocation(`/planner/${project.id}`);
  };

  const handleRename = async (project: ProjectSummary) => {
    const nextName = renaming[project.id]?.trim();
    if (!nextName) return;
    const response = await fetch(`/api/projects/${project.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nextName }),
    });
    if (response.ok) {
      setRenaming((prev) => ({ ...prev, [project.id]: "" }));
      void loadProjects();
    }
  };

  const handleDelete = async (project: ProjectSummary) => {
    const response = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    if (response.ok) {
      void loadProjects();
    }
  };

  const handleGuestOpen = (projectId: string, projectType: ProjectType) => {
    if (projectType === "decking") {
      setLocation(`/decking/new?localId=${projectId}`);
      return;
    }
    setLocation(`/planner/new?localId=${projectId}`);
  };

  const handleSaveGuest = async (localId: string) => {
    const success = await saveGuestToAccount(localId);
    if (success) {
      setGuestProjects(loadGuestProjectSummaries());
      void loadProjects();
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Projects</h1>
            <p className="text-sm text-slate-600">
              Manage your saved projects or start something new.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setLocation("/new")} data-testid="button-dashboard-new">
              Create new project
            </Button>
            {user ? (
              <Button variant="outline" onClick={() => void logout()}>
                Log out
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setLocation("/login")}>
                Log in
              </Button>
            )}
          </div>
        </div>

        {!user && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
            You are browsing in guest mode. Log in to sync projects across devices.
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {user && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              Saved projects
            </h2>
            {loading ? (
              <p className="text-sm text-slate-500">Loading projects…</p>
            ) : projects.length === 0 ? (
              <p className="text-sm text-slate-500">
                No saved projects yet. Create one to get started.
              </p>
            ) : (
              <div className="space-y-3">
                {projects.map((project) => (
                  <div
                    key={project.id}
                    className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-semibold text-slate-800">{project.name}</p>
                      <p className="text-xs text-slate-500">
                        {formatType(project.projectType)} • Updated{" "}
                        {new Date(project.updatedAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <Button size="sm" onClick={() => openProject(project)}>
                        Open
                      </Button>
                      <div className="flex items-center gap-2">
                        <Input
                          value={renaming[project.id] ?? ""}
                          onChange={(event) =>
                            setRenaming((prev) => ({
                              ...prev,
                              [project.id]: event.target.value,
                            }))
                          }
                          placeholder="Rename"
                          className="h-8 text-xs"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleRename(project)}
                        >
                          Rename
                        </Button>
                      </div>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => void handleDelete(project)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {guestProjects.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              Guest projects
            </h2>
            <div className="space-y-3">
              {guestProjects.map((project) => (
                <div
                  key={project.id}
                  className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-semibold text-slate-800">{project.name}</p>
                    <p className="text-xs text-slate-500">
                      {formatType(project.projectType)} • Updated{" "}
                      {new Date(project.updatedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Button
                      size="sm"
                      onClick={() => handleGuestOpen(project.id, project.projectType)}
                    >
                      Open
                    </Button>
                    {user && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleSaveGuest(project.id)}
                      >
                        Save to account
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
