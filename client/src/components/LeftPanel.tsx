import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useAppStore } from "@/store/appStore";
import { ProductKind, FenceStyleId, GateType } from "@/types/models";
import { calculateCosts } from "@/lib/pricing";
import { Check } from "lucide-react";
import { useLocation } from "wouter";

const PRODUCTS: ProductKind[] = [
  "Decking",
  "Titan rail",
  "Residential fencing",
  "Rural fencing",
];

const FENCE_STYLES: { id: FenceStyleId; name: string }[] = [
  { id: "mystique_lattice", name: "Mystique Lattice" },
  { id: "mystique_solid", name: "Mystique Solid" },
  { id: "wren", name: "Wren" },
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
    selectedGateType,
    lines,
    panels,
    posts,
    gates,
    setProductKind,
    setFenceStyle,
    setSelectedGateType,
  } = useAppStore();
  const [, setLocation] = useLocation();

  const selectedLine = lines.find((l) => !l.gateId);
  const canToggleSpacing = selectedLine !== undefined;

  const costs = calculateCosts(fenceStyleId, panels, posts, gates, lines);

  return (
    <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-slate-200 bg-white p-4 md:p-6 overflow-y-auto max-h-64 md:max-h-none md:h-full">
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold mb-4">Fence Planner</h2>
        </div>

        <div>
          <Label className="text-sm font-medium uppercase tracking-wide text-slate-600 mb-3 block">
            Product Category
          </Label>
          <div className="grid grid-cols-2 gap-2">
            {PRODUCTS.map((product) => (
              <Button
                key={product}
                variant={productKind === product ? "default" : "outline"}
                size="sm"
                disabled={product !== "Residential fencing" && product !== "Decking"}
                onClick={() => {
                  if (product === "Decking") {
                    setLocation("/decking");
                  } else {
                    setProductKind(product);
                  }
                }}
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
          <div className="space-y-2">
            {FENCE_STYLES.map((style) => (
              <Card
                key={style.id}
                className={`p-4 cursor-pointer transition-all ${
                  fenceStyleId === style.id
                    ? "border-2 border-primary bg-primary/5"
                    : "border-2 border-transparent hover-elevate"
                }`}
                onClick={() => setFenceStyle(style.id)}
                data-testid={`card-style-${style.id}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{style.name}</span>
                  {fenceStyleId === style.id && (
                    <Check className="w-4 h-4 text-primary" />
                  )}
                </div>
              </Card>
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
                  <th className="px-3 py-2 text-right font-semibold text-slate-700">
                    Unit Price
                  </th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-700">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {costs.panels.quantity > 0 && (
                  <tr className="border-b border-slate-100" data-testid="row-panels">
                    <td className="px-3 py-2">Panels</td>
                    <td className="px-3 py-2 text-right">{costs.panels.quantity}</td>
                    <td className="px-3 py-2 text-right">
                      ${costs.panels.unitPrice.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      ${costs.panels.total.toFixed(2)}
                    </td>
                  </tr>
                )}
                {costs.posts.end.quantity > 0 && (
                  <tr className="border-b border-slate-100" data-testid="row-posts-end">
                    <td className="px-3 py-2">End Posts</td>
                    <td className="px-3 py-2 text-right">{costs.posts.end.quantity}</td>
                    <td className="px-3 py-2 text-right">
                      ${costs.posts.end.unitPrice.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      ${costs.posts.end.total.toFixed(2)}
                    </td>
                  </tr>
                )}
                {costs.posts.corner.quantity > 0 && (
                  <tr className="border-b border-slate-100" data-testid="row-posts-corner">
                    <td className="px-3 py-2">Corner Posts</td>
                    <td className="px-3 py-2 text-right">
                      {costs.posts.corner.quantity}
                    </td>
                    <td className="px-3 py-2 text-right">
                      ${costs.posts.corner.unitPrice.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      ${costs.posts.corner.total.toFixed(2)}
                    </td>
                  </tr>
                )}
                {costs.posts.line.quantity > 0 && (
                  <tr className="border-b border-slate-100" data-testid="row-posts-line">
                    <td className="px-3 py-2">Line Posts</td>
                    <td className="px-3 py-2 text-right">{costs.posts.line.quantity}</td>
                    <td className="px-3 py-2 text-right">
                      ${costs.posts.line.unitPrice.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      ${costs.posts.line.total.toFixed(2)}
                    </td>
                  </tr>
                )}
                {Object.entries(costs.gates).map(
                  ([type, data]) =>
                    data.quantity > 0 && (
                      <tr
                        key={type}
                        className="border-b border-slate-100"
                        data-testid={`row-gate-${type}`}
                      >
                        <td className="px-3 py-2">
                          {type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                        </td>
                        <td className="px-3 py-2 text-right">{data.quantity}</td>
                        <td className="px-3 py-2 text-right">
                          ${data.unitPrice.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          ${data.total.toFixed(2)}
                        </td>
                      </tr>
                    )
                )}
                <tr className="bg-slate-100 border-t-2 border-slate-300">
                  <td className="px-3 py-2 font-semibold" colSpan={3} data-testid="text-total-label">
                    Total
                  </td>
                  <td className="px-3 py-2 text-right font-semibold" data-testid="text-total-price">
                    ${costs.grandTotal.toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-2 text-xs text-slate-500 font-mono">
            Total Length: {(costs.totalLength_mm / 1000).toFixed(2)}m
          </div>
        </div>
      </div>
    </div>
  );
}
