import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useAppStore } from "@/store/appStore";
import { X, Grid3x3 } from "lucide-react";

interface LineControlsProps {
  lineId: string;
  onClose: () => void;
}

export function LineControls({ lineId, onClose }: LineControlsProps) {
  const { lines, toggleEvenSpacing, deleteLine } = useAppStore();
  const line = lines.find((l) => l.id === lineId);

  if (!line || line.gateId) return null;

  return (
    <Card className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 bg-white p-4 rounded-lg shadow-xl border-2 border-slate-200 min-w-64">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Line Options</h3>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onClose}
          data-testid="button-close-line-controls"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Checkbox
            id="even-spacing"
            checked={line.even_spacing}
            onCheckedChange={() => toggleEvenSpacing(lineId)}
            data-testid="checkbox-even-spacing"
          />
          <Label
            htmlFor="even-spacing"
            className="text-sm font-medium cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Grid3x3 className="w-4 h-4" />
              Evenly Space Panels
            </div>
          </Label>
        </div>

        <Button
          variant="destructive"
          size="sm"
          onClick={() => {
            deleteLine(lineId);
            onClose();
          }}
          className="w-full"
          data-testid="button-delete-line"
        >
          Delete Line
        </Button>
      </div>
    </Card>
  );
}
