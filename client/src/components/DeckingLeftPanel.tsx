import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Square, RectangleHorizontal, Circle, RotateCw, Triangle } from "lucide-react";
import { useDeckingStore } from "@/store/deckingStore";
import type { ShapeType, DeckColor } from "@/types/decking";

const SHAPES: { type: ShapeType; label: string; icon: typeof Square }[] = [
  { type: "rectangle", label: "Rectangle", icon: RectangleHorizontal },
  { type: "triangle", label: "Triangle", icon: Triangle },
];

const COLORS: { color: DeckColor; label: string; image: string }[] = [
  {
    color: "storm-granite",
    label: "Storm Granite",
    image: "https://de2bd644.delivery.rocketcdn.me/wp-content/uploads/2025/11/Tile_Storm_Granite-1.jpg",
  },
  {
    color: "mallee-bark",
    label: "Mallee Bark",
    image: "https://de2bd644.delivery.rocketcdn.me/wp-content/uploads/2025/11/Tile_Mallee_Bark-1.jpg",
  },
  {
    color: "ironbark-ember",
    label: "Ironbark Ember",
    image: "https://de2bd644.delivery.rocketcdn.me/wp-content/uploads/2025/11/Tile_Ironbark_Ember-1.jpg",
  },
  {
    color: "saltbush-veil",
    label: "Saltbush Veil",
    image: "https://de2bd644.delivery.rocketcdn.me/wp-content/uploads/2025/11/Tile_Saltbush_Veil-1.jpg",
  },
  {
    color: "outback",
    label: "Outback",
    image: "https://de2bd644.delivery.rocketcdn.me/wp-content/uploads/2025/11/Tile_Outback-1.jpg",
  },
  {
    color: "coastal-spiniflex",
    label: "Coastal Spinifex",
    image: "https://de2bd644.delivery.rocketcdn.me/wp-content/uploads/2025/11/Tile_Coastal_Spinifex-1.jpg",
  },
  {
    color: "wild-shore",
    label: "Wild Shore",
    image: "https://de2bd644.delivery.rocketcdn.me/wp-content/uploads/2025/11/Tile_Wild_Shore-1.jpg",
  },
  {
    color: "coastal-sandstone",
    label: "Coastal Sandstone",
    image: "https://de2bd644.delivery.rocketcdn.me/wp-content/uploads/2025/11/Tile_Coastal_Sandstone-3.jpg",
  },
];

export function DeckingLeftPanel() {
  const {
    shapes,
    selectedShapeType,
    selectedShapeId,
    selectedColor,
    boardDirection,
    boardPlan,
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
                <span
                  aria-hidden
                  className="absolute inset-0"
                  style={{
                    backgroundImage: `url(${colorOption.image})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                />
                <span className="sr-only">{colorOption.label}</span>
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

        {boardPlan && (
          <div>
            <Label className="text-sm font-medium uppercase tracking-wide text-slate-600 mb-3 block">
              Board Plan
            </Label>
            <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs space-y-1">
              <div className="flex justify-between" data-testid="board-plan-rows">
                <span className="text-slate-600">Rows</span>
                <span className="font-semibold">{boardPlan.numberOfRows}</span>
              </div>
              <div className="flex justify-between" data-testid="board-plan-total">
                <span className="text-slate-600">Total boards</span>
                <span className="font-semibold">{Math.ceil(boardPlan.totalBoards)}</span>
              </div>
              <div className="flex justify-between" data-testid="board-plan-average">
                <span className="text-slate-600">Avg boards / row</span>
                <span className="font-semibold">{boardPlan.averageBoardsPerRow.toFixed(2)}</span>
              </div>
              <div className="flex justify-between" data-testid="board-plan-waste">
                <span className="text-slate-600">Estimated waste</span>
                <span className="font-semibold">{Math.round(boardPlan.totalWasteMm)} mm</span>
              </div>
              <div className="flex justify-between" data-testid="board-plan-overflow">
                <span className="text-slate-600">Avg overhang used</span>
                <span className="font-semibold">{boardPlan.averageOverflowMm.toFixed(1)} mm</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-2">
                Uses the longest possible runs and allows a small overhang to reduce board count.
              </p>
            </div>
          </div>
        )}

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
