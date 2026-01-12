import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Stage, Layer, Line, Rect, Group, Circle, Text } from "react-konva";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useDeckingStore } from "@/store/deckingStore";
import { useMapViewportStore } from "@/store/mapViewportStore";
import {
  BOARD_GAP_MM,
  BOARD_WIDTH_MM,
  JOIST_SPACING_MM,
  MAX_BOARD_LENGTH_MM,
  mmToPx,
} from "@/lib/deckingGeometry";
import type { DeckRenderModel, DeckReport } from "@/types/decking";
import "@/styles/deckingPrint.css";

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

const BOARD_RENDER_WIDTH_MM = BOARD_WIDTH_MM + 0.5;
const EXPORT_PADDING_MM = 500;
const MAX_EXPORT_WIDTH_PX = 1100;
const MAX_EXPORT_HEIGHT_PX = 900;
const SCALE_BAR_LENGTH_MM = 1000;

function formatLength(lengthMm: number) {
  if (!Number.isFinite(lengthMm)) return "0 mm";
  if (Math.abs(lengthMm) >= 1000) {
    return `${(lengthMm / 1000).toFixed(2)} m`;
  }
  return `${Math.round(lengthMm)} mm`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-AU", { maximumFractionDigits: 2 }).format(value);
}

function getBounds(points: { x: number; y: number }[]) {
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

interface DeckImageExporterProps {
  model: DeckRenderModel;
  showJoins: boolean;
  showBreakerBoards: boolean;
  showClips: boolean;
  onRendered: (deckId: string, dataUrl: string) => void;
}

function DeckImageExporter({
  model,
  showJoins,
  showBreakerBoards,
  showClips,
  onRendered,
}: DeckImageExporterProps) {
  const stageRef = useRef<any>(null);
  const hasPolygon = model.polygon.length > 0;
  const bounds = hasPolygon
    ? getBounds(model.polygon)
    : { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  const widthMm = bounds.maxX - bounds.minX + EXPORT_PADDING_MM * 2;
  const heightMm = bounds.maxY - bounds.minY + EXPORT_PADDING_MM * 2;
  const baseWidthPx = mmToPx(widthMm);
  const baseHeightPx = mmToPx(heightMm);
  const scale = Math.min(
    1.5,
    MAX_EXPORT_WIDTH_PX / Math.max(baseWidthPx, 1),
    MAX_EXPORT_HEIGHT_PX / Math.max(baseHeightPx, 1)
  );
  const stageWidth = baseWidthPx * scale;
  const stageHeight = baseHeightPx * scale;
  const offset = { x: EXPORT_PADDING_MM - bounds.minX, y: EXPORT_PADDING_MM - bounds.minY };

  const toPx = (valueMm: number) => mmToPx(valueMm) * scale;
  const mapPoint = (point: { x: number; y: number }) => ({
    x: toPx(point.x + offset.x),
    y: toPx(point.y + offset.y),
  });

  useEffect(() => {
    const handle = requestAnimationFrame(() => {
      const stage = stageRef.current?.getStage?.() ?? stageRef.current;
      if (!stage) return;
      stage.draw();
      const dataUrl = stage.toDataURL({ pixelRatio: 2 });
      onRendered(model.id, dataUrl);
    });

    return () => cancelAnimationFrame(handle);
  }, [model, showJoins, showBreakerBoards, showClips, onRendered]);

  const polygonPoints = model.polygon.map(mapPoint).flatMap((p) => [p.x, p.y]);
  const infillPolygonPoints = model.infillPolygon.map(mapPoint);

  const boardClipPoints = infillPolygonPoints.map((p) => ({ x: p.x, y: p.y }));
  const scaleBarLengthPx = toPx(SCALE_BAR_LENGTH_MM);

  return (
    <Stage
      ref={stageRef}
      width={stageWidth}
      height={stageHeight}
      visible={false}
      style={{ position: "absolute", left: -9999, top: -9999 }}
    >
      <Layer listening={false}>
        {model.polygon.length >= 3 && (
          <Line points={polygonPoints} closed fill={COLOR_MAP[model.selectedColor] || "#92400e"} opacity={0.2} />
        )}

        <Group
          clipFunc={(ctx) => {
            if (boardClipPoints.length === 0) return;
            ctx.beginPath();
            ctx.moveTo(boardClipPoints[0].x, boardClipPoints[0].y);
            boardClipPoints.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
            ctx.closePath();
          }}
        >
          {model.boards.map((board) => {
            const isHorizontal = board.start.y === board.end.y;
            if (isHorizontal) {
              const xStart = Math.min(board.start.x, board.end.x);
              const yTop = board.start.y - BOARD_RENDER_WIDTH_MM / 2;
              const rectWidth = Math.abs(board.end.x - board.start.x);
              const joinAt = Math.max(board.start.x, board.end.x);
              return (
                <Group key={board.id}>
                  <Rect
                    x={toPx(xStart + offset.x)}
                    y={toPx(yTop + offset.y)}
                    width={toPx(rectWidth)}
                    height={toPx(BOARD_RENDER_WIDTH_MM)}
                    fill={COLOR_MAP[model.selectedColor] || "#92400e"}
                    opacity={0.75}
                  />
                  {showJoins && board.segmentIndex !== undefined && board.segmentCount !== undefined && board.segmentIndex < board.segmentCount - 1 && (
                    <Line
                      points={[
                        toPx(joinAt + offset.x),
                        toPx(board.start.y - BOARD_RENDER_WIDTH_MM / 2 + offset.y),
                        toPx(joinAt + offset.x),
                        toPx(board.start.y + BOARD_RENDER_WIDTH_MM / 2 + offset.y),
                      ]}
                      stroke="#0f172a"
                      strokeWidth={1}
                    />
                  )}
                </Group>
              );
            }

            const yStart = Math.min(board.start.y, board.end.y);
            const xLeft = board.start.x - BOARD_RENDER_WIDTH_MM / 2;
            const rectHeight = Math.abs(board.end.y - board.start.y);
            const joinAt = Math.max(board.start.y, board.end.y);
            return (
              <Group key={board.id}>
                <Rect
                  x={toPx(xLeft + offset.x)}
                  y={toPx(yStart + offset.y)}
                  width={toPx(BOARD_RENDER_WIDTH_MM)}
                  height={toPx(rectHeight)}
                  fill={COLOR_MAP[model.selectedColor] || "#92400e"}
                  opacity={0.75}
                />
                {showJoins && board.segmentIndex !== undefined && board.segmentCount !== undefined && board.segmentIndex < board.segmentCount - 1 && (
                  <Line
                    points={[
                      toPx(board.start.x - BOARD_RENDER_WIDTH_MM / 2 + offset.x),
                      toPx(joinAt + offset.y),
                      toPx(board.start.x + BOARD_RENDER_WIDTH_MM / 2 + offset.x),
                      toPx(joinAt + offset.y),
                    ]}
                    stroke="#0f172a"
                    strokeWidth={1}
                  />
                )}
              </Group>
            );
          })}

          {showBreakerBoards &&
            model.breakerBoards.map((board) => {
              const isVertical = board.start.x === board.end.x;
              if (isVertical) {
                const yStart = Math.min(board.start.y, board.end.y);
                const xLeft = board.start.x - BOARD_RENDER_WIDTH_MM / 2;
                const rectHeight = Math.abs(board.end.y - board.start.y);
                return (
                  <Rect
                    key={board.id}
                    x={toPx(xLeft + offset.x)}
                    y={toPx(yStart + offset.y)}
                    width={toPx(BOARD_RENDER_WIDTH_MM)}
                    height={toPx(rectHeight)}
                    fill="#0f172a"
                    opacity={0.7}
                  />
                );
              }

              const xStart = Math.min(board.start.x, board.end.x);
              const yTop = board.start.y - BOARD_RENDER_WIDTH_MM / 2;
              const rectWidth = Math.abs(board.end.x - board.start.x);
              return (
                <Rect
                  key={board.id}
                  x={toPx(xStart + offset.x)}
                  y={toPx(yTop + offset.y)}
                  width={toPx(rectWidth)}
                  height={toPx(BOARD_RENDER_WIDTH_MM)}
                  fill="#0f172a"
                  opacity={0.7}
                />
              );
            })}
        </Group>

        {model.pictureFramePieces.map((piece, index) => (
          <Line
            key={`pf-${model.id}-${index}`}
            points={piece.map((p) => mapPoint(p)).flatMap((p) => [p.x, p.y])}
            closed
            fill={COLOR_MAP[model.selectedColor] || "#92400e"}
            opacity={0.85}
            stroke="rgba(0,0,0,0.25)"
            strokeWidth={1}
          />
        ))}

        {model.fasciaPieces.map((piece, index) => (
          <Line
            key={`fascia-${model.id}-${index}`}
            points={piece.map((p) => mapPoint(p)).flatMap((p) => [p.x, p.y])}
            closed
            fill={COLOR_MAP[model.selectedColor] || "#92400e"}
            opacity={0.35}
            stroke="rgba(15,23,42,0.2)"
            strokeWidth={1}
          />
        ))}

        {model.polygon.length >= 3 && (
          <Line
            points={polygonPoints}
            closed
            stroke={COLOR_MAP[model.selectedColor] || "#92400e"}
            strokeWidth={2}
            opacity={0.9}
          />
        )}

        {showClips &&
          model.clips.map((clip) => {
            const point = mapPoint(clip.position);
            return (
              <Circle
                key={clip.id}
                x={point.x}
                y={point.y}
                radius={toPx(20)}
                fill="#0ea5e9"
                opacity={0.75}
              />
            );
          })}

        <Group x={toPx(bounds.minX + offset.x)} y={stageHeight - 60}>
          <Line
            points={[0, 0, scaleBarLengthPx, 0]}
            stroke="#0f172a"
            strokeWidth={2}
            lineCap="round"
          />
          <Line points={[0, -6, 0, 6]} stroke="#0f172a" strokeWidth={2} />
          <Line
            points={[scaleBarLengthPx, -6, scaleBarLengthPx, 6]}
            stroke="#0f172a"
            strokeWidth={2}
          />
          <Text
            x={scaleBarLengthPx + 12}
            y={-10}
            text="Scale bar 1 metre"
            fontSize={14}
            fill="#0f172a"
          />
        </Group>
      </Layer>
    </Stage>
  );
}

export function DeckingFinishedPageView() {
  const [, setLocation] = useLocation();
  const decks = useDeckingStore((state) => state.decks);
  const hasHydrated = useDeckingStore((state) => state.hasHydrated);
  const getReportData = useDeckingStore((state) => state.getReportData);
  const getDeckRenderModel = useDeckingStore((state) => state.getDeckRenderModel);
  const mapViewport = useMapViewportStore((state) => state.viewport);
  const reportData = useMemo(
    () =>
      hasHydrated
        ? getReportData()
        : {
            decks: [],
            projectTotals: {
              boardPieces: 0,
              totalPieces: 0,
              boardLinealMm: 0,
              fasciaLinealMm: 0,
              totalLinealMm: 0,
              totalClips: 0,
              totalFasciaClips: 0,
              totalDeckClipsSnappedForFascia: 0,
            },
          },
    [decks, getReportData, hasHydrated]
  );
  const defaultBreaker = useMemo(
    () => reportData.decks.some((deck) => deck.finishes.breakerBoardsEnabled),
    [reportData.decks]
  );
  const [showJoins, setShowJoins] = useState(true);
  const [showBreakerBoards, setShowBreakerBoards] = useState(defaultBreaker);
  const [showClips, setShowClips] = useState(true);
  const [projectName, setProjectName] = useState("Decking project");
  const [deckImages, setDeckImages] = useState<Record<string, string>>({});

  const deckModels = useMemo(
    () =>
      reportData.decks
        .map((report) => ({
          report,
          renderModel: getDeckRenderModel(report.id),
        }))
        .filter((entry): entry is { report: DeckReport; renderModel: DeckRenderModel } =>
          Boolean(entry.renderModel)
        ),
    [reportData.decks, getDeckRenderModel]
  );

  useEffect(() => {
    if (reportData.decks.length === 0) {
      setDeckImages({});
    }
  }, [reportData.decks.length]);

  useEffect(() => {
    setShowBreakerBoards(defaultBreaker);
  }, [defaultBreaker]);

  const handleRendered = (deckId: string, url: string) => {
    setDeckImages((prev) => {
      if (prev[deckId] === url) return prev;
      return { ...prev, [deckId]: url };
    });
  };

  if (!hasHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-600">
        Loading saved decks...
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-slate-50 print:bg-white decking-finished-page"
      data-map-viewport={mapViewport ? "restored" : "none"}
    >
      <div className="no-print sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 py-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wide text-slate-500">Decking report</div>
            <div className="text-lg font-semibold text-slate-900">Finished page</div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Checkbox id="toggle-joins" checked={showJoins} onCheckedChange={(v) => setShowJoins(Boolean(v))} />
              <label htmlFor="toggle-joins" className="text-sm text-slate-700">
                Show joins
              </label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="toggle-breakers"
                checked={showBreakerBoards}
                onCheckedChange={(v) => setShowBreakerBoards(Boolean(v))}
              />
              <label htmlFor="toggle-breakers" className="text-sm text-slate-700">
                Show breaker boards
              </label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="toggle-clips" checked={showClips} onCheckedChange={(v) => setShowClips(Boolean(v))} />
              <label htmlFor="toggle-clips" className="text-sm text-slate-700">
                Show clips
              </label>
            </div>
            <div className="h-8 w-px bg-slate-200 hidden md:block" />
            <Button variant="outline" onClick={() => setLocation("/decking")}>
              Back to planner
            </Button>
            <Button onClick={() => window.print()}>Print</Button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 deck-card">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Decking plan</h1>
              <p className="text-slate-600 text-sm">Printable summary of your decking project.</p>
            </div>
            <div className="text-sm text-slate-600 space-y-1">
              <div>{new Date().toLocaleString()}</div>
              <label className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wide text-slate-500">Project name</span>
                <input
                  className="border border-slate-300 rounded-md px-3 py-1 text-sm"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                />
              </label>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-3 deck-card">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Project options</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-4 text-sm text-slate-700">
            <div className="rounded-lg border border-slate-200 p-4 bg-slate-50">
              <div className="font-semibold text-slate-900 mb-1">Joist spacing</div>
              <p>Residential 450 mm (default)</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-4 bg-slate-50">
              <div className="font-semibold text-slate-900 mb-1">Board setup</div>
              <p>Board width: {BOARD_WIDTH_MM} mm</p>
              <p>Board gap: {BOARD_GAP_MM} mm</p>
              <p>Max length: {MAX_BOARD_LENGTH_MM} mm</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-4 bg-slate-50">
              <div className="font-semibold text-slate-900 mb-1">Clip rules</div>
              <p>Spacing aligned to joists ({JOIST_SPACING_MM} mm).</p>
              <p>Starter clip at first joist, consistent run spacing.</p>
            </div>
          </div>
        </div>

        {deckModels.length === 0 ? (
          <div className="bg-white border border-dashed border-slate-200 rounded-xl p-6 text-center text-slate-600 deck-card">
            No decks to preview. Return to the planner to add a deck outline.
          </div>
        ) : (
          deckModels.map(({ report, renderModel }) => (
            <div key={report.id} className="bg-white border border-slate-200 rounded-xl shadow-sm deck-card overflow-hidden">
              <div className="border-b border-slate-200 bg-slate-50 px-5 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <h3 className="text-xl font-semibold text-slate-900">{report.name}</h3>
                  <p className="text-slate-600 text-sm">
                    Board direction: {report.boardDirection === "horizontal" ? "Horizontal" : "Vertical"}
                  </p>
                </div>
                <div className="text-sm text-slate-600 space-y-1 md:text-right">
                  <div>Total pieces: {report.totals.totalPieces}</div>
                  <div>Total lineal: {formatLength(report.totals.totalLinealMm)}</div>
                  <div>Clips: {report.clipCount} (fascia: {report.fasciaClipCount})</div>
                </div>
              </div>

              <div className="p-5 grid md:grid-cols-2 gap-4">
                <div>
                  <div className="rounded-lg border border-slate-200 overflow-hidden bg-slate-100">
                    {deckImages[report.id] ? (
                      <img
                        src={deckImages[report.id]}
                        alt={`Decking layout for ${report.name}`}
                        className="w-full h-full object-contain bg-white"
                      />
                    ) : (
                      <div className="aspect-video flex items-center justify-center text-slate-500 text-sm">
                        Generating scaled drawing...
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-2">Print at 100 percent for scale reference.</p>
                </div>

                <div className="space-y-4">
                  <div className="rounded-lg border border-slate-200 p-4 bg-slate-50">
                    <div className="font-semibold text-slate-900 mb-2">Options</div>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-slate-700">
                      <div className="flex justify-between">
                        <dt>Picture frame</dt>
                        <dd>{report.finishes.pictureFrameEnabled ? "On" : "Off"}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt>Fascia</dt>
                        <dd>{report.finishes.fasciaEnabled ? "On" : "Off"}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt>Breaker boards</dt>
                        <dd>{report.finishes.breakerBoardsEnabled ? "On" : "Off"}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt>Clip overlay</dt>
                        <dd>{showClips ? "Shown" : "Hidden"}</dd>
                      </div>
                    </dl>
                  </div>

                  <div className="rounded-lg border border-slate-200 p-4 bg-white">
                    <div className="font-semibold text-slate-900 mb-2">Deck metrics</div>
                    <dl className="space-y-1 text-sm text-slate-700">
                      <div className="flex justify-between">
                        <dt>Area</dt>
                        <dd>{formatNumber(report.areaM2)} m²</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt>Perimeter</dt>
                        <dd>{formatLength(report.perimeterMm)}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt>Rows</dt>
                        <dd>{report.rowCount}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt>Joists</dt>
                        <dd>{report.joistCount}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt>Clip count</dt>
                        <dd>{report.clipCount}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt>Fascia clips</dt>
                        <dd>{report.fasciaClipCount}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt>Deck clips snapped for fascia</dt>
                        <dd>{report.deckClipsSnappedForFascia}</dd>
                      </div>
                    </dl>
                  </div>
                </div>
              </div>

              <div className="px-5 pb-5">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-lg font-semibold text-slate-900">Cutting list</h4>
                </div>
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-700">
                      <tr>
                        <th className="text-left px-3 py-2 font-semibold">Item</th>
                        <th className="text-right px-3 py-2 font-semibold">Qty</th>
                        <th className="text-right px-3 py-2 font-semibold">Length</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {report.cuttingList.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-3 py-3 text-slate-500">
                            Add a deck outline to generate a cutting list.
                          </td>
                        </tr>
                      ) : (
                        ["field", "breaker", "pictureFrame", "fascia"].map((kind) => {
                          const items = report.cuttingList.filter((item) => item.kind === kind);
                          if (items.length === 0) return null;
                          const heading =
                            kind === "field"
                              ? "Surface boards"
                              : kind === "breaker"
                                ? "Breaker boards"
                                : kind === "pictureFrame"
                                  ? "Picture frame"
                                  : "Fascia";
                          return (
                            <Fragment key={kind}>
                              <tr className="bg-slate-50/60">
                                <td className="px-3 py-2 font-semibold text-slate-800" colSpan={3}>
                                  {heading}
                                </td>
                              </tr>
                              {items.map((item, idx) => (
                                <tr key={`${kind}-${idx}`} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/30"}>
                                  <td className="px-3 py-2">{item.label} ({item.lengthMm} mm)</td>
                                  <td className="px-3 py-2 text-right">{item.count}</td>
                                  <td className="px-3 py-2 text-right">{formatLength(item.lengthMm)}</td>
                                </tr>
                              ))}
                            </Fragment>
                          );
                        })
                      )}
                      {report.cuttingList.length > 0 && (
                        <tr className="bg-slate-100 font-semibold text-slate-900">
                          <td className="px-3 py-2">Totals</td>
                          <td className="px-3 py-2 text-right">{report.totals.totalPieces}</td>
                          <td className="px-3 py-2 text-right">{formatLength(report.totals.totalLinealMm)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ))
        )}

        {deckModels.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 totals-block">
            <h3 className="text-lg font-semibold text-slate-900 mb-3">Project totals</h3>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Metric</th>
                    <th className="text-right px-3 py-2 font-semibold">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr className="bg-white">
                    <td className="px-3 py-2">Total board pieces</td>
                    <td className="px-3 py-2 text-right">{reportData.projectTotals.boardPieces}</td>
                  </tr>
                  <tr className="bg-slate-50/40">
                    <td className="px-3 py-2">Total lineal metres (boards + picture frame)</td>
                    <td className="px-3 py-2 text-right">
                      {formatNumber(reportData.projectTotals.boardLinealMm / 1000)} m
                    </td>
                  </tr>
                  <tr className="bg-white">
                    <td className="px-3 py-2">Total lineal metres (fascia)</td>
                    <td className="px-3 py-2 text-right">
                      {formatNumber(reportData.projectTotals.fasciaLinealMm / 1000)} m
                    </td>
                  </tr>
                  <tr className="bg-slate-50/40">
                    <td className="px-3 py-2">Project lineal metres</td>
                    <td className="px-3 py-2 text-right">
                      {formatNumber(reportData.projectTotals.totalLinealMm / 1000)} m
                    </td>
                  </tr>
                  <tr className="bg-white">
                    <td className="px-3 py-2">Total clips</td>
                    <td className="px-3 py-2 text-right">{reportData.projectTotals.totalClips}</td>
                  </tr>
                  <tr className="bg-slate-50/40">
                    <td className="px-3 py-2">Total fascia clips</td>
                    <td className="px-3 py-2 text-right">{reportData.projectTotals.totalFasciaClips}</td>
                  </tr>
                  <tr className="bg-white font-semibold">
                    <td className="px-3 py-2">Deck clips snapped for fascia</td>
                    <td className="px-3 py-2 text-right">
                      {reportData.projectTotals.totalDeckClipsSnappedForFascia}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="absolute -left-[9999px] -top-[9999px]" aria-hidden>
        {deckModels.map(({ report, renderModel }) => (
          <DeckImageExporter
            key={report.id}
            model={renderModel}
            showJoins={showJoins}
            showBreakerBoards={showBreakerBoards}
            showClips={showClips}
            onRendered={handleRendered}
          />
        ))}
      </div>
    </div>
  );
}
