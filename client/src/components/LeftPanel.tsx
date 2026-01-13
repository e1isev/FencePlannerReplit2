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
import { ProductKind, GateType } from "@/types/models";
import { calculateCosts } from "@/lib/pricing";
import { FenceStylePicker } from "@/components/FenceStylePicker";
import { getFenceStyleLabel } from "@/config/fenceStyles";
import { FENCE_HEIGHTS_M, FenceHeightM } from "@/config/fenceHeights";
import { FENCE_COLORS, getFenceColourMode } from "@/config/fenceColors";
import { usePricingCatalog } from "@/pricing/usePricingCatalog";
import { fencingModeFromProjectType, plannerOptions, projectTypeFromProduct } from "@/config/plannerOptions";

const PRODUCTS: ProductKind[] = [
  "Decking",
  "Titan rail",
  "Residential fencing",
  "Rural fencing",
];

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
    productKind,
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
    pricingBySku,
    pricingStatus,
    updatedAtIso,
    errorMessage: pricingError,
  } = usePricingCatalog();

  const costs = calculateCosts({
    fenceStyleId,
    fenceHeightM,
    fenceColourMode: getFenceColourMode(fenceColorId),
    panels,
    posts,
    gates,
    lines,
    pricingBySku,
  });
  const fenceStyleLabel = getFenceStyleLabel(fenceStyleId);
  const projectType = projectTypeFromProduct(productKind);
  const fencingMode = fencingModeFromProjectType(projectType);
  const availableCategories =
    fencingMode === "rural"
      ? plannerOptions.rural_fencing.fenceCategories
      : plannerOptions.residential_fencing.fenceCategories;
  const formattedUpdatedAt =
    updatedAtIso && !Number.isNaN(Date.parse(updatedAtIso))
      ? new Date(updatedAtIso).toLocaleString()
      : "Not available";
  const hasMissingPrices = costs.missingItems.length > 0;
  const formatMoney = (value: number | null) =>
    value === null ? "—" : `$${value.toFixed(2)}`;

  return (
    <div className="w-full md:w-96 border-b md:border-b-0 md:border-r border-slate-200 bg-white p-4 md:p-6 overflow-y-auto max-h-64 md:max-h-none md:h-full">
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold mb-4">Fence Planner</h2>
        </div>

        <div>
          <Label className="text-sm font-medium uppercase tracking-wide text-slate-600 mb-3 block">
            Project Type
          </Label>
          <div className="grid grid-cols-2 gap-2">
            {PRODUCTS.map((product) => (
              <Button
                key={product}
                variant={productKind === product ? "default" : "outline"}
                size="sm"
                disabled
                className="text-xs"
                data-testid={`button-product-${product.toLowerCase().replace(/\s+/g, '-')}`}
              >
                {product}
              </Button>
            ))}
          </div>
        </div>

        <div>
          <Label className="text-sm font-medium uppercase tracking-wide text-slate-600 mb-3 block">
            Fence Style
          </Label>
          <FenceStylePicker availableCategories={availableCategories} />
        </div>

        <div>
          <Label className="text-sm font-medium uppercase tracking-wide text-slate-600 mb-3 block">
            Height
          </Label>
          <Select
            value={String(fenceHeightM)}
            onValueChange={(value) => {
              const parsed = Number(value) as FenceHeightM;
              if (!FENCE_HEIGHTS_M.includes(parsed)) return;
              setFenceHeightM(parsed);
            }}
          >
            <SelectTrigger className="w-full text-xs">
              <SelectValue placeholder="Select height" />
            </SelectTrigger>
            <SelectContent>
              {FENCE_HEIGHTS_M.map((height) => (
                <SelectItem key={height} value={String(height)}>
                  {height} m
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-sm font-medium uppercase tracking-wide text-slate-600 mb-3 block">
            Colour
          </Label>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-7">
            {FENCE_COLORS.map((colorOption) => (
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
            {pricingStatus === "loading" && <div>Pricing catalog loading...</div>}
            {pricingStatus === "error" && (
              <div className="text-amber-600">
                Pricing catalog unavailable{pricingError ? `: ${pricingError}` : "."}
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
                    {item.missingReason ?? "No SKU or price found"}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
