import fs from "fs/promises";
import path from "path";
import xlsx from "xlsx";

const WORKBOOK_PATH = path.resolve("attached_assets", "Fence Planner SKU List.xlsx");
const OUTPUT_DIR = path.resolve("shared", "pricing");
const OUTPUT_ROWS = path.join(OUTPUT_DIR, "residential_pricing_rows.json");
const OUTPUT_OPTIONS = path.join(OUTPUT_DIR, "residential_pricing_options.json");

const REQUIRED_HEADERS = [
  "Catagory",
  "Type",
  "Style",
  "Colour",
  "Height",
  "Width",
  "SKU",
  "Price",
] as const;

type WidthValue = number | { min: number; max: number } | null;

const parseWidth = (value: unknown): WidthValue => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  const text = String(value).trim();
  if (!text) return null;
  if (text.includes("-")) {
    const [minRaw, maxRaw] = text.split("-").map((part) => part.trim());
    const min = Number.parseFloat(minRaw);
    const max = Number.parseFloat(maxRaw);
    if (!Number.isNaN(min) && !Number.isNaN(max)) {
      return { min, max };
    }
  }
  const numeric = Number.parseFloat(text);
  return Number.isNaN(numeric) ? null : numeric;
};

const normalizeColour = (value: unknown): "White" | "Coloured" | null => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  const lowered = text.toLowerCase();
  if (lowered === "white") return "White";
  if (lowered === "colour" || lowered === "colored" || lowered === "coloured") {
    return "Coloured";
  }
  return text as "White" | "Coloured";
};

const normalizeType = (type: string, sku: string) => {
  if (sku.includes("-Sliding-")) return "Sliding Gate";
  if (sku.includes("-Double-")) return "Double Gate";
  if (sku.includes("-Single-")) return "Single Gate";
  return type;
};

const formatRange = (width: WidthValue) => {
  if (!width || typeof width === "number") return null;
  return `${width.min}-${width.max}`;
};

const main = async () => {
  const workbook = xlsx.readFile(WORKBOOK_PATH);
  const sheetName = workbook.SheetNames[1];
  if (!sheetName) {
    throw new Error("Expected pricing worksheet at index 1.");
  }

  const sheet = workbook.Sheets[sheetName];
  const headerRows = xlsx.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
  }) as Array<Array<string>>;
  const headers = (headerRows[0] || []).map((value) => String(value).trim());
  const missing = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
  if (missing.length) {
    throw new Error(`Missing required headers: ${missing.join(", ")}`);
  }

  const rawRows = xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });

  const rows = rawRows
    .map((row) => {
      const category = String(row.Catagory ?? "").trim();
      if (category.toLowerCase() !== "residential") return null;

      const skuRaw = String(row.SKU ?? "").trim();
      const sku = skuRaw.replace(/\s+/g, "");
      const type = normalizeType(String(row.Type ?? "").trim(), sku);
      const style = String(row.Style ?? "").trim();
      const colour = normalizeColour(row.Colour);
      const height_m = Number.parseFloat(String(row.Height ?? "").trim());
      const width = parseWidth(row.Width);
      const unit_price = Number.parseFloat(String(row.Price ?? "").trim());

      if (!style || !type || !sku) return null;

      return {
        category: "Residential" as const,
        type: type as
          | "Panel"
          | "Line Post"
          | "End Post"
          | "Corner Post"
          | "Blank Post"
          | "Single Gate"
          | "Double Gate"
          | "Sliding Gate",
        style,
        colour,
        height_m,
        width,
        sku,
        unit_price,
      };
    })
    .filter(Boolean);

  const heights = Array.from(
    new Set(rows.map((row) => row!.height_m).filter((value) => Number.isFinite(value)))
  ).sort((a, b) => a - b);

  const panelStyles = Array.from(
    new Set(rows.filter((row) => row!.type === "Panel").map((row) => row!.style))
  ).sort((a, b) => a.localeCompare(b));

  const postStyles = Array.from(
    new Set(
      rows
        .filter((row) => row!.type.includes("Post"))
        .map((row) => row!.style)
        .concat(rows.some((row) => row!.style === "Picket") ? ["Picket"] : [])
    )
  ).sort((a, b) => a.localeCompare(b));

  const gateWidths = {
    single: Array.from(
      new Set(
        rows
          .filter((row) => row!.type === "Single Gate" && typeof row!.width === "number")
          .map((row) => row!.width as number)
      )
    ).sort((a, b) => a - b),
    double: Array.from(
      new Set(
        rows
          .filter((row) => row!.type === "Double Gate" && typeof row!.width === "number")
          .map((row) => row!.width as number)
      )
    ).sort((a, b) => a - b),
    sliding: Array.from(
      new Set(
        rows
          .filter((row) => row!.type === "Sliding Gate" && row!.width)
          .map((row) => formatRange(row!.width))
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b)),
  };

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(OUTPUT_ROWS, JSON.stringify(rows, null, 2));
  await fs.writeFile(
    OUTPUT_OPTIONS,
    JSON.stringify({ heights, panelStyles, postStyles, gateWidths }, null, 2)
  );

  console.log(`Wrote ${rows.length} residential pricing rows.`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
