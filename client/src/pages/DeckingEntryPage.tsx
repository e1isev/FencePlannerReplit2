import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import DeckingPlannerPage from "@/pages/DeckingPlannerPage";
import { useProjectSessionStore } from "@/store/projectSessionStore";

export default function DeckingEntryPage({ params }: { params: { projectId?: string } }) {
  const [location] = useLocation();
  const [loading, setLoading] = useState(false);
  const projectId = params.projectId;
  const startNewProject = useProjectSessionStore((state) => state.startNewProject);
  const loadProject = useProjectSessionStore((state) => state.loadProject);
  const loadGuestProject = useProjectSessionStore((state) => state.loadGuestProject);
  const currentType = useProjectSessionStore((state) => state.projectType);

  const query = useMemo(() => new URLSearchParams(location.split("?")[1] ?? ""), [location]);
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
    if (currentType === "decking") {
      return;
    }
    const name = projectName ? decodeURIComponent(projectName) : `Untitled project ${new Date().toLocaleString()}`;
    startNewProject("decking", name);
  }, [projectId, projectName, localId, startNewProject, loadProject, loadGuestProject, currentType]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">
        Loading project…
      </div>
    );
  }

  return <DeckingPlannerPage />;
}
