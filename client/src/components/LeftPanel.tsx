import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppStore } from "@/store/appStore";
import { getSupportedPanelHeights, usePricingStore } from "@/store/pricingStore";
import { GateType } from "@/types/models";
import { calculateCosts } from "@/lib/pricing";
import { FenceStylePicker } from "@/components/FenceStylePicker";
import { getFenceStyleLabel } from "@/config/fenceStyles";
import { DEFAULT_FENCE_HEIGHT_M, FENCE_HEIGHTS_M, FenceHeightM } from "@/config/fenceHeights";
import { FENCE_COLORS, getFenceColourMode } from "@/config/fenceColors";
import { coerceFenceProjectType, fencingModeFromProjectType, plannerOptions } from "@/config/plannerOptions";
import { useProjectSessionStore } from "@/store/projectSessionStore";
import { useEffect, useMemo } from "react";

const GATE_TYPES: { type: GateType; label: string }[] = [
  { type: "single_900", label: "Single 900mm" },
  { type: "single_1800", label: "Single 1800mm" },
  { type: "double_900", label: "Double 900mm" },
  { type: "double_1800", label: "Double 1800mm" },
  { type: "sliding_4800", label: "Sliding 4800mm" },
  { type: "opening_custom", label: "Custom Opening" },
];

