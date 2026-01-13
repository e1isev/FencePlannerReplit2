import { useCallback, useEffect, useRef, useState } from "react";
import { Label, Layer, Line, Tag, Text, Group, Rect, Stage } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { Stage as KonvaStage } from "konva/lib/Stage";
import { MAX_RUN_MM, MIN_RUN_MM, useAppStore } from "@/store/appStore";
import { Point } from "@/types/models";
import {
  ENDPOINT_SNAP_RADIUS_MM,
  findSnapOnLines,
  findSnapPoint,
  findSnapPointOnSegment,
} from "@/geometry/snapping";
import { FENCE_THICKNESS_MM } from "@/constants/geometry";
import { getSlidingReturnRect } from "@/geometry/gates";
import { LineControls } from "./LineControls";
import MapOverlay, { type MapStyleMode } from "./MapOverlay";
import { Button } from "@/components/ui/button";
import { PostShape } from "./PostShape";
import { getJunctionAngleDegForPost, getPostNeighbours } from "@/geometry/posts";
import { DEFAULT_CALIBRATED_SCALE_LABEL, DEFAULT_CALIBRATED_SCALE_MM_PER_PX } from "@/constants/scale";

const BASE_MAP_ZOOM = 15;
const LABEL_OFFSET_PX = 14;
const MIN_LINE_HIT_PX = 10;
const DRAG_THRESHOLD_PX = 4;
const SNAP_SCREEN_MIN_PX = 10;
const SNAP_SCREEN_MAX_PX = 40;
const SEGMENT_SNAP_SCREEN_MAX_PX = 20;

type ScreenPoint = { x: number; y: number };
type CameraState = { scale: number; offsetX: number; offsetY: number };

