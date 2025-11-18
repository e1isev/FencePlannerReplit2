import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Square, RectangleHorizontal, Circle, RotateCw, Triangle } from "lucide-react";
import { useDeckingStore } from "@/store/deckingStore";
import type { ShapeType, DeckColor } from "@/types/decking";
import stormGraniteImg from "@assets/Tile_Storm_Granite-1_1763424352700.jpg";
import malleeBarkImg from "@assets/Tile_Mallee_Bark-1_1763424355684.jpg";
import ironbarkEmberImg from "@assets/Tile_Ironbark_Ember-1_1763424358469.jpg";
import saltbushVeilImg from "@assets/Tile_Saltbush_Veil-1_1763424360650.jpg";
import outbackImg from "@assets/Tile_Outback-1_1763424364636.jpg";
import coastalSpiniflexImg from "@assets/Tile_Coastal_Spiniflex-1_1763424368138.jpg";
import wildShoreImg from "@assets/Tile_Wild_Shore-1_1763424370480.jpg";
import coastalSandstoneImg from "@assets/Tile_Coastal_Sandstone-3_1763424372801.jpg";

const SHAPES: { type: ShapeType; label: string; icon: typeof Square }[] = [
  { type: "rectangle", label: "Rectangle", icon: RectangleHorizontal },
  { type: "triangle", label: "Triangle", icon: Triangle },
];

const COLORS: { color: DeckColor; label: string; image: string }[] = [
  { color: "storm-granite", label: "Storm Granite", image: stormGraniteImg },
  { color: "mallee-bark", label: "Mallee Bark", image: malleeBarkImg },
  { color: "ironbark-ember", label: "Ironbark Ember", image: ironbarkEmberImg },
  { color: "saltbush-veil", label: "Saltbush Veil", image: saltbushVeilImg },
  { color: "outback", label: "Outback", image: outbackImg },
  { color: "coastal-spiniflex", label: "Coastal Spinifex", image: coastalSpiniflexImg },
  { color: "wild-shore", label: "Wild Shore", image: wildShoreImg },
  { color: "coastal-sandstone", label: "Coastal Sandstone", image: coastalSandstoneImg },
];

export function DeckingLeftPanel() {
  const {
    shapes,
    selectedShapeType,
    selectedShapeId,
    selectedColor,
    boardDirection,
    setSelectedShapeType,
    setSelectedColor,
    toggleBoardDirection,
    updateShape,
    getCuttingList,
  } = useDeckingStore();

  const cuttingList = getCuttingList();
  const selectedShape = shapes.find((s) => s.id === selectedShapeId);

  return (
    <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-slate-200 bg-white p-4 md:p-6 overflow-y-auto max-h-64 md:max-h-none md:h-full">
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold mb-4">Decking Planner</h2>
        </div>

        <div>
          <Label className="text-sm font-medium uppercase tracking-wide text-slate-600 mb-3 block">
            Select Shape
          </Label>
          <p className="text-xs text-slate-500 mb-2">
            Click a shape, then click on the canvas to draw.
          </p>
          <div className="space-y-2">
            {SHAPES.map((shape) => (
              <Button
                key={shape.type}
                variant={selectedShapeType === shape.type ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedShapeType(shape.type)}
                className="w-full justify-start text-xs"
                data-testid={`button-shape-${shape.type}`}
              >
                <shape.icon className="w-4 h-4 mr-2" />
                {shape.label}
              </Button>
            ))}
          </div>
        </div>

        <div>
          <Label className="text-sm font-medium uppercase tracking-wide text-slate-600 mb-3 block">
            Deck Color
          </Label>
          <div className="grid grid-cols-4 gap-2">
            {COLORS.map((colorOption) => (
              <button
                key={colorOption.color}
                onClick={() => setSelectedColor(colorOption.color)}
                className={`relative aspect-square rounded-md overflow-hidden border-2 transition-all ${
                  selectedColor === colorOption.color
                    ? "border-blue-500 ring-2 ring-blue-200"
                    : "border-slate-200 hover-elevate"
                }`}
                title={colorOption.label}
                data-testid={`button-color-${colorOption.color}`}
              >
                <img
                  src={colorOption.image}
                  alt={colorOption.label}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-600 mt-2 font-medium">
            {COLORS.find((c) => c.color === selectedColor)?.label}
          </p>
        </div>

        {selectedShape && (
          <div>
            <Label className="text-sm font-medium uppercase tracking-wide text-slate-600 mb-3 block">
              Dimensions (mm)
            </Label>
            <div className="space-y-2">
              <div>
                <Label className="text-xs text-slate-500">Width</Label>
                <Input
                  type="number"
                  min="100"
                  max="10000"
                  step="10"
                  value={Math.round(selectedShape.width)}
                  onChange={(e) => {
                    const newWidth = parseInt(e.target.value) || selectedShape.width;
                    updateShape(selectedShape.id, { width: newWidth });
                  }}
                  className="text-xs"
                  data-testid="input-shape-width"
                />
              </div>
              <div>
                <Label className="text-xs text-slate-500">Height</Label>
                <Input
                  type="number"
                  min="100"
                  max="10000"
                  step="10"
                  value={Math.round(selectedShape.height)}
                  onChange={(e) => {
                    const newHeight = parseInt(e.target.value) || selectedShape.height;
                    updateShape(selectedShape.id, { height: newHeight });
                  }}
                  className="text-xs"
                  data-testid="input-shape-height"
                />
              </div>
            </div>
          </div>
        )}

        <div>
          <Label className="text-sm font-medium uppercase tracking-wide text-slate-600 mb-3 block">
            Board Direction
          </Label>
          <Button
            variant="outline"
            size="sm"
            onClick={toggleBoardDirection}
            className="w-full justify-start text-xs"
            data-testid="button-toggle-direction"
          >
            <RotateCw className="w-4 h-4 mr-2" />
            Rotate 90°
          </Button>
          <p className="text-xs text-slate-500 mt-2">
            Current: {boardDirection === "horizontal" ? "Horizontal" : "Vertical"}
          </p>
        </div>

        <div>
          <Label className="text-sm font-medium uppercase tracking-wide text-slate-600 mb-3 block">
            Cutting List
          </Label>
          <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">
                    Item
                  </th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-700">
                    Qty
                  </th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-700">
                    Length (mm)
                  </th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {cuttingList.boards.length === 0 && cuttingList.clips === 0 ? (
                  <tr className="border-b border-slate-100">
                    <td className="px-3 py-2 text-slate-400" colSpan={3}>
                      No shapes drawn yet
                    </td>
                  </tr>
                ) : (
                  <>
                    {cuttingList.boards.map((board, index) => (
                      <tr key={index} className="border-b border-slate-100" data-testid={`row-board-${index}`}>
                        <td className="px-3 py-2">Board ({board.length}mm)</td>
                        <td className="px-3 py-2 text-right">{board.count}</td>
                        <td className="px-3 py-2 text-right">{board.length}</td>
                      </tr>
                    ))}
                    {cuttingList.clips > 0 && (
                      <tr className="border-b border-slate-100" data-testid="row-clips">
                        <td className="px-3 py-2">Clips</td>
                        <td className="px-3 py-2 text-right">{cuttingList.clips}</td>
                        <td className="px-3 py-2 text-right">-</td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
