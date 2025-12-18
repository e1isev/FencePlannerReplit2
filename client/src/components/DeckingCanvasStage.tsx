import { useEffect, useMemo, useRef, useState } from "react";
import Konva from "konva";
import { Circle, Group, Layer, Line, Rect, Shape, Stage, Text } from "react-konva";
import { useDeckingStore } from "@/store/deckingStore";
import {
  mmToPx,
  pxToMm,
  BOARD_WIDTH_MM,
  BOARD_GAP_MM,
  BREAKER_WIDTH_MM,
  BREAKER_HALF_MM,
} from "@/lib/deckingGeometry";
import { breakerAxisForDirection, getBreakerLineSegments, snapBreakerPosition } from "@/lib/deckingBreaker";
import {
  CLOSE_SHAPE_SNAP_RADIUS_MM,
  ENDPOINT_SNAP_RADIUS_MM,
  findSnapPoint,
  getDistance,
  snapToAngle,
} from "@/geometry/snapping";
import { angleDegAtVertex, normalise } from "@/geometry/deckingAngles";
import { edgeLengthMm, isEdgeLocked } from "@/geometry/deckingEdges";
import type { DeckEntity, Point, PolygonBounds } from "@/types/decking";
import {
  getClipsPerJoist,
  getDeckBounds,
  getFasciaClipPositions,
  getJoistPositions,
  getRowAxisStart,
} from "@/geometry/clipCalc";
import type { BreakerLine } from "@/types/decking";

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

type PendingSegment = {
  startIndex: number;
  startMm: Point;
  provisionalEndMm: Point;
  screenX: number;
  screenY: number;
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

function getPolygonBounds(points: Point[]): PolygonBounds | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  points.forEach((p) => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  });

  return { minX, minY, maxX, maxY };
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

function getFillColor(deck: DeckEntity) {
  return COLOR_MAP[deck.selectedColor] || "#92400e";
}

