import { useMemo } from "react";
import { useAuthStore } from "@/store/authStore";
import { useAppStore } from "@/store/appStore";
import { usePricingStore } from "@/store/pricingStore";
import { calculateCosts } from "@/lib/pricing";
import { getFenceColourMode } from "@/config/fenceColors";
import type {
  QuoteDescriptionBlock,
  QuoteLineItemViewModel,
  QuoteViewModel,
} from "@/hooks/useQuoteViewModel";

const DEFAULT_DELIVERY_TERMS = [
  "Delivery window will be confirmed prior to dispatch.",
  "Customer to ensure clear site access for delivery vehicles.",
  "Any additional handling charges will be quoted prior to delivery.",
];

const DEFAULT_COMPANY_FOOTER = {
  companyName: "Think Manufacturing",
  companyAddressLines: ["1/123 Industrial Avenue", "Brisbane QLD 4000", "Australia"],
  abn: "ABN 00 000 000 000",
};

const buildDisplayName = (email?: string) => {
  if (!email) return "";
  const [local] = email.split("@");
  if (!local) return email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((segment) => segment[0]?.toUpperCase() + segment.slice(1))
    .join(" ");
};

const addDays = (isoDate: string, days: number) => {
  const baseDate = new Date(isoDate);
  if (Number.isNaN(baseDate.getTime())) {
    const fallback = new Date();
    fallback.setDate(fallback.getDate() + days);
    return fallback.toISOString();
  }
  const next = new Date(baseDate);
  next.setDate(baseDate.getDate() + days);
  return next.toISOString();
};

export const useFenceQuoteViewModel = (): QuoteViewModel => {
  const user = useAuthStore((state) => state.user);
  const fenceCategoryId = useAppStore((state) => state.fenceCategoryId);
  const fenceStyleId = useAppStore((state) => state.fenceStyleId);
  const fenceHeightM = useAppStore((state) => state.fenceHeightM);
  const fenceColorId = useAppStore((state) => state.fenceColorId);
  const panels = useAppStore((state) => state.panels);
  const posts = useAppStore((state) => state.posts);
  const gates = useAppStore((state) => state.gates);
  const lines = useAppStore((state) => state.lines);
  const warnings = useAppStore((state) => state.warnings);
  const residentialIndex = usePricingStore((state) => state.residentialIndex);

  return useMemo(() => {
    const costs = calculateCosts({
      fenceCategoryId,
      fenceStyleId,
      fenceHeightM,
      fenceColourMode: getFenceColourMode(fenceColorId),
      residentialIndex,
      panels,
      posts,
      gates,
      lines,
    });

    const createdDate = new Date().toISOString();
    const expiresDate = addDays(createdDate, 30);
    const subtotal = costs.pricedTotal ?? 0;
    const taxRate = 0.1;
    const taxAmount = subtotal * taxRate;
    const total = subtotal + taxAmount;

    const lineItems: QuoteLineItemViewModel[] = costs.lineItems.map((item, index) => {
      const unitPrice = Number.isFinite(item.unitPrice) ? item.unitPrice ?? 0 : 0;
      const lineTotal = Number.isFinite(item.lineTotal) ? item.lineTotal ?? 0 : 0;
      const quantity = Number.isFinite(item.quantity) ? item.quantity : 0;
      const gateWidthLabel =
        item.itemType === "gate" && item.gateWidthRange
          ? `Gate width range: ${item.gateWidthRange} m`
          : item.itemType === "gate" && item.gateWidthM
            ? `Gate width: ${item.gateWidthM.toFixed(2)} m`
            : null;
      const longDescriptionBlocks: QuoteDescriptionBlock[] = gateWidthLabel
        ? [{ type: "text", text: gateWidthLabel }]
        : [];
      return {
        id: `${item.sku ?? item.name}-${index}`,
        title: item.name,
        longDescriptionBlocks,
        quantity,
        unitPriceExDiscount: unitPrice,
        discountPercent: 0,
        totalAfterDiscount: lineTotal,
        gstAmount: lineTotal * taxRate,
        displayNotes: [],
      };
    });

    return {
      quoteMeta: {
        customerName: "",
        customerEmail: "",
        referenceId: "",
        createdDate,
        expiresDate,
        createdByName: buildDisplayName(user?.email),
        createdByEmail: user?.email ?? "",
        createdByPhone: "",
      },
      comments: {
        salesTeamComments: warnings.length ? warnings.map((warning) => warning.text).join("\n") : "",
      },
      lineItems,
      totals: {
        subtotalAfterDiscount: subtotal,
        taxAmount,
        total,
        discountAmount: 0,
        subtotalBeforeDiscount: subtotal,
      },
      delivery: {
        deliveryAddress: "",
        freightMethod: "",
        deliveryTerms: DEFAULT_DELIVERY_TERMS,
      },
      paymentSchedule: total
        ? [
            {
              name: "Payment 1",
              due: "Upon acceptance",
              amount: total,
              isDueNow: true,
            },
          ]
        : [],
      companyFooter: DEFAULT_COMPANY_FOOTER,
    };
  }, [
    fenceCategoryId,
    fenceStyleId,
    fenceHeightM,
    fenceColorId,
    panels,
    posts,
    gates,
    lines,
    warnings,
    user?.email,
    residentialIndex,
  ]);
};
