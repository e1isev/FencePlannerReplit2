export const getCatalogVersion = () =>
  process.env.CATALOG_VERSION ?? "2025.01";

export const getRuleSetVersion = () =>
  process.env.RULESET_VERSION ?? "2025.01";

export type SkuMapping = {
  fromSku: string;
  toSku: string;
  reason?: string;
};

export const getSkuMappings = (): { substitutions: SkuMapping[] } => ({
  substitutions: [],
});
