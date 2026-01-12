import { Button } from "@/components/ui/button";
import { Undo2, Redo2, Trash2, Fence, FileText } from "lucide-react";
import { useLocation } from "wouter";
import { useDeckingStore } from "@/store/deckingStore";

export function DeckingToolbar() {
  const [, setLocation] = useLocation();
  const { clearAllDecks, undo, redo, history, historyIndex } = useDeckingStore();

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  return (
    <div className="h-14 border-b border-slate-200 bg-white px-6 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setLocation("/projects")}
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
      <div className="flex items-center gap-2" />
    </div>
  );
}
