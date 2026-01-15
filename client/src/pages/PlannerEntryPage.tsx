import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import PlannerPage from "@/pages/PlannerPage";
import { getActiveProject, useProjectSessionStore } from "@/store/projectSessionStore";
import { hydratePlannerSnapshot, normalizePlannerSnapshot } from "@/lib/plannerSnapshot";
import { useAppStore } from "@/store/appStore";
import { coerceFenceProjectType } from "@/config/plannerOptions";

export default function PlannerEntryPage({ params }: { params: { projectId?: string } }) {
  const [location, setLocation] = useLocation();
  const [loading, setLoading] = useState(false);
  const projectId = params.projectId;
  const startNewProject = useProjectSessionStore((state) => state.startNewProject);
  const restoreActiveProject = useProjectSessionStore((state) => state.restoreActiveProject);
  const loadProject = useProjectSessionStore((state) => state.loadProject);
  const loadGuestProject = useProjectSessionStore((state) => state.loadGuestProject);
  const currentType = useProjectSessionStore((state) => state.projectType);
  const activeProjectId = useProjectSessionStore((state) => state.activeProjectId);
  const projectsById = useProjectSessionStore((state) => state.projectsById);
  const sessionIntent = useProjectSessionStore((state) => state.sessionIntent);
  const hasBootstrapped = useProjectSessionStore((state) => state.hasBootstrapped);
  const activeProject = useProjectSessionStore(getActiveProject);
  const resetPlannerState = useAppStore((state) => state.resetPlannerState);
  const hydrateFromSnapshot = useAppStore((state) => state.hydrateFromSnapshot);

  const query = useMemo(() => new URLSearchParams(location.split("?")[1] ?? ""), [location]);
  const requestedType = query.get("projectType") ?? query.get("type");
  const projectName = query.get("name");
  const localId = query.get("localId");
  const requestedProjectType =
    coerceFenceProjectType(requestedType) ?? coerceFenceProjectType(query.get("category"));
  const isRuralBlocked = requestedProjectType === "rural";

  useEffect(() => {
    if (isRuralBlocked && !projectId && !localId) {
      setLocation("/projects");
      return;
    }
    if (projectId) {
      setLoading(true);
      void loadProject(projectId).finally(() => setLoading(false));
      return;
    }
    if (localId) {
      loadGuestProject(localId);
      return;
    }
    if (
      !requestedProjectType &&
      !projectName &&
      !activeProjectId &&
      (sessionIntent === null || sessionIntent === "restore") &&
      (!hasBootstrapped || Object.keys(projectsById).length === 0)
    ) {
      const restored = restoreActiveProject();
      if (restored) return;
    }
    if (!requestedProjectType && currentType && currentType !== "decking") {
      return;
    }
    const type = requestedProjectType ?? "residential";
    const name = projectName ? decodeURIComponent(projectName) : `Untitled project ${new Date().toLocaleString()}`;
    startNewProject(type, name);
  }, [
    projectId,
    requestedType,
    projectName,
    localId,
    isRuralBlocked,
    requestedProjectType,
    startNewProject,
    restoreActiveProject,
    loadProject,
    loadGuestProject,
    currentType,
    activeProjectId,
    projectsById,
    sessionIntent,
    hasBootstrapped,
    setLocation,
  ]);

  useEffect(() => {
    if (!activeProject?.snapshot) return;
    if (activeProject?.projectType === "rural") return;
    const normalized = normalizePlannerSnapshot(
      activeProject.snapshot,
      coerceFenceProjectType(activeProject.projectType) ?? undefined
    );
    if (normalized.projectType === "decking") {
      hydratePlannerSnapshot(normalized);
      return;
    }
    if (sessionIntent === "new") {
      resetPlannerState();
    }
    hydrateFromSnapshot(normalized);
  }, [
    activeProject?.id,
    activeProject?.updatedAt,
    activeProject?.snapshot,
    sessionIntent,
    resetPlannerState,
    hydrateFromSnapshot,
    hydratePlannerSnapshot,
  ]);

  if (activeProject?.projectType === "rural") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
          <h2 className="text-lg font-semibold text-amber-900">
            Rural planner is temporarily unavailable
          </h2>
          <p className="mt-2 text-sm text-amber-700">
            We are fixing issues with rural fencing plans. Please open a different
            project for now.
          </p>
          <Button className="mt-4" onClick={() => setLocation("/projects")}>
            Back to projects
          </Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">
        Loading project…
      </div>
    );
  }

  return <PlannerPage />;
}
