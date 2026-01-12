import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import PlannerPage from "@/pages/PlannerPage";
import { useProjectSessionStore } from "@/store/projectSessionStore";
import type { ProjectType } from "@shared/projectSnapshot";

const isSupportedFenceType = (value: string | null): value is ProjectType =>
  value === "residential_fencing" || value === "rural_fencing";

export default function PlannerEntryPage({ params }: { params: { projectId?: string } }) {
  const [location] = useLocation();
  const [loading, setLoading] = useState(false);
  const projectId = params.projectId;
  const startNewProject = useProjectSessionStore((state) => state.startNewProject);
  const loadProject = useProjectSessionStore((state) => state.loadProject);
  const loadGuestProject = useProjectSessionStore((state) => state.loadGuestProject);
  const currentType = useProjectSessionStore((state) => state.projectType);

  const query = useMemo(() => new URLSearchParams(location.split("?")[1] ?? ""), [location]);
  const requestedType = query.get("type");
  const projectName = query.get("name");
  const localId = query.get("localId");

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
    if (!requestedType && currentType && currentType !== "decking") {
      return;
    }
    const type = isSupportedFenceType(requestedType) ? requestedType : "residential_fencing";
    const name = projectName ? decodeURIComponent(projectName) : `Untitled project ${new Date().toLocaleString()}`;
    startNewProject(type, name);
  }, [
    projectId,
    requestedType,
    projectName,
    localId,
    startNewProject,
    loadProject,
    loadGuestProject,
    currentType,
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
