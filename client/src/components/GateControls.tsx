import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppStore } from "@/store/appStore";
import { usePricingCatalog } from "@/pricing/usePricingCatalog";
import { getGateWidthRules } from "@/lib/gates/gateWidth";
import { getCatalogGateType, getCatalogStyleForFenceStyle, normalizeStyleToken } from "@/pricing/catalogStyle";
import { resolveSlidingGateRange } from "@/pricing/catalogQuery";
import { X } from "lucide-react";

interface GateControlsProps {
  gateId: string;
  onClose: () => void;
}

const parseRange = (range: string) => {
  const parts = range.split("/").map((value) => Number.parseFloat(value));
  if (parts.length !== 2 || parts.some((value) => !Number.isFinite(value))) {
    return null;
  }
  return { min: Math.min(parts[0], parts[1]), max: Math.max(parts[0], parts[1]) };
};

export function GateControls({ gateId, onClose }: GateControlsProps) {
  const { gates, updateGateWidth, fenceCategoryId, fenceStyleId, fenceHeightM } = useAppStore();
  const gate = gates.find((item) => item.id === gateId);
  const { pricingIndex, catalogReady } = usePricingCatalog();

  const gateType = gate ? getCatalogGateType(gate.type) : null;
  const gateStyle = getCatalogStyleForFenceStyle(fenceStyleId, "gate");

  const availableRows = useMemo(() => {
    if (!pricingIndex || !gateType || !gateStyle) return [];
    return pricingIndex.rows.filter((row) => {
      if (row.productType !== "gate") return false;
      if (row.category !== fenceCategoryId) return false;
      if (row.gateType !== gateType) return false;
      if (row.style && normalizeStyleToken(row.style) !== normalizeStyleToken(gateStyle)) {
        return false;
      }
      if (row.heightM !== null && Math.abs(row.heightM - fenceHeightM) > 0.01) {
        return false;
      }
      return true;
    });
  }, [pricingIndex, gateType, gateStyle, fenceCategoryId, fenceHeightM]);

  const widthOptions = useMemo(() => {
    const options = availableRows
      .map((row) => row.gateWidthM)
      .filter((width): width is number => typeof width === "number");
    return Array.from(new Set(options)).sort((a, b) => a - b);
  }, [availableRows]);

  const rangeOptions = useMemo(() => {
    const options = availableRows
      .map((row) => row.gateWidthRange)
      .filter((range): range is string => Boolean(range));
    return Array.from(new Set(options)).sort();
  }, [availableRows]);

  const rules = useMemo(() => (gate ? getGateWidthRules(gate.type) : null), [gate?.type]);

  const [draftValue, setDraftValue] = useState("");
  const [rangeValue, setRangeValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const resolvedRange = useMemo(() => {
    if (!gate || !pricingIndex || !gateStyle) return null;
    if (gate.widthRange) return gate.widthRange;
    const widthM = gate.opening_mm / 1000;
    const resolved = resolveSlidingGateRange(pricingIndex, fenceCategoryId, gateStyle, widthM);
    return resolved.range;
  }, [gate, pricingIndex, gateStyle, fenceCategoryId]);

  useEffect(() => {
    if (!gate) return;
    setDraftValue((gate.opening_mm / 1000).toFixed(2));
    setRangeValue(gate.widthRange ?? resolvedRange ?? "");
    setError(null);
  }, [gate?.id, gate?.opening_mm, gate?.widthRange, resolvedRange]);

  if (!gate || !rules) return null;

  const rangeLabel = `Range ${rules.minM.toFixed(2)} to ${rules.maxM.toFixed(2)} m`;
  const isSliding = gateType === "sliding";
  const canUseCatalogOptions = catalogReady && pricingIndex && gateType !== null;

  const commitNumeric = (value: string) => {
    const numeric = Number(value.trim());
    if (!Number.isFinite(numeric)) {
      setDraftValue((gate.opening_mm / 1000).toFixed(2));
      setError("Enter a valid number.");
      return;
    }

    const result = updateGateWidth(gate.id, Math.round(numeric * 1000));
    if (!result.ok) {
      setDraftValue((gate.opening_mm / 1000).toFixed(2));
      setError(result.error ?? "Unable to update gate width.");
      return;
    }

    setDraftValue((result.widthMm / 1000).toFixed(2));
    setError(null);
  };

  const commitRange = (value: string) => {
    const parsed = parseRange(value);
    if (!parsed) {
      setError("Select a valid range.");
      return;
    }
    const widthMm = Math.round(parsed.max * 1000);
    const result = updateGateWidth(gate.id, widthMm, { widthRange: value });
    if (!result.ok) {
      setError(result.error ?? "Unable to update gate width.");
      return;
    }
    setRangeValue(value);
    setError(null);
  };

  const renderSelectWidths = () => (
    <Select
      value={draftValue}
      onValueChange={(value) => {
        setDraftValue(value);
        setError(null);
        commitNumeric(value);
      }}
    >
      <SelectTrigger className="w-full text-xs" data-testid="select-gate-width">
        <SelectValue placeholder="Select width" />
      </SelectTrigger>
      <SelectContent>
        {widthOptions.map((width) => (
          <SelectItem key={width} value={width.toFixed(2)}>
            {width.toFixed(2)} m
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const renderSelectRanges = () => (
    <Select
      value={rangeValue}
      onValueChange={(value) => {
        setRangeValue(value);
        setError(null);
        commitRange(value);
      }}
    >
      <SelectTrigger className="w-full text-xs" data-testid="select-gate-width-range">
        <SelectValue placeholder="Select range" />
      </SelectTrigger>
      <SelectContent>
        {rangeOptions.map((range) => (
          <SelectItem key={range} value={range}>
            {range} m
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <Card className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 bg-white p-4 rounded-lg shadow-xl border-2 border-slate-200 min-w-72">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Gate Options</h3>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onClose}
          data-testid="button-close-gate-controls"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-2">
        <Label htmlFor="gate-width" className="text-sm font-medium">
          Gate width (m)
        </Label>
        {gate.type === "opening_custom" ? (
          <Input
            id="gate-width"
            type="text"
            inputMode="decimal"
            value={draftValue}
            onChange={(e) => {
              setDraftValue(e.target.value);
              setError(null);
            }}
            onBlur={() => commitNumeric(draftValue)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitNumeric(draftValue);
              if (e.key === "Escape") {
                setDraftValue((gate.opening_mm / 1000).toFixed(2));
                setError(null);
              }
            }}
            placeholder="0.00"
            data-testid="input-gate-width"
          />
        ) : canUseCatalogOptions && isSliding && rangeOptions.length > 0 ? (
          renderSelectRanges()
        ) : canUseCatalogOptions && !isSliding && widthOptions.length > 0 ? (
          renderSelectWidths()
        ) : (
          <Input
            id="gate-width"
            type="text"
            inputMode="decimal"
            value={draftValue}
            onChange={(e) => {
              setDraftValue(e.target.value);
              setError(null);
            }}
            onBlur={() => commitNumeric(draftValue)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitNumeric(draftValue);
              if (e.key === "Escape") {
                setDraftValue((gate.opening_mm / 1000).toFixed(2));
                setError(null);
              }
            }}
            placeholder="0.00"
            data-testid="input-gate-width"
          />
        )}
        {!canUseCatalogOptions && <p className="text-xs text-slate-500">{rangeLabel}</p>}
        {canUseCatalogOptions && isSliding && rangeOptions.length === 0 && (
          <p className="text-xs text-amber-600">No catalogue ranges available for this gate.</p>
        )}
        {canUseCatalogOptions && !isSliding && widthOptions.length === 0 && (
          <p className="text-xs text-amber-600">No catalogue widths available for this gate.</p>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </Card>
  );
}
