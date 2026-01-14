import type { Request, Response } from "express";

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
  if (!payload?.bomLines) {
    return res.status(400).json({ message: "bomLines is required." });
  }

  const pricedLines = payload.bomLines.map((line) => {
    return {
      sku: line.sku,
      qty: line.qty,
      uom: line.uom,
      unitPrice: 0,
      lineTotal: 0,
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
    warnings: [],
  });
};
