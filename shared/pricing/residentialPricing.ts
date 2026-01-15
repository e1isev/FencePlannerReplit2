export type ResidentialPricingRow = {
  category: "Residential";
  type:
    | "Panel"
    | "Line Post"
    | "End Post"
    | "Corner Post"
    | "Blank Post"
    | "Single Gate"
    | "Double Gate"
    | "Sliding Gate";
  style: string;
  colour: "White" | "Coloured" | null;
  height_m: number;
  width: number | { min: number; max: number } | null;
  sku: string;
  unit_price: number;
};

export type ResidentialSelection = {
  type: ResidentialPricingRow["type"];
  fenceStyle: string;
  colour: "White" | "Coloured";
  height_m: number;
  gateWidth_m?: number | null;
};

export type ResidentialResolved = {
  sku: string;
  unit_price: number;
};

export type ResidentialPricingIndex = {
  exact: Map<string, ResidentialPricingRow>;
  sliding: Map<string, ResidentialPricingRow[]>;
};

const PICKET_EXCEPTIONS = new Set(["Mystique Solid", "Mystique Lattice"]);

const styleKeyForSelection = (selection: ResidentialSelection) => {
  if (selection.type === "Panel") return selection.fenceStyle;
  return PICKET_EXCEPTIONS.has(selection.fenceStyle) ? selection.fenceStyle : "Picket";
};

const colorKey = (colour: ResidentialPricingRow["colour"]) => colour ?? "*";

const widthKey = (width: ResidentialPricingRow["width"]) => {
  if (width === null) return "*";
  if (typeof width === "number") return `${width}`;
  return `${width.min}-${width.max}`;
};

const makeKey = (parts: Array<string | number>) => parts.join("|");

export const buildResidentialIndex = (rows: ResidentialPricingRow[]): ResidentialPricingIndex => {
  const exact = new Map<string, ResidentialPricingRow>();
  const sliding = new Map<string, ResidentialPricingRow[]>();

  rows.forEach((row) => {
    if (row.type === "Sliding Gate") {
      const key = makeKey([row.type, row.style, row.height_m]);
      const bucket = sliding.get(key);
      if (bucket) {
        bucket.push(row);
      } else {
        sliding.set(key, [row]);
      }
      return;
    }

    const key = makeKey([
      row.type,
      row.style,
      colorKey(row.colour),
      row.height_m,
      widthKey(row.width),
    ]);
    exact.set(key, row);
  });

  return { exact, sliding };
};

export const resolveResidentialRow = (
  index: ResidentialPricingIndex | null,
  selection: ResidentialSelection
): ResidentialPricingRow | null => {
  if (!index) return null;

  const style = styleKeyForSelection(selection);

  if (selection.type === "Sliding Gate") {
    const width = selection.gateWidth_m;
    if (width === null || width === undefined) return null;

    const key = makeKey([selection.type, style, selection.height_m]);
    const candidates = index.sliding.get(key) ?? [];
    return (
      candidates.find((row) => {
        if (!row.width || typeof row.width === "number") return false;
        return width >= row.width.min && width <= row.width.max;
      }) ?? null
    );
  }

  const widthValue =
    selection.type === "Single Gate" || selection.type === "Double Gate"
      ? selection.gateWidth_m
      : null;

  if (
    (selection.type === "Single Gate" || selection.type === "Double Gate") &&
    (widthValue === null || widthValue === undefined)
  ) {
    return null;
  }

  const exactKey = makeKey([
    selection.type,
    style,
    selection.colour,
    selection.height_m,
    widthValue ?? "*",
  ]);
  const exactMatch = index.exact.get(exactKey);
  if (exactMatch) return exactMatch;

  const wildcardKey = makeKey([
    selection.type,
    style,
    "*",
    selection.height_m,
    widthValue ?? "*",
  ]);
  return index.exact.get(wildcardKey) ?? null;
};

export const resolveResidentialSkuAndPrice = (
  index: ResidentialPricingIndex | null,
  selection: ResidentialSelection
): ResidentialResolved | null => {
  const row = resolveResidentialRow(index, selection);
  if (!row) return null;
  return { sku: row.sku, unit_price: row.unit_price };
};