export function DeckingCanvasStage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const [scale, setScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [panStart, setPanStart] = useState<
    { client: { x: number; y: number }; stage: { x: number; y: number } } | null
  >(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [draftPointsMm, setDraftPointsMm] = useState<Point[]>([]);
  const [previewPointMm, setPreviewPointMm] = useState<Point | null>(null);
  const [pendingSegment, setPendingSegment] = useState<PendingSegment | null>(null);
  const [pendingLengthText, setPendingLengthText] = useState("");
  const [isLengthPromptOpen, setIsLengthPromptOpen] = useState(false);
  const [lengthError, setLengthError] = useState<string | null>(null);
  const [rightClickMoved, setRightClickMoved] = useState(false);
  const [editingEdgeIndex, setEditingEdgeIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [edgeEditorPos, setEdgeEditorPos] = useState<{ x: number; y: number } | null>(null);
  const [lockAfterApply, setLockAfterApply] = useState(false);

  const {
    decks,
    activeDeckId,
    selectedDeckId,
    pendingDeleteDeckId,
    addDeck,
    setSelectedDeck,
    requestDeleteDeck,
    confirmDeleteDeck,
    cancelDeleteDeck,
    updateEdgeLength,
    lockEdgeLength,
    unlockEdgeLength,
    joistSpacingMode,
    showClips,
    selectedBreakerId,
    editingBreakerId,
    breakerDraftPosMm,
    breakerConfirmId,
    breakerConfirmPosMm,
    selectBreakerLine,
    startEditBreakerLine,
    setBreakerDraftPos,
    requestConfirmBreaker,
    confirmBreakerPlacement,
    rejectBreakerPlacement,
    exitEditBreakerLine,
  } = useDeckingStore();

  const activeDeck = useMemo(
    () => decks.find((deck) => deck.id === activeDeckId) ?? null,
    [activeDeckId, decks]
  );
  const selectedDeck = useMemo(
    () => decks.find((deck) => deck.id === selectedDeckId) ?? null,
    [decks, selectedDeckId]
  );
  const allBoards = useMemo(() => decks.flatMap((deck) => deck.boards), [decks]);
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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        cancelDeleteDeck();
        setSelectedDeck(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cancelDeleteDeck, setSelectedDeck]);

  const screenToWorld = (point: { x: number; y: number }) => ({
    x: pxToMm((point.x - stagePos.x) / scale),
    y: pxToMm((point.y - stagePos.y) / scale),
  });

  const worldToScreen = (point: { x: number; y: number }) => ({
    x: stagePos.x + mmToPx(point.x) * scale,
    y: stagePos.y + mmToPx(point.y) * scale,
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
      if (pendingSegment) {
        setRightClickMoved(false);
        return;
      }
      setPanStart({
        client: { x: e.evt.clientX, y: e.evt.clientY },
        stage: { ...stagePos },
      });
      setRightClickMoved(false);
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
      if (!rightClickMoved && (Math.abs(deltaX) > 0 || Math.abs(deltaY) > 0)) {
        setRightClickMoved(true);
      }
      return;
    }
    const stage = e.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!pointer) return;

    if (!isDrawing || draftPointsMm.length === 0 || pendingSegment) return;

    const lastPoint = draftPointsMm[draftPointsMm.length - 1];
    const snapped = getSnappedPointer(pointer, lastPoint, e.evt.altKey);

    setPreviewPointMm(snapped);
  };

  const handleMouseUp = (e?: Konva.KonvaEventObject<MouseEvent>) => {
    if (panStart) {
      setPanStart(null);
    }

    if (e?.evt?.button === 2) {
      if (!rightClickMoved && pendingSegment) {
        handleCancelPendingSegment();
      } else if (!rightClickMoved && isDrawing) {
        handleCancelDrawing();
      }
      setRightClickMoved(false);
    }
  };

  const handleStageClick = (e: any) => {
    if (e.evt.button === 2) return;
    if (e.target !== e.target.getStage()) return;
    if (breakerConfirmId) return;
    if (pendingSegment || isLengthPromptOpen) return;

    const stage = e.target.getStage();
    if (!stage) return;

    if (!isDrawing) {
      setSelectedDeck(null);
      cancelDeleteDeck();
      if (selectedDeck) {
        return;
      }
    }

    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const anchor =
      isDrawing && draftPointsMm.length > 0 ? draftPointsMm[draftPointsMm.length - 1] : null;
    const snapped = getSnappedPointer(pointer, anchor, e.evt.altKey);

    if (!isDrawing || draftPointsMm.length === 0) {
      setIsDrawing(true);
      setDraftPointsMm([snapped]);
      setPreviewPointMm(snapped);
      return;
    }

    const startIndex = draftPointsMm.length - 1;
    const startMm = draftPointsMm[startIndex];
    const midpoint = {
      x: (startMm.x + snapped.x) / 2,
      y: (startMm.y + snapped.y) / 2,
    };
    const promptPos = worldToScreen(midpoint);

    const nextPoints = [...draftPointsMm, snapped];
    setDraftPointsMm(nextPoints);
    setPreviewPointMm(snapped);
    setPendingSegment({
      startIndex,
      startMm,
      provisionalEndMm: snapped,
      screenX: promptPos.x,
      screenY: promptPos.y,
    });
    setPendingLengthText(getDistance(startMm, snapped).toFixed(0));
    setIsLengthPromptOpen(true);
    setLengthError(null);
  };

  const handleCancelPendingSegment = () => {
    if (!pendingSegment) return;

    setDraftPointsMm((prev) => {
      const next = prev.slice(0, -1);
      if (next.length === 0) {
        setIsDrawing(false);
        setPreviewPointMm(null);
      } else {
        setIsDrawing(true);
        setPreviewPointMm(next[next.length - 1]);
      }
      return next;
    });

    setPendingSegment(null);
    setIsLengthPromptOpen(false);
    setPendingLengthText("");
    setLengthError(null);
  };

  const handleCancelDrawing = () => {
    setDraftPointsMm([]);
    setPreviewPointMm(null);
    setPendingSegment(null);
    setPendingLengthText("");
    setIsLengthPromptOpen(false);
    setIsDrawing(false);
    setLengthError(null);
  };

  const handleApplyLength = () => {
    if (!pendingSegment) return;

    const targetLengthMm = Number(pendingLengthText);
    if (!Number.isFinite(targetLengthMm) || targetLengthMm <= 0) {
      setLengthError("Please enter a positive length.");
      return;
    }

    const { startIndex, startMm, provisionalEndMm } = pendingSegment;
    const direction = {
      x: provisionalEndMm.x - startMm.x,
      y: provisionalEndMm.y - startMm.y,
    };
    const currentLength = Math.hypot(direction.x, direction.y);

    if (currentLength === 0) {
      setLengthError("Cannot size a zero-length segment.");
      return;
    }

    const unitDir = { x: direction.x / currentLength, y: direction.y / currentLength };
    const newEnd = {
      x: startMm.x + unitDir.x * targetLengthMm,
      y: startMm.y + unitDir.y * targetLengthMm,
    };

    const endIndex = startIndex + 1;
    if (endIndex >= draftPointsMm.length) {
      setLengthError("Segment is no longer available.");
      return;
    }

    const nextPoints = draftPointsMm.map((point, idx) => (idx === endIndex ? newEnd : point));

    const closingToStart =
      nextPoints.length >= 3 &&
      endIndex === nextPoints.length - 1 &&
      getDistance(newEnd, nextPoints[0]) <= CLOSE_SHAPE_SNAP_RADIUS_MM;

    if (closingToStart) {
      const newPolygon = nextPoints.slice(0, -1);
      if (newPolygon.length >= 3) {
        addDeck(newPolygon);
      }
      setDraftPointsMm([]);
      setPreviewPointMm(null);
      setIsDrawing(false);
    } else {
      setDraftPointsMm(nextPoints);
      setPreviewPointMm(newEnd);
      setIsDrawing(true);
    }

    setPendingSegment(null);
    setIsLengthPromptOpen(false);
    setPendingLengthText("");
    setLengthError(null);
  };

  const hasPolygon = Boolean(activeDeck && activeDeck.polygon.length >= 3);
  const drawingPointsMm = previewPointMm ? [...draftPointsMm, previewPointMm] : draftPointsMm;
  const drawingPointsPx = drawingPointsMm.flatMap((p) => [mmToPx(p.x), mmToPx(p.y)]);
  const isConfirmingDelete = selectedDeck?.id === pendingDeleteDeckId;
  const boardRenderWidthMm = BOARD_WIDTH_MM + 0.5;
  const breakerRenderWidthMm = BREAKER_WIDTH_MM + 0.5;
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

    const boardEndpoints = allBoards.flatMap((board) => [board.start, board.end]);
    const polygonPoints = decks.flatMap((deck) => deck.polygon);
    const allPoints = [...draftPointsMm, ...polygonPoints, ...boardEndpoints];
    const snapPoint = findSnapPoint(worldPosMm, allPoints, ENDPOINT_SNAP_RADIUS_MM);
    const snappedToPoint = Boolean(snapPoint);
    let candidate = snapPoint || worldPosMm;

    if (anchor && !snappedToPoint && !disableAngleSnap) {
      candidate = snapToAngle(anchor, candidate);
    }

    return candidate;
  };

  const polygonCentroid = useMemo(
    () => computeCentroid(activeDeck?.polygon ?? []),
    [activeDeck?.polygon]
  );
  const selectedDeckAnchor = useMemo(() => {
    if (!selectedDeck || selectedDeck.polygon.length === 0) return null;
    const centroid = computeCentroid(selectedDeck.polygon);
    if (centroid) return centroid;
    const bounds = getPolygonBounds(selectedDeck.polygon);
    if (!bounds) return null;
    return {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2,
    };
  }, [selectedDeck]);
  const selectedDeckAnchorScreen = useMemo(
    () => (selectedDeckAnchor ? worldToScreen(selectedDeckAnchor) : null),
    [selectedDeckAnchor, stagePos.x, stagePos.y, scale]
  );
  const drawingCentre = useMemo(() => computeCentroid(draftPointsMm, false), [draftPointsMm]);

  const polygonSegments = useMemo(
    () => getSegments(activeDeck?.polygon ?? [], true),
    [activeDeck?.polygon]
  );
  const drawingSegments = useMemo(() => getSegments(draftPointsMm, false), [draftPointsMm]);
  const selectedBreakerAnchor = useMemo(
    () => getBreakerAnchor(selectedBreakerId),
    [
      selectedBreakerId,
      decks,
      breakerDraftPosMm,
      breakerConfirmId,
      breakerConfirmPosMm,
      stagePos.x,
      stagePos.y,
      scale,
      editingBreakerId,
    ]
  );
  const confirmBreakerAnchor = useMemo(
    () => getBreakerAnchor(breakerConfirmId),
    [breakerConfirmId, decks, breakerDraftPosMm, breakerConfirmPosMm, stagePos.x, stagePos.y, scale, editingBreakerId]
  );

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
    const centrePx = center ? { x: mmToPx(center.x), y: mmToPx(center.y) } : midPoint;
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
      ? isEdgeLocked(activeDeck?.edgeConstraints ?? {}, options.edgeIndex)
      : false;

    const handleClick = options?.edgeIndex !== undefined
      ? (event: any) => handleLabelClick(options.edgeIndex as number, lengthMm, labelPos, event)
      : undefined;

    return (
      <Group
        key={key}
        x={labelPos.x}
        y={labelPos.y}
        listening
        onMouseDown={(event) => {
          event.cancelBubble = true;
        }}
        onClick={(event) => {
          event.cancelBubble = true;
          handleClick?.(event);
        }}
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
    setLockAfterApply(isEdgeLocked(activeDeck?.edgeConstraints ?? {}, edgeIndex));
    setEdgeEditorPos({
      x: stagePos.x + labelPos.x * scale,
      y: stagePos.y + labelPos.y * scale,
    });
  };

  const renderCornerMarkers = () => {
    if (!hasPolygon || !activeDeck) return null;

    const r = BASE_MARKER_RADIUS / stageScale;
    const hitR = BASE_HIT_RADIUS / stageScale;
    const fontSize = BASE_ANGLE_FONT_SIZE / stageScale;
    const strokeWidth = 1 / stageScale;

    return activeDeck.polygon.map((_, i) => {
      const n = activeDeck.polygon.length;
      const prev = activeDeck.polygon[(i - 1 + n) % n];
      const curr = activeDeck.polygon[i];
      const next = activeDeck.polygon[(i + 1) % n];

      const currPx = { x: mmToPx(curr.x), y: mmToPx(curr.y) };
      const prevPx = { x: mmToPx(prev.x), y: mmToPx(prev.y) };
      const nextPx = { x: mmToPx(next.x), y: mmToPx(next.y) };

      const u1 = normalise({ x: prevPx.x - currPx.x, y: prevPx.y - currPx.y });
      const u2 = normalise({ x: nextPx.x - currPx.x, y: nextPx.y - currPx.y });

      const angleDeg = angleDegAtVertex(activeDeck.polygon, i);
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
    if (activeDeck) {
      const length = edgeLengthMm(activeDeck.polygon, editingEdgeIndex);
      setEditValue((length / 1000).toFixed(2));
    }
    setLockAfterApply(false);
  };

  const editingLocked =
    editingEdgeIndex !== null && isEdgeLocked(activeDeck?.edgeConstraints ?? {}, editingEdgeIndex);
  const editingEdgeLengthMm =
    editingEdgeIndex !== null && activeDeck ? edgeLengthMm(activeDeck.polygon, editingEdgeIndex) : 0;
  const editorPosition = edgeEditorPos || {
    x: stageSize.width / 2,
    y: 32,
  };

  const renderClipOverlay = (deck: DeckEntity) => {
    if (!showClips || deck.infillPolygon.length < 3 || deck.rowCount <= 0) return null;
    const bounds = getDeckBounds(deck.infillPolygon);
    if (!bounds) return null;

    const joistSpacing = deck.clipSummary?.joistSpacingMm ?? (joistSpacingMode === "commercial" ? 350 : 450);
    const joistPositions = getJoistPositions(deck.infillPolygon, deck.boardDirection, joistSpacing);
    if (joistPositions.length === 0) return null;

    const pitchMm = BOARD_WIDTH_MM + BOARD_GAP_MM;
    const clipThicknessMm = 20;
    const clipCounts = getClipsPerJoist(deck.rowCount);
    const rowAxisStart = getRowAxisStart(bounds, deck.boardDirection);

    const clipPointsPx = deck.infillPolygon.map((p) => ({ x: mmToPx(p.x), y: mmToPx(p.y) }));
    const fasciaClipPointsPx = deck.finishes.fasciaEnabled
      ? getFasciaClipPositions(deck.polygon, joistSpacing).map((p) => ({ x: mmToPx(p.x), y: mmToPx(p.y) }))
      : [];

    const joistLines = joistPositions.map((pos, index) => {
      const isHorizontal = deck.boardDirection === "horizontal";
      const points = isHorizontal
        ? [mmToPx(pos), mmToPx(bounds.minY), mmToPx(pos), mmToPx(bounds.maxY)]
        : [mmToPx(bounds.minX), mmToPx(pos), mmToPx(bounds.maxX), mmToPx(pos)];
      return (
        <Line
          key={`joist-${deck.id}-${index}`}
          points={points}
          stroke="#0ea5e9"
          strokeWidth={1 / stageScale}
          dash={[4 / stageScale, 6 / stageScale]}
          opacity={0.35}
          listening={false}
        />
      );
    });

    const clipRects = joistPositions.map((pos, idx) => {
      let cursor = rowAxisStart;
      const segments = Array.from({ length: clipCounts.clipsPerJoist }, (_, clipIndex) => {
        const lengthMm = (clipIndex === 0 ? 2.5 : 3) * pitchMm;
        const start = cursor;
        cursor += lengthMm;
        return { start, lengthMm, isStarter: clipIndex === 0 };
      });

      return segments.map((segment, segmentIdx) => {
        const isHorizontal = deck.boardDirection === "horizontal";
        const widthMm = isHorizontal ? clipThicknessMm : segment.lengthMm;
        const heightMm = isHorizontal ? segment.lengthMm : clipThicknessMm;
        const xMm = isHorizontal ? pos - clipThicknessMm / 2 : segment.start;
        const yMm = isHorizontal ? segment.start : pos - clipThicknessMm / 2;
        return (
          <Rect
            key={`clip-${deck.id}-${idx}-${segmentIdx}`}
            x={mmToPx(xMm)}
            y={mmToPx(yMm)}
            width={mmToPx(widthMm)}
            height={mmToPx(heightMm)}
            fill={segment.isStarter ? "rgba(14,165,233,0.4)" : "rgba(14,165,233,0.25)"}
            stroke={segment.isStarter ? "#0284c7" : "#0ea5e9"}
            strokeWidth={segment.isStarter ? 1.5 / stageScale : 1 / stageScale}
            dash={segment.isStarter ? [6 / stageScale, 4 / stageScale] : undefined}
            cornerRadius={2}
            listening={false}
            opacity={0.85}
          />
        );
      });
    });

    const fasciaMarkers = fasciaClipPointsPx.map((point, idx) => (
      <Rect
        key={`fascia-clip-${deck.id}-${idx}`}
        x={point.x - (6 / stageScale)}
        y={point.y - (6 / stageScale)}
        width={12 / stageScale}
        height={12 / stageScale}
        fill="#0ea5e9"
        stroke="#0369a1"
        strokeWidth={1 / stageScale}
        listening={false}
        opacity={0.9}
      />
    ));

    return (
      <Group listening={false}>
        <Group
          listening={false}
          clipFunc={(ctx) => {
            if (clipPointsPx.length === 0) return;
            ctx.beginPath();
            ctx.moveTo(clipPointsPx[0].x, clipPointsPx[0].y);
            clipPointsPx.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
            ctx.closePath();
          }}
        >
          {joistLines}
          {clipRects}
        </Group>
        {fasciaMarkers}
      </Group>
    );
  };

  const renderBoardRects = (deck: DeckEntity) => {
    if (deck.infillPolygon.length < 3 || deck.boards.length === 0) return null;
    const boardClipPointsPxCoords = deck.infillPolygon.map((p) => ({ x: mmToPx(p.x), y: mmToPx(p.y) }));
    const joinLines: JSX.Element[] = [];
    const joinStrokeWidth = 1.25 / stageScale;

    const boardRects = deck.boards.map((board) => {
      const isHorizontal = board.start.y === board.end.y;
      if (isHorizontal) {
        const xStart = Math.min(board.start.x, board.end.x);
        const widthMm = Math.abs(board.end.x - board.start.x);
        const yTopMm = board.start.y - BOARD_WIDTH_MM / 2;

        if (board.segmentIndex !== undefined && board.segmentCount !== undefined && board.segmentIndex < board.segmentCount - 1) {
          const xJoin = Math.max(board.start.x, board.end.x);
          joinLines.push(
            <Line
              key={`join-${board.id}`}
              points={[mmToPx(xJoin), mmToPx(board.start.y - BOARD_WIDTH_MM / 2), mmToPx(xJoin), mmToPx(board.start.y + BOARD_WIDTH_MM / 2)]}
              stroke="#0f172a"
              strokeWidth={joinStrokeWidth}
            />
          );
        }

        return (
          <Rect
            key={board.id}
            x={mmToPx(xStart)}
            y={mmToPx(yTopMm)}
            width={mmToPx(widthMm)}
            height={mmToPx(boardRenderWidthMm)}
            fill={getFillColor(deck)}
            opacity={0.7}
          />
        );
      }

      const yStart = Math.min(board.start.y, board.end.y);
      const heightMm = Math.abs(board.end.y - board.start.y);
      const xLeftMm = board.start.x - BOARD_WIDTH_MM / 2;

      if (board.segmentIndex !== undefined && board.segmentCount !== undefined && board.segmentIndex < board.segmentCount - 1) {
        const yJoin = Math.max(board.start.y, board.end.y);
        joinLines.push(
          <Line
            key={`join-${board.id}`}
            points={[mmToPx(board.start.x - BOARD_WIDTH_MM / 2), mmToPx(yJoin), mmToPx(board.start.x + BOARD_WIDTH_MM / 2), mmToPx(yJoin)]}
            stroke="#0f172a"
            strokeWidth={joinStrokeWidth}
          />
        );
      }

      return (
        <Rect
          key={board.id}
          x={mmToPx(xLeftMm)}
          y={mmToPx(yStart)}
          width={mmToPx(boardRenderWidthMm)}
          height={mmToPx(heightMm)}
          fill={getFillColor(deck)}
          opacity={0.7}
        />
      );
    });

    const breakerRects = deck.breakerBoards.map((board) => {
      const isVertical = board.start.x === board.end.x;
      if (isVertical) {
        const yStart = Math.min(board.start.y, board.end.y);
        const heightMm = Math.abs(board.end.y - board.start.y);
        const xLeftMm = board.start.x - BREAKER_HALF_MM;
        const xRightMm = board.start.x + BREAKER_HALF_MM;
        joinLines.push(
          <Line
            key={`breaker-edge-left-${board.id}`}
            points={[mmToPx(xLeftMm), mmToPx(yStart), mmToPx(xLeftMm), mmToPx(yStart + heightMm)]}
            stroke="#0f172a"
            strokeWidth={joinStrokeWidth}
          />
        );
        joinLines.push(
          <Line
            key={`breaker-edge-right-${board.id}`}
            points={[mmToPx(xRightMm), mmToPx(yStart), mmToPx(xRightMm), mmToPx(yStart + heightMm)]}
            stroke="#0f172a"
            strokeWidth={joinStrokeWidth}
          />
        );
        return (
          <Rect
            key={board.id}
            x={mmToPx(xLeftMm)}
            y={mmToPx(yStart)}
            width={mmToPx(breakerRenderWidthMm)}
            height={mmToPx(heightMm)}
            fill="#0f172a"
            opacity={0.65}
            stroke="#0f172a"
            strokeWidth={joinStrokeWidth}
          />
        );
      }

      const xStart = Math.min(board.start.x, board.end.x);
      const widthMm = Math.abs(board.end.x - board.start.x);
      const yTopMm = board.start.y - BREAKER_HALF_MM;
      const yBottomMm = board.start.y + BREAKER_HALF_MM;
      joinLines.push(
        <Line
          key={`breaker-edge-top-${board.id}`}
          points={[mmToPx(xStart), mmToPx(yTopMm), mmToPx(xStart + widthMm), mmToPx(yTopMm)]}
          stroke="#0f172a"
          strokeWidth={joinStrokeWidth}
        />
      );
      joinLines.push(
        <Line
          key={`breaker-edge-bottom-${board.id}`}
          points={[mmToPx(xStart), mmToPx(yBottomMm), mmToPx(xStart + widthMm), mmToPx(yBottomMm)]}
          stroke="#0f172a"
          strokeWidth={joinStrokeWidth}
        />
      );
      return (
        <Rect
          key={board.id}
          x={mmToPx(xStart)}
          y={mmToPx(yTopMm)}
          width={mmToPx(widthMm)}
          height={mmToPx(breakerRenderWidthMm)}
          fill="#0f172a"
          opacity={0.65}
          stroke="#0f172a"
          strokeWidth={joinStrokeWidth}
        />
      );
    });

    return (
      <Group
        clipFunc={(ctx) => {
          if (boardClipPointsPxCoords.length === 0) return;
          ctx.beginPath();
          ctx.moveTo(boardClipPointsPxCoords[0].x, boardClipPointsPxCoords[0].y);
          boardClipPointsPxCoords.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
          ctx.closePath();
        }}
      >
        {boardRects}
        {breakerRects}
        {joinLines}
      </Group>
    );
  };

  const getBreakerPolygon = (deck: DeckEntity) =>
    deck.finishes.pictureFrameEnabled && deck.infillPolygon.length >= 3 ? deck.infillPolygon : deck.polygon;

  const getBreakerEffectivePos = (line: BreakerLine) => {
    if (editingBreakerId === line.id && breakerDraftPosMm[line.id] !== undefined) {
      return breakerDraftPosMm[line.id];
    }
    if (breakerConfirmId === line.id && typeof breakerConfirmPosMm === "number") {
      return breakerConfirmPosMm;
    }
    return line.posMm;
  };

  const renderBreakerLines = (deck: DeckEntity) => {
    if (!deck.finishes.breakerBoardsEnabled || (deck.breakerLines?.length ?? 0) === 0) return null;
    const breakerAxis = breakerAxisForDirection(deck.boardDirection);
    const lines = deck.breakerLines.filter((line) => line.axis === breakerAxis);
    if (lines.length === 0) return null;
    const polygon = getBreakerPolygon(deck);
    if (polygon.length < 2) return null;

    return lines.map((line) => {
      const posMm = getBreakerEffectivePos(line);
      const displayLine: BreakerLine = { ...line, posMm };
      const segments = getBreakerLineSegments(displayLine, polygon);
      if (segments.length === 0) return null;

      const isSelected = selectedBreakerId === line.id;
      const isEditing = editingBreakerId === line.id;
      const strokeWidth = 2 / stageScale;
      const hitThicknessPx = 18 / stageScale;
      const paddingPx = 10 / stageScale;

      const extent = segments.reduce(
        (acc, segment) => {
          const min = Math.min(line.axis === "x" ? segment.start.y : segment.start.x, line.axis === "x" ? segment.end.y : segment.end.x);
          const max = Math.max(line.axis === "x" ? segment.start.y : segment.start.x, line.axis === "x" ? segment.end.y : segment.end.x);
          return { min: Math.min(acc.min, min), max: Math.max(acc.max, max) };
        },
        { min: Infinity, max: -Infinity }
      );
      if (!Number.isFinite(extent.min) || !Number.isFinite(extent.max)) return null;

      const hitRect =
        line.axis === "x"
          ? {
              x: mmToPx(posMm) - hitThicknessPx / 2,
              y: mmToPx(extent.min) - paddingPx,
              width: hitThicknessPx,
              height: mmToPx(extent.max - extent.min) + paddingPx * 2,
            }
          : {
              x: mmToPx(extent.min) - paddingPx,
              y: mmToPx(posMm) - hitThicknessPx / 2,
              width: mmToPx(extent.max - extent.min) + paddingPx * 2,
              height: hitThicknessPx,
            };

      const handleSelect = (evt: any) => {
        evt.cancelBubble = true;
        if (isDrawing || pendingSegment || isLengthPromptOpen || breakerConfirmId) return;
        selectBreakerLine(deck.id, line.id);
      };

      const handleDragMove = (evt: any) => {
        evt.cancelBubble = true;
        const stage = evt.target.getStage();
        const pointer = stage?.getPointerPosition();
        if (!pointer) return;
        const world = screenToWorld(pointer);
        const polygonForSnap = getBreakerPolygon(deck);
        const rawPos = line.axis === "x" ? world.x : world.y;
        const snapped = snapBreakerPosition(line.axis, rawPos, polygonForSnap);
        setBreakerDraftPos(deck.id, line.id, snapped);

        if (line.axis === "x") {
          evt.target.x(mmToPx(snapped) - hitThicknessPx / 2);
        } else {
          evt.target.y(mmToPx(snapped) - hitThicknessPx / 2);
        }
      };

      const handleDragEnd = (evt: any) => {
        evt.cancelBubble = true;
        const draftPos = breakerDraftPosMm[line.id] ?? posMm;
        requestConfirmBreaker(deck.id, line.id, draftPos);
      };

      const lineColor = isEditing ? "#2563eb" : isSelected ? "#0f172a" : "#334155";

      return (
        <Group key={`breaker-line-${line.id}`} listening>
          {segments.map((segment, idx) => (
            <Line
              key={`${line.id}-segment-${idx}`}
              points={[
                mmToPx(segment.start.x),
                mmToPx(segment.start.y),
                mmToPx(segment.end.x),
                mmToPx(segment.end.y),
              ]}
              stroke={lineColor}
              strokeWidth={strokeWidth}
              dash={isEditing ? [8 / stageScale, 6 / stageScale] : undefined}
              opacity={isSelected || isEditing ? 0.9 : 0.6}
              listening={false}
            />
          ))}
          <Rect
            {...hitRect}
            fill="transparent"
            onClick={handleSelect}
            draggable={isEditing && !breakerConfirmId}
            dragBoundFunc={(pos) =>
              line.axis === "x" ? { x: pos.x, y: hitRect.y } : { x: hitRect.x, y: pos.y }
            }
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
          />
        </Group>
      );
    });
  };

  const getBreakerAnchor = (breakerId: string | null) => {
    if (!breakerId) return null;
    const deck = decks.find((d) => d.breakerLines?.some((line) => line.id === breakerId));
    if (!deck) return null;
    const breakerAxis = breakerAxisForDirection(deck.boardDirection);
    const line = deck.breakerLines.find((l) => l.id === breakerId && l.axis === breakerAxis);
    if (!line) return null;
    const polygon = getBreakerPolygon(deck);
    const posMm = getBreakerEffectivePos(line);
    const segments = getBreakerLineSegments({ ...line, posMm }, polygon);
    if (segments.length === 0) return null;
    const midPoint = {
      x: (segments[0].start.x + segments[0].end.x) / 2,
      y: (segments[0].start.y + segments[0].end.y) / 2,
    };
    const screen = worldToScreen(midPoint);
    return { deckId: deck.id, lineId: line.id, screen };
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

      {isLengthPromptOpen && pendingSegment && (
        <div
          className="absolute z-50"
          style={{
            left: pendingSegment.screenX,
            top: pendingSegment.screenY,
            transform: "translate(-50%, -50%)",
          }}
        >
          <div className="bg-white p-3 rounded-lg shadow-lg border border-slate-200 min-w-[180px]">
            <label className="text-xs text-slate-600 mb-1 block">Length</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="1"
                value={pendingLengthText}
                onChange={(e) => setPendingLengthText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleApplyLength();
                  if (e.key === "Escape") handleCancelPendingSegment();
                }}
                className="px-2 py-1 border border-slate-300 rounded-md text-sm font-mono w-24"
                autoFocus
              />
              <span className="text-[11px] text-slate-500">mm</span>
            </div>
            {lengthError && (
              <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1 mt-2">
                {lengthError}
              </div>
            )}
            <div className="flex gap-2 justify-end mt-2">
              <button
                onClick={handleApplyLength}
                className="px-3 py-1 bg-blue-600 text-white rounded text-xs"
              >
                Apply
              </button>
              <button
                onClick={handleCancelPendingSegment}
                className="px-3 py-1 bg-slate-200 rounded text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedDeck && selectedDeckAnchorScreen && (
        <div
          className="absolute z-40"
          style={{
            left: selectedDeckAnchorScreen.x,
            top: selectedDeckAnchorScreen.y,
            transform: "translate(-50%, -120%)",
          }}
        >
          <div className="bg-white px-3 py-2 rounded-md shadow-lg border border-slate-200 text-xs text-slate-700 min-w-[180px]">
            {isConfirmingDelete ? (
              <>
                <div className="font-semibold text-slate-900 mb-2">Delete deck?</div>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={confirmDeleteDeck}
                    className="px-3 py-1 rounded bg-rose-600 text-white text-xs"
                  >
                    Yes
                  </button>
                  <button
                    onClick={cancelDeleteDeck}
                    className="px-3 py-1 rounded bg-slate-200 text-slate-700 text-xs"
                  >
                    No
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="font-semibold text-slate-900 mb-2">{selectedDeck.name}</div>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => requestDeleteDeck(selectedDeck.id)}
                    className="px-3 py-1 rounded bg-rose-50 text-rose-700 text-xs border border-rose-100"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => {
                      cancelDeleteDeck();
                      setSelectedDeck(null);
                    }}
                    className="px-3 py-1 rounded bg-slate-200 text-slate-700 text-xs"
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {confirmBreakerAnchor && breakerConfirmId && (
        <div
          className="absolute z-50"
          style={{
            left: confirmBreakerAnchor.screen.x,
            top: confirmBreakerAnchor.screen.y - 32,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="bg-white border border-slate-200 shadow-lg rounded-md p-3 text-xs text-slate-700 min-w-[220px]">
            <div className="font-semibold text-slate-900 mb-2">Is this correct placement?</div>
            <div className="flex gap-2 justify-end">
              <button
                className="px-3 py-1 bg-blue-600 text-white rounded text-xs"
                onClick={() => confirmBreakerPlacement(confirmBreakerAnchor.deckId, confirmBreakerAnchor.lineId)}
              >
                Yes
              </button>
              <button
                className="px-3 py-1 bg-slate-200 rounded text-xs"
                onClick={() => rejectBreakerPlacement(confirmBreakerAnchor.deckId, confirmBreakerAnchor.lineId)}
              >
                No
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedBreakerAnchor && !breakerConfirmId && (
        <div
          className="absolute z-40"
          style={{
            left: selectedBreakerAnchor.screen.x,
            top: selectedBreakerAnchor.screen.y - 28,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="bg-white border border-slate-200 shadow-lg rounded-md p-3 text-xs text-slate-700 min-w-[180px]">
            <div className="font-semibold text-slate-900 mb-2">Breaker line</div>
            <div className="flex gap-2 justify-end">
              <button
                className="px-3 py-1 bg-blue-600 text-white rounded text-xs"
                onClick={() => startEditBreakerLine(selectedBreakerAnchor.deckId, selectedBreakerAnchor.lineId)}
              >
                Edit
              </button>
              <button
                className="px-3 py-1 bg-slate-200 rounded text-xs"
                onClick={() => exitEditBreakerLine()}
              >
                Close
              </button>
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
          {decks.length === 0 && !isDrawing && (
            <Text
              x={stageSize.width / (2 * scale) - stagePos.x / scale - 140}
              y={stageSize.height / (2 * scale) - stagePos.y / scale - 10}
              text="Click to begin drawing your deck outline"
              fontSize={16}
              fill="#94a3b8"
            />
          )}

          {decks.map((deck) => {
            const polygonPointsPx = deck.polygon.flatMap((p) => [mmToPx(p.x), mmToPx(p.y)]);
            const fill = getFillColor(deck);

            return (
              <Group
                key={deck.id}
                listening
                onClick={(event) => {
                  if (isDrawing || pendingSegment || isLengthPromptOpen || breakerConfirmId) return;
                  event.cancelBubble = true;
                  setSelectedDeck(deck.id);
                  cancelDeleteDeck();
                }}
              >
                {deck.polygon.length >= 3 && (
                  <Line
                    points={polygonPointsPx}
                    closed
                    fill={fill}
                    opacity={deck.id === activeDeckId ? 0.35 : 0.2}
                    stroke={fill}
                    strokeWidth={2}
                    listening
                  />
                )}

                {renderBoardRects(deck)}
                {renderBreakerLines(deck)}
                {renderClipOverlay(deck)}

                {deck.pictureFramePieces.length > 0 && (
                  <Group listening={false}>
                    {deck.pictureFramePieces.map((piece, index) => (
                      <Line
                        key={`picture-frame-${deck.id}-${index}`}
                        points={piece.flatMap((p) => [mmToPx(p.x), mmToPx(p.y)])}
                        closed
                        fill={fill}
                        opacity={0.85}
                        stroke="rgba(0,0,0,0.25)"
                        strokeWidth={2 / stageScale}
                      />
                    ))}
                  </Group>
                )}

                {deck.fasciaPieces.length > 0 && (
                  <Group listening={false}>
                    {deck.fasciaPieces.map((piece, index) => (
                      <Line
                        key={`fascia-${deck.id}-${index}`}
                        points={piece.flatMap((p) => [mmToPx(p.x), mmToPx(p.y)])}
                        closed
                        fill={fill}
                        opacity={0.4}
                        stroke="rgba(15,23,42,0.3)"
                        strokeWidth={2 / stageScale}
                      />
                    ))}
                  </Group>
                )}
              </Group>
            );
          })}

          {drawingPointsMm.length > 0 && (
            <Line
              points={drawingPointsPx}
              stroke="#2563eb"
              strokeWidth={3}
              dash={[6, 6]}
              closed={false}
            />
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

          {previewPointMm && draftPointsMm.length > 0 && !pendingSegment &&
            renderDimensionLabel(
              { start: draftPointsMm[draftPointsMm.length - 1], end: previewPointMm },
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
        <div>Board direction: {activeDeck?.boardDirection === "vertical" ? "Vertical" : "Horizontal"}</div>
      </div>
    </div>
  );
}
