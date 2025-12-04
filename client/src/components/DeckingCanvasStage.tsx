import { useEffect, useRef, useState } from "react";
import Konva from "konva";
import { Stage, Layer, Text, Line } from "react-konva";
import { useDeckingStore } from "@/store/deckingStore";
import { GRID_SIZE_MM, mmToPx, pxToMm, BOARD_WIDTH_MM } from "@/lib/deckingGeometry";
import { findSnapPoint, getDistance } from "@/geometry/snapping";

const CLOSE_TOLERANCE_MM = 150;

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
  const [panStart, setPanStart] = useState<
    { client: { x: number; y: number }; stage: { x: number; y: number } } | null
  >(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [points, setPoints] = useState<{ x: number; y: number }[]>([]);
  const [previewPoint, setPreviewPoint] = useState<{ x: number; y: number } | null>(null);
  const [editingEdgeIndex, setEditingEdgeIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  const { boards, polygon, selectedColor, setPolygon, boardDirection, updateEdgeLength } =
    useDeckingStore();

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

  const screenToWorld = (point: { x: number; y: number }) => ({
    x: pxToMm((point.x - stagePos.x) / scale),
    y: pxToMm((point.y - stagePos.y) / scale),
  });

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const worldBefore = screenToWorld(pointer);
    const worldBeforePx = { x: mmToPx(worldBefore.x), y: mmToPx(worldBefore.y) };

    const zoomFactor = e.evt.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.25, Math.min(8, scale * zoomFactor));

    setScale(newScale);
    setStagePos({
      x: pointer.x - worldBeforePx.x * newScale,
      y: pointer.y - worldBeforePx.y * newScale,
    });
  };

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!pointer) return;

    if (e.evt.button === 2) {
      setPanStart({
        client: { x: e.evt.clientX, y: e.evt.clientY },
        stage: { ...stagePos },
      });
      return;
    }

  };

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (panStart) {
      const { clientX, clientY } = e.evt;
      const deltaX = clientX - panStart.client.x;
      const deltaY = clientY - panStart.client.y;
      setStagePos({
        x: panStart.stage.x + deltaX,
        y: panStart.stage.y + deltaY,
      });
      return;
    }

    const stage = e.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!pointer) return;

    if (!isDrawing || points.length === 0) return;

    const worldPosMm = {
      x: pxToMm((pointer.x - stagePos.x) / scale),
      y: pxToMm((pointer.y - stagePos.y) / scale),
    };

    const boardEndpoints = boards.flatMap((board) => [board.start, board.end]);
    const allPoints = [...points, ...polygon, ...boardEndpoints];
    const snapped = findSnapPoint(worldPosMm, allPoints) || worldPosMm;

    setPreviewPoint(snapped);
  };

  const handleMouseUp = () => {
    if (panStart) {
      setPanStart(null);
    }
  };

  const handleStageClick = (e: any) => {
    if (e.evt.button === 2) return;
    if (e.target !== e.target.getStage()) return;

    const stage = e.target.getStage();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const worldPosMm = {
      x: pxToMm((pointer.x - stagePos.x) / scale),
      y: pxToMm((pointer.y - stagePos.y) / scale),
    };

    const boardEndpoints = boards.flatMap((board) => [board.start, board.end]);
    const allPoints = [...points, ...polygon, ...boardEndpoints];
    const snapped = findSnapPoint(worldPosMm, allPoints) || worldPosMm;

    if (!isDrawing) {
      setIsDrawing(true);
      setPoints([snapped]);
      setPreviewPoint(snapped);
      return;
    }

    if (points.length >= 2) {
      const distanceToStart = getDistance(points[0], snapped);
      if (distanceToStart <= CLOSE_TOLERANCE_MM) {
        const newPolygon = [...points];
        if (newPolygon.length >= 3) {
          setPolygon(newPolygon);
        }
        setPoints([]);
        setPreviewPoint(null);
        setIsDrawing(false);
        return;
      }
    }

    const lastPoint = points[points.length - 1];
    setPoints([...points, snapped]);
    setPreviewPoint(snapped);
  };

  const fillColor = COLOR_MAP[selectedColor] || "#92400e";
  const hasPolygon = polygon.length >= 3;
  const drawingPoints = previewPoint ? [...points, previewPoint] : points;
  const polygonPointsPx = polygon.flatMap((p) => [mmToPx(p.x), mmToPx(p.y)]);
  const drawingPointsPx = drawingPoints.flatMap((p) => [mmToPx(p.x), mmToPx(p.y)]);

  const gridSpacingPx = mmToPx(GRID_SIZE_MM);

  const worldMinX = (0 - stagePos.x) / scale;
  const worldMaxX = (stageSize.width - stagePos.x) / scale;
  const worldMinY = (0 - stagePos.y) / scale;
  const worldMaxY = (stageSize.height - stagePos.y) / scale;

  const gridLines: JSX.Element[] = [];

  const startX = Math.floor(worldMinX / gridSpacingPx) * gridSpacingPx;
  for (let x = startX; x <= worldMaxX; x += gridSpacingPx) {
    gridLines.push(
      <Line
        key={`grid-v-${x}`}
        points={[x, worldMinY, x, worldMaxY]}
        stroke="#e0e0e0"
        strokeWidth={1 / scale}
        listening={false}
      />
    );
  }

  const startY = Math.floor(worldMinY / gridSpacingPx) * gridSpacingPx;
  for (let y = startY; y <= worldMaxY; y += gridSpacingPx) {
    gridLines.push(
      <Line
        key={`grid-h-${y}`}
        points={[worldMinX, y, worldMaxX, y]}
        stroke="#e0e0e0"
        strokeWidth={1 / scale}
        listening={false}
      />
    );
  }

  const handleLabelClick = (edgeIndex: number, lengthMm: number, e: any) => {
    e.cancelBubble = true;
    setEditingEdgeIndex(edgeIndex);
    setEditValue((lengthMm / 1000).toFixed(2));
  };

  const handleLabelSubmit = () => {
    if (editingEdgeIndex !== null && editValue) {
      const metres = parseFloat(editValue);
      if (!isNaN(metres) && metres > 0) {
        updateEdgeLength(editingEdgeIndex, metres * 1000);
      }
    }
    setEditingEdgeIndex(null);
    setEditValue("");
  };

  return (
    <div
      ref={containerRef}
      className="flex-1 bg-slate-50 overflow-hidden relative"
      onContextMenu={(e) => e.preventDefault()}
    >
      {editingEdgeIndex !== null && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 bg-white p-4 rounded-lg shadow-lg border border-slate-200">
          <input
            type="number"
            step="0.1"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleLabelSubmit();
              if (e.key === "Escape") {
                setEditingEdgeIndex(null);
                setEditValue("");
              }
            }}
            className="px-3 py-2 border border-slate-300 rounded-md text-sm font-mono w-24"
            autoFocus
          />
          <div className="flex gap-2 mt-2">
            <button onClick={handleLabelSubmit} className="px-3 py-1 bg-blue-600 text-white rounded text-xs">
              Apply
            </button>
            <button
              onClick={() => {
                setEditingEdgeIndex(null);
                setEditValue("");
              }}
              className="px-3 py-1 bg-slate-200 rounded text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 bg-white px-4 py-2 rounded shadow text-xs text-slate-600">
        {isDrawing ? "Click near the first point to close the shape." : "Click to start outlining your deck."}
      </div>

      <Stage
        className="absolute inset-0"
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
        <Layer listening={false}>{gridLines}</Layer>

        <Layer>
          {!hasPolygon && !isDrawing && (
            <Text
              x={stageSize.width / (2 * scale) - stagePos.x / scale - 140}
              y={stageSize.height / (2 * scale) - stagePos.y / scale - 10}
              text="Click to begin drawing your deck outline"
              fontSize={16}
              fill="#94a3b8"
            />
          )}

          {hasPolygon && (
            <Line
              points={polygonPointsPx}
              closed
              fill={fillColor}
              opacity={0.35}
              stroke={fillColor}
              strokeWidth={2}
            />
          )}

          {drawingPoints.length > 0 && (
            <Line
              points={drawingPointsPx}
              stroke="#2563eb"
              strokeWidth={3}
              dash={[6, 6]}
              closed={false}
            />
          )}

          {hasPolygon &&
            polygon.map((point, index) => {
              const nextPoint = polygon[(index + 1) % polygon.length];

              const startPx = { x: mmToPx(point.x), y: mmToPx(point.y) };
              const endPx = { x: mmToPx(nextPoint.x), y: mmToPx(nextPoint.y) };

              const dxPx = endPx.x - startPx.x;
              const dyPx = endPx.y - startPx.y;
              const lengthPx = Math.sqrt(dxPx * dxPx + dyPx * dyPx);
              const lengthMm = Math.sqrt(
                Math.pow(nextPoint.x - point.x, 2) + Math.pow(nextPoint.y - point.y, 2)
              );

              if (lengthPx === 0 || lengthMm === 0) return null;

              const midPoint = {
                x: (startPx.x + endPx.x) / 2,
                y: (startPx.y + endPx.y) / 2,
              };

              const perpX = -dyPx / lengthPx;
              const perpY = dxPx / lengthPx;
              const labelOffset = 12;

              const labelPoint = {
                x: midPoint.x + perpX * labelOffset,
                y: midPoint.y + perpY * labelOffset,
              };

              return (
                <Text
                  key={`edge-label-${index}`}
                  x={labelPoint.x - 30}
                  y={labelPoint.y - 10}
                  text={`${(lengthMm / 1000).toFixed(2)}m`}
                  fontSize={12}
                  fill="#1e293b"
                  padding={4}
                  onClick={(e) => handleLabelClick(index, lengthMm, e)}
                  listening
                />
              );
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

      <div className="absolute bottom-4 left-4 bg-white px-3 py-2 rounded shadow text-xs text-slate-600">
        <div className="font-semibold text-slate-700">Controls</div>
        <div>Left click to add points.</div>
        <div>Right click + drag to pan. Scroll to zoom.</div>
        <div>Board direction: {boardDirection === "horizontal" ? "Horizontal" : "Vertical"}</div>
      </div>
    </div>
  );
}
