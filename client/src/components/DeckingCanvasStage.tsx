import { useEffect, useRef, useState } from "react";
import { Stage, Layer, Rect, Text, Line } from "react-konva";
import { useDeckingStore } from "@/store/deckingStore";
import { GRID_SIZE_MM, mmToPx, pxToMm, BOARD_WIDTH_MM } from "@/lib/deckingGeometry";
import { getAngle, getDistance, snapAngleTo45Degrees, findSnapPoint } from "@/geometry/snapping";

const GRID_SIZE = mmToPx(GRID_SIZE_MM);
const GRID_COLOR = "#e0e0e0";
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
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPos, setLastPanPos] = useState<{ x: number; y: number } | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [points, setPoints] = useState<{ x: number; y: number }[]>([]);
  const [previewPoint, setPreviewPoint] = useState<{ x: number; y: number } | null>(null);

  const { boards, polygon, selectedColor, setPolygon, boardDirection } = useDeckingStore();

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
      return;
    }

    if (!isDrawing || points.length === 0) return;

    const worldPosMm = {
      x: pxToMm((pointer.x - stagePos.x) / scale),
      y: pxToMm((pointer.y - stagePos.y) / scale),
    };

    const boardEndpoints = boards.flatMap((board) => [board.start, board.end]);
    const allPoints = [...points, ...polygon, ...boardEndpoints];
    const snapped = findSnapPoint(worldPosMm, allPoints) || worldPosMm;

    const lastPoint = points[points.length - 1];
    const angle = getAngle(lastPoint, snapped);
    const snappedAngle = snapAngleTo45Degrees(angle);
    const distance = getDistance(lastPoint, snapped);

    const preview = {
      x: lastPoint.x + Math.cos(snappedAngle) * distance,
      y: lastPoint.y + Math.sin(snappedAngle) * distance,
    };
    setPreviewPoint(preview);
  };

  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
      setLastPanPos(null);
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
    const angle = getAngle(lastPoint, snapped);
    const snappedAngle = snapAngleTo45Degrees(angle);
    const distance = getDistance(lastPoint, snapped);
    const nextPoint = {
      x: lastPoint.x + Math.cos(snappedAngle) * distance,
      y: lastPoint.y + Math.sin(snappedAngle) * distance,
    };

    setPoints([...points, nextPoint]);
    setPreviewPoint(nextPoint);
  };

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
  const hasPolygon = polygon.length >= 3;
  const drawingPoints = previewPoint ? [...points, previewPoint] : points;
  const polygonPointsPx = polygon.flatMap((p) => [mmToPx(p.x), mmToPx(p.y)]);
  const drawingPointsPx = drawingPoints.flatMap((p) => [mmToPx(p.x), mmToPx(p.y)]);

  return (
    <div
      ref={containerRef}
      className="flex-1 bg-slate-50 overflow-hidden relative"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 bg-white px-4 py-2 rounded shadow text-xs text-slate-600">
        {isDrawing ? "Click near the first point to close the shape." : "Click to start outlining your deck."}
      </div>

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
