import { fenceStyleImages } from "@/config/fenceStyleImages";
import { FENCE_COLORS } from "@/config/fenceColors";
import { FENCE_HEIGHTS_M } from "@/config/fenceHeights";
import type { FenceStyleCatalogItem } from "@/data/fenceStyles/types";

const availableColours = FENCE_COLORS.map((color) => color.id);
const availableHeights = FENCE_HEIGHTS_M;

export const residentialStyles: FenceStyleCatalogItem[] = [
  {
    id: "bellbrae",
    name: "Bellbrae",
    image: fenceStyleImages.bellbrae,
    availableHeights,
    availableColours,
    supportsGates: true,
  },
  {
    id: "jabiru",
    name: "Jabiru",
    image: fenceStyleImages.jabiru,
    availableHeights,
    availableColours,
    supportsGates: true,
  },
  {
    id: "kestrel",
    name: "Kestrel",
    image: fenceStyleImages.kestrel,
    availableHeights,
    availableColours,
    supportsGates: true,
  },
  {
    id: "kookaburra",
    name: "Kookaburra",
    image: fenceStyleImages.kookaburra,
    availableHeights,
    availableColours,
    supportsGates: true,
  },
  {
    id: "mystique_lattice",
    name: "Mystique Lattice",
    image: fenceStyleImages.mystiqueLattice,
    availableHeights,
    availableColours,
    supportsGates: true,
  },
  {
    id: "mystique_solid",
    name: "Mystique Solid",
    image: fenceStyleImages.mystiqueSolid,
    availableHeights,
    availableColours,
    supportsGates: true,
  },
  {
    id: "rosella",
    name: "Rosella",
    image: fenceStyleImages.rosella,
    availableHeights,
    availableColours,
    supportsGates: true,
  },
  {
    id: "toucan",
    name: "Toucan",
    image: fenceStyleImages.toucan,
    availableHeights,
    availableColours,
    supportsGates: true,
  },
  {
    id: "wren",
    name: "Wren",
    image: fenceStyleImages.wren,
    availableHeights,
    availableColours,
    supportsGates: true,
  },
];
