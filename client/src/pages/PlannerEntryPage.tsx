import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import PlannerPage from "@/pages/PlannerPage";
import { useProjectSessionStore } from "@/store/projectSessionStore";
import { useAppStore } from "@/store/appStore";
import type { FenceCategoryId } from "@/types/models";
import type { ProjectType } from "@shared/projectSnapshot";

const isSupportedFenceType = (value: string | null): value is ProjectType =>
  value === "residential_fencing" || value === "rural_fencing";

const isFenceCategory = (value: string | null): value is FenceCategoryId =>
  value === "residential" || value === "rural";

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
  const sessionIntent = useProjectSessionStore((state) => state.sessionIntent);
  const hasBootstrapped = useProjectSessionStore((state) => state.hasBootstrapped);
  const setFenceCategory = useAppStore((state) => state.setFenceCategory);

  const query = useMemo(() => new URLSearchParams(location.split("?")[1] ?? ""), [location]);
  const requestedType = query.get("type");
  const projectName = query.get("name");
  const localId = query.get("localId");
  const categoryParam = query.get("category");
  const requestedCategory = isFenceCategory(categoryParam) ? categoryParam : null;

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
      !requestedType &&
      !requestedCategory &&
      !projectName &&
      activeProjectId &&
      sessionIntent === null &&
      !hasBootstrapped
    ) {
      const restored = restoreActiveProject();
      if (restored) return;
    }
    if (!requestedType && currentType && currentType !== "decking") {
      return;
    }
    const type = isSupportedFenceType(requestedType) ? requestedType : "residential_fencing";
    const name = projectName ? decodeURIComponent(projectName) : `Untitled project ${new Date().toLocaleString()}`;
    startNewProject(type, name);
    if (requestedCategory) {
      setFenceCategory(requestedCategory);
    }
  }, [
    projectId,
    requestedType,
    projectName,
    localId,
    requestedCategory,
    startNewProject,
    restoreActiveProject,
    loadProject,
    loadGuestProject,
    currentType,
    activeProjectId,
    sessionIntent,
    hasBootstrapped,
    setFenceCategory,
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
