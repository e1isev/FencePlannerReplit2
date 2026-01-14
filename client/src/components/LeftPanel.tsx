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
import { GateType } from "@/types/models";
import { calculateCosts } from "@/lib/pricing";
import { FenceStylePicker } from "@/components/FenceStylePicker";
import { getFenceStyleLabel } from "@/config/fenceStyles";
import { FENCE_HEIGHTS_M, FenceHeightM } from "@/config/fenceHeights";
import { FENCE_COLORS, getFenceColourMode } from "@/config/fenceColors";
import { usePricingCatalog } from "@/pricing/usePricingCatalog";
import { coerceFenceProjectType, fencingModeFromProjectType, plannerOptions } from "@/config/plannerOptions";
import { getSupportedPanelHeights } from "@/pricing/skuRules";
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

const heightEquals = (a: number, b: number) => Math.abs(a - b) < 1e-6;

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
  const {
    pricingIndex,
    pricingStatus,
    noticeMessage: pricingNotice,
    updatedAtIso,
    errorMessage: pricingError,
    catalogStatus,
    catalogReady,
    loadPricingCatalog,
  } = usePricingCatalog();
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
        pricingIndex
      ),
    [fenceStyleId, fenceColourMode, fenceCategoryId, pricingIndex]
  );
  const resolvedProjectType = projectType ?? "residential";
  const fencingMode = fencingModeFromProjectType(resolvedProjectType);
  const showProjectTypeWarning = !projectType;
  const showFencingModeWarning = !fencingMode;
  useEffect(() => {
    if (!supportedHeights.length) return;
    const currentHeight = Number(fenceHeightM);
    const matches = supportedHeights.some((height) => heightEquals(height, currentHeight));
    if (matches) return;
    const nextHeight = Number(supportedHeights[0]) as FenceHeightM;
    if (heightEquals(nextHeight, currentHeight)) return;
    setFenceHeightM(nextHeight);
  }, [supportedHeights, fenceHeightM, setFenceHeightM]);

  useEffect(() => {
    if (!availableColours.length) return;
    const hasColour = availableColours.some((color) => color.id === fenceColorId);
    if (hasColour) return;
    setFenceColorId(availableColours[0].id);
  }, [availableColours, fenceColorId, setFenceColorId]);

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
    panels,
    posts,
    gates,
    lines,
    pricingIndex,
    catalogReady,
  });
  const fenceStyleLabel = getFenceStyleLabel(fenceStyleId);
  const resolvedFencingMode = fencingMode ?? "residential";
  const availableCategories =
    resolvedFencingMode === "rural"
      ? plannerOptions.rural.fenceCategories
      : plannerOptions.residential.fenceCategories;
  const catalogStyle = getCatalogStyleForFenceStyle(fenceStyleId, "panel");
  const availableStyles =
    catalogReady && pricingIndex
      ? pricingIndex.optionSets.stylesByCategory[resolvedFencingMode]
      : null;
  const availableColours = useMemo(() => {
    if (!catalogReady || !pricingIndex || !catalogStyle) return FENCE_COLORS;
    const colours =
      pricingIndex.optionSets.coloursByCategoryStyle[
        `${fenceCategoryId}|${catalogStyle}`
      ] ?? [];
    if (colours.length === 0) return FENCE_COLORS;
    const normalized = new Set(colours.map((colour) => colour.toLowerCase()));
    return FENCE_COLORS.filter((colorOption) => {
      if (normalized.has(colorOption.id)) return true;
      if (normalized.has("white") && colorOption.id === "white") return true;
      if (normalized.has("colour") && colorOption.id !== "white") return true;
      return false;
    });
  }, [catalogReady, pricingIndex, fenceCategoryId, catalogStyle]);
  const formattedUpdatedAt =
    updatedAtIso && !Number.isNaN(Date.parse(updatedAtIso))
      ? new Date(updatedAtIso).toLocaleString()
      : "Not available";
  const formattedStatusLastErrorAt =
    catalogStatus?.lastErrorAt && !Number.isNaN(Date.parse(catalogStatus.lastErrorAt))
      ? new Date(catalogStatus.lastErrorAt).toLocaleString()
      : null;
  const catalogHasRows = Boolean(catalogStatus?.ok && catalogStatus.catalogueRowCount > 0);
  const statusErrorMessage = catalogStatus?.lastErrorMessage;
  const statusErrorStatus = catalogStatus?.lastErrorStatus;
  const hasMissingPrices = costs.missingItems.length > 0;
  const formatMoney = (value: number | null) =>
    value === null ? "—" : `$${value.toFixed(2)}`;

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
            value={String(fenceHeightM)}
            onValueChange={(value) => {
              const parsed = Number(value) as FenceHeightM;
              const matches = supportedHeights.some((height) => heightEquals(height, parsed));
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
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">
                    SKU
                  </th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-700">
                    Qty
                  </th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-700">
                    Unit
                  </th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-700">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {costs.lineItems.length === 0 && (
                  <tr className="border-b border-slate-100">
                    <td className="px-3 py-2 text-slate-400" colSpan={5}>
                      Add fence segments to see priced items.
                    </td>
                  </tr>
                )}
                {costs.lineItems.map((item) => (
                  <tr
                    key={`${item.name}-${item.sku ?? "missing"}`}
                    className="border-b border-slate-100"
                  >
                    <td className="px-3 py-2">{item.name}</td>
                    <td className="px-3 py-2 text-left">
                      {item.sku ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right">{item.quantity}</td>
                    <td className="px-3 py-2 text-right">
                      {formatMoney(item.unitPrice)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatMoney(item.lineTotal)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-100 border-t-2 border-slate-300">
                  <td
                    className="px-3 py-2 font-semibold"
                    colSpan={4}
                    data-testid="text-total-label"
                  >
                    Total
                  </td>
                  <td className="px-3 py-2 text-right font-semibold" data-testid="text-total-price">
                    {formatMoney(costs.grandTotal)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-2 text-xs text-slate-500 font-mono space-y-1">
            <div>Total Length: {(costs.totalLengthMm / 1000).toFixed(2)}m</div>
            {pricingStatus === "ready" && (
              <div>Pricing last updated: {formattedUpdatedAt}</div>
            )}
            {pricingStatus === "ready" && pricingNotice && (
              <div className="text-amber-600">{pricingNotice}</div>
            )}
            {pricingStatus === "loading" && <div>Pricing catalog loading...</div>}
            {pricingStatus === "error" && (
              <div className="space-y-2 text-amber-600">
                <div>
                  Pricing catalog unavailable{pricingError ? `: ${pricingError}` : "."}
                </div>
                <Button size="sm" variant="outline" onClick={() => void loadPricingCatalog()}>
                  Retry pricing load
                </Button>
              </div>
            )}
            {catalogStatus && (
              <div className="space-y-1 text-slate-500">
                {catalogHasRows ? (
                  <>
                    <div>Pricing source: {catalogStatus.source}</div>
                    <div>Catalogue rows: {catalogStatus.catalogueRowCount}</div>
                  </>
                ) : (
                  <div className="text-amber-600">
                    Pricing catalog not loaded
                    {statusErrorMessage ? `: ${statusErrorMessage}` : ""}
                    {statusErrorStatus ? ` (${statusErrorStatus})` : ""}
                  </div>
                )}
                {formattedStatusLastErrorAt && (
                  <div className="text-amber-600">
                    Last error at {formattedStatusLastErrorAt}
                    {catalogStatus.lastErrorStatus
                      ? ` (${catalogStatus.lastErrorStatus})`
                      : ""}
                  </div>
                )}
              </div>
            )}
          </div>
          {hasMissingPrices && (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <div className="font-semibold">Missing prices</div>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {costs.missingItems.map((item) => (
                  <li key={`${item.name}-${item.sku ?? "missing"}`}>
                    {item.name}
                    {item.sku ? ` (${item.sku})` : ""} —{" "}
                    {item.missingReason ?? "NOT_FOUND"}
                    {item.catalogKey ? ` | Key: ${item.catalogKey}` : ""}
                    {item.missingDiagnostics?.duplicates?.length
                      ? ` | Duplicates: ${item.missingDiagnostics.duplicates
                          .map((row) => row.sku)
                          .join(", ")}`
                      : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {import.meta.env.DEV && pricingIndex && (
            <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <div className="font-semibold text-slate-700">Catalogue diagnostics</div>
              <div>Total rows: {pricingIndex.rows.length}</div>
              <div>Duplicate keys: {pricingIndex.diagnostics.duplicateKeys.length}</div>
              <div>Missing category rows: {pricingIndex.diagnostics.rowsMissingCategory.length}</div>
              <div>Missing price rows: {pricingIndex.diagnostics.rowsMissingPrice.length}</div>
              {pricingIndex.diagnostics.duplicateKeys.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-slate-600">
                    View duplicate keys
                  </summary>
                  <ul className="mt-1 space-y-1 pl-4">
                    {pricingIndex.diagnostics.duplicateKeys.map((key) => (
                      <li key={key}>
                        <div>{key}</div>
                        <div className="text-[11px] text-slate-500">
                          {pricingIndex.duplicates
                            .get(key)
                            ?.map((row) => row.sku)
                            .join(", ")}
                        </div>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
