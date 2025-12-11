import { useCallback, useEffect, useRef, useState } from "react";
import { Stage, Layer, Line, Circle, Text, Group, Rect } from "react-konva";
import { useAppStore } from "@/store/appStore";
import { Point } from "@/types/models";
import { findSnapPoint } from "@/geometry/snapping";
import { DEFAULT_SNAP_TOLERANCE, SNAP_RADIUS_MM } from "@/constants/geometry";
import { getSlidingReturnRect } from "@/geometry/gates";
import { LineControls } from "./LineControls";
import MapOverlay, { DEFAULT_CENTER, type MapStyleMode } from "./MapOverlay";
import { calculateMetersPerPixel } from "@/lib/mapScale";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const GRID_SIZE = 15;
const BASE_MAP_ZOOM = 15;
const TEN_YARDS_METERS = 9.144;
const FIXED_SCALE_METERS_PER_PIXEL = 1.82;

type ScreenPoint = { x: number; y: number };
type CameraState = { scale: number; offsetX: number; offsetY: number };

function worldToScreen(point: Point, camera: CameraState): ScreenPoint {
  return {
    x: (point.x - camera.offsetX) * camera.scale,
    y: (point.y - camera.offsetY) * camera.scale,
  };
}

function screenToWorld(point: ScreenPoint, camera: CameraState): Point {
  return {
    x: point.x / camera.scale + camera.offsetX,
    y: point.y / camera.scale + camera.offsetY,
  };
}

