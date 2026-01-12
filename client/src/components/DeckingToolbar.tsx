import { Button } from "@/components/ui/button";
import { Save, Undo2, Redo2, Trash2, Fence, FileText, FolderOpen } from "lucide-react";
import { useLocation } from "wouter";
import { useDeckingStore } from "@/store/deckingStore";
import { useProjectStore } from "@/store/projectStore";
import { ProjectManagerDialog } from "@/components/ProjectManagerDialog";
import { useState } from "react";

export function DeckingToolbar() {
  const [, setLocation] = useLocation();
  const { clearAllDecks, undo, redo, history, historyIndex } = useDeckingStore();
  const { saveCurrentProject, saveStatus, saveMessage } = useProjectStore();
  const [projectsOpen, setProjectsOpen] = useState(false);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  return (
    <div className="h-14 border-b border-slate-200 bg-white px-6 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setLocation("/")}
          data-testid="button-fence"
        >
          <Fence className="w-4 h-4 mr-2" />
          Fence Planner
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setLocation("/decking/finished")}
          data-testid="button-decking-finished-page"
        >
          <FileText className="w-4 h-4 mr-2" />
          Finished page
        </Button>
        <div className="h-8 w-px bg-slate-300 mx-1" />
        <Button
          variant="outline"
          size="sm"
          onClick={clearAllDecks}
          data-testid="button-clear-decking"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Clear
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={undo}
          disabled={!canUndo}
          data-testid="button-undo-decking"
        >
          <Undo2 className="w-4 h-4 mr-2" />
          Undo
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={redo}
          disabled={!canRedo}
          data-testid="button-redo-decking"
        >
          <Redo2 className="w-4 h-4 mr-2" />
          Redo
        </Button>
      </div>
      <div className="flex items-center gap-2">
        {saveMessage && (
          <span className="text-xs text-slate-500" data-testid="text-save-status">
            {saveMessage}
          </span>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => saveCurrentProject({ manual: true })}
          disabled={saveStatus === "saving"}
          data-testid="button-save-project"
        >
          <Save className="w-4 h-4 mr-2" />
          Save
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setProjectsOpen(true)}
          data-testid="button-projects"
        >
          <FolderOpen className="w-4 h-4 mr-2" />
          Projects
        </Button>
        <ProjectManagerDialog open={projectsOpen} onOpenChange={setProjectsOpen} />
      </div>
    </div>
  );
}
