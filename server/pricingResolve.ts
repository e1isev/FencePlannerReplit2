import type { Request, Response } from "express";
import { getPricingCatalog } from "./pricingCatalog";

type PricingResolveRequest = {
  bomLines: Array<{
    sku: string;
    qty: number;
    uom: string;
    attributes?: Record<string, unknown>;
  }>;
  context?: {
    postcode?: string;
    storeId?: string;
    channel?: string;
  };
};

export const handlePricingResolve = async (req: Request, res: Response) => {
  const payload = req.body as PricingResolveRequest;
  const warnings: string[] = [];
  if (!payload?.bomLines) {
    return res.status(400).json({ message: "bomLines is required." });
  }

  let catalog: Record<string, { name: string; unitPrice: number }> = {};
  try {
    const { catalog: data } = await getPricingCatalog();
    catalog = data.items.reduce(
      (acc, item) => {
        acc[item.sku] = { name: item.name, unitPrice: item.unitPrice };
        return acc;
      },
      {} as Record<string, { name: string; unitPrice: number }>
    );
  } catch (error) {
    warnings.push(
      error instanceof Error ? error.message : "Pricing catalog unavailable."
    );
  }

  const pricedLines = payload.bomLines.map((line) => {
    const pricing = catalog[line.sku];
    if (!pricing) {
      warnings.push(`Missing pricing for SKU ${line.sku}.`);
    }
    const unitPrice = pricing?.unitPrice ?? 0;
    const lineTotal = unitPrice * line.qty;
    return {
      sku: line.sku,
      qty: line.qty,
      uom: line.uom,
      unitPrice,
      lineTotal,
      warning: pricing ? undefined : "Missing pricing",
    };
  });

  const subtotal = pricedLines.reduce((sum, line) => sum + line.lineTotal, 0);
  const tax = 0;
  const total = subtotal + tax;

  return res.status(200).json({
    pricedLines,
    totals: {
      subtotal,
      tax,
      total,
      currency: "AUD",
    },
    warnings,
  });
};
