import { useMemo } from "react";
import { useAppStore } from "@/store/appStore";
import { useAuthStore } from "@/store/authStore";
import { useProjectSessionStore } from "@/store/projectSessionStore";
import { usePricingCatalog } from "@/pricing/usePricingCatalog";
import { calculateCosts } from "@/lib/pricing";
import { getFenceColourMode } from "@/config/fenceColors";
import type { QuoteLineItemViewModel, QuoteViewModel } from "@/hooks/useQuoteViewModel";

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

const resolveNote = (reason?: string) => {
  if (!reason) return null;
  return `Pricing pending (${reason.replace(/_/g, " ").toLowerCase()}).`;
};

export const useFenceQuoteViewModel = (): QuoteViewModel => {
  const {
    fenceCategoryId,
    fenceStyleId,
    fenceHeightM,
    fenceColorId,
    panels,
    posts,
    gates,
    lines,
    warnings,
  } = useAppStore();
  const projectName = useProjectSessionStore((state) => state.projectName);
  const projectId = useProjectSessionStore((state) => state.projectId);
  const localId = useProjectSessionStore((state) => state.localId);
  const lastSavedAt = useProjectSessionStore((state) => state.lastSavedAt);
  const user = useAuthStore((state) => state.user);
  const { pricingIndex, catalogReady } = usePricingCatalog();

  return useMemo(() => {
    const createdDate = lastSavedAt ?? new Date().toISOString();
    const expiresDate = addDays(createdDate, 30);
    const costs = calculateCosts({
      fenceCategoryId,
      fenceStyleId,
      fenceHeightM,
      fenceColourMode: getFenceColourMode(fenceColorId),
      panels,
      posts,
      gates,
      lines,
      pricingIndex,
      catalogReady,
    });
    const subtotal = costs.pricedTotal;
    const taxAmount = subtotal * 0.1;
    const total = subtotal + taxAmount;

    const lineItems: QuoteLineItemViewModel[] = costs.lineItems.map((lineItem, index) => {
      const totalAfterDiscount = lineItem.lineTotal ?? 0;
      const unitPrice = lineItem.unitPrice ?? 0;
      const quantity = Number.isFinite(lineItem.quantity) ? lineItem.quantity : 0;
      const displayNotes = [];
      const reasonNote = resolveNote(lineItem.missingReason);
      if (reasonNote) {
        displayNotes.push(reasonNote);
      }
      if (!lineItem.sku) {
        displayNotes.push("SKU not available yet.");
      }

      return {
        id: `${lineItem.name}-${index}`,
        title: lineItem.name,
        longDescriptionBlocks: [
          {
            type: "text",
            text: `SKU: ${lineItem.sku ?? "Pending"}`,
          },
        ],
        quantity,
        unitPriceExDiscount: unitPrice,
        discountPercent: 0,
        totalAfterDiscount,
        gstAmount: totalAfterDiscount * 0.1,
        displayNotes,
      };
    });

    const subtotalBeforeDiscount = subtotal;
    const subtotalAfterDiscount = subtotal;
    const discountAmount = subtotalBeforeDiscount - subtotalAfterDiscount;

    const defaultPaymentSchedule = total
      ? [
          {
            name: "Payment 1",
            due: "Upon acceptance",
            amount: total,
            isDueNow: true,
          },
        ]
      : [];

    const warningText = warnings.map((warning) => warning.text).join("\n");

    return {
      quoteMeta: {
        customerName: projectName,
        customerEmail: "",
        referenceId: projectId ?? localId ?? "",
        createdDate,
        expiresDate,
        createdByName: buildDisplayName(user?.email),
        createdByEmail: user?.email ?? "",
        createdByPhone: "",
      },
      comments: {
        salesTeamComments: warningText,
      },
      lineItems,
      totals: {
        subtotalAfterDiscount,
        taxAmount,
        total,
        discountAmount,
        subtotalBeforeDiscount,
      },
      delivery: {
        deliveryAddress: "",
        freightMethod: "",
        deliveryTerms: DEFAULT_DELIVERY_TERMS,
      },
      paymentSchedule: defaultPaymentSchedule,
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
    projectName,
    projectId,
    localId,
    lastSavedAt,
    user?.email,
    pricingIndex,
    catalogReady,
  ]);
};
