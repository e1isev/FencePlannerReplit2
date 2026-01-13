import { useMemo } from "react";
import { useProjectStore } from "@/store/projectStore";
import { useAuthStore } from "@/store/authStore";

export type QuoteDescriptionBlock =
  | { type: "text"; text: string }
  | { type: "bullets"; bullets: string[] };

export type QuoteLineItemViewModel = {
  id: string;
  title: string;
  longDescriptionBlocks: QuoteDescriptionBlock[];
  quantity: number;
  unitPriceExDiscount: number;
  discountPercent: number;
  totalAfterDiscount: number;
  gstAmount: number;
  displayNotes: string[];
};

export type QuoteViewModel = {
  quoteMeta: {
    customerName: string;
    customerEmail: string;
    referenceId: string;
    createdDate: string;
    expiresDate: string;
    createdByName: string;
    createdByEmail: string;
    createdByPhone: string;
  };
  comments: {
    salesTeamComments: string;
  };
  lineItems: QuoteLineItemViewModel[];
  totals: {
    subtotalAfterDiscount: number;
    taxAmount: number;
    total: number;
    discountAmount: number;
    subtotalBeforeDiscount: number;
  };
  delivery: {
    deliveryAddress: string;
    freightMethod: string;
    deliveryTerms: string[];
  };
  paymentSchedule: Array<{
    name: string;
    due: string;
    amount: number;
    isDueNow: boolean;
  }>;
  companyFooter: {
    companyName: string;
    companyAddressLines: string[];
    abn: string;
  };
};

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

const resolveTaxRate = (subtotal: number, tax: number) => {
  if (subtotal > 0 && Number.isFinite(tax)) {
    return tax / subtotal;
  }
  return 0.1;
};

export const useQuoteViewModel = (): QuoteViewModel => {
  const pricingSummary = useProjectStore((state) => state.pricingSummary);
  const projectMeta = useProjectStore((state) => state.projectMeta);
  const projectId = useProjectStore((state) => state.projectId);
  const warnings = useProjectStore((state) => state.warnings);
  const user = useAuthStore((state) => state.user);

  return useMemo(() => {
    const createdDate = projectMeta?.createdAt ?? new Date().toISOString();
    const expiresDate = addDays(createdDate, 30);
    const subtotal = pricingSummary?.totals.subtotal ?? 0;
    const taxAmount = pricingSummary?.totals.tax ?? 0;
    const total = pricingSummary?.totals.total ?? subtotal + taxAmount;
    const taxRate = resolveTaxRate(subtotal, taxAmount);

    const lineItems: QuoteLineItemViewModel[] =
      pricingSummary?.lines.map((line, index) => {
        const totalAfterDiscount = Number.isFinite(line.lineTotal) ? line.lineTotal : 0;
        const unitPrice = Number.isFinite(line.unitPrice) ? line.unitPrice : 0;
        const quantity = Number.isFinite(line.qty) ? line.qty : 0;
        const discountPercent = 0;
        return {
          id: `${line.sku}-${index}`,
          title: line.sku,
          longDescriptionBlocks: [
            {
              type: "text",
              text: `Unit of measure: ${line.uom || "-"}`,
            },
          ],
          quantity,
          unitPriceExDiscount: unitPrice,
          discountPercent,
          totalAfterDiscount,
          gstAmount: totalAfterDiscount * taxRate,
          displayNotes: line.warning ? [line.warning] : [],
        };
      }) ?? [];

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

    return {
      quoteMeta: {
        customerName: projectMeta?.name ?? "",
        customerEmail: "",
        referenceId: projectId ?? "",
        createdDate,
        expiresDate,
        createdByName: buildDisplayName(user?.email),
        createdByEmail: user?.email ?? "",
        createdByPhone: "",
      },
      comments: {
        salesTeamComments: warnings.length ? warnings.join("\n") : "",
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
  }, [pricingSummary, projectMeta, projectId, warnings, user?.email]);
};
