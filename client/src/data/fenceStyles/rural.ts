import { fenceStyleImages } from "@/config/fenceStyleImages";
import { FENCE_COLORS } from "@/config/fenceColors";
import { FENCE_HEIGHTS_M } from "@/config/fenceHeights";
import type { FenceStyleCatalogItem } from "@/data/fenceStyles/types";

const availableColours = FENCE_COLORS.map((color) => color.id);
const availableHeights = FENCE_HEIGHTS_M;

export const ruralStyles: FenceStyleCatalogItem[] = [
  {
    id: "1_rail_140x40",
    name: "1 Rail 140x40",
    image: fenceStyleImages.rail1,
    availableHeights,
    availableColours,
    supportsGates: true,
  },
  {
    id: "1_rail_150x50",
    name: "1 Rail 150x50",
    image: fenceStyleImages.rail1,
    availableHeights,
    availableColours,
    supportsGates: true,
  },
  {
    id: "2_rails_140x40",
    name: "2 Rails 140x40",
    image: fenceStyleImages.rail2,
    availableHeights,
    availableColours,
    supportsGates: true,
  },
  {
    id: "2_rails_150x50",
    name: "2 Rails 150x50",
    image: fenceStyleImages.rail2,
    availableHeights,
    availableColours,
    supportsGates: true,
  },
  {
    id: "3_rails_140x40",
    name: "3 Rails 140x40",
    image: fenceStyleImages.rail3,
    availableHeights,
    availableColours,
    supportsGates: true,
  },
  {
    id: "3_rails_150x50",
    name: "3 Rails 150x50",
    image: fenceStyleImages.rail3,
    availableHeights,
    availableColours,
    supportsGates: true,
  },
  {
    id: "4_rails_140x40",
    name: "4 Rails 140x40",
    image: fenceStyleImages.rail4,
    availableHeights,
    availableColours,
    supportsGates: true,
  },
  {
    id: "4_rails_150x50",
    name: "4 Rails 150x50",
    image: fenceStyleImages.rail4,
    availableHeights,
    availableColours,
    supportsGates: true,
  },
  {
    id: "caviar_150x50",
    name: "Caviar 150x50",
    image: fenceStyleImages.caviar,
    availableHeights,
    availableColours,
    supportsGates: true,
  },
  {
    id: "crossbuck_150x50",
    name: "Crossbuck 150x50",
    image: fenceStyleImages.crossbuck,
    availableHeights,
    availableColours,
    supportsGates: true,
  },
  {
    id: "mesh_150x50",
    name: "Mesh 150x50",
    image: fenceStyleImages.mesh,
    availableHeights,
    availableColours,
    supportsGates: true,
  },
];
