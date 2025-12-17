import { useEffect, useMemo, useRef, useState } from "react";
import Konva from "konva";
import { Circle, Group, Layer, Line, Rect, Shape, Stage, Text } from "react-konva";
import { useDeckingStore } from "@/store/deckingStore";
import { mmToPx, pxToMm, BOARD_WIDTH_MM } from "@/lib/deckingGeometry";
import {
  CLOSE_SHAPE_SNAP_RADIUS_MM,
  ENDPOINT_SNAP_RADIUS_MM,
  findSnapPoint,
  getDistance,
  snapToAngle,
} from "@/geometry/snapping";
import { angleDegAtVertex, normalise } from "@/geometry/deckingAngles";
import { edgeLengthMm, isEdgeLocked } from "@/geometry/deckingEdges";

const BASE_LABEL_OFFSET = 32;
const BASE_FONT_SIZE = 14;
const BASE_PADDING = 8;
const BASE_CORNER_RADIUS = 6;
const BASE_HIT_PADDING = 6;
const BASE_MARKER_RADIUS = 18;
const BASE_HIT_RADIUS = 28;
const BASE_ANGLE_FONT_SIZE = 12;

type Segment = {
  start: { x: number; y: number };
  end: { x: number; y: number };
};

function formatLength(lengthMm: number): string {
  if (lengthMm >= 1000) {
    return `${(lengthMm / 1000).toFixed(2)}m`;
  }
  return `${Math.round(lengthMm)}mm`;
}

function computeCentroid(points: { x: number; y: number }[], treatAsClosed: boolean = true) {
  if (points.length === 0) return null;

  if (treatAsClosed && points.length >= 3) {
    let area = 0;
    let cx = 0;
    let cy = 0;

    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      const cross = points[i].x * points[j].y - points[j].x * points[i].y;
      area += cross;
      cx += (points[i].x + points[j].x) * cross;
      cy += (points[i].y + points[j].y) * cross;
    }

    if (area !== 0) {
      area *= 0.5;
      return {
        x: cx / (6 * area),
        y: cy / (6 * area),
      };
    }
  }

  const sum = points.reduce(
    (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
    { x: 0, y: 0 }
  );

  return { x: sum.x / points.length, y: sum.y / points.length };
}

