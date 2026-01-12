import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { useProjectSessionStore } from "@/store/projectSessionStore";
import { useAuthStore } from "@/store/authStore";

export function PlannerTopBar() {
  const [, setLocation] = useLocation();
  const user = useAuthStore((state) => state.user);
  const projectName = useProjectSessionStore((state) => state.projectName);
  const setProjectName = useProjectSessionStore((state) => state.setProjectName);
  const saveStatus = useProjectSessionStore((state) => state.saveStatus);
  const lastSavedAt = useProjectSessionStore((state) => state.lastSavedAt);
  const saveProject = useProjectSessionStore((state) => state.saveProject);
  const [nameInput, setNameInput] = useState(projectName);

  useEffect(() => {
    setNameInput(projectName);
  }, [projectName]);

  const statusLabel = () => {
    switch (saveStatus) {
      case "saving":
        return "Saving…";
      case "saved":
        return "All changes saved";
      case "local":
        return "Saved locally";
      case "error":
        return "Save failed";
      default:
        return lastSavedAt ? `Saved ${new Date(lastSavedAt).toLocaleTimeString()}` : "";
    }
  };

  return (
    <div className="h-14 border-b border-slate-200 bg-white px-6 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Button variant="ghost" onClick={() => setLocation("/projects")}>
          Back to projects
        </Button>
        <Input
          value={nameInput}
          onChange={(event) => setNameInput(event.target.value)}
          onBlur={() => setProjectName(nameInput.trim() || "Untitled project")}
          className="h-9 w-64"
          placeholder="Project name"
        />
      </div>
      <div className="flex items-center gap-3">
        {statusLabel() && <span className="text-xs text-slate-500">{statusLabel()}</span>}
        <Button onClick={() => void saveProject()} data-testid="button-save-project-topbar">
          {user ? "Save" : "Save locally"}
        </Button>
      </div>
    </div>
  );
}
