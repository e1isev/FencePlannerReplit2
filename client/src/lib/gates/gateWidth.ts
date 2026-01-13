import type { Gate, GateType } from "@/types/models";

export type GateWidthType = "single" | "double" | "sliding";

type GateWidthRule = {
  minM: number;
  maxM: number;
  defaultM: number;
  stepM: number;
};

export const GATE_WIDTH_RULES: Record<GateWidthType, GateWidthRule> = {
  single: {
    minM: 0.9,
    maxM: 2.35,
    defaultM: 0.9,
    stepM: 0.05,
  },
  double: {
    minM: 2.4,
    maxM: 4.7,
    defaultM: 2.4,
    stepM: 0.05,
  },
  sliding: {
    minM: 3.1,
    maxM: 6.0,
    defaultM: 4.8,
    stepM: 0.05,
  },
};

export const getGateWidthType = (gateType: GateType | string): GateWidthType => {
  if (gateType.startsWith("double")) return "double";
  if (gateType.startsWith("sliding")) return "sliding";
  if (gateType.startsWith("single")) return "single";
  return "single";
};

export const getGateWidthRules = (gateType: GateType | string): GateWidthRule => {
  return GATE_WIDTH_RULES[getGateWidthType(gateType)];
};

export const snapGateWidthM = (widthM: number, stepM: number) => {
  if (!Number.isFinite(widthM)) return widthM;
  const snapped = Math.round(widthM / stepM) * stepM;
  return Math.round(snapped * 1000) / 1000;
};

export const clampGateWidthM = (widthM: number, gateType: GateType | string) => {
  const rules = getGateWidthRules(gateType);
  const clamped = Math.min(rules.maxM, Math.max(rules.minM, widthM));
  const snapped = snapGateWidthM(clamped, rules.stepM);
  return Math.min(rules.maxM, Math.max(rules.minM, snapped));
};

export const getDefaultGateWidthMm = (gateType: GateType | string) => {
  const rules = getGateWidthRules(gateType);
  return Math.round(rules.defaultM * 1000);
};

export const normalizeGateWidthMm = (gate: Gate): Gate => {
  if (gate.type === "opening_custom") {
    return gate;
  }

  const rules = getGateWidthRules(gate.type);
  const currentM = gate.opening_mm / 1000;

  if (!Number.isFinite(currentM) || currentM <= 0) {
    return {
      ...gate,
      opening_mm: Math.round(rules.defaultM * 1000),
    };
  }

  return gate;
};
