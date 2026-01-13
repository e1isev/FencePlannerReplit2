import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Label, Layer, Line, Tag, Text, Group, Rect, Stage } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { Stage as KonvaStage } from "konva/lib/Stage";
import type { Map as MaplibreMap } from "maplibre-gl";
import { MAX_RUN_MM, MIN_RUN_MM, useAppStore } from "@/store/appStore";
import { Point } from "@/types/models";
import {
  ENDPOINT_SNAP_RADIUS_MM,
  findSnapOnLines,
  findSnapPoint,
  findSnapPointOnSegment,
} from "@/geometry/snapping";
import { FENCE_THICKNESS_MM, LINE_HIT_SLOP_PX } from "@/constants/geometry";
import { getSlidingReturnRect } from "@/geometry/gates";
import { LineControls } from "./LineControls";
import MapOverlay, { DEFAULT_CENTER, type MapStyleMode } from "./MapOverlay";
import { calculateMetersPerPixel } from "@/lib/mapScale";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PostShape } from "./PostShape";
import { getJunctionAngleDegForPost, getPostAngleDeg, getPostNeighbours } from "@/geometry/posts";
import { distanceMetersProjected } from "@/lib/geo";

const BASE_MAP_ZOOM = 15;
const TEN_YARDS_METERS = 9.144;
const FIXED_SCALE_METERS_PER_PIXEL = 1.82;
const LABEL_OFFSET_PX = 14;
const MIN_LINE_HIT_PX = 10;
const DRAG_THRESHOLD_PX = 4;
const SNAP_SCREEN_MIN_PX = 10;
const SNAP_SCREEN_MAX_PX = 40;
const SEGMENT_SNAP_SCREEN_MAX_PX = 20;

type ScreenPoint = { x: number; y: number };

