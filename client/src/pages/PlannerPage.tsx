import { LeftPanel } from "@/components/LeftPanel";
import { Toolbar } from "@/components/Toolbar";
import { CanvasStage } from "@/components/CanvasStage";
import { WarningsPanel } from "@/components/WarningsPanel";

export default function PlannerPage() {
  return (
    <div className="h-screen flex flex-col" data-testid="page-planner">
      <Toolbar />
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        <LeftPanel />
        <CanvasStage />
      </div>
      <WarningsPanel />
    </div>
  );
}
