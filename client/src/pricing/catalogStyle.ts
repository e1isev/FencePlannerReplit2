import type { FenceStyleId, GateType, FenceColourMode } from "@/types/models";
import { getFenceStyleLabel } from "@/config/fenceStyles";

export const normalizeStyleToken = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();

const normalizeSpacing = (value: string) => value.trim().replace(/\s+/g, " ");

export const normalizeStyleValue = (value: string | null) =>
  value ? normalizeSpacing(value) : null;

const toTitleCase = (value: string) =>
  value
    .split(" ")
    .map((segment) => (segment ? segment[0].toUpperCase() + segment.slice(1) : ""))
    .join(" ");

export const getCatalogStyleForFenceStyle = (
  fenceStyleId: FenceStyleId,
  productType: "panel" | "gate" | "post"
): string | null => {
  const label = getFenceStyleLabel(fenceStyleId);

  if (productType === "post") {
    if (fenceStyleId === "mystique_lattice") return "Mystique Lattice";
    if (fenceStyleId === "mystique_solid") return "Mystique Solid";
    if (fenceStyleId === "wren") return "Wren";
    return "ResPost";
  }

  if (productType === "gate" && fenceStyleId.includes("rail")) {
    const match = fenceStyleId.match(/^(\d)_rail/) ?? fenceStyleId.match(/^(\d)_rails/);
    if (match) {
      return `${match[1]} Rail`;
    }
  }

  if (productType === "panel" && fenceStyleId.includes("rail")) {
    if (fenceStyleId.includes("140x40")) return "140";
    if (fenceStyleId.includes("150x50")) return "150";
  }

  if (fenceStyleId === "crossbuck_150x50") return "Crossbuck";
  if (fenceStyleId === "mesh_150x50") return "Mesh";
  if (fenceStyleId === "caviar_150x50") return "Caviar";

  if (fenceStyleId === "mystique_lattice") return "Mystique Lattice";
  if (fenceStyleId === "mystique_solid") return "Mystique Solid";

  return toTitleCase(normalizeSpacing(label));
};

export const getCatalogColourForFenceColourMode = (
  fenceColourMode: FenceColourMode
): string => (fenceColourMode === "White" ? "white" : "colour");

export const getCatalogGateType = (gateType: GateType | string | null | undefined) => {
  if (!gateType) return null;
  if (gateType.startsWith("single")) return "single";
  if (gateType.startsWith("double")) return "double";
  if (gateType.startsWith("sliding")) return "sliding";
  return null;
};
