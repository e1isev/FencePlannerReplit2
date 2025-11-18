import { DeckingLeftPanel } from "@/components/DeckingLeftPanel";
import { DeckingToolbar } from "@/components/DeckingToolbar";
import { DeckingCanvasStage } from "@/components/DeckingCanvasStage";

export default function DeckingPlannerPage() {
  return (
    <div className="h-screen flex flex-col" data-testid="page-decking-planner">
      <DeckingToolbar />
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        <DeckingLeftPanel />
        <DeckingCanvasStage />
      </div>
    </div>
  );
}
