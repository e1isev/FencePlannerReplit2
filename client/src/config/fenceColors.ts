import type { FenceColourMode } from "@/types/models";

export type FenceColorId =
  | "white"
  | "cream"
  | "night-mist"
  | "grey-ridge"
  | "delux"
  | "woodgrain-pine"
  | "red-gum";

export interface FenceColorOption {
  id: FenceColorId;
  label: string;
  swatch: {
    backgroundColor?: string;
    backgroundImage?: string;
  };
}

export const FENCE_COLORS: FenceColorOption[] = [
  {
    id: "white",
    label: "White",
    swatch: {
      backgroundColor: "#ffffff",
    },
  },
  {
    id: "cream",
    label: "Cream",
    swatch: {
      backgroundColor: "#efe6c8",
    },
  },
  {
    id: "night-mist",
    label: "Night Mist",
    swatch: {
      backgroundColor: "#2f2b2b",
    },
  },
  {
    id: "grey-ridge",
    label: "Grey Ridge",
    swatch: {
      backgroundColor: "#6c6a66",
    },
  },
  {
    id: "delux",
    label: "Delux",
    swatch: {
      backgroundImage:
        "linear-gradient(135deg, #6f7378 0%, #8c9196 45%, #595d61 100%)",
    },
  },
  {
    id: "woodgrain-pine",
    label: "Woodgrain Pine",
    swatch: {
      backgroundImage:
        "linear-gradient(135deg, #8e7a5f 0%, #a58a68 40%, #6f5a43 100%)",
    },
  },
  {
    id: "red-gum",
    label: "Red Gum",
    swatch: {
      backgroundImage:
        "linear-gradient(135deg, #4e1f1b 0%, #732a24 45%, #2f1412 100%)",
    },
  },
];

export const DEFAULT_FENCE_COLOR: FenceColorId = "white";

export const getFenceColourMode = (colorId: FenceColorId): FenceColourMode =>
  colorId === "white" ? "White" : "Colour";