export function CanvasStage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [mapPanOffset, setMapPanOffset] = useState({ x: 0, y: 0 });
  const [scale] = useState(1);
  const [mapScale, setMapScale] = useState(1);
  const [mapZoom, setMapZoom] = useState(BASE_MAP_ZOOM);
  const [mapMode, setMapMode] = useState<MapStyleMode>("street");
  const [baseMetersPerPixel, setBaseMetersPerPixel] = useState<number | null>(null);
  const [currentMetersPerPixel, setCurrentMetersPerPixel] = useState<number | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationPoints, setCalibrationPoints] = useState<Point[]>([]);
  const [calibrationFactor, setCalibrationFactor] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPos, setLastPanPos] = useState<{ x: number; y: number } | null>(null);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [currentPoint, setCurrentPoint] = useState<Point | null>(null);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [lastTouchDistance, setLastTouchDistance] = useState<number | null>(null);
  const [lastTouchCenter, setLastTouchCenter] = useState<{ x: number; y: number } | null>(null);
  const [panByDelta, setPanByDelta] = useState<{ x: number; y: number } | null>(null);
  const baseMetersPerPixelRef = useRef<number | null>(null);
  const mapMetersPerPixelRef = useRef<number | null>(null);
  const calibrationFactorRef = useRef(1);

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

  // Stage is always centred in the viewport.
  // The only thing that moves the world relative to the screen
  // is mapPanOffset coming from MapOverlay.
  const stagePosition = {
    x: dimensions.width / 2 - mapPanOffset.x,
    y: dimensions.height / 2 - mapPanOffset.y,
  };

  const stageScale =
    Number.isFinite(combinedScale) && combinedScale > 0 ? combinedScale : 1;

  const cameraState: CameraState = {
    scale: stageScale,
    offsetX: -stagePosition.x / stageScale,
    offsetY: -stagePosition.y / stageScale,
  };

  const handleZoomChange = useCallback((zoom: number) => {
    setMapZoom(zoom);
  }, []);

  const handleScaleChange = useCallback(
    (metersPerPixel: number, _zoom?: number) => {
      if (!isFinite(metersPerPixel) || metersPerPixel <= 0) return;

      mapMetersPerPixelRef.current = metersPerPixel;

      setCurrentMetersPerPixel(metersPerPixel);

      if (baseMetersPerPixelRef.current === null) {
        baseMetersPerPixelRef.current = metersPerPixel;
        setBaseMetersPerPixel(metersPerPixel);
      }

      const referenceMetersPerPixel = baseMetersPerPixelRef.current ?? metersPerPixel;
      const scaleFromMap = referenceMetersPerPixel / metersPerPixel;

      setMapScale(scaleFromMap);

      const nextMmPerPixel = referenceMetersPerPixel * calibrationFactorRef.current * 1000;
      if (Math.abs(nextMmPerPixel - mmPerPixel) < 0.0001) return;

      setMmPerPixel(nextMmPerPixel);
    },
    [mmPerPixel, setMmPerPixel]
  );

  const handleMapModeChange = useCallback((mode: MapStyleMode) => {
    setMapMode(mode);
  }, []);

  const handleMapPanOffsetChange = useCallback((offset: { x: number; y: number }) => {
    setMapPanOffset(offset);
  }, []);

  const handlePanReferenceReset = useCallback(() => {
    setMapPanOffset({ x: 0, y: 0 });
  }, []);

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
    if (baseMetersPerPixelRef.current !== null) return;

    const baseMetersPerPixel = calculateMetersPerPixel(BASE_MAP_ZOOM, DEFAULT_CENTER[1]);
    const currentMetersPerPixel = calculateMetersPerPixel(mapZoom, DEFAULT_CENTER[1]);

    if (!isFinite(baseMetersPerPixel) || !isFinite(currentMetersPerPixel)) return;

    baseMetersPerPixelRef.current = baseMetersPerPixel;
    setBaseMetersPerPixel(baseMetersPerPixel);
    setCurrentMetersPerPixel(currentMetersPerPixel);
    setMapScale(baseMetersPerPixel / currentMetersPerPixel);
  }, [mapZoom]);
  useEffect(() => {
    calibrationFactorRef.current = calibrationFactor;
  }, [calibrationFactor]);

  useEffect(() => {
    const metersPerPixel = baseMetersPerPixel ?? currentMetersPerPixel ?? null;
    if (!metersPerPixel) return;

    const nextMmPerPixel = metersPerPixel * calibrationFactor * 1000;
    if (Math.abs(nextMmPerPixel - mmPerPixel) < 0.0001) return;

    setMmPerPixel(nextMmPerPixel);
  }, [
    baseMetersPerPixel,
    calibrationFactor,
    currentMetersPerPixel,
    mmPerPixel,
    setMmPerPixel,
  ]);

  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const zoomStep = 0.25;
    setMapZoom((currentZoom) => {
      const nextZoom = currentZoom + (e.evt.deltaY > 0 ? -zoomStep : zoomStep);
      return Math.max(1, Math.min(22, nextZoom));
    });
  };

  const snapTolerance = mmPerPixel > 0 ? SNAP_RADIUS_MM / mmPerPixel : DEFAULT_SNAP_TOLERANCE;

  const handleCalibrationComplete = useCallback(
    (a: Point, b: Point) => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distancePx = Math.hypot(dx, dy);

      const referenceMetersPerPixel =
        baseMetersPerPixelRef.current ?? mapMetersPerPixelRef.current ?? currentMetersPerPixel;
      if (!referenceMetersPerPixel || distancePx === 0) {
        setCalibrationPoints([]);
        setIsCalibrating(false);
        return;
      }

      const calibratedMetersPerPixel = TEN_YARDS_METERS / distancePx;
      const nextFactor = calibratedMetersPerPixel / referenceMetersPerPixel;

      setCalibrationFactor(nextFactor);
      setCalibrationPoints([]);
      setIsCalibrating(false);
      setMmPerPixel(calibratedMetersPerPixel * 1000);
    },
    [currentMetersPerPixel, setMmPerPixel]
  );

  const registerCalibrationPoint = useCallback(
    (point: Point) => {
      setCalibrationPoints((prev) => {
        const next = [...prev, point];
        if (next.length === 2) {
          handleCalibrationComplete(next[0], next[1]);
          return [];
        }
        return next;
      });
    },
    [handleCalibrationComplete]
  );

  const handleMouseDown = (e: any) => {
    const stage = e.target.getStage();
    if (!stage) return;

    const container = stage.container();
    const rect = container.getBoundingClientRect();
    const { clientX, clientY, button } = e.evt;

    const pointerScreen = {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };

    if (button === 2) {
      setIsPanning(true);
      setLastPanPos(pointerScreen);
      return;
    }

    if (e.target !== stage) return;

    const point = screenToWorld(pointerScreen, cameraState);

    if (isCalibrating) {
      registerCalibrationPoint(point);
      setIsDrawing(false);
      setStartPoint(null);
      setCurrentPoint(null);
      return;
    }

    const allPoints = [
      ...lines.flatMap((l) => [l.a, l.b]),
      ...posts.map((p) => p.pos),
    ];
    const snapped = findSnapPoint(point, allPoints, snapTolerance) || point;

    if (selectedGateType) {
      const clickedLine = lines.find((line) => {
        const dist = pointToLineDistance(snapped, line.a, line.b);
        return dist < 10 / cameraState.scale;
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
    if (!stage) return;

    const container = stage.container();
    const rect = container.getBoundingClientRect();
    const { clientX, clientY } = e.evt;

    const pointerScreen = {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };

    if (isPanning && lastPanPos) {
      const deltaX = pointerScreen.x - lastPanPos.x;
      const deltaY = pointerScreen.y - lastPanPos.y;
      setPanByDelta({ x: -deltaX, y: -deltaY });
      setLastPanPos(pointerScreen);
      return;
    }

    if (!isDrawing || !startPoint) return;

    const point = screenToWorld(pointerScreen, cameraState);

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
      setPanByDelta(null);
      return;
    }

    if (!isDrawing || !startPoint || !currentPoint) {
      setIsDrawing(false);
      setStartPoint(null);
      setCurrentPoint(null);
      return;
    }

    if (startPoint.x !== currentPoint.x || startPoint.y !== currentPoint.y) {
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

      if (e.target !== stage) return;

      const point = screenToWorld(pointer, cameraState);

      if (isCalibrating) {
        registerCalibrationPoint(point);
        setIsDrawing(false);
        setStartPoint(null);
        setCurrentPoint(null);
        return;
      }

      const allPoints = [
        ...lines.flatMap((l) => [l.a, l.b]),
        ...posts.map((p) => p.pos),
      ];
      const snapped = findSnapPoint(point, allPoints, snapTolerance) || point;

      if (selectedGateType) {
        const clickedLine = lines.find((line) => {
          const dist = pointToLineDistance(snapped, line.a, line.b);
          return dist < 20 / cameraState.scale;
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
        const scaleChange = distance / lastTouchDistance;
        const zoomDelta = Math.log2(scaleChange);

        if (isFinite(zoomDelta)) {
          setMapZoom((currentZoom) => {
            const nextZoom = currentZoom + zoomDelta;
            return Math.max(1, Math.min(22, nextZoom));
          });
        }
      } else {
        const deltaX = pointer.x - lastTouchCenter.x;
        const deltaY = pointer.y - lastTouchCenter.y;
        setPanByDelta({ x: -deltaX, y: -deltaY });
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
        const point = screenToWorld(pointer, cameraState);

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
      if (
        isDrawing &&
        startPoint &&
        currentPoint &&
        (startPoint.x !== currentPoint.x || startPoint.y !== currentPoint.y)
      ) {
        addLine(startPoint, currentPoint);
      }
      setLastTouchDistance(null);
      setLastTouchCenter(null);
      setIsPanning(false);
      setLastPanPos(null);
      setPanByDelta(null);
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

  const gridColor = mapMode === "satellite" ? "#475569" : "#e2e8f0";

  const topLeft = screenToWorld({ x: 0, y: 0 }, cameraState);
  const bottomRight = screenToWorld(
    { x: dimensions.width, y: dimensions.height },
    cameraState
  );

  const minX = Math.min(topLeft.x, bottomRight.x);
  const maxX = Math.max(topLeft.x, bottomRight.x);
  const minY = Math.min(topLeft.y, bottomRight.y);
  const maxY = Math.max(topLeft.y, bottomRight.y);

  const startX = Math.floor(minX / GRID_SIZE) * GRID_SIZE;
  const endX = Math.ceil(maxX / GRID_SIZE) * GRID_SIZE;
  const startY = Math.floor(minY / GRID_SIZE) * GRID_SIZE;
  const endY = Math.ceil(maxY / GRID_SIZE) * GRID_SIZE;

  const gridLines: JSX.Element[] = [];

  for (let x = startX; x <= endX; x += GRID_SIZE) {
    gridLines.push(
      <Line
        key={`gx-${x}`}
        points={[x, startY, x, endY]}
        stroke={gridColor}
        strokeWidth={1 / stageScale}
        listening={false}
      />
    );
  }

  for (let y = startY; y <= endY; y += GRID_SIZE) {
    gridLines.push(
      <Line
        key={`gy-${y}`}
        points={[startX, y, endX, y]}
        stroke={gridColor}
        strokeWidth={1 / stageScale}
        listening={false}
      />
    );
  }

  return (
    <div ref={containerRef} className="flex-1 relative overflow-hidden bg-slate-50">
      <MapOverlay
        onZoomChange={handleZoomChange}
        onScaleChange={handleScaleChange}
        onPanOffsetChange={handleMapPanOffsetChange}
        onPanReferenceReset={handlePanReferenceReset}
        onMapModeChange={handleMapModeChange}
        mapZoom={mapZoom}
        panByDelta={panByDelta}
      />

      <div className="absolute inset-0 z-10">
        <Stage
          className="absolute inset-0"
          width={dimensions.width}
          height={dimensions.height}
          scaleX={stageScale}
          scaleY={stageScale}
          x={stagePosition.x}
          y={stagePosition.y}
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
          <Layer listening={false}>{gridLines}</Layer>
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
                    strokeWidth={(isGate ? 6 : isSelected ? 4 : 3) / stageScale}
                    opacity={isGate ? 0.8 : 1}
                    onClick={(e) => handleLineClick(line.id, e)}
                    listening={!isGate}
                  />

                  <Text
                    x={(line.a.x + line.b.x) / 2 - 30 / stageScale}
                    y={(line.a.y + line.b.y) / 2 - 15 / stageScale}
                    text={`${(line.length_mm / 1000).toFixed(2)}m`}
                    fontSize={12 / stageScale}
                    fill={isGate ? "#f59e0b" : "#1e293b"}
                    padding={4 / stageScale}
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
                strokeWidth={3 / stageScale}
                dash={[5 / stageScale, 5 / stageScale]}
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
                  radius={6 / stageScale}
                  fill={colors[post.category]}
                  stroke={colors[post.category]}
                  strokeWidth={2 / stageScale}
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
                    strokeWidth={2 / stageScale}
                    dash={[8 / stageScale, 4 / stageScale]}
                    fill="rgba(239, 68, 68, 0.1)"
                  />
                );
              })}
          </Layer>
        </Stage>
      </div>

      <div className="absolute top-2 right-2 z-30">
        <div className="text-xs bg-white/80 backdrop-blur rounded-md shadow px-3 py-2">
          {mmPerPixel ? (
            <>
              <span>
                Scale: {(mmPerPixel / 1000).toFixed(3)} m/px
              </span>
              {calibrationFactor !== 1 && (
                <span className="ml-1 text-[0.7rem] text-emerald-700">
                  (calibrated)
                </span>
              )}
            </>
          ) : (
            <span>Scale: —</span>
          )}
        </div>
      </div>

      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30">
        <Card className="px-4 py-3 shadow-lg flex items-center gap-3">
          <div className="text-sm">
            <p className="font-semibold">Calibration</p>
            <p className="text-xs text-slate-500">
              {isCalibrating
                ? (() => {
                    const remaining = 2 - calibrationPoints.length;
                    return `Select ${remaining} point${remaining === 1 ? "" : "s"} 10 yards apart`;
                  })()
                : `Scale: ${FIXED_SCALE_METERS_PER_PIXEL.toFixed(3)} m/px${
                    calibrationFactor !== 1 ? " (calibrated)" : ""
                  }`}
            </p>
          </div>
          <Button
            variant={isCalibrating ? "default" : "outline"}
            size="sm"
            onClick={() => {
              if (isCalibrating) {
                setIsCalibrating(false);
                setCalibrationPoints([]);
              } else {
                setIsCalibrating(true);
                setCalibrationPoints([]);
                setIsDrawing(false);
              }
            }}
            data-testid="button-calibrate-scale"
          >
            {isCalibrating ? "Cancel" : "Calibrate"}
          </Button>
        </Card>
      </div>

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