function getSegments(points: { x: number; y: number }[], closed: boolean): Segment[] {
  const segments: Segment[] = [];
  if (points.length < 2) return segments;

  for (let i = 0; i < points.length - 1; i++) {
    segments.push({ start: points[i], end: points[i + 1] });
  }

  if (closed && points.length > 2) {
    segments.push({ start: points[points.length - 1], end: points[0] });
  }

  return segments;
}

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
  const [edgeEditorPos, setEdgeEditorPos] = useState<{ x: number; y: number } | null>(null);
  const [lockAfterApply, setLockAfterApply] = useState(false);

  const {
    boards,
    polygon,
    selectedColor,
    setPolygon,
    boardDirection,
    updateEdgeLength,
    lockEdgeLength,
    unlockEdgeLength,
    edgeConstraints,
  } = useDeckingStore();

  const stageScale = scale;

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

    const lastPoint = points[points.length - 1];
    const snapped = getSnappedPointer(pointer, lastPoint, e.evt.altKey);

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

    const anchor = isDrawing && points.length > 0 ? points[points.length - 1] : null;
    const snapped = getSnappedPointer(pointer, anchor, e.evt.altKey);

    if (!isDrawing) {
      setIsDrawing(true);
      setPoints([snapped]);
      setPreviewPoint(snapped);
      return;
    }

    if (points.length >= 2) {
      const distanceToStart = getDistance(points[0], snapped);
      if (distanceToStart <= CLOSE_SHAPE_SNAP_RADIUS_MM) {
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

    setPoints([...points, snapped]);
    setPreviewPoint(snapped);
  };

  const fillColor = COLOR_MAP[selectedColor] || "#92400e";
  const hasPolygon = polygon.length >= 3;
  const drawingPoints = previewPoint ? [...points, previewPoint] : points;
  const polygonPointsPx = polygon.flatMap((p) => [mmToPx(p.x), mmToPx(p.y)]);
  const polygonPointsPxCoords = useMemo(
    () => polygon.map((p) => ({ x: mmToPx(p.x), y: mmToPx(p.y) })),
    [polygon]
  );
  const drawingPointsPx = drawingPoints.flatMap((p) => [mmToPx(p.x), mmToPx(p.y)]);
  const boardOverlapMm = 1;
  const boardRenderWidthMm = BOARD_WIDTH_MM + boardOverlapMm;
  const boardPitchMm = BOARD_WIDTH_MM;
  const gridLines: JSX.Element[] = [];

  const getSnappedPointer = (
    pointer: { x: number; y: number },
    anchor: { x: number; y: number } | null,
    disableAngleSnap?: boolean
  ) => {
    const worldPosMm = {
      x: pxToMm((pointer.x - stagePos.x) / scale),
      y: pxToMm((pointer.y - stagePos.y) / scale),
    };

    const boardEndpoints = boards.flatMap((board) => [board.start, board.end]);
    const allPoints = [...points, ...polygon, ...boardEndpoints];
    const snapPoint = findSnapPoint(worldPosMm, allPoints, ENDPOINT_SNAP_RADIUS_MM);
    const snappedToPoint = Boolean(snapPoint);
    let candidate = snapPoint || worldPosMm;

    if (anchor && !snappedToPoint && !disableAngleSnap) {
      candidate = snapToAngle(anchor, candidate);
    }

    return candidate;
  };

  const polygonCentroid = useMemo(() => computeCentroid(polygon), [polygon]);
  const drawingCentre = useMemo(() => computeCentroid(points, false), [points]);

  const polygonSegments = useMemo(() => getSegments(polygon, true), [polygon]);
  const drawingSegments = useMemo(
    () => getSegments(points, false),
    [points]
  );

  const boardRects = useMemo(() => {
    if (polygon.length < 3) return [];

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    polygon.forEach((p) => {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    });

    const bleedMm = BOARD_WIDTH_MM * 2;
    const spanX = maxX - minX;
    const spanY = maxY - minY;
    const rects: { x: number; y: number; width: number; height: number }[] = [];

    if (boardDirection === "horizontal") {
      const startX = minX - bleedMm - boardRenderWidthMm;
      const totalWidth = spanX + bleedMm * 2 + boardRenderWidthMm * 2;
      const startY = minY - bleedMm - boardRenderWidthMm;
      const totalHeight = spanY + bleedMm * 2 + boardRenderWidthMm * 2;
      const rows = Math.ceil(totalHeight / boardPitchMm) + 1;

      for (let i = 0; i < rows; i++) {
        const y = startY + i * boardPitchMm;
        rects.push({ x: startX, y, width: totalWidth, height: boardRenderWidthMm });
      }
    } else {
      const startY = minY - bleedMm - boardRenderWidthMm;
      const totalHeight = spanY + bleedMm * 2 + boardRenderWidthMm * 2;
      const startX = minX - bleedMm - boardRenderWidthMm;
      const totalWidth = spanX + bleedMm * 2 + boardRenderWidthMm * 2;
      const columns = Math.ceil(totalWidth / boardPitchMm) + 1;

      for (let i = 0; i < columns; i++) {
        const x = startX + i * boardPitchMm;
        rects.push({ x, y: startY, width: boardRenderWidthMm, height: totalHeight });
      }
    }

    return rects;
  }, [polygon, boardDirection, boardPitchMm, boardRenderWidthMm]);

  const computeLabelPosition = (
    segment: Segment,
    center: { x: number; y: number } | null
  ) => {
    const startPx = { x: mmToPx(segment.start.x), y: mmToPx(segment.start.y) };
    const endPx = { x: mmToPx(segment.end.x), y: mmToPx(segment.end.y) };

    const dxPx = endPx.x - startPx.x;
    const dyPx = endPx.y - startPx.y;
    const lengthPx = Math.hypot(dxPx, dyPx);
    if (lengthPx === 0) return null;

    const midPoint = {
      x: (startPx.x + endPx.x) / 2,
      y: (startPx.y + endPx.y) / 2,
    };

    const perp = { x: -dyPx / lengthPx, y: dxPx / lengthPx };
    const centrePx = center
      ? { x: mmToPx(center.x), y: mmToPx(center.y) }
      : midPoint;
    const toMid = { x: midPoint.x - centrePx.x, y: midPoint.y - centrePx.y };

    const dot1 = perp.x * toMid.x + perp.y * toMid.y;
    const dot2 = -perp.x * toMid.x + -perp.y * toMid.y;
    const outwardNormal = dot1 < dot2 ? { x: -perp.x, y: -perp.y } : perp;

    const labelOffset = BASE_LABEL_OFFSET / stageScale;
    return {
      x: midPoint.x + outwardNormal.x * labelOffset,
      y: midPoint.y + outwardNormal.y * labelOffset,
    };
  };

  const renderDimensionLabel = (
    segment: Segment,
    key: string,
    center: { x: number; y: number } | null,
    options?: { edgeIndex?: number; isPreview?: boolean }
  ) => {
    const startPx = { x: mmToPx(segment.start.x), y: mmToPx(segment.start.y) };
    const endPx = { x: mmToPx(segment.end.x), y: mmToPx(segment.end.y) };

    const dxPx = endPx.x - startPx.x;
    const dyPx = endPx.y - startPx.y;
    const lengthPx = Math.hypot(dxPx, dyPx);
    const lengthMm = getDistance(segment.start, segment.end);

    if (lengthPx === 0 || lengthMm === 0) return null;

    const midPoint = {
      x: (startPx.x + endPx.x) / 2,
      y: (startPx.y + endPx.y) / 2,
    };

    const labelPos = computeLabelPosition(segment, center) || midPoint;

    const text = formatLength(lengthMm);
    const fontSize = BASE_FONT_SIZE / stageScale;
    const padding = BASE_PADDING / stageScale;
    const hitPadding = BASE_HIT_PADDING / stageScale;
    const cornerRadius = BASE_CORNER_RADIUS / stageScale;
    const textWidth = text.length * fontSize * 0.6;
    const contentWidth = textWidth + padding * 2;
    const contentHeight = fontSize + padding * 2;
    const rectWidth = contentWidth + hitPadding * 2;
    const rectHeight = contentHeight + hitPadding * 2;

    const locked = options?.edgeIndex !== undefined
      ? isEdgeLocked(edgeConstraints, options.edgeIndex)
      : false;

    const handleClick = options?.edgeIndex !== undefined
      ? (e: any) => handleLabelClick(options.edgeIndex as number, lengthMm, labelPos, e)
      : undefined;

    return (
      <Group
        key={key}
        x={labelPos.x}
        y={labelPos.y}
        listening
        onClick={handleClick}
      >
        <Rect
          width={rectWidth}
          height={rectHeight}
          offsetX={rectWidth / 2}
          offsetY={rectHeight / 2}
          cornerRadius={cornerRadius}
          fill={locked ? "rgba(30,41,59,0.95)" : "rgba(15,23,42,0.8)"}
          stroke="rgba(255,255,255,0.65)"
          strokeWidth={1 / stageScale}
        />
        <Text
          width={contentWidth}
          height={contentHeight}
          offsetX={contentWidth / 2}
          offsetY={contentHeight / 2}
          text={`${text}${locked ? " 🔒" : ""}`}
          fontSize={fontSize}
          fill="#f8fafc"
          align="center"
          verticalAlign="middle"
        />
      </Group>
    );
  };

  const handleLabelClick = (
    edgeIndex: number,
    lengthMm: number,
    labelPos: { x: number; y: number },
    e: any
  ) => {
    e.cancelBubble = true;
    setEditingEdgeIndex(edgeIndex);
    setEditValue((lengthMm / 1000).toFixed(2));
    setLockAfterApply(isEdgeLocked(edgeConstraints, edgeIndex));
    setEdgeEditorPos({
      x: stagePos.x + labelPos.x * scale,
      y: stagePos.y + labelPos.y * scale,
    });
  };

  const renderCornerMarkers = () => {
    if (!hasPolygon) return null;

    const r = BASE_MARKER_RADIUS / stageScale;
    const hitR = BASE_HIT_RADIUS / stageScale;
    const fontSize = BASE_ANGLE_FONT_SIZE / stageScale;
    const strokeWidth = 1 / stageScale;

    return polygon.map((_, i) => {
      const n = polygon.length;
      const prev = polygon[(i - 1 + n) % n];
      const curr = polygon[i];
      const next = polygon[(i + 1) % n];

      const currPx = { x: mmToPx(curr.x), y: mmToPx(curr.y) };
      const prevPx = { x: mmToPx(prev.x), y: mmToPx(prev.y) };
      const nextPx = { x: mmToPx(next.x), y: mmToPx(next.y) };

      const u1 = normalise({ x: prevPx.x - currPx.x, y: prevPx.y - currPx.y });
      const u2 = normalise({ x: nextPx.x - currPx.x, y: nextPx.y - currPx.y });

      const angleDeg = angleDegAtVertex(polygon, i);
      const isRightAngle = Math.abs(angleDeg - 90) < 1;
      const stroke = isRightAngle ? "#0ea5e9" : "#0f172a";

      const pA = { x: u1.x * r, y: u1.y * r };
      const pB = { x: u2.x * r, y: u2.y * r };
      const pC = { x: (u1.x + u2.x) * r, y: (u1.y + u2.y) * r };

      const start = Math.atan2(u1.y, u1.x);
      let end = Math.atan2(u2.y, u2.x);
      let delta = end - start;
      while (delta <= -Math.PI) delta += Math.PI * 2;
      while (delta > Math.PI) delta -= Math.PI * 2;
      end = start + delta;
      const anticlockwise = delta < 0;

      const bisector = normalise({ x: u1.x + u2.x, y: u1.y + u2.y });
      const labelDir = bisector.x === 0 && bisector.y === 0 ? u1 : bisector;
      const labelPos = {
        x: labelDir.x * (r + 6 / stageScale),
        y: labelDir.y * (r + 6 / stageScale),
      };

      return (
        <Group
          key={`corner-${i}`}
          x={currPx.x}
          y={currPx.y}
          listening={false}
        >
          <Circle radius={hitR} opacity={0} />
          {isRightAngle ? (
            <Line points={[pA.x, pA.y, pC.x, pC.y, pB.x, pB.y]} stroke={stroke} strokeWidth={strokeWidth} />
          ) : (
            <Shape
              stroke={stroke}
              strokeWidth={strokeWidth}
              sceneFunc={(ctx, shape) => {
                ctx.beginPath();
                ctx.arc(0, 0, r, start, end, anticlockwise);
                ctx.strokeShape(shape);
              }}
            />
          )}
          <Text
            x={labelPos.x}
            y={labelPos.y}
            text={`${Math.round(angleDeg)}°`}
            fontSize={fontSize}
            fill={stroke}
            offsetX={(labelDir.x * fontSize) / 2}
            offsetY={(labelDir.y * fontSize) / 2}
          />
        </Group>
      );
    });
  };

  const handleLabelSubmit = () => {
    if (editingEdgeIndex !== null && editValue) {
      const metres = parseFloat(editValue);
      if (!isNaN(metres) && metres > 0) {
        updateEdgeLength(editingEdgeIndex, metres * 1000);
        if (lockAfterApply) {
          lockEdgeLength(editingEdgeIndex);
        }
      }
    }
    setEditingEdgeIndex(null);
    setEditValue("");
    setEdgeEditorPos(null);
    setLockAfterApply(false);
  };

  const handleUnlockEdge = () => {
    if (editingEdgeIndex === null) return;
    unlockEdgeLength(editingEdgeIndex);
    const length = edgeLengthMm(polygon, editingEdgeIndex);
    setEditValue((length / 1000).toFixed(2));
    setLockAfterApply(false);
  };

  const editingLocked =
    editingEdgeIndex !== null && isEdgeLocked(edgeConstraints, editingEdgeIndex);
  const editingEdgeLengthMm =
    editingEdgeIndex !== null ? edgeLengthMm(polygon, editingEdgeIndex) : 0;
  const editorPosition = edgeEditorPos || {
    x: stageSize.width / 2,
    y: 32,
  };

  return (
    <div
      ref={containerRef}
      className="flex-1 bg-slate-50 overflow-hidden relative"
      onContextMenu={(e) => e.preventDefault()}
    >
      {editingEdgeIndex !== null && (
        <div
          className="absolute z-50 bg-white p-4 rounded-lg shadow-lg border border-slate-200"
          style={{ left: editorPosition.x, top: editorPosition.y }}
        >
          <div className="text-xs text-slate-600 mb-2">
            Edge {editingEdgeIndex + 1} {editingLocked ? "(Locked)" : ""}
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-[11px] text-slate-600">Length (m)</label>
            <input
              type="number"
              step="0.1"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !editingLocked) handleLabelSubmit();
                if (e.key === "Escape") {
                  setEditingEdgeIndex(null);
                  setEditValue("");
                  setEdgeEditorPos(null);
                  setLockAfterApply(false);
                }
              }}
              disabled={editingLocked}
              className="px-3 py-2 border border-slate-300 rounded-md text-sm font-mono w-24 disabled:bg-slate-100"
              autoFocus
            />
            {editingLocked ? (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1">
                Locked at {formatLength(editingEdgeLengthMm)}
              </div>
            ) : (
              <label className="flex items-center gap-2 text-[11px] text-slate-600">
                <input
                  type="checkbox"
                  checked={lockAfterApply}
                  onChange={(e) => setLockAfterApply(e.target.checked)}
                />
                Lock after applying
              </label>
            )}
            <div className="flex gap-2 mt-1">
              <button
                onClick={handleLabelSubmit}
                disabled={editingLocked}
                className="px-3 py-1 bg-blue-600 text-white rounded text-xs disabled:opacity-50"
              >
                Apply
              </button>
              <button
                onClick={() => {
                  setEditingEdgeIndex(null);
                  setEditValue("");
                  setEdgeEditorPos(null);
                  setLockAfterApply(false);
                }}
                className="px-3 py-1 bg-slate-200 rounded text-xs"
              >
                Close
              </button>
              {editingLocked ? (
                <button
                  onClick={handleUnlockEdge}
                  className="px-3 py-1 bg-amber-100 text-amber-700 rounded text-xs"
                >
                  Unlock
                </button>
              ) : (
                <button
                  onClick={() => lockEdgeLength(editingEdgeIndex)}
                  className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded text-xs"
                >
                  Lock
                </button>
              )}
            </div>
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

          {hasPolygon && boardRects.length > 0 && (
            <Group
              clipFunc={(ctx) => {
                if (polygonPointsPxCoords.length === 0) return;
                ctx.beginPath();
                ctx.moveTo(polygonPointsPxCoords[0].x, polygonPointsPxCoords[0].y);
                polygonPointsPxCoords.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
                ctx.closePath();
              }}
            >
              {boardRects.map((rect, index) => (
                <Rect
                  key={`board-${index}`}
                  x={mmToPx(rect.x)}
                  y={mmToPx(rect.y)}
                  width={mmToPx(rect.width)}
                  height={mmToPx(rect.height)}
                  fill={fillColor}
                  opacity={0.6}
                  data-testid={`board-${index}`}
                />
              ))}
            </Group>
          )}
        </Layer>

        <Layer listening={false}>{renderCornerMarkers()}</Layer>

        <Layer listening>
          {polygonSegments.map((segment, index) =>
            renderDimensionLabel(
              segment,
              `polygon-label-${index}`,
              polygonCentroid,
              { edgeIndex: index }
            )
          )}

          {drawingSegments.map((segment, index) =>
            renderDimensionLabel(
              segment,
              `drawing-label-${index}`,
              drawingCentre
            )
          )}

          {previewPoint && points.length > 0 &&
            renderDimensionLabel(
              { start: points[points.length - 1], end: previewPoint },
              "preview-label",
              drawingCentre,
              { isPreview: true }
            )}
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