type SnapTarget =
  | { type: "endpoint"; point: Point }
  | { type: "segment"; point: Point; lineId: string; t: number }
  | { type: "free"; point: Point };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

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
  const stageRef = useRef<KonvaStage | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [mapPanOffset, setMapPanOffset] = useState({ x: 0, y: 0 });
  const [scale] = useState(1);
  const [mapScale, setMapScale] = useState(1);
  const [mapZoom, setMapZoom] = useState(BASE_MAP_ZOOM);
  const [mapMode, setMapMode] = useState<MapStyleMode>("street");
  const [isDrawing, setIsDrawing] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPos, setLastPanPos] = useState<{ x: number; y: number } | null>(null);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [currentPoint, setCurrentPoint] = useState<Point | null>(null);
  const [startSnap, setStartSnap] = useState<SnapTarget | null>(null);
  const [currentSnap, setCurrentSnap] = useState<SnapTarget | null>(null);
  const [hoverSnap, setHoverSnap] = useState<SnapTarget | null>(null);
  const [showSnapDebug, setShowSnapDebug] = useState(false);
  const [showPostAngleDebug, setShowPostAngleDebug] = useState(false);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [labelUnit, setLabelUnit] = useState<"mm" | "m">("mm");
  const [editError, setEditError] = useState<string | null>(null);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [lastTouchDistance, setLastTouchDistance] = useState<number | null>(null);
  const [lastTouchCenter, setLastTouchCenter] = useState<{ x: number; y: number } | null>(null);
  const [panByDelta, setPanByDelta] = useState<{ x: number; y: number } | null>(null);
  const baseMetersPerPixelRef = useRef<number | null>(null);
  const pointerDownWorldRef = useRef<Point | null>(null);
  const didDragRef = useRef(false);
  const isDev = import.meta.env.DEV;

  const {
    lines,
    posts,
    gates,
    addLine,
    splitLineAtPoint,
    selectedGateType,
    addGate,
    updateLine,
    mmPerPixel,
    setMmPerPixel,
  } = useAppStore();

  const viewScale = Number.isFinite(scale * mapScale) && scale * mapScale > 0 ? scale * mapScale : 1;

  const mmToPx = useCallback(
    (mm: number) => (mmPerPixel > 0 ? mm / mmPerPixel : mm),
    [mmPerPixel]
  );

  // Stage is always centred in the viewport.
  // The only thing that moves the world relative to the screen
  // is mapPanOffset coming from MapOverlay.
  const viewOffset = {
    x: dimensions.width / 2 - mapPanOffset.x,
    y: dimensions.height / 2 - mapPanOffset.y,
  };

  const cameraState: CameraState = {
    scale: viewScale,
    offsetX: -viewOffset.x / viewScale,
    offsetY: -viewOffset.y / viewScale,
  };

  const getWorldPointFromEvent = useCallback(
    (e: KonvaEventObject<MouseEvent | TouchEvent>): Point | null => {
      const stage = stageRef.current;
      if (!stage) return null;

      const isPost = e.target?.hasName?.("post");
      if (isPost) {
        return { x: e.target.x(), y: e.target.y() };
      }

      const pointer = stage.getPointerPosition();
      if (!pointer) return null;

      return screenToWorld(pointer, cameraState);
    },
    [cameraState]
  );

  const handleZoomChange = useCallback((zoom: number) => {
    setMapZoom(zoom);
  }, []);

  const handleScaleChange = useCallback((metersPerPixel: number, _zoom?: number) => {
    if (!isFinite(metersPerPixel) || metersPerPixel <= 0) return;

    if (baseMetersPerPixelRef.current === null) {
      baseMetersPerPixelRef.current = metersPerPixel;
    }

    const referenceMetersPerPixel = baseMetersPerPixelRef.current ?? metersPerPixel;
    const scaleFromMap = referenceMetersPerPixel / metersPerPixel;

    setMapScale(scaleFromMap);
  }, []);

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
    setMmPerPixel(DEFAULT_CALIBRATED_SCALE_MM_PER_PX);
  }, [setMmPerPixel]);

  useEffect(() => {
    const handleKeyToggle = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "d") {
        setShowSnapDebug((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyToggle);
    return () => window.removeEventListener("keydown", handleKeyToggle);
  }, []);

  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const zoomStep = 0.25;
    setMapZoom((currentZoom) => {
      const nextZoom = currentZoom + (e.evt.deltaY > 0 ? -zoomStep : zoomStep);
      return Math.max(1, Math.min(22, nextZoom));
    });
  };

  const effectiveMmPerPixel = mmPerPixel || 1;
  const snapWorldFromMm = ENDPOINT_SNAP_RADIUS_MM / effectiveMmPerPixel;
  const snapWorldMin = SNAP_SCREEN_MIN_PX / cameraState.scale;
  const snapWorldMax = SNAP_SCREEN_MAX_PX / cameraState.scale;
  const snapTolerance = clamp(snapWorldFromMm, snapWorldMin, snapWorldMax);
  const segmentSnapTolPx = Math.min(snapTolerance, SEGMENT_SNAP_SCREEN_MAX_PX / cameraState.scale);
  const dragThresholdWorld = DRAG_THRESHOLD_PX / cameraState.scale;
  const lineHitStrokeWidth = Math.max(MIN_LINE_HIT_PX / cameraState.scale, 1);
  const snapToleranceScreenPx = snapTolerance * cameraState.scale;
  const previewStrokeWidth = mmToPx(FENCE_THICKNESS_MM);
  const previewDashLength = mmToPx(FENCE_THICKNESS_MM);

  const resolveSnapTarget = useCallback(
    (point: Point): SnapTarget => {
      const allPoints = [
        ...lines.flatMap((l) => [l.a, l.b]),
        ...posts.map((p) => p.pos),
      ];

      const snappedEndpoint = findSnapPoint(point, allPoints, snapTolerance);
      if (snappedEndpoint) {
        return { type: "endpoint", point: snappedEndpoint };
      }

      const lineSnap = findSnapOnLines(point, lines, segmentSnapTolPx);
      if (lineSnap) {
        return lineSnap.kind === "endpoint"
          ? { type: "endpoint", point: lineSnap.point }
          : {
              type: "segment",
              point: lineSnap.point,
              lineId: lineSnap.lineId,
              t: lineSnap.t,
            };
      }

      return { type: "free", point };
    },
    [lines, posts, segmentSnapTolPx, snapTolerance]
  );

  const resetDrawingState = useCallback(() => {
    setIsDrawing(false);
    setStartPoint(null);
    setCurrentPoint(null);
    setStartSnap(null);
    setCurrentSnap(null);
    pointerDownWorldRef.current = null;
    didDragRef.current = false;
  }, []);

  const finalizeDrawing = useCallback(
    (overrides?: {
      startPoint?: Point | null;
      startSnap?: SnapTarget | null;
      currentPoint?: Point | null;
      currentSnap?: SnapTarget | null;
    }) => {
      const resolvedStart = overrides?.startPoint ?? startPoint;
      const resolvedEnd = overrides?.currentPoint ?? currentPoint;
      let resolvedStartSnap = overrides?.startSnap ?? startSnap;
      let resolvedEndSnap = overrides?.currentSnap ?? currentSnap;

      if (!isDrawing || !resolvedStart || !resolvedEnd) {
        resetDrawingState();
        return;
      }

      const hasMovement = resolvedStart.x !== resolvedEnd.x || resolvedStart.y !== resolvedEnd.y;

      if (!hasMovement) {
        resetDrawingState();
        return;
      }

      let latestLines = useAppStore.getState().lines;

      const applySegmentSnap = (snap: SnapTarget | null, fallbackPoint: Point) => {
        if (!snap || snap.type !== "segment") {
          return snap ? snap.point : fallbackPoint;
        }

        const result = splitLineAtPoint(snap.lineId, snap.point);
        latestLines = useAppStore.getState().lines;

        if (result) {
          return result;
        }

        const line = latestLines.find((l) => l.id === snap.lineId);
        if (line) {
          const distA = Math.hypot(snap.point.x - line.a.x, snap.point.y - line.a.y);
          const distB = Math.hypot(snap.point.x - line.b.x, snap.point.y - line.b.y);
          return distA <= distB ? line.a : line.b;
        }

        return fallbackPoint;
      };

      if (resolvedStartSnap?.type === "segment") {
        const startLineId = resolvedStartSnap.lineId;
        resolvedStartSnap = {
          ...resolvedStartSnap,
          point: applySegmentSnap(resolvedStartSnap, resolvedStart),
        } as SnapTarget;

        if (resolvedEndSnap?.type === "segment" && resolvedEndSnap.lineId === startLineId) {
          const refreshed = findSnapPointOnSegment(resolvedEndSnap.point, latestLines, segmentSnapTolPx);
          if (refreshed && refreshed.kind === "segment" && refreshed.lineId) {
            resolvedEndSnap = {
              type: "segment",
              point: refreshed.point,
              lineId: refreshed.lineId,
              t: refreshed.t ?? 0,
            };
          } else if (refreshed?.kind === "endpoint") {
            resolvedEndSnap = { type: "endpoint", point: refreshed.point };
          }
        }
      }

      const finalStart = resolvedStartSnap?.type === "segment" ? resolvedStartSnap.point : resolvedStart;
      const finalEnd =
        resolvedEndSnap?.type === "segment"
          ? applySegmentSnap(resolvedEndSnap, resolvedEnd)
          : resolvedEndSnap
            ? resolvedEndSnap.point
            : resolvedEnd;

      if (finalStart.x !== finalEnd.x || finalStart.y !== finalEnd.y) {
        addLine(finalStart, finalEnd);
      }

      resetDrawingState();
    },
    [
      addLine,
      currentPoint,
      currentSnap,
      isDrawing,
      resetDrawingState,
      segmentSnapTolPx,
      splitLineAtPoint,
      startPoint,
      startSnap,
    ]
  );

  const startDrawingFromSnap = (snap: SnapTarget) => {
    setIsDrawing(true);
    setStartPoint(snap.point);
    setCurrentPoint(snap.point);
    setStartSnap(snap);
    setCurrentSnap(null);
    didDragRef.current = false;
  };

  const trackPointerDrag = (point: Point, isPointerDown: boolean) => {
    if (!isPointerDown || !pointerDownWorldRef.current) return;

    const dist = Math.hypot(point.x - pointerDownWorldRef.current.x, point.y - pointerDownWorldRef.current.y);
    if (dist > dragThresholdWorld) {
      didDragRef.current = true;
    }
  };

  const handleInteractionStart = (worldPoint: Point) => {
    const snap = resolveSnapTarget(worldPoint);
    setHoverSnap(snap);

    if (selectedGateType) {
      const clickedLine = lines.find((line) => {
        const dist = pointToLineDistance(worldPoint, line.a, line.b);
        return dist < 10 / cameraState.scale;
      });

      if (clickedLine && !clickedLine.gateId) {
        addGate(clickedLine.id, worldPoint);
      }
      return;
    }

    if (!isDrawing) {
      startDrawingFromSnap(snap);
      return;
    }

    setCurrentPoint(snap.point);
    setCurrentSnap(snap);
    finalizeDrawing({ currentPoint: snap.point, currentSnap: snap });
  };

  const handleMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    const stage = stageRef.current ?? e.target.getStage();
    if (!stage) return;

    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const { button } = e.evt;

    if (button === 2) {
      setIsPanning(true);
      setLastPanPos(pointer);
      return;
    }

    if (isPanning || editingLineId) return;

    const worldPoint = getWorldPointFromEvent(e);
    if (!worldPoint) return;

    pointerDownWorldRef.current = worldPoint;
    didDragRef.current = false;

    handleInteractionStart(worldPoint);
  };

  const handleMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    const stage = stageRef.current ?? e.target.getStage();
    if (!stage) return;

    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    if (isPanning && lastPanPos) {
      const deltaX = pointer.x - lastPanPos.x;
      const deltaY = pointer.y - lastPanPos.y;
      setPanByDelta({ x: -deltaX, y: -deltaY });
      setLastPanPos(pointer);
      return;
    }

    const worldPoint = screenToWorld(pointer, cameraState);
    setHoverSnap(resolveSnapTarget(worldPoint));

    if (!isDrawing || !startPoint) return;

    const snap = resolveSnapTarget(worldPoint);

    setCurrentPoint(snap.point);
    setCurrentSnap(snap);
    trackPointerDrag(worldPoint, Boolean(e.evt.buttons & 1));
  };

  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
      setLastPanPos(null);
      setPanByDelta(null);
      pointerDownWorldRef.current = null;
      didDragRef.current = false;
      return;
    }

    if (isDrawing && didDragRef.current) {
      finalizeDrawing();
    }

    pointerDownWorldRef.current = null;
    didDragRef.current = false;
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

  const handleTouchStart = (e: KonvaEventObject<TouchEvent>) => {
    const touches = e.evt.touches;
    const stage = stageRef.current ?? e.target.getStage();
    if (!stage) return;

    if (touches.length === 2) {
      e.evt.preventDefault();
      const distance = getTouchDistance(touches[0], touches[1]);
      const center = getTouchCenter(touches[0], touches[1]);
      const rect = stage.container().getBoundingClientRect();
      const pointer = { x: center.x - rect.left, y: center.y - rect.top };

      setLastTouchDistance(distance);
      setLastTouchCenter(pointer);
      resetDrawingState();
      setIsPanning(false);
      return;
    }

    if (touches.length === 1) {
      const worldPoint = getWorldPointFromEvent(e);
      if (!worldPoint) return;

      if (isPanning || editingLineId) return;

      pointerDownWorldRef.current = worldPoint;
      didDragRef.current = false;

      handleInteractionStart(worldPoint);
    }
  };

  const handleTouchMove = (e: KonvaEventObject<TouchEvent>) => {
    e.evt.preventDefault();
    const touches = e.evt.touches;
    const stage = stageRef.current ?? e.target.getStage();
    if (!stage) return;
    
    if (touches.length === 2 && lastTouchDistance !== null && lastTouchCenter !== null) {
      const distance = getTouchDistance(touches[0], touches[1]);
      const center = getTouchCenter(touches[0], touches[1]);
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
      pointerDownWorldRef.current = null;
      didDragRef.current = false;
      return;
    }
    
    if (touches.length === 1) {
      const worldPoint = getWorldPointFromEvent(e);
      if (!worldPoint) return;

      setHoverSnap(resolveSnapTarget(worldPoint));

      if (isDrawing && startPoint) {
        const snap = resolveSnapTarget(worldPoint);

        setCurrentPoint(snap.point);
        setCurrentSnap(snap);
        trackPointerDrag(worldPoint, true);
      }
    }
  };

  const handleTouchEnd = (e: KonvaEventObject<TouchEvent>) => {
    const touches = e.evt.touches;
    
    if (touches.length === 0) {
      if (isDrawing && didDragRef.current) {
        finalizeDrawing();
      }
      setLastTouchDistance(null);
      setLastTouchCenter(null);
      setIsPanning(false);
      setLastPanPos(null);
      setPanByDelta(null);
      pointerDownWorldRef.current = null;
      didDragRef.current = false;
    } else if (touches.length === 1) {
      setLastTouchDistance(null);
      setLastTouchCenter(null);
      pointerDownWorldRef.current = null;
      didDragRef.current = false;
    }
  };

  const handleLabelClick = (lineId: string, currentLength: number, e: any) => {
    e.cancelBubble = true;
    const line = lines.find((l) => l.id === lineId);
    if (line && !line.gateId) {
      if (selectedGateType) {
        const stage = e.target.getStage();
        const rect = stage.container().getBoundingClientRect();
        const pointerScreen = {
          x: e.evt.clientX - rect.left,
          y: e.evt.clientY - rect.top,
        };

        addGate(lineId, screenToWorld(pointerScreen, cameraState));
      } else if (e.evt.shiftKey) {
        setSelectedLineId(lineId);
      } else {
        setEditingLineId(lineId);
        setLabelUnit("mm");
        setEditValue(currentLength.toFixed(0));
        setEditError(null);
      }
    }
  };

  const handleLineClick = (lineId: string, e: any) => {
    e.cancelBubble = true;
    if (isDrawing) return;
    const line = lines.find((l) => l.id === lineId);
    if (line && !line.gateId) {
      if (selectedGateType) {
        const stage = e.target.getStage();
        const rect = stage.container().getBoundingClientRect();
        const pointerScreen = {
          x: e.evt.clientX - rect.left,
          y: e.evt.clientY - rect.top,
        };
        addGate(lineId, screenToWorld(pointerScreen, cameraState));
      } else {
        setSelectedLineId(lineId);
      }
    }
  };

  const parseLengthInput = useCallback(
    (value: string, unit: "mm" | "m") => {
      const trimmed = value.trim();
      if (!trimmed) {
        return { mm: null, error: "Enter a value" };
      }

      const numeric = Number(trimmed);
      if (!Number.isFinite(numeric)) {
        return { mm: null, error: "Enter a valid number" };
      }
      if (numeric <= 0) {
        return { mm: null, error: "Value must be greater than zero" };
      }

      const mm = unit === "m" ? numeric * 1000 : numeric;
      if (mm < MIN_RUN_MM) {
        return {
          mm: null,
          error: `Value too small. Minimum is ${(MIN_RUN_MM / 1000).toFixed(2)} m`,
        };
      }
      if (mm > MAX_RUN_MM) {
        return { mm: null, error: "Value too large, check units" };
      }

      return { mm };
    },
    []
  );

  const handleLabelSubmit = () => {
    if (!editingLineId) return;

    const { mm, error } = parseLengthInput(editValue, labelUnit);
    if (!mm || error) {
      setEditError(error ?? "Enter a value");
      return;
    }

    const targetLineId = editingLineId;

    setEditingLineId(null);
    setEditValue("");
    setEditError(null);

    queueMicrotask(() => {
      try {
        updateLine(targetLineId, mm, "b", { allowMerge: false });
        const latestLines = useAppStore.getState().lines;
        const stillExists = latestLines.some((line) => line.id === targetLineId);
        if (!stillExists) {
          setSelectedLineId(null);
        }
      } catch (err) {
        setEditError(err instanceof Error ? err.message : "Unable to update length");
        setEditingLineId(targetLineId);
      }
    });
  };

  const handleUnitChange = (unit: "mm" | "m") => {
    if (unit === labelUnit) return;
    const numeric = Number(editValue);
    let convertedValue = editValue;

    if (Number.isFinite(numeric)) {
      const mmValue = labelUnit === "m" ? numeric * 1000 : numeric;
      convertedValue = unit === "m" ? (mmValue / 1000).toString() : mmValue.toString();
    }

    setLabelUnit(unit);
    setEditValue(convertedValue);
    setEditError(null);
  };

  const validationResult = parseLengthInput(editValue, labelUnit);
  const inlineError = editError ?? validationResult.error;

  const helperText = (() => {
    const numeric = Number(editValue);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    const mmValue = labelUnit === "m" ? numeric * 1000 : numeric;
    const metresValue = mmValue / 1000;

    return labelUnit === "m"
      ? `= ${mmValue.toLocaleString()} mm`
      : `= ${metresValue.toFixed(3)} m`;
  })();

  const gridLines: JSX.Element[] = [];

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
          ref={stageRef}
          className="absolute inset-0"
          width={dimensions.width}
          height={dimensions.height}
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
          <Layer listening={false}>
            <Group x={viewOffset.x} y={viewOffset.y} scaleX={viewScale} scaleY={viewScale}>
              {gridLines}
            </Group>
          </Layer>
          <Layer>
            <Group x={viewOffset.x} y={viewOffset.y} scaleX={viewScale} scaleY={viewScale}>
            {lines.map((line) => {
              const isGate = !!line.gateId;
              const isSelected = line.id === selectedLineId;

              const isInteractive = !isGate;

              const baseStrokeWidth = mmToPx(FENCE_THICKNESS_MM);
              const outlineStrokeWidth = baseStrokeWidth + mmToPx(6);
              const linePoints = [line.a.x, line.a.y, line.b.x, line.b.y];

              const mainStroke = isGate
                ? "#fbbf24"
                : mapMode === "satellite"
                  ? "rgba(255,255,255,0.9)"
                  : isSelected
                    ? "#2563eb"
                    : "#475569";

              const outlineStroke = mapMode === "satellite" ? "rgba(0,0,0,0.6)" : "#0f172a";

              return (
                <Group key={line.id}>
                  <Line
                    points={linePoints}
                    stroke={outlineStroke}
                    strokeWidth={outlineStrokeWidth}
                    opacity={isGate ? 0.8 : mapMode === "satellite" ? 0.75 : 0.9}
                    listening={false}
                  />
                  <Line
                    points={linePoints}
                    stroke={mainStroke}
                    strokeWidth={baseStrokeWidth}
                    opacity={isGate ? 0.8 : 1}
                    listening={false}
                    shadowColor={mapMode === "satellite" ? "rgba(0,0,0,0.6)" : undefined}
                    shadowBlur={mapMode === "satellite" ? 2 : undefined}
                  />
                  {isInteractive && (
                    <Line
                      points={linePoints}
                      stroke="rgba(0,0,0,0)"
                      strokeWidth={1}
                      hitStrokeWidth={lineHitStrokeWidth}
                      listening
                      perfectDrawEnabled={false}
                      strokeScaleEnabled={false}
                      onMouseEnter={(e) => {
                        const stage = e.target.getStage();
                        if (stage) stage.container().style.cursor = "pointer";
                      }}
                      onMouseLeave={(e) => {
                        const stage = e.target.getStage();
                        if (stage) stage.container().style.cursor = "default";
                      }}
                      onClick={(e) => handleLineClick(line.id, e)}
                      onTap={(e) => handleLineClick(line.id, e)}
                    />
                  )}

                  {(() => {
                    const dx = line.b.x - line.a.x;
                    const dy = line.b.y - line.a.y;
                    const length = Math.hypot(dx, dy) || 1;

                    const nx = -dy / length;
                    const ny = dx / length;

                    const midX = (line.a.x + line.b.x) / 2;
                    const midY = (line.a.y + line.b.y) / 2;

                    const labelOffset = LABEL_OFFSET_PX / viewScale;
                    const labelX = midX + nx * labelOffset;
                    const labelY = midY + ny * labelOffset;

                    const text = `${(line.length_mm / 1000).toFixed(2)}m`;
                    const fontSize = 12 / viewScale;
                    const padding = 4 / viewScale;
                    const estimatedWidth = text.length * fontSize * 0.6 + padding * 2;
                    const estimatedHeight = fontSize + padding * 2;

                    const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
                    const readableAngle = angleDeg > 90 || angleDeg < -90 ? angleDeg + 180 : angleDeg;

                    const textFill = isGate
                      ? "#f59e0b"
                      : mapMode === "satellite"
                        ? "#0f172a"
                        : "#1e293b";

                    const tagFill = mapMode === "satellite" ? "rgba(255,255,255,0.9)" : "#ffffff";
                    const tagStroke = mapMode === "satellite" ? "rgba(0,0,0,0.35)" : "rgba(15,23,42,0.35)";

                    return (
                      <Label
                        x={labelX}
                        y={labelY}
                        offsetX={estimatedWidth / 2}
                        offsetY={estimatedHeight / 2}
                        rotation={readableAngle}
                        listening={!isGate}
                        onClick={(e) => handleLabelClick(line.id, line.length_mm, e)}
                      >
                        <Tag
                          fill={tagFill}
                          stroke={tagStroke}
                          strokeWidth={1 / viewScale}
                          cornerRadius={4 / viewScale}
                          pointerDirection="none"
                          padding={padding}
                        />
                        <Text
                          text={text}
                          fontSize={fontSize}
                          fill={textFill}
                          padding={padding}
                        />
                      </Label>
                    );
                  })()}
                </Group>
              );
            })}

            {isDrawing && startPoint && currentPoint && (
              <Line
                points={[startPoint.x, startPoint.y, currentPoint.x, currentPoint.y]}
                stroke={mapMode === "satellite" ? "#ffffff" : "#94a3b8"}
                strokeWidth={previewStrokeWidth}
                dash={[previewDashLength, previewDashLength]}
                strokeScaleEnabled
              />
            )}

            {posts.map((post) => {
              const neighbours = getPostNeighbours(post.pos, lines);
              const junctionAngle = showPostAngleDebug
                ? getJunctionAngleDegForPost(post.pos, lines)
                : null;

              return (
                <Group key={post.id}>
                  <PostShape
                    x={post.pos.x}
                    y={post.pos.y}
                    neighbours={neighbours}
                    mmPerPixel={mmPerPixel}
                    category={post.category}
                    lines={lines}
                    isSatelliteMode={mapMode === "satellite"}
                  />
                  {junctionAngle !== null && (
                    <Text
                      x={post.pos.x + 8 / viewScale}
                      y={post.pos.y - 18 / viewScale}
                      text={`${junctionAngle.toFixed(1)}°`}
                      fontSize={12 / viewScale}
                      fill={mapMode === "satellite" ? "#0f172a" : "#1e293b"}
                      listening={false}
                    />
                  )}
                </Group>
              );
            })}

            {gates
              .filter((g) => g.type.startsWith("sliding"))
              .map((gate) => {
                const gateLine = lines.find((l) => l.gateId === gate.id);
                if (!gateLine) return null;

                const geometry = getSlidingReturnRect(gate, gateLine, mmPerPixel);
                if (!geometry) return null;

                return (
                  <Rect
                    key={gate.id}
                    x={geometry.center.x}
                    y={geometry.center.y}
                    width={geometry.width}
                    height={geometry.height}
                    offsetX={geometry.width / 2}
                    offsetY={geometry.height / 2}
                    rotation={geometry.rotation}
                    stroke="#ef4444"
                    strokeWidth={2}
                    dash={[8, 4]}
                    fill="rgba(239, 68, 68, 0.12)"
                    strokeScaleEnabled={false}
                    listening={false}
                  />
                );
              })}
            </Group>
          </Layer>
        </Stage>
      </div>

      <div className="absolute top-2 right-2 z-30">
        <div className="text-xs bg-white/80 backdrop-blur rounded-md shadow px-3 py-2">
          <span>{DEFAULT_CALIBRATED_SCALE_LABEL}</span>
        </div>
      </div>

      {isDev && (
        <div className="absolute bottom-3 left-3 z-30 flex flex-col gap-2 items-start">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSnapDebug((prev) => !prev)}
            className="shadow"
          >
            {showSnapDebug ? "Hide snap debug" : "Show snap debug"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPostAngleDebug((prev) => !prev)}
            className="shadow"
          >
            {showPostAngleDebug ? "Hide post angles" : "Show post angles"}
          </Button>
          {showSnapDebug && (
            <div className="text-xs bg-white/90 backdrop-blur rounded-md shadow px-3 py-2 border border-slate-200">
              <p className="font-semibold text-slate-700">Snap</p>
              <p className="font-mono text-slate-600">{hoverSnap ? hoverSnap.type : "none"}</p>
              <p className="text-[0.7rem] text-slate-500">Press "d" to toggle</p>
              <div className="mt-1 space-y-0.5 font-mono text-slate-600">
                <p>Scale: {cameraState.scale.toFixed(3)}</p>
                <p>Snap (world px): {snapTolerance.toFixed(2)}</p>
                <p>Snap (screen px): {snapToleranceScreenPx.toFixed(2)}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {selectedLineId && (
        <LineControls
          lineId={selectedLineId}
          onClose={() => setSelectedLineId(null)}
        />
      )}

      {editingLineId && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 bg-white p-4 rounded-lg shadow-lg border border-slate-200">
          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="decimal"
              value={editValue}
              onChange={(e) => {
                setEditValue(e.target.value);
                setEditError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleLabelSubmit();
                if (e.key === "Escape") {
                  setEditingLineId(null);
                  setEditValue("");
                  setEditError(null);
                }
              }}
              className="px-3 py-2 border border-slate-300 rounded-md text-sm font-mono w-28"
              autoFocus
              data-testid="input-dimension"
              placeholder="Length"
            />
            <div className="flex rounded-md border border-slate-300 overflow-hidden text-xs">
              <button
                type="button"
                className={`px-2 py-1 ${labelUnit === "mm" ? "bg-primary text-primary-foreground" : "bg-white text-slate-700"}`}
                onClick={() => handleUnitChange("mm")}
              >
                mm
              </button>
              <button
                type="button"
                className={`px-2 py-1 ${labelUnit === "m" ? "bg-primary text-primary-foreground" : "bg-white text-slate-700"}`}
                onClick={() => handleUnitChange("m")}
              >
                m
              </button>
            </div>
          </div>
          {helperText && <p className="text-xs text-slate-600 mt-2 font-mono">{helperText}</p>}
          {inlineError && <p className="text-xs text-red-600 mt-1">{inlineError}</p>}
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleLabelSubmit}
              className="px-3 py-1 bg-primary text-primary-foreground rounded text-xs disabled:opacity-60"
              data-testid="button-submit-dimension"
              disabled={Boolean(validationResult.error)}
            >
              Apply
            </button>
            <button
              onClick={() => {
                setEditingLineId(null);
                setEditValue("");
                setEditError(null);
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
