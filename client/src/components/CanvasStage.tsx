import { useRef, useState, useEffect } from "react";
import { Stage, Layer, Line, Circle, Text, Group, Rect } from "react-konva";
import { useAppStore } from "@/store/appStore";
import { Point } from "@/types/models";
import {
  snapAngleTo45Degrees,
  getAngle,
  getDistance,
  findSnapPoint,
  getAllLineEndpoints,
} from "@/geometry/snapping";
import { getSlidingReturnRect } from "@/geometry/gates";
import { LineControls } from "./LineControls";
import MapOverlay from "./MapOverlay";

const GRID_SIZE = 50;
const SCALE_FACTOR = 10;
const MIN_LINE_LENGTH_MM = 300;

export function CanvasStage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
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

  const { lines, posts, gates, addLine, selectedGateType, addGate, updateLine, panelPositionsMap } =
    useAppStore();

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

  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const scaleBy = 1.1;
    const stage = e.target.getStage();
    const oldScale = scale;
    const pointer = stage.getPointerPosition();

    const mousePointTo = {
      x: (pointer.x - stagePos.x) / oldScale,
      y: (pointer.y - stagePos.y) / oldScale,
    };

    const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;
    const clampedScale = Math.max(0.5, Math.min(3, newScale));

    setScale(clampedScale);
    setStagePos({
      x: pointer.x - mousePointTo.x * clampedScale,
      y: pointer.y - mousePointTo.y * clampedScale,
    });
  };

  const handleMouseDown = (e: any) => {
    if (e.target !== e.target.getStage()) return;

    const stage = e.target.getStage();
    const pointer = stage.getPointerPosition();
    
    if (e.evt.button === 2) {
      setIsPanning(true);
      setLastPanPos({ x: pointer.x, y: pointer.y });
      return;
    }

    const point = {
      x: (pointer.x - stagePos.x) / scale,
      y: (pointer.y - stagePos.y) / scale,
    };

    const allPoints = [
      ...lines.flatMap((l) => [l.a, l.b]),
      ...posts.map((p) => p.pos),
    ];
    const snapped = findSnapPoint(point, allPoints) || point;

    if (selectedGateType) {
      const clickedLine = lines.find((line) => {
        const dist = pointToLineDistance(snapped, line.a, line.b);
        return dist < 10 / scale;
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
      x: (pointer.x - stagePos.x) / scale,
      y: (pointer.y - stagePos.y) / scale,
    };

    const allPoints = [
      ...lines.flatMap((l) => [l.a, l.b]),
      ...posts.map((p) => p.pos),
    ];
    const snapped = findSnapPoint(point, allPoints) || point;

    const angle = getAngle(startPoint, snapped);
    const snappedAngle = snapAngleTo45Degrees(angle);
    const distance = getDistance(startPoint, snapped);

    const previewPoint = {
      x: startPoint.x + Math.cos(snappedAngle) * distance,
      y: startPoint.y + Math.sin(snappedAngle) * distance,
    };

    setCurrentPoint(previewPoint);
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
        x: (pointer.x - stagePos.x) / scale,
        y: (pointer.y - stagePos.y) / scale,
      };
      
      const allPoints = [
        ...lines.flatMap((l) => [l.a, l.b]),
        ...posts.map((p) => p.pos),
      ];
      const snapped = findSnapPoint(point, allPoints) || point;
      
      if (selectedGateType) {
        const clickedLine = lines.find((line) => {
          const dist = pointToLineDistance(snapped, line.a, line.b);
          return dist < 20 / scale;
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
        const oldScale = scale;
        const scaleChange = distance / lastTouchDistance;
        const newScale = oldScale * scaleChange;
        const clampedScale = Math.max(0.5, Math.min(3, newScale));
        
        const mousePointTo = {
          x: (pointer.x - stagePos.x) / oldScale,
          y: (pointer.y - stagePos.y) / oldScale,
        };
        
        setScale(clampedScale);
        setStagePos({
          x: pointer.x - mousePointTo.x * clampedScale,
          y: pointer.y - mousePointTo.y * clampedScale,
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
          x: (pointer.x - stagePos.x) / scale,
          y: (pointer.y - stagePos.y) / scale,
        };
        
        const allPoints = [
          ...lines.flatMap((l) => [l.a, l.b]),
          ...posts.map((p) => p.pos),
        ];
        const snapped = findSnapPoint(point, allPoints) || point;
        
        const angle = getAngle(startPoint, snapped);
        const snappedAngle = snapAngleTo45Degrees(angle);
        const distance = getDistance(startPoint, snapped);
        
        const previewPoint = {
          x: startPoint.x + Math.cos(snappedAngle) * distance,
          y: startPoint.y + Math.sin(snappedAngle) * distance,
        };
        
        setCurrentPoint(previewPoint);
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
      <MapOverlay />

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

      <div className="absolute inset-0 z-10">
        <Stage
          width={dimensions.width}
          height={dimensions.height}
          scaleX={scale}
          scaleY={scale}
          x={stagePos.x}
          y={stagePos.y}
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
                strokeWidth={0.5 / scale}
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
                strokeWidth={0.5 / scale}
              />
            ))}
          </Layer>

          <Layer>
            {lines.map((line) => {
              const isGate = !!line.gateId;
              const isSelected = line.id === selectedLineId;
              const panelPositions = panelPositionsMap.get(line.id) || [];

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
                    strokeWidth={(isGate ? 6 : isSelected ? 4 : 3) / scale}
                    opacity={isGate ? 0.8 : 1}
                    onClick={(e) => handleLineClick(line.id, e)}
                    listening={!isGate}
                  />

                  {!isGate &&
                    panelPositions.length > 1 &&
                    panelPositions.map((pos_mm, idx) => {
                      if (idx === panelPositions.length - 1) return null;

                      const nextPos_mm = panelPositions[idx + 1];
                      const segmentLength_mm = nextPos_mm - pos_mm;

                      const startPos_px = pos_mm / SCALE_FACTOR;
                      const endPos_px = nextPos_mm / SCALE_FACTOR;
                      const midPos_px = (startPos_px + endPos_px) / 2;

                      const midPoint = {
                        x: line.a.x + unitX * midPos_px,
                        y: line.a.y + unitY * midPos_px,
                      };

                      const labelOffset = 15 / scale;
                      const labelPoint = {
                        x: midPoint.x + perpX * labelOffset,
                        y: midPoint.y + perpY * labelOffset,
                      };

                      return (
                        <Text
                          key={`seg-${line.id}-${idx}`}
                          x={labelPoint.x - 20 / scale}
                          y={labelPoint.y - 8 / scale}
                          text={`${(segmentLength_mm / 1000).toFixed(2)}m`}
                          fontSize={11 / scale}
                          fill="#1e293b"
                          padding={3 / scale}
                          onClick={(e) => handleLabelClick(line.id, line.length_mm, e)}
                          listening={true}
                        />
                      );
                    })}

                  {(isGate || panelPositions.length <= 1) && (
                    <Text
                      x={(line.a.x + line.b.x) / 2 - 30 / scale}
                      y={(line.a.y + line.b.y) / 2 - 15 / scale}
                      text={`${(line.length_mm / 1000).toFixed(2)}m`}
                      fontSize={12 / scale}
                      fill={isGate ? "#f59e0b" : "#1e293b"}
                      padding={4 / scale}
                      onClick={(e) => handleLabelClick(line.id, line.length_mm, e)}
                      listening={!isGate}
                    />
                  )}
                </Group>
              );
            })}

            {isDrawing && startPoint && currentPoint && (
              <Line
                points={[startPoint.x, startPoint.y, currentPoint.x, currentPoint.y]}
                stroke="#94a3b8"
                strokeWidth={3 / scale}
                dash={[5 / scale, 5 / scale]}
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
                  radius={6 / scale}
                  fill={colors[post.category]}
                  stroke={colors[post.category]}
                  strokeWidth={2 / scale}
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
                    strokeWidth={2 / scale}
                    dash={[8 / scale, 4 / scale]}
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
