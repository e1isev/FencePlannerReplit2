import { create } from "zustand";

export type MapViewport = {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
};

type MapViewportState = {
  viewport: MapViewport | null;
  setViewport: (viewport: MapViewport | null) => void;
};

export const useMapViewportStore = create<MapViewportState>((set) => ({
  viewport: null,
  setViewport: (viewport) => set({ viewport }),
}));
