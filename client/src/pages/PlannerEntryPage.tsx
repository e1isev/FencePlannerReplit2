import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import PlannerPage from "@/pages/PlannerPage";
import { getActiveProject, useProjectSessionStore } from "@/store/projectSessionStore";
import { hydratePlannerSnapshot, normalizePlannerSnapshot } from "@/lib/plannerSnapshot";
import { useAppStore } from "@/store/appStore";
import { coerceFenceProjectType } from "@/config/plannerOptions";

export default function PlannerEntryPage({ params }: { params: { projectId?: string } }) {
  const [location] = useLocation();
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

  useEffect(() => {
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
  ]);

  useEffect(() => {
    if (!activeProject?.snapshot) return;
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">
        Loading project…
      </div>
    );
  }

  return <PlannerPage />;
}
