import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RotateCw, Ruler } from "lucide-react";
import { useDeckingStore } from "@/store/deckingStore";
import type { DeckColor } from "@/types/decking";

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
    decks,
    activeDeckId,
    setActiveDeck,
    updateActiveDeck,
    calculateBoardsForDeck,
    getCuttingListForDeck,
    saveHistory,
  } = useDeckingStore();

  const activeDeck = decks.find((deck) => deck.id === activeDeckId) ?? null;
  const cuttingList = getCuttingListForDeck(activeDeckId);
  const hasPolygon = Boolean(activeDeck && activeDeck.polygon.length >= 3);

  const handleBoardDirectionToggle = () => {
    if (!activeDeck) return;
    const nextDirection: "horizontal" | "vertical" =
      activeDeck.boardDirection === "horizontal" ? "vertical" : "horizontal";
    updateActiveDeck({ boardDirection: nextDirection });
    calculateBoardsForDeck(activeDeck.id);
    saveHistory();
  };

  const handleFinishToggle = (key: "pictureFrameEnabled" | "fasciaEnabled" | "breakerBoardsEnabled") => {
    if (!activeDeck) return;
    updateActiveDeck({
      finishes: { ...activeDeck.finishes, [key]: !activeDeck.finishes[key] },
    });
    calculateBoardsForDeck(activeDeck.id);
    saveHistory();
  };

  const handlePictureFrameWidthChange = (widthMm: number) => {
    if (!activeDeck || widthMm <= 0) return;
    updateActiveDeck({ pictureFrameBoardWidthMm: widthMm });
    calculateBoardsForDeck(activeDeck.id);
    saveHistory();
  };

  const handlePictureFrameGapChange = (gapMm: number) => {
    if (!activeDeck || gapMm < 0) return;
    updateActiveDeck({ pictureFrameGapMm: gapMm });
    calculateBoardsForDeck(activeDeck.id);
    saveHistory();
  };

  const handleFasciaThicknessChange = (thicknessMm: number) => {
    if (!activeDeck || thicknessMm <= 0) return;
    updateActiveDeck({ fasciaThicknessMm: thicknessMm });
    calculateBoardsForDeck(activeDeck.id);
    saveHistory();
  };

  return (
    <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-slate-200 bg-white p-4 md:p-6 overflow-y-auto max-h-64 md:max-h-none md:h-full">
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold mb-4">Decking Planner</h2>
        </div>

        <div>
          <Label className="text-sm font-medium uppercase tracking-wide text-slate-600 mb-3 block">
            Decks
          </Label>
          <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2 text-xs text-slate-600">
            {decks.length === 0 ? (
              <p className="text-slate-500">Draw and close a shape to add a deck.</p>
            ) : (
              decks.map((deck) => (
                <button
                  key={deck.id}
                  className={`w-full text-left px-3 py-2 rounded-md border ${
                    deck.id === activeDeckId
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-slate-200 hover:border-blue-200"
                  }`}
                  onClick={() => setActiveDeck(deck.id)}
                >
                  {deck.name}
                </button>
              ))
            )}
          </div>
        </div>

        <div>
          <Label className="text-sm font-medium uppercase tracking-wide text-slate-600 mb-3 block">
            Drawing mode
          </Label>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 space-y-2">
            <p>Click to drop points and outline your deck.</p>
            <p>Close the loop to calculate area and boards.</p>
            <p className="flex items-center gap-2 font-medium text-slate-700">
              <Ruler className="w-4 h-4" />
              {hasPolygon ? "Shape closed" : "Shape not closed"}
            </p>
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
                onClick={() => {
                  if (!activeDeck) return;
                  updateActiveDeck({ selectedColor: colorOption.color });
                  saveHistory();
                }}
                className={`relative aspect-square rounded-md overflow-hidden border-2 transition-all ${
                  activeDeck?.selectedColor === colorOption.color
                    ? "border-blue-500 ring-2 ring-blue-200"
                    : "border-slate-200 hover-elevate"
                }`}
                title={colorOption.label}
                data-testid={`button-color-${colorOption.color}`}
                disabled={!activeDeck}
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
            {COLORS.find((c) => c.color === activeDeck?.selectedColor)?.label ?? "Select a deck to set color"}
          </p>
        </div>

        <div>
          <Label className="text-sm font-medium uppercase tracking-wide text-slate-600 mb-3 block">
            Board Direction
          </Label>
          <Button
            variant="outline"
            size="sm"
            onClick={handleBoardDirectionToggle}
            className="w-full justify-start text-xs"
            data-testid="button-toggle-direction"
            disabled={!activeDeck}
          >
            <RotateCw className="w-4 h-4 mr-2" />
            Rotate 90°
          </Button>
          <p className="text-xs text-slate-500 mt-2">
            Current: {activeDeck?.boardDirection === "vertical" ? "Vertical" : "Horizontal"}
          </p>
        </div>

        <div>
          <Label className="text-sm font-medium uppercase tracking-wide text-slate-600 mb-3 block">
            Finishes
          </Label>
          <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3 text-xs text-slate-600">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-700">Picture frame</p>
                <p className="text-[11px] text-slate-500">Perimeter border with mitred corners.</p>
              </div>
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={activeDeck?.finishes.pictureFrameEnabled ?? false}
                onChange={() => handleFinishToggle("pictureFrameEnabled")}
                disabled={!hasPolygon}
              />
            </div>

            <div className="grid grid-cols-2 gap-2 items-center">
              <span>Picture frame board width (mm)</span>
              <Input
                type="number"
                inputMode="numeric"
                value={activeDeck?.pictureFrameBoardWidthMm ?? 0}
                min={1}
                step={1}
                onChange={(e) => handlePictureFrameWidthChange(Number(e.target.value))}
                disabled={!hasPolygon || !activeDeck?.finishes.pictureFrameEnabled}
                className="h-8"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 items-center">
              <span>Picture frame gap (mm)</span>
              <Input
                type="number"
                inputMode="numeric"
                value={activeDeck?.pictureFrameGapMm ?? 0}
                min={0}
                step={1}
                onChange={(e) => handlePictureFrameGapChange(Number(e.target.value))}
                disabled={!hasPolygon || !activeDeck?.finishes.pictureFrameEnabled}
                className="h-8"
              />
            </div>

            {activeDeck?.pictureFrameWarning && (
              <div className="rounded bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 text-[11px]">
                {activeDeck.pictureFrameWarning}
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-700">Breaker boards</p>
                <p className="text-[11px] text-slate-500">Aligns joins and adds perpendicular boards.</p>
              </div>
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={activeDeck?.finishes.breakerBoardsEnabled ?? false}
                onChange={() => handleFinishToggle("breakerBoardsEnabled")}
                disabled={!hasPolygon}
              />
            </div>

            <div className="border-t border-slate-100 pt-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-700">Fascia</p>
                  <p className="text-[11px] text-slate-500">Vertical trim band around the rim.</p>
                </div>
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={activeDeck?.finishes.fasciaEnabled ?? false}
                  onChange={() => handleFinishToggle("fasciaEnabled")}
                  disabled={!hasPolygon}
                />
              </div>

              <div className="grid grid-cols-2 gap-2 items-center mt-2">
                <span>Fascia thickness (mm)</span>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={activeDeck?.fasciaThicknessMm ?? 0}
                  min={1}
                  step={1}
                  onChange={(e) => handleFasciaThicknessChange(Number(e.target.value))}
                  disabled={!hasPolygon || !activeDeck?.finishes.fasciaEnabled}
                  className="h-8"
                />
              </div>
            </div>
          </div>
        </div>

        <div>
          <Label className="text-sm font-medium uppercase tracking-wide text-slate-600 mb-3 block">
            Board Plan
          </Label>
          {activeDeck?.boardPlan ? (
            <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs space-y-1">
              <div className="flex justify-between" data-testid="board-plan-area">
                <span className="text-slate-600">Area</span>
                <span className="font-semibold">{activeDeck.boardPlan.areaM2.toFixed(2)} m²</span>
              </div>
              <div className="flex justify-between" data-testid="board-plan-rows">
                <span className="text-slate-600">Rows</span>
                <span className="font-semibold">{activeDeck.boardPlan.numberOfRows}</span>
              </div>
              <div className="flex justify-between" data-testid="board-plan-total">
                <span className="text-slate-600">Total boards</span>
                <span className="font-semibold">{Math.ceil(activeDeck.boardPlan.totalBoards)}</span>
              </div>
              <div className="flex justify-between" data-testid="board-plan-average">
                <span className="text-slate-600">Avg boards / row</span>
                <span className="font-semibold">
                  {activeDeck.boardPlan.averageBoardsPerRow.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between" data-testid="board-plan-waste">
                <span className="text-slate-600">Estimated waste</span>
                <span className="font-semibold">{Math.round(activeDeck.boardPlan.totalWasteMm)} mm</span>
              </div>
              <div className="flex justify-between" data-testid="board-plan-overflow">
                <span className="text-slate-600">Avg overhang used</span>
                <span className="font-semibold">
                  {activeDeck.boardPlan.averageOverflowMm.toFixed(1)} mm
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-2">
                Close the outline to see calculated runs and waste estimates.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              Draw and close a shape to calculate decking coverage.
            </div>
          )}
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
                {cuttingList.boards.length === 0 &&
                cuttingList.pictureFrame.length === 0 &&
                cuttingList.fascia.length === 0 &&
                cuttingList.clips === 0 ? (
                  <tr className="border-b border-slate-100">
                    <td className="px-3 py-2 text-slate-400" colSpan={3}>
                      {activeDeck ? "Draw and close a shape to see the cutting list" : "Select a deck to see its cutting list"}
                    </td>
                  </tr>
                ) : (
                  <>
                    {cuttingList.boards.length > 0 && (
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <td className="px-3 py-2 font-semibold" colSpan={3}>Surface boards</td>
                      </tr>
                    )}
                    {cuttingList.boards.map((board, index) => (
                      <tr key={`board-${index}`} className="border-b border-slate-100" data-testid={`row-board-${index}`}>
                        <td className="px-3 py-2">Board ({board.length}mm)</td>
                        <td className="px-3 py-2 text-right">{board.count}</td>
                        <td className="px-3 py-2 text-right">{board.length}</td>
                      </tr>
                    ))}

                    {cuttingList.pictureFrame.length > 0 && (
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <td className="px-3 py-2 font-semibold" colSpan={3}>Picture frame</td>
                      </tr>
                    )}
                    {cuttingList.pictureFrame.map((piece, index) => (
                      <tr key={`picture-frame-${index}`} className="border-b border-slate-100">
                        <td className="px-3 py-2">Perimeter board ({piece.length}mm)</td>
                        <td className="px-3 py-2 text-right">{piece.count}</td>
                        <td className="px-3 py-2 text-right">{piece.length}</td>
                      </tr>
                    ))}

                    {cuttingList.fascia.length > 0 && (
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <td className="px-3 py-2 font-semibold" colSpan={3}>Fascia</td>
                      </tr>
                    )}
                    {cuttingList.fascia.map((piece, index) => (
                      <tr key={`fascia-${index}`} className="border-b border-slate-100">
                        <td className="px-3 py-2">Fascia run ({piece.length}mm)</td>
                        <td className="px-3 py-2 text-right">{piece.count}</td>
                        <td className="px-3 py-2 text-right">{piece.length}</td>
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
          {(cuttingList.boards.length > 0 || cuttingList.pictureFrame.length > 0) && (
            <p className="text-[11px] text-slate-500 mt-2">
              Surface board total length: {Math.round(cuttingList.totalBoardLength)} mm
            </p>
          )}
          {cuttingList.fascia.length > 0 && (
            <p className="text-[11px] text-slate-500">
              Fascia total length: {Math.round(cuttingList.totalFasciaLength)} mm
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
