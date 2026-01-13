import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/appStore";
import {
  Undo2,
  Redo2,
  Trash2,
  FileCheck,
  ArrowLeftRight,
  FileDown,
  FileSpreadsheet,
} from "lucide-react";
import { useLocation } from "wouter";
import { exportPDF, exportCuttingListCSV } from "@/lib/exports";
import { usePricingCatalog } from "@/pricing/usePricingCatalog";
import { getFenceColourMode } from "@/config/fenceColors";
import { getSlidingReturnSide } from "@/geometry/gates";

export function Toolbar() {
  const {
    clear,
    undo,
    redo,
    history,
    historyIndex,
    gates,
    fenceCategoryId,
    fenceStyleId,
    fenceHeightM,
    fenceColorId,
    panels,
    posts,
    lines,
    updateGateReturnSide,
  } = useAppStore();
  const [, setLocation] = useLocation();
  const { pricingIndex, catalogReady } = usePricingCatalog();

  const selectedGate = gates.find((g) =>
    g.type.startsWith("sliding")
  );
  const selectedReturnSide = selectedGate ? getSlidingReturnSide(selectedGate) : null;

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;
  const hasData = lines.length > 0;

  const handleExportPDF = () => {
    exportPDF({
      fenceCategoryId,
      fenceStyleId,
      fenceHeightM,
      fenceColourMode: getFenceColourMode(fenceColorId),
      panels,
      posts,
      gates,
      lines,
      pricingIndex,
      catalogReady,
    });
  };

  const handleExportCSV = () => {
    exportCuttingListCSV({
      fenceCategoryId,
      fenceStyleId,
      fenceHeightM,
      fenceColourMode: getFenceColourMode(fenceColorId),
      panels,
      posts,
      gates,
      lines,
      pricingIndex,
      catalogReady,
    });
  };

  return (
    <div className="h-14 border-b border-slate-200 bg-white px-6 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={clear}
          data-testid="button-clear"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Clear
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={undo}
          disabled={!canUndo}
          data-testid="button-undo"
        >
          <Undo2 className="w-4 h-4 mr-2" />
          Undo
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={redo}
          disabled={!canRedo}
          data-testid="button-redo"
        >
          <Redo2 className="w-4 h-4 mr-2" />
          Redo
        </Button>
        <div className="h-8 w-px bg-slate-300 mx-1" />
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportPDF}
          disabled={!hasData}
          data-testid="button-export-pdf"
        >
          <FileDown className="w-4 h-4 mr-2" />
          Export PDF
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportCSV}
          disabled={!hasData}
          data-testid="button-export-csv"
        >
          <FileSpreadsheet className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <div className="flex items-center gap-2">
        {selectedGate && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const { updateGateReturnDirection } = useAppStore.getState();
                const newDirection =
                  selectedGate.slidingReturnDirection === "left"
                    ? "right"
                    : "left";
                updateGateReturnDirection(selectedGate.id, newDirection);
              }}
              data-testid="button-toggle-direction"
            >
              <ArrowLeftRight className="w-4 h-4 mr-2" />
              Change Sliding Direction
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (!selectedReturnSide) return;
                const nextSide = selectedReturnSide === "a" ? "b" : "a";
                updateGateReturnSide(selectedGate.id, nextSide);
              }}
              data-testid="button-toggle-return-side"
            >
              Return Side: {selectedReturnSide === "a" ? "Side A" : "Side B"}
            </Button>
          </>
        )}
        <Button
          variant="default"
          size="sm"
          onClick={() => setLocation("/planner/finished")}
          data-testid="button-finish"
        >
          <FileCheck className="w-4 h-4 mr-2" />
          Finish
        </Button>
      </div>
    </div>
  );
}