export function LeftPanel() {
  const {
    fenceCategoryId,
    fenceStyleId,
    fenceHeightM,
    fenceColorId,
    selectedGateType,
    lines,
    panels,
    posts,
    gates,
    setSelectedGateType,
    setFenceHeightM,
    setFenceColorId,
  } = useAppStore();
  const residentialIndex = usePricingStore((state) => state.residentialIndex);
  const activeProject = useProjectSessionStore((state) =>
    state.activeProjectId ? state.projectsById[state.activeProjectId] : null
  );
  const activeProjectId = useProjectSessionStore((state) => state.activeProjectId);
  const hasBootstrapped = useProjectSessionStore((state) => state.hasBootstrapped);
  const projectType = coerceFenceProjectType(activeProject?.projectType ?? null);

  const fenceColourMode = getFenceColourMode(fenceColorId);
  const supportedHeights = useMemo(
    () =>
      getSupportedPanelHeights(
        fenceStyleId,
        fenceColourMode,
        fenceCategoryId,
        residentialIndex
      ),
    [fenceStyleId, fenceColourMode, fenceCategoryId, residentialIndex]
  );
  const resolvedFenceHeightM = useMemo(() => {
    const currentHeight = Number(fenceHeightM);
    if (Number.isFinite(currentHeight)) {
      const matches = supportedHeights.includes(currentHeight);
      if (matches) return currentHeight as FenceHeightM;
    }
    return (supportedHeights[0] ?? DEFAULT_FENCE_HEIGHT_M) as FenceHeightM;
  }, [fenceHeightM, supportedHeights]);
  const resolvedProjectType = projectType ?? "residential";
  const fencingMode = fencingModeFromProjectType(resolvedProjectType);
  const showProjectTypeWarning = !projectType;
  const showFencingModeWarning = !fencingMode;
  const availableColours = useMemo(() => FENCE_COLORS, []);
  const availableColoursKey = useMemo(
    () => availableColours.map((color) => color.id).join("|"),
    [availableColours]
  );
  useEffect(() => {
    if (!supportedHeights.length) return;
    const currentHeight = Number(fenceHeightM);
    if (Number.isFinite(currentHeight) && currentHeight === resolvedFenceHeightM) {
      return;
    }
    if (resolvedFenceHeightM === currentHeight) return;
    setFenceHeightM(resolvedFenceHeightM);
  }, [supportedHeights, fenceHeightM, resolvedFenceHeightM, setFenceHeightM]);

  useEffect(() => {
    const availableIds = new Set(availableColours.map((color) => color.id));
    const currentValid = fenceColorId && availableIds.has(fenceColorId);
    if (currentValid) return;
    const nextId = availableColours[0]?.id;
    if (!nextId) return;
    if (nextId !== fenceColorId) setFenceColorId(nextId);
  }, [availableColoursKey, fenceColorId, setFenceColorId]);

  if (!hasBootstrapped) {
    return (
      <div className="w-full md:w-96 border-b md:border-b-0 md:border-r border-slate-200 bg-white p-4 md:p-6 overflow-y-auto max-h-64 md:max-h-none md:h-full">
        <div className="text-sm text-slate-500">Loading project…</div>
      </div>
    );
  }

  if (!activeProject) {
    return (
      <div className="w-full md:w-96 border-b md:border-b-0 md:border-r border-slate-200 bg-white p-4 md:p-6 overflow-y-auto max-h-64 md:max-h-none md:h-full">
        <div className="text-sm text-slate-600">
          No active project. Please create or select a project to load the planner.
        </div>
        {import.meta.env.DEV && (
          <div className="mt-2 text-xs text-slate-400">
            Missing project for activeProjectId: {activeProjectId ?? "none"}
          </div>
        )}
      </div>
    );
  }

  const costs = calculateCosts({
    fenceCategoryId,
    fenceStyleId,
    fenceHeightM,
    fenceColourMode,
    residentialIndex,
    panels,
    posts,
    gates,
    lines,
  });
  const fenceStyleLabel = getFenceStyleLabel(fenceStyleId);
  const resolvedFencingMode = fencingMode ?? "residential";
  const availableCategories =
    resolvedFencingMode === "rural"
      ? plannerOptions.rural.fenceCategories
      : plannerOptions.residential.fenceCategories;
  const availableStyles =
    null;
  return (
    <div className="w-full md:w-96 border-b md:border-b-0 md:border-r border-slate-200 bg-white p-4 md:p-6 overflow-y-auto max-h-64 md:max-h-none md:h-full">
      <div className="space-y-6">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Fence Planner</h2>
          {(showProjectTypeWarning || showFencingModeWarning) && (
            <p className="text-xs text-amber-600">
              Planner defaulted to residential due to an unknown project type.
            </p>
          )}
        </div>

        <div>
          <Label className="text-sm font-medium uppercase tracking-wide text-slate-600 mb-3 block">
            Fence Style
          </Label>
          <FenceStylePicker
            availableCategories={availableCategories}
            availableStyles={availableStyles ?? undefined}
          />
        </div>

        <div>
          <Label className="text-sm font-medium uppercase tracking-wide text-slate-600 mb-3 block">
            Height
          </Label>
          <Select
            value={String(resolvedFenceHeightM)}
            onValueChange={(value) => {
              const parsed = Number(value) as FenceHeightM;
              const matches = supportedHeights.includes(parsed);
              if (!matches) return;
              setFenceHeightM(parsed);
            }}
          >
            <SelectTrigger className="w-full text-xs">
              <SelectValue placeholder="Select height" />
            </SelectTrigger>
            <SelectContent>
              {(supportedHeights.length > 0 ? supportedHeights : FENCE_HEIGHTS_M).map(
                (height) => (
                  <SelectItem key={height} value={String(height)}>
                    {height} m
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-sm font-medium uppercase tracking-wide text-slate-600 mb-3 block">
            Colour
          </Label>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-7">
            {availableColours.map((colorOption) => (
              <button
                key={colorOption.id}
                type="button"
                onClick={() => setFenceColorId(colorOption.id)}
                className="flex flex-col items-center gap-2 text-[11px] text-slate-600"
                title={colorOption.label}
                data-testid={`button-fence-color-${colorOption.id}`}
              >
                <span
                  className={`h-10 w-10 rounded-md border-2 transition ${
                    fenceColorId === colorOption.id
                      ? "border-primary ring-2 ring-primary/30"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                  style={colorOption.swatch}
                />
                <span className="text-center leading-tight">{colorOption.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label className="text-sm font-medium uppercase tracking-wide text-slate-600 mb-3 block">
            Gate Types
          </Label>
          <p className="text-xs text-slate-500 mb-2">
            Select a gate type, then click on a fence line to place it.
          </p>
          <div className="space-y-2">
            {GATE_TYPES.map((gate) => (
              <Button
                key={gate.type}
                variant={selectedGateType === gate.type ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedGateType(gate.type)}
                className="w-full justify-start text-xs"
                data-testid={`button-gate-${gate.type}`}
              >
                {gate.label}
              </Button>
            ))}
          </div>
        </div>

        <div>
          <Label className="text-sm font-medium uppercase tracking-wide text-slate-600 mb-3 block">
            Cutting List
          </Label>
          <p className="text-xs text-slate-500 mb-2">
            Style: <span className="font-medium text-slate-700">{fenceStyleLabel}</span>
          </p>
          <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">
                    Product
                  </th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-700">
                    Qty
                  </th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {costs.lineItems.length === 0 && (
                  <tr className="border-b border-slate-100">
                    <td className="px-3 py-2 text-slate-400" colSpan={2}>
                      Add fence segments to see items.
                    </td>
                  </tr>
                )}
                {costs.lineItems.map((item, index) => (
                  <tr
                    key={`${item.name}-${index}`}
                    className="border-b border-slate-100"
                  >
                    <td className="px-3 py-2">{item.name}</td>
                    <td className="px-3 py-2 text-right">{item.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 text-xs text-slate-500 font-mono space-y-1">
            <div>Total Length: {(costs.totalLengthMm / 1000).toFixed(2)}m</div>
          </div>
        </div>
      </div>
    </div>
  );
}
