import type { Category, ProductType } from "@/pricing/catalogTypes";

const formatMeters = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  const fixed = value.toFixed(2);
  return fixed.replace(/\.00$/, "").replace(/(\.[0-9])0$/, "$1");
};

const derivePostStyle = (args: { style?: string | null; sku?: string; name?: string }) => {
  if (args.style) return args.style;
  const sku = args.sku ?? "";
  if (sku.startsWith("ResPost-")) return "ResPost";
  if (sku.startsWith("B-")) {
    const name = args.name ?? "";
    const prefix = name.split("Post")[0]?.trim();
    if (prefix) return prefix;
    const match = name.match(/^([A-Za-z]+)/);
    return match?.[1] ?? null;
  }
  return null;
};

export const buildKey = (rowLike: {
  category: Category;
  productType: ProductType;
  style?: string | null;
  colour?: string | null;
  heightM?: number | null;
  postType?: string | null;
  gateType?: string | null;
  gateWidthM?: number | null;
  gateWidthRange?: string | null;
  name?: string | null;
  sku?: string | null;
}): string => {
  const category = rowLike.category;
  const productType = rowLike.productType;

  let keyParts: string[] = [];

  if (productType === "panel") {
    keyParts = [
      category,
      "panel",
      rowLike.style ?? "",
      rowLike.colour ?? "",
      formatMeters(rowLike.heightM ?? null),
    ];
  } else if (productType === "post") {
    const postStyle = derivePostStyle({
      style: rowLike.style,
      sku: rowLike.sku ?? undefined,
      name: rowLike.name ?? undefined,
    });
    keyParts = [
      category,
      "post",
      postStyle ?? "",
      rowLike.postType ?? "",
      rowLike.colour ?? "",
      formatMeters(rowLike.heightM ?? null),
    ];
  } else if (productType === "gate") {
    const widthOrRange =
      rowLike.gateType === "sliding" && rowLike.gateWidthRange
        ? rowLike.gateWidthRange
        : formatMeters(rowLike.gateWidthM ?? null);
    keyParts = [
      category,
      "gate",
      rowLike.style ?? "",
      rowLike.gateType ?? "",
      formatMeters(rowLike.heightM ?? null),
      widthOrRange ?? "",
    ];
  } else {
    keyParts = [
      category,
      productType,
      rowLike.style ?? "",
      rowLike.colour ?? "",
      formatMeters(rowLike.heightM ?? null),
    ];
  }

  while (keyParts.length > 0 && !keyParts[keyParts.length - 1]) {
    keyParts = keyParts.slice(0, -1);
  }

  return keyParts.join("|");
};
