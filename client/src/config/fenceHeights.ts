export const FENCE_HEIGHTS_M = [0.9, 1.2, 1.4, 1.6, 1.8, 2.0, 2.1] as const;

export type FenceHeightM = (typeof FENCE_HEIGHTS_M)[number];

export const DEFAULT_FENCE_HEIGHT_M: FenceHeightM = 1.8;
