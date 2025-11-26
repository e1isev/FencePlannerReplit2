import { useCallback, useEffect, useRef, useState } from "react";
import { Stage, Layer, Line, Circle, Text, Group, Rect } from "react-konva";
import { useAppStore } from "@/store/appStore";
import { Point } from "@/types/models";
import { findSnapPoint } from "@/geometry/snapping";
import { DEFAULT_SNAP_TOLERANCE, SNAP_RADIUS_MM } from "@/constants/geometry";
import { getSlidingReturnRect } from "@/geometry/gates";
import { LineControls } from "./LineControls";
import MapOverlay from "./MapOverlay";

const GRID_SIZE = 25;
const BASE_MAP_ZOOM = 15;

export function CanvasStage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [mapPanOffset, setMapPanOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [mapScale, setMapScale] = useState(1);
  const [mapZoom, setMapZoom] = useState(BASE_MAP_ZOOM);
  const [isMapLocked, setIsMapLocked] = useState(true);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPos, setLastPanPos] = useState<{ x: number; y: number } | null>(null);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [currentPoint, setCurrentPoint] = useState<Point | null>(null);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [lastTouchDistance, setLastTouchDistance] = useState<number | null>(null);
  const [lastTouchCenter, setLastTouchCenter] = useState<{ x: number; y: number } | null>(null);
  const lastCombinedScaleRef = useRef(1);

  const {
    lines,
    posts,
    gates,
    addLine,
    selectedGateType,
    addGate,
    updateLine,
    mmPerPixel,
    setMmPerPixel,
  } = useAppStore();

  const combinedScale = scale * mapScale;
  const normalizedMapPanOffset = {
    x: mapPanOffset.x / mapScale,
    y: mapPanOffset.y / mapScale,
  };
  const renderedStagePos = {
    x: stagePos.x + normalizedMapPanOffset.x,
    y: stagePos.y + normalizedMapPanOffset.y,
  };

  const handleZoomChange = useCallback((zoom: number) => {
    setMapZoom(zoom);
  }, []);

  const handleScaleChange = useCallback(
    (metersPerPixel: number) => {
      if (!isFinite(metersPerPixel) || metersPerPixel <= 0) return;

      const nextMmPerPixel = metersPerPixel * 1000;
      if (Math.abs(nextMmPerPixel - mmPerPixel) < 0.0001) return;

      setMmPerPixel(nextMmPerPixel);
    },
    [mmPerPixel, setMmPerPixel]
  );

  const handleMapPanOffsetChange = useCallback((offset: { x: number; y: number }) => {
    setMapPanOffset(offset);
  }, []);

  const handlePanReferenceReset = useCallback(() => {
    setStagePos((pos) => ({
      x: pos.x + mapPanOffset.x,
      y: pos.y + mapPanOffset.y,
    }));
    setMapPanOffset({ x: 0, y: 0 });
  }, [mapPanOffset.x, mapPanOffset.y]);

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        });
      }
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, []);

  useEffect(() => {
    const prevCombined = lastCombinedScaleRef.current;
    const nextCombined = combinedScale;
    if (prevCombined === nextCombined) return;

    const center = {
      x: dimensions.width / 2,
      y: dimensions.height / 2,
    };

    const newRenderedPos = {
      x: center.x - ((center.x - renderedStagePos.x) / prevCombined) * nextCombined,
      y: center.y - ((center.y - renderedStagePos.y) / prevCombined) * nextCombined,
    };

    setStagePos({
      x: newRenderedPos.x - normalizedMapPanOffset.x,
      y: newRenderedPos.y - normalizedMapPanOffset.y,
    });

    lastCombinedScaleRef.current = nextCombined;
  }, [
    combinedScale,
    dimensions.width,
    dimensions.height,
    normalizedMapPanOffset.x,
    normalizedMapPanOffset.y,
    renderedStagePos.x,
    renderedStagePos.y,
  ]);

  useEffect(() => {
    const nextMapScale = Math.pow(2, mapZoom - BASE_MAP_ZOOM);
    setMapScale(nextMapScale);
  }, [mapZoom]);

  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    if (isMapLocked) return;

    const scaleBy = 1.1;
    const stage = e.target.getStage();
    const oldScale = scale;
    const pointer = stage.getPointerPosition();

    const mousePointTo = {
      x: (pointer.x - renderedStagePos.x) / combinedScale,
      y: (pointer.y - renderedStagePos.y) / combinedScale,
    };

    const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;
    const clampedScale = Math.max(0.5, Math.min(3, newScale));
    const newCombinedScale = clampedScale * mapScale;

    setScale(clampedScale);
    const newRenderedPos = {
      x: pointer.x - mousePointTo.x * newCombinedScale,
      y: pointer.y - mousePointTo.y * newCombinedScale,
    };

    setStagePos({
      x: newRenderedPos.x - normalizedMapPanOffset.x,
      y: newRenderedPos.y - normalizedMapPanOffset.y,
    });
  };

  const snapTolerance = mmPerPixel > 0 ? SNAP_RADIUS_MM / mmPerPixel : DEFAULT_SNAP_TOLERANCE;

  const handleMouseDown = (e: any) => {
    if (e.target !== e.target.getStage()) return;

    const stage = e.target.getStage();
    const pointer = stage.getPointerPosition();
    
    if (e.evt.button === 2) {
      if (isMapLocked) return;
      setIsPanning(true);
      setLastPanPos({ x: pointer.x, y: pointer.y });
      return;
    }

    const point = {
      x: (pointer.x - renderedStagePos.x) / combinedScale,
      y: (pointer.y - renderedStagePos.y) / combinedScale,
    };

    const allPoints = [
      ...lines.flatMap((l) => [l.a, l.b]),
      ...posts.map((p) => p.pos),
    ];
    const snapped = findSnapPoint(point, allPoints, snapTolerance) || point;

    if (selectedGateType) {
      const clickedLine = lines.find((line) => {
        const dist = pointToLineDistance(snapped, line.a, line.b);
        return dist < 10 / combinedScale;
      });

      if (clickedLine && !clickedLine.gateId) {
        addGate(clickedLine.id);
      }
    } else {
      setIsDrawing(true);
      setStartPoint(snapped);
      setCurrentPoint(snapped);
    }
  };

  const handleMouseMove = (e: any) => {
    const stage = e.target.getStage();
    const pointer = stage.getPointerPosition();
    
    if (isPanning && lastPanPos) {
      if (isMapLocked) return;
      const deltaX = pointer.x - lastPanPos.x;
      const deltaY = pointer.y - lastPanPos.y;
      setStagePos({
        x: stagePos.x + deltaX,
        y: stagePos.y + deltaY,
      });
      setLastPanPos({ x: pointer.x, y: pointer.y });
      return;
    }
    
    if (!isDrawing || !startPoint) return;

    const point = {
      x: (pointer.x - renderedStagePos.x) / combinedScale,
      y: (pointer.y - renderedStagePos.y) / combinedScale,
    };

    const allPoints = [
      ...lines.flatMap((l) => [l.a, l.b]),
      ...posts.map((p) => p.pos),
    ];
    const snapped = findSnapPoint(point, allPoints, snapTolerance) || point;

    setCurrentPoint(snapped);
  };

  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
      setLastPanPos(null);
      return;
    }
    
    if (isDrawing && startPoint && currentPoint) {
      addLine(startPoint, currentPoint);
    }
    setIsDrawing(false);
    setStartPoint(null);
    setCurrentPoint(null);
  };

  const getTouchDistance = (touch1: any, touch2: any) => {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const getTouchCenter = (touch1: any, touch2: any) => {
    return {
      x: (touch1.clientX + touch2.clientX) / 2,
      y: (touch1.clientY + touch2.clientY) / 2,
    };
  };

  const handleTouchStart = (e: any) => {
    const touches = e.evt.touches;
    
    if (touches.length === 2) {
      if (isMapLocked) return;
      e.evt.preventDefault();
      const distance = getTouchDistance(touches[0], touches[1]);
      const center = getTouchCenter(touches[0], touches[1]);
      const stage = e.target.getStage();
      const rect = stage.container().getBoundingClientRect();
      const pointer = { x: center.x - rect.left, y: center.y - rect.top };
      
      setLastTouchDistance(distance);
      setLastTouchCenter(pointer);
      setIsDrawing(false);
      setStartPoint(null);
      setIsPanning(false);
      return;
    }
    
    if (touches.length === 1) {
      const touch = touches[0];
      const stage = e.target.getStage();
      const rect = stage.container().getBoundingClientRect();
      const pointer = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
      
      if (e.target !== e.target.getStage()) return;

      const point = {
        x: (pointer.x - renderedStagePos.x) / combinedScale,
        y: (pointer.y - renderedStagePos.y) / combinedScale,
      };
      
      const allPoints = [
        ...lines.flatMap((l) => [l.a, l.b]),
        ...posts.map((p) => p.pos),
      ];
    const snapped = findSnapPoint(point, allPoints, snapTolerance) || point;
      
      if (selectedGateType) {
        const clickedLine = lines.find((line) => {
          const dist = pointToLineDistance(snapped, line.a, line.b);
          return dist < 20 / combinedScale;
        });
        
        if (clickedLine && !clickedLine.gateId) {
          addGate(clickedLine.id);
        }
      } else {
        setIsDrawing(true);
        setStartPoint(snapped);
        setCurrentPoint(snapped);
      }
    }
  };

  const handleTouchMove = (e: any) => {
    e.evt.preventDefault();
    const touches = e.evt.touches;
    
    if (touches.length === 2 && lastTouchDistance !== null && lastTouchCenter !== null) {
      const distance = getTouchDistance(touches[0], touches[1]);
      const center = getTouchCenter(touches[0], touches[1]);
      const stage = e.target.getStage();
      const rect = stage.container().getBoundingClientRect();
      const pointer = { x: center.x - rect.left, y: center.y - rect.top };
      
      const distanceChange = Math.abs(distance - lastTouchDistance);
      const centerMovement = Math.sqrt(
        Math.pow(pointer.x - lastTouchCenter.x, 2) +
        Math.pow(pointer.y - lastTouchCenter.y, 2)
      );

      if (distanceChange > centerMovement * 0.5) {
        if (isMapLocked) return;

        const oldScale = scale;
        const scaleChange = distance / lastTouchDistance;
        const newScale = oldScale * scaleChange;
        const clampedScale = Math.max(0.5, Math.min(3, newScale));
        const newCombinedScale = clampedScale * mapScale;

        const mousePointTo = {
          x: (pointer.x - renderedStagePos.x) / combinedScale,
          y: (pointer.y - renderedStagePos.y) / combinedScale,
        };

        setScale(clampedScale);
        const newRenderedPos = {
          x: pointer.x - mousePointTo.x * newCombinedScale,
          y: pointer.y - mousePointTo.y * newCombinedScale,
        };

        setStagePos({
          x: newRenderedPos.x - normalizedMapPanOffset.x,
          y: newRenderedPos.y - normalizedMapPanOffset.y,
        });
      } else {
        const deltaX = pointer.x - lastTouchCenter.x;
        const deltaY = pointer.y - lastTouchCenter.y;
        setStagePos({
          x: stagePos.x + deltaX,
          y: stagePos.y + deltaY,
        });
      }
      
      setLastTouchDistance(distance);
      setLastTouchCenter(pointer);
      return;
    }
    
    if (touches.length === 1) {
      const touch = touches[0];
      const stage = e.target.getStage();
      const rect = stage.container().getBoundingClientRect();
      const pointer = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };

      if (isDrawing && startPoint) {
        const point = {
          x: (pointer.x - renderedStagePos.x) / combinedScale,
          y: (pointer.y - renderedStagePos.y) / combinedScale,
        };

        const allPoints = [
          ...lines.flatMap((l) => [l.a, l.b]),
          ...posts.map((p) => p.pos),
        ];
        const snapped = findSnapPoint(point, allPoints, snapTolerance) || point;

        setCurrentPoint(snapped);
      }
    }
  };

  const handleTouchEnd = (e: any) => {
    const touches = e.evt.touches;
    
    if (touches.length === 0) {
      if (isDrawing && startPoint && currentPoint) {
        addLine(startPoint, currentPoint);
      }
      setLastTouchDistance(null);
      setLastTouchCenter(null);
      setIsPanning(false);
      setLastPanPos(null);
      setIsDrawing(false);
      setStartPoint(null);
      setCurrentPoint(null);
    } else if (touches.length === 1) {
      setLastTouchDistance(null);
      setLastTouchCenter(null);
    }
  };

  const handleLabelClick = (lineId: string, currentLength: number, e: any) => {
    e.cancelBubble = true;
    const line = lines.find((l) => l.id === lineId);
    if (line && !line.gateId) {
      if (selectedGateType) {
        addGate(lineId);
      } else if (e.evt.shiftKey) {
        setSelectedLineId(lineId);
      } else {
        setEditingLineId(lineId);
        setEditValue((currentLength / 1000).toFixed(1));
      }
    }
  };

  const handleLineClick = (lineId: string, e: any) => {
    e.cancelBubble = true;
    const line = lines.find((l) => l.id === lineId);
    if (line && !line.gateId) {
      if (selectedGateType) {
        addGate(lineId);
      } else {
        setSelectedLineId(lineId);
      }
    }
  };

  const handleLabelSubmit = () => {
    if (editingLineId && editValue) {
      const metres = parseFloat(editValue);
      if (!isNaN(metres) && metres > 0) {
        updateLine(editingLineId, metres * 1000);
      }
    }
    setEditingLineId(null);
    setEditValue("");
  };

  return (
    <div ref={containerRef} className="flex-1 relative overflow-hidden bg-slate-50">
      <MapOverlay
        onZoomChange={handleZoomChange}
        onScaleChange={handleScaleChange}
        onPanOffsetChange={handleMapPanOffsetChange}
        onPanReferenceReset={handlePanReferenceReset}
        isLocked={isMapLocked}
        onLockChange={setIsMapLocked}
        mapZoom={mapZoom}
      />

      {selectedLineId && (
        <LineControls
          lineId={selectedLineId}
          onClose={() => setSelectedLineId(null)}
        />
      )}

      {editingLineId && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 bg-white p-4 rounded-lg shadow-lg border border-slate-200">
          <input
            type="number"
            step="0.1"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleLabelSubmit();
              if (e.key === "Escape") {
                setEditingLineId(null);
                setEditValue("");
              }
            }}
            className="px-3 py-2 border border-slate-300 rounded-md text-sm font-mono w-24"
            autoFocus
            data-testid="input-dimension"
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleLabelSubmit}
              className="px-3 py-1 bg-primary text-primary-foreground rounded text-xs"
              data-testid="button-submit-dimension"
            >
              Apply
            </button>
            <button
              onClick={() => {
                setEditingLineId(null);
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

      <div className={`absolute inset-0 z-10 ${isMapLocked ? "" : "pointer-events-none"}`}>
        <Stage
          width={dimensions.width}
          height={dimensions.height}
          scaleX={combinedScale}
          scaleY={combinedScale}
          x={renderedStagePos.x}
          y={renderedStagePos.y}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onContextMenu={(e) => e.evt.preventDefault()}
          data-testid="canvas-stage"
        >
          <Layer>
            {Array.from({ length: Math.ceil(dimensions.width / GRID_SIZE) + 10 }).map((_, i) => (
              <Line
                key={`v-${i}`}
                points={[
                  i * GRID_SIZE - GRID_SIZE * 5,
                  -GRID_SIZE * 5,
                  i * GRID_SIZE - GRID_SIZE * 5,
                  dimensions.height + GRID_SIZE * 5,
                ]}
                stroke="#e2e8f0"
                strokeWidth={0.5 / combinedScale}
              />
            ))}
            {Array.from({ length: Math.ceil(dimensions.height / GRID_SIZE) + 10 }).map((_, i) => (
              <Line
                key={`h-${i}`}
                points={[
                  -GRID_SIZE * 5,
                  i * GRID_SIZE - GRID_SIZE * 5,
                  dimensions.width + GRID_SIZE * 5,
                  i * GRID_SIZE - GRID_SIZE * 5,
                ]}
                stroke="#e2e8f0"
                strokeWidth={0.5 / combinedScale}
              />
            ))}
          </Layer>

          <Layer>
            {lines.map((line) => {
              const isGate = !!line.gateId;
              const isSelected = line.id === selectedLineId;

              const dx = line.b.x - line.a.x;
              const dy = line.b.y - line.a.y;
              const lineLength_px = Math.sqrt(dx * dx + dy * dy);
              const unitX = dx / lineLength_px;
              const unitY = dy / lineLength_px;
              const perpX = -unitY;
              const perpY = unitX;

              return (
                <Group key={line.id}>
                  <Line
                    points={[line.a.x, line.a.y, line.b.x, line.b.y]}
                    stroke={isGate ? "#fbbf24" : isSelected ? "#2563eb" : "#475569"}
                    strokeWidth={(isGate ? 6 : isSelected ? 4 : 3) / combinedScale}
                    opacity={isGate ? 0.8 : 1}
                    onClick={(e) => handleLineClick(line.id, e)}
                    listening={!isGate}
                  />

                  <Text
                    x={(line.a.x + line.b.x) / 2 - 30 / combinedScale}
                    y={(line.a.y + line.b.y) / 2 - 15 / combinedScale}
                    text={`${(line.length_mm / 1000).toFixed(2)}m`}
                    fontSize={12 / combinedScale}
                    fill={isGate ? "#f59e0b" : "#1e293b"}
                    padding={4 / combinedScale}
                    onClick={(e) => handleLabelClick(line.id, line.length_mm, e)}
                    listening={!isGate}
                  />
                </Group>
              );
            })}

            {isDrawing && startPoint && currentPoint && (
              <Line
                points={[startPoint.x, startPoint.y, currentPoint.x, currentPoint.y]}
                stroke="#94a3b8"
                strokeWidth={3 / combinedScale}
                dash={[5 / combinedScale, 5 / combinedScale]}
              />
            )}

            {posts.map((post) => {
              const colors = {
                end: "#10b981",
                corner: "#ef4444",
                line: "#06b6d4",
              };
              return (
                <Circle
                  key={post.id}
                  x={post.pos.x}
                  y={post.pos.y}
                  radius={6 / combinedScale}
                  fill={colors[post.category]}
                  stroke={colors[post.category]}
                  strokeWidth={2 / combinedScale}
                />
              );
            })}

            {gates
              .filter((g) => g.type.startsWith("sliding"))
              .map((gate) => {
                const gateLine = lines.find((l) => l.gateId === gate.id);
                if (!gateLine) return null;

                const rect = getSlidingReturnRect(gate, gateLine, lines);
                if (!rect) return null;

                return (
                  <Rect
                    key={gate.id}
                    x={rect.x}
                    y={rect.y}
                    width={rect.width}
                    height={rect.height}
                    stroke="#ef4444"
                    strokeWidth={2 / combinedScale}
                    dash={[8 / combinedScale, 4 / combinedScale]}
                    fill="rgba(239, 68, 68, 0.1)"
                  />
                );
              })}
          </Layer>
        </Stage>
      </div>
    </div>
  );
}

function pointToLineDistance(point: Point, lineStart: Point, lineEnd: Point): number {
  const A = point.x - lineStart.x;
  const B = point.y - lineStart.y;
  const C = lineEnd.x - lineStart.x;
  const D = lineEnd.y - lineStart.y;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;

  if (lenSq !== 0) param = dot / lenSq;

  let xx, yy;

  if (param < 0) {
    xx = lineStart.x;
    yy = lineStart.y;
  } else if (param > 1) {
    xx = lineEnd.x;
    yy = lineEnd.y;
  } else {
    xx = lineStart.x + param * C;
    yy = lineStart.y + param * D;
  }

  const dx = point.x - xx;
  const dy = point.y - yy;

  return Math.sqrt(dx * dx + dy * dy);
}
