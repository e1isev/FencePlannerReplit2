import { useRef, useState, useEffect } from "react";
import { Stage, Layer, Rect, Text, Circle, Arc, Line } from "react-konva";
import { useDeckingStore } from "@/store/deckingStore";
import { mmToPx, pxToMm, BOARD_WIDTH_MM, GRID_SIZE_MM } from "@/lib/deckingGeometry";

const GRID_SIZE = mmToPx(GRID_SIZE_MM);
const GRID_COLOR = "#e0e0e0";
const DEFAULT_SHAPE_SIZE_MM = 2000; // 2000mm = 2m default size

const COLOR_MAP: Record<string, string> = {
  "storm-granite": "#6b7280",
  "mallee-bark": "#92400e",
  "ironbark-ember": "#78350f",
  "saltbush-veil": "#a8a29e",
  "outback": "#a16207",
  "coastal-spiniflex": "#713f12",
  "wild-shore": "#57534e",
  "coastal-sandstone": "#d6d3d1",
};

export function DeckingCanvasStage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const [scale, setScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPos, setLastPanPos] = useState<{ x: number; y: number } | null>(null);
  const [editingShapeId, setEditingShapeId] = useState<string | null>(null);
  const [editDimension, setEditDimension] = useState<"width" | "height" | null>(null);
  const [editValue, setEditValue] = useState("");

  const {
    shapes,
    boards,
    selectedShapeType,
    selectedShapeId,
    selectedColor,
    addShape,
    updateShape,
    setSelectedShapeId,
    setSelectedShapeType,
  } = useDeckingStore();

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setStageSize({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        });
      }
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    const oldScale = scale;
    const pointer = stage.getPointerPosition();
    const mousePointTo = {
      x: (pointer.x - stagePos.x) / oldScale,
      y: (pointer.y - stagePos.y) / oldScale,
    };
    const newScale = e.evt.deltaY > 0 ? oldScale * 0.9 : oldScale * 1.1;
    const clampedScale = Math.max(0.5, Math.min(3, newScale));
    setScale(clampedScale);
    setStagePos({
      x: pointer.x - mousePointTo.x * clampedScale,
      y: pointer.y - mousePointTo.y * clampedScale,
    });
  };

  const handleMouseDown = (e: any) => {
    const stage = e.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!pointer) return;

    if (e.evt.button === 2) {
      setIsPanning(true);
      setLastPanPos({ x: pointer.x, y: pointer.y });
      return;
    }
  };

  const handleMouseMove = (e: any) => {
    const stage = e.target.getStage();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    if (isPanning && lastPanPos) {
      const deltaX = pointer.x - lastPanPos.x;
      const deltaY = pointer.y - lastPanPos.y;
      setStagePos({
        x: stagePos.x + deltaX,
        y: stagePos.y + deltaY,
      });
      setLastPanPos({ x: pointer.x, y: pointer.y });
    }
  };

  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
      setLastPanPos(null);
    }
  };

  const handleStageClick = (e: any) => {
    if (e.target === e.target.getStage()) {
      setSelectedShapeId(null);
      if (selectedShapeType) {
        const stage = e.target.getStage();
        const pointerPosition = stage.getPointerPosition();
        const worldPosPx = {
          x: (pointerPosition.x - stagePos.x) / scale,
          y: (pointerPosition.y - stagePos.y) / scale,
        };
        const worldPosMm = {
          x: pxToMm(worldPosPx.x),
          y: pxToMm(worldPosPx.y),
        };
        addShape(worldPosMm, DEFAULT_SHAPE_SIZE_MM, DEFAULT_SHAPE_SIZE_MM);
        setSelectedShapeType(null);
      }
    }
  };

  const handleDimensionClick = (shapeId: string, dimension: "width" | "height", currentValue: number, e: any) => {
    e.cancelBubble = true;
    setEditingShapeId(shapeId);
    setEditDimension(dimension);
    setEditValue((currentValue / 1000).toFixed(2));
  };

  const handleDimensionSubmit = () => {
    if (editingShapeId && editDimension && editValue) {
      const metres = parseFloat(editValue);
      if (!isNaN(metres) && metres > 0) {
        updateShape(editingShapeId, { [editDimension]: metres * 1000 });
      }
    }
    setEditingShapeId(null);
    setEditDimension(null);
    setEditValue("");
  };

  // Draw grid
  const gridLines: JSX.Element[] = [];
  for (let i = 0; i < stageSize.width / GRID_SIZE; i++) {
    gridLines.push(
      <Rect
        key={`v-${i}`}
        x={i * GRID_SIZE}
        y={0}
        width={1}
        height={stageSize.height}
        fill={GRID_COLOR}
      />
    );
  }
  for (let i = 0; i < stageSize.height / GRID_SIZE; i++) {
    gridLines.push(
      <Rect
        key={`h-${i}`}
        x={0}
        y={i * GRID_SIZE}
        width={stageSize.width}
        height={1}
        fill={GRID_COLOR}
      />
    );
  }

  const fillColor = COLOR_MAP[selectedColor] || "#92400e";

  return (
    <div ref={containerRef} className="flex-1 bg-slate-50 overflow-hidden" onContextMenu={(e) => e.preventDefault()}>
      {editingShapeId && editDimension && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 bg-white p-4 rounded-lg shadow-lg border border-slate-200">
          <input
            type="number"
            step="0.1"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleDimensionSubmit();
              if (e.key === "Escape") {
                setEditingShapeId(null);
                setEditDimension(null);
                setEditValue("");
              }
            }}
            className="px-3 py-2 border border-slate-300 rounded-md text-sm font-mono w-24"
            autoFocus
            data-testid="input-dimension"
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleDimensionSubmit}
              className="px-3 py-1 bg-primary text-primary-foreground rounded text-xs"
              data-testid="button-submit-dimension"
            >
              Apply
            </button>
            <button
              onClick={() => {
                setEditingShapeId(null);
                setEditDimension(null);
                setEditValue("");
              }}
              className="px-3 py-1 bg-slate-200 rounded text-xs"
              data-testid="button-cancel-dimension"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <Stage
        width={stageSize.width}
        height={stageSize.height}
        scaleX={scale}
        scaleY={scale}
        x={stagePos.x}
        y={stagePos.y}
        onWheel={handleWheel}
        onClick={handleStageClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <Layer listening={false}>
          {gridLines}
        </Layer>
        <Layer>
          {shapes.length === 0 && (
            <Text
              x={stageSize.width / (2 * scale) - stagePos.x / scale - 100}
              y={stageSize.height / (2 * scale) - stagePos.y / scale - 20}
              text="Select a shape and click to draw"
              fontSize={16}
              fill="#94a3b8"
            />
          )}
          {shapes.map((shape) => {
            const posPx = {
              x: mmToPx(shape.position.x),
              y: mmToPx(shape.position.y),
            };
            const sizePx = {
              width: mmToPx(shape.width),
              height: mmToPx(shape.height),
            };

            if (shape.type === "square" || shape.type === "rectangle") {
              const isSelected = selectedShapeId === shape.id;
              return (
                <>
                  <Rect
                    key={shape.id}
                    x={posPx.x}
                    y={posPx.y}
                    width={sizePx.width}
                    height={sizePx.height}
                    fill={fillColor}
                    opacity={isSelected ? 0.6 : 0.4}
                    stroke={isSelected ? "#1e40af" : fillColor}
                    strokeWidth={isSelected ? 3 : 2}
                    draggable
                    onClick={(e) => {
                      e.cancelBubble = true;
                      setSelectedShapeId(shape.id);
                    }}
                    onDragEnd={(e) => {
                      const absolutePos = e.target.getAbsolutePosition();
                      const nodePosPx = {
                        x: (absolutePos.x - stagePos.x) / scale,
                        y: (absolutePos.y - stagePos.y) / scale,
                      };
                      e.target.position({ x: posPx.x, y: posPx.y });
                      
                      const newPosMm = {
                        x: pxToMm(nodePosPx.x),
                        y: pxToMm(nodePosPx.y),
                      };
                      updateShape(shape.id, { position: newPosMm });
                    }}
                    data-testid={`shape-${shape.id}`}
                  />
                  <Text
                    key={`${shape.id}-width`}
                    x={posPx.x + sizePx.width / 2 - 30}
                    y={posPx.y - 20}
                    text={`${(shape.width / 1000).toFixed(2)}m`}
                    fontSize={14}
                    fill="#1e293b"
                    fontStyle="bold"
                    onClick={(e) => handleDimensionClick(shape.id, "width", shape.width, e)}
                    data-testid={`text-width-${shape.id}`}
                  />
                  <Text
                    key={`${shape.id}-height`}
                    x={posPx.x - 50}
                    y={posPx.y + sizePx.height / 2 - 7}
                    text={`${(shape.height / 1000).toFixed(2)}m`}
                    fontSize={14}
                    fill="#1e293b"
                    fontStyle="bold"
                    onClick={(e) => handleDimensionClick(shape.id, "height", shape.height, e)}
                    data-testid={`text-height-${shape.id}`}
                  />
                </>
              );
            } else if (shape.type === "triangle") {
              const isSelected = selectedShapeId === shape.id;
              const trianglePoints = [
                posPx.x,
                posPx.y + sizePx.height,
                posPx.x + sizePx.width,
                posPx.y + sizePx.height,
                posPx.x + sizePx.width,
                posPx.y,
              ];
              return (
                <>
                  <Line
                    key={shape.id}
                    points={trianglePoints}
                    fill={fillColor}
                    opacity={isSelected ? 0.6 : 0.4}
                    stroke={isSelected ? "#1e40af" : fillColor}
                    strokeWidth={isSelected ? 3 : 2}
                    closed={true}
                    draggable
                    onClick={(e) => {
                      e.cancelBubble = true;
                      setSelectedShapeId(shape.id);
                    }}
                    onDragEnd={(e) => {
                      const absolutePos = e.target.getAbsolutePosition();
                      const nodePosPx = {
                        x: (absolutePos.x - stagePos.x) / scale,
                        y: (absolutePos.y - stagePos.y) / scale,
                      };
                      e.target.position({ x: posPx.x, y: posPx.y });
                      
                      const newPosMm = {
                        x: pxToMm(nodePosPx.x),
                        y: pxToMm(nodePosPx.y),
                      };
                      updateShape(shape.id, { position: newPosMm });
                    }}
                    data-testid={`shape-${shape.id}`}
                  />
                  <Text
                    key={`${shape.id}-width`}
                    x={posPx.x + sizePx.width / 2 - 30}
                    y={posPx.y + sizePx.height + 5}
                    text={`${(shape.width / 1000).toFixed(2)}m`}
                    fontSize={14}
                    fill="#1e293b"
                    fontStyle="bold"
                    onClick={(e) => handleDimensionClick(shape.id, "width", shape.width, e)}
                    data-testid={`text-width-${shape.id}`}
                  />
                  <Text
                    key={`${shape.id}-height`}
                    x={posPx.x + sizePx.width + 5}
                    y={posPx.y + sizePx.height / 2 - 7}
                    text={`${(shape.height / 1000).toFixed(2)}m`}
                    fontSize={14}
                    fill="#1e293b"
                    fontStyle="bold"
                    onClick={(e) => handleDimensionClick(shape.id, "height", shape.height, e)}
                    data-testid={`text-height-${shape.id}`}
                  />
                </>
              );
            }
            return null;
          })}
          {boards.map((board) => (
            <Line
              key={board.id}
              points={[
                mmToPx(board.start.x),
                mmToPx(board.start.y),
                mmToPx(board.end.x),
                mmToPx(board.end.y),
              ]}
              stroke={fillColor}
              strokeWidth={mmToPx(BOARD_WIDTH_MM)}
              opacity={0.6}
              lineCap="butt"
              data-testid={`board-${board.id}`}
            />
          ))}
        </Layer>
      </Stage>
    </div>
  );
}