type SnapTarget =
  | { type: "endpoint"; point: Point; screenPoint: ScreenPoint }
  | { type: "segment"; point: Point; screenPoint: ScreenPoint; lineId: string; t: number }
  | { type: "free"; point: Point; screenPoint: ScreenPoint };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function CanvasStage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<KonvaStage | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [mapCenter, setMapCenter] = useState<Point | null>(null);
  const [mapZoom, setMapZoom] = useState(BASE_MAP_ZOOM);
  const [mapMode, setMapMode] = useState<MapStyleMode>(initialMapMode);
  const [baseMetersPerPixel, setBaseMetersPerPixel] = useState<number | null>(null);
  const [currentMetersPerPixel, setCurrentMetersPerPixel] = useState<number | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationPoints, setCalibrationPoints] = useState<ScreenPoint[]>([]);
  const [calibrationFactor, setCalibrationFactor] = useState(1);
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
  const mapMetersPerPixelRef = useRef<number | null>(null);
  const calibrationFactorRef = useRef(1);
  const pointerDownScreenRef = useRef<ScreenPoint | null>(null);
  const didDragRef = useRef(false);
  const mapRef = useRef<MaplibreMap | null>(null);
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

  const mmToPx = useCallback(
    (mm: number) => (mmPerPixel > 0 ? mm / mmPerPixel : mm),
    [mmPerPixel]
  );

  const screenLines = useMemo(() => {
    const map = mapRef.current;
    if (!map) return [];

    return lines.map((line) => {
      const a = map.project({ lng: line.a.x, lat: line.a.y });
      const b = map.project({ lng: line.b.x, lat: line.b.y });
      return {
        ...line,
        a: { x: a.x, y: a.y },
        b: { x: b.x, y: b.y },
      };
    });
  }, [lines, mapCenter, mapZoom]);

  const screenPosts = useMemo(() => {
    const map = mapRef.current;
    if (!map) return [];

    return posts.map((post) => {
      const projected = map.project({ lng: post.pos.x, lat: post.pos.y });
      return {
        ...post,
        screenPos: { x: projected.x, y: projected.y },
      };
    });
  }, [posts, mapCenter, mapZoom]);

  const toLngLat = useCallback((point: ScreenPoint): Point | null => {
    const map = mapRef.current;
    if (!map) return null;
    const lngLat = map.unproject([point.x, point.y]);
    return { x: lngLat.lng, y: lngLat.lat };
  }, []);

  const toScreenPoint = useCallback((point: Point): ScreenPoint | null => {
    const map = mapRef.current;
    if (!map) return null;
    const projected = map.project({ lng: point.x, lat: point.y });
    return { x: projected.x, y: projected.y };
  }, []);

  const getWorldPointFromEvent = useCallback(
    (e: KonvaEventObject<MouseEvent | TouchEvent>): Point | null => {
      const stage = stageRef.current;
      if (!stage) return null;

      const pointer = stage.getPointerPosition();
      if (!pointer) return null;

      return toLngLat(pointer);
    },
    [toLngLat]
  );

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
      const nextMmPerPixel = referenceMetersPerPixel * calibrationFactorRef.current * 1000;
      if (Math.abs(nextMmPerPixel - mmPerPixel) < 0.0001) return;

      setMmPerPixel(nextMmPerPixel);
    },
    [mmPerPixel, setMmPerPixel]
  );

  const handleMapModeChange = useCallback((mode: MapStyleMode) => {
    setMapMode(mode);
  }, []);

  const handleMapReady = useCallback((map: MaplibreMap) => {
    mapRef.current = map;
  }, []);

  const handleMapCenterChange = useCallback((center: { lng: number; lat: number }) => {
    setMapCenter({ x: center.lng, y: center.lat });
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
    if (!readOnly) return;
    const points = [
      ...lines.flatMap((line) => [line.a, line.b]),
      ...posts.map((post) => post.pos),
    ];
    if (points.length === 0) return;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    points.forEach((point) => {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    });

    const boundsWidth = Math.max(maxX - minX, 1);
    const boundsHeight = Math.max(maxY - minY, 1);
    const padding = 80;
    const availableWidth = Math.max(dimensions.width - padding * 2, 1);
    const availableHeight = Math.max(dimensions.height - padding * 2, 1);
    const nextScale = Math.min(availableWidth / boundsWidth, availableHeight / boundsHeight);
    const safeScale = Number.isFinite(nextScale) && nextScale > 0 ? nextScale : 1;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    setMapScale(safeScale);
    setMapPanOffset({ x: centerX * safeScale, y: centerY * safeScale });
  }, [dimensions.height, dimensions.width, lines, posts, readOnly]);

  useEffect(() => {
    if (baseMetersPerPixelRef.current !== null) return;

    const baseMetersPerPixel = calculateMetersPerPixel(BASE_MAP_ZOOM, DEFAULT_CENTER[1]);
    const currentMetersPerPixel = calculateMetersPerPixel(mapZoom, DEFAULT_CENTER[1]);

    if (!isFinite(baseMetersPerPixel) || !isFinite(currentMetersPerPixel)) return;

    baseMetersPerPixelRef.current = baseMetersPerPixel;
    setBaseMetersPerPixel(baseMetersPerPixel);
    setCurrentMetersPerPixel(currentMetersPerPixel);
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
  const snapScreenFromMm = ENDPOINT_SNAP_RADIUS_MM / effectiveMmPerPixel;
  const snapTolerance = clamp(snapScreenFromMm, SNAP_SCREEN_MIN_PX, SNAP_SCREEN_MAX_PX);
  const segmentSnapTolPx = Math.min(snapTolerance, SEGMENT_SNAP_SCREEN_MAX_PX);
  const dragThresholdPx = DRAG_THRESHOLD_PX;
  const lineHitStrokeWidth = Math.max(MIN_LINE_HIT_PX, 1);
  const snapToleranceScreenPx = snapTolerance;
  const previewStrokeWidth = mmToPx(FENCE_THICKNESS_MM);
  const previewDashLength = mmToPx(FENCE_THICKNESS_MM);

  const resolveSnapTarget = useCallback(
    (screenPoint: ScreenPoint): SnapTarget => {
      const allPoints = [
        ...screenLines.flatMap((l) => [l.a, l.b]),
        ...screenPosts.map((p) => p.screenPos),
      ];

      const snappedEndpoint = findSnapPoint(screenPoint, allPoints, snapTolerance);
      if (snappedEndpoint) {
        const snappedLngLat = toLngLat(snappedEndpoint) ?? null;
        if (snappedLngLat) {
          return { type: "endpoint", point: snappedLngLat, screenPoint: snappedEndpoint };
        }
      }

      const lineSnap = findSnapOnLines(screenPoint, screenLines, segmentSnapTolPx);
      if (lineSnap) {
        const snappedLngLat = toLngLat(lineSnap.point) ?? null;
        if (snappedLngLat) {
          return lineSnap.kind === "endpoint"
            ? {
                type: "endpoint",
                point: snappedLngLat,
                screenPoint: lineSnap.point,
              }
            : {
                type: "segment",
                point: snappedLngLat,
                screenPoint: lineSnap.point,
                lineId: lineSnap.lineId,
                t: lineSnap.t,
              };
        }
      }

      const fallbackLngLat = toLngLat(screenPoint);
      return fallbackLngLat
        ? { type: "free", point: fallbackLngLat, screenPoint }
        : { type: "free", point: { x: 0, y: 0 }, screenPoint };
    },
    [screenLines, screenPosts, segmentSnapTolPx, snapTolerance, toLngLat]
  );

  const handleCalibrationComplete = useCallback(
    (a: ScreenPoint, b: ScreenPoint) => {
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
    (point: ScreenPoint) => {
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

  const resetDrawingState = useCallback(() => {
    setIsDrawing(false);
    setStartPoint(null);
    setCurrentPoint(null);
    setStartSnap(null);
    setCurrentSnap(null);
    pointerDownScreenRef.current = null;
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
          const distA = distanceMetersProjected(snap.point, line.a);
          const distB = distanceMetersProjected(snap.point, line.b);
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
          const refreshedLines = latestLines.flatMap((line) => {
            const start = toScreenPoint(line.a);
            const end = toScreenPoint(line.b);
            if (!start || !end) return [];
            return [{ ...line, a: start, b: end }];
          });
          const refreshed = findSnapPointOnSegment(
            resolvedEndSnap.screenPoint,
            refreshedLines,
            segmentSnapTolPx
          );
          if (refreshed && refreshed.kind === "segment" && refreshed.lineId) {
            const refreshedLngLat = toLngLat(refreshed.point);
            resolvedEndSnap = {
              type: "segment",
              point: refreshedLngLat ?? resolvedEndSnap.point,
              screenPoint: refreshed.point,
              lineId: refreshed.lineId,
              t: refreshed.t ?? 0,
            };
          } else if (refreshed?.kind === "endpoint") {
            const refreshedLngLat = toLngLat(refreshed.point);
            if (refreshedLngLat) {
              resolvedEndSnap = {
                type: "endpoint",
                point: refreshedLngLat,
                screenPoint: refreshed.point,
              };
            }
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

  const trackPointerDrag = (point: ScreenPoint, isPointerDown: boolean) => {
    if (!isPointerDown || !pointerDownScreenRef.current) return;

    const dist = Math.hypot(
      point.x - pointerDownScreenRef.current.x,
      point.y - pointerDownScreenRef.current.y
    );
    if (dist > dragThresholdPx) {
      didDragRef.current = true;
    }
  };

  const handleInteractionStart = (screenPoint: ScreenPoint, worldPoint: Point) => {
    if (isCalibrating) {
      registerCalibrationPoint(screenPoint);
      resetDrawingState();
      return;
    }

    const snap = resolveSnapTarget(screenPoint);
    setHoverSnap(snap);

    if (selectedGateType) {
      const clickedLine = screenLines.find((line) => {
        const dist = pointToLineDistance(screenPoint, line.a, line.b);
        return dist < 10;
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
    if (!mapRef.current) return;

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

    pointerDownScreenRef.current = pointer;
    didDragRef.current = false;

    handleInteractionStart(pointer, worldPoint);
  };

  const handleMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    const stage = stageRef.current ?? e.target.getStage();
    if (!stage) return;
    if (!mapRef.current) return;

    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    if (isPanning && lastPanPos) {
      const deltaX = pointer.x - lastPanPos.x;
      const deltaY = pointer.y - lastPanPos.y;
      setPanByDelta({ x: -deltaX, y: -deltaY });
      setLastPanPos(pointer);
      return;
    }

    const snap = resolveSnapTarget(pointer);
    setHoverSnap(snap);

    if (!isDrawing || !startPoint) return;

    setCurrentPoint(snap.point);
    setCurrentSnap(snap);
    trackPointerDrag(pointer, Boolean(e.evt.buttons & 1));
  };

  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
      setLastPanPos(null);
      setPanByDelta(null);
      pointerDownScreenRef.current = null;
      didDragRef.current = false;
      return;
    }

    if (isDrawing && didDragRef.current) {
      finalizeDrawing();
    }

    pointerDownScreenRef.current = null;
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
    if (!mapRef.current) return;

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
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const worldPoint = toLngLat(pointer);
      if (!worldPoint) return;

      if (isPanning || editingLineId) return;

      pointerDownScreenRef.current = pointer;
      didDragRef.current = false;

      handleInteractionStart(pointer, worldPoint);
    }
  };

  const handleTouchMove = (e: KonvaEventObject<TouchEvent>) => {
    e.evt.preventDefault();
    const touches = e.evt.touches;
    const stage = stageRef.current ?? e.target.getStage();
    if (!stage) return;
    if (!mapRef.current) return;
    
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
      pointerDownScreenRef.current = null;
      didDragRef.current = false;
      return;
    }
    
    if (touches.length === 1) {
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      const worldPoint = toLngLat(pointer);
      if (!worldPoint) return;

      const snap = resolveSnapTarget(pointer);
      setHoverSnap(snap);

      if (isDrawing && startPoint) {
        setCurrentPoint(snap.point);
        setCurrentSnap(snap);
        trackPointerDrag(pointer, true);
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
      pointerDownScreenRef.current = null;
      didDragRef.current = false;
    } else if (touches.length === 1) {
      setLastTouchDistance(null);
      setLastTouchCenter(null);
      pointerDownScreenRef.current = null;
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

        const worldPoint = toLngLat(pointerScreen);
        if (worldPoint) {
          addGate(lineId, worldPoint);
        }
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
        const worldPoint = toLngLat(pointerScreen);
        if (worldPoint) {
          addGate(lineId, worldPoint);
        }
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

  const isReadOnly = readOnly;

  return (
    <div
      ref={containerRef}
      className={`flex-1 relative overflow-hidden bg-slate-50${isReadOnly ? " pointer-events-none" : ""}`}
    >
      <MapOverlay
        onZoomChange={handleZoomChange}
        onScaleChange={handleScaleChange}
        onMapModeChange={handleMapModeChange}
        onMapReady={handleMapReady}
        onCenterChange={handleMapCenterChange}
        mapZoom={mapZoom}
        panByDelta={panByDelta}
        readOnly={isReadOnly}
      />

      <div className="absolute inset-0 z-10">
        <Stage
          ref={stageRef}
          className="absolute inset-0"
          width={dimensions.width}
          height={dimensions.height}
          onWheel={isReadOnly ? undefined : handleWheel}
          onMouseDown={isReadOnly ? undefined : handleMouseDown}
          onMouseMove={isReadOnly ? undefined : handleMouseMove}
          onMouseUp={isReadOnly ? undefined : handleMouseUp}
          onTouchStart={isReadOnly ? undefined : handleTouchStart}
          onTouchMove={isReadOnly ? undefined : handleTouchMove}
          onTouchEnd={isReadOnly ? undefined : handleTouchEnd}
          onContextMenu={(e) => e.evt.preventDefault()}
          data-testid="canvas-stage"
        >
          <Layer listening={false}>
            {gridLines}
          </Layer>
          <Layer>
            {screenLines.map((line) => {
              const isGate = !!line.gateId;
              const isSelected = line.id === selectedLineId;

              const isInteractive = !isGate && !isReadOnly;

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

                    const labelOffset = LABEL_OFFSET_PX;
                    const labelX = midX + nx * labelOffset;
                    const labelY = midY + ny * labelOffset;

                    const text = `${(line.length_mm / 1000).toFixed(2)}m`;
                    const fontSize = 12;
                    const padding = 4;
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
                        listening={!isGate && !isReadOnly}
                        onClick={isReadOnly ? undefined : (e) => handleLabelClick(line.id, line.length_mm, e)}
                      >
                        <Tag
                          fill={tagFill}
                          stroke={tagStroke}
                          strokeWidth={1}
                          cornerRadius={4}
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

            {isDrawing && startPoint && currentPoint && (() => {
              const startScreen = toScreenPoint(startPoint);
              const currentScreen = toScreenPoint(currentPoint);
              if (!startScreen || !currentScreen) return null;

              return (
                <Line
                  points={[startScreen.x, startScreen.y, currentScreen.x, currentScreen.y]}
                  stroke={mapMode === "satellite" ? "#ffffff" : "#94a3b8"}
                  strokeWidth={previewStrokeWidth}
                  dash={[previewDashLength, previewDashLength]}
                  strokeScaleEnabled={false}
                />
              );
            })()}

            {screenPosts.map((post) => {
              const neighbours = getPostNeighbours(post.pos, lines);
              const angleDeg = getPostAngleDeg(post.pos, neighbours, lines, post.category);
              const junctionAngle = showPostAngleDebug
                ? getJunctionAngleDegForPost(post.pos, lines)
                : null;

              return (
                <Group key={post.id}>
                  <PostShape
                    x={post.screenPos.x}
                    y={post.screenPos.y}
                    mmPerPixel={mmPerPixel}
                    category={post.category}
                    angleDeg={angleDeg}
                    isSatelliteMode={mapMode === "satellite"}
                  />
                  {junctionAngle !== null && (
                    <Text
                      x={post.screenPos.x + 8}
                      y={post.screenPos.y - 18}
                      text={`${junctionAngle.toFixed(1)}°`}
                      fontSize={12}
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
                const gateLine = screenLines.find((l) => l.gateId === gate.id);
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
          </Layer>
        </Stage>
      </div>

      {!isReadOnly && (
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
      )}

      {!isReadOnly && isDev && (
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
                <p>Zoom: {mapZoom.toFixed(2)}</p>
                <p>Snap (px): {snapTolerance.toFixed(2)}</p>
                <p>Snap (screen px): {snapToleranceScreenPx.toFixed(2)}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {!isReadOnly && (
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
      )}

      {!isReadOnly && selectedLineId && (
        <LineControls
          lineId={selectedLineId}
          onClose={() => setSelectedLineId(null)}
        />
      )}

      {!isReadOnly && editingLineId && (
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

function pointToLineDistance(point: ScreenPoint, lineStart: ScreenPoint, lineEnd: ScreenPoint): number {
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
