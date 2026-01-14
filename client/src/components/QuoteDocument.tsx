import { Fragment } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { formatAUD } from "@/lib/formatters";
import type { QuoteDescriptionBlock, QuoteLineItemViewModel, QuoteViewModel } from "@/hooks/useQuoteViewModel";

const formatDate = (isoDate: string) => {
  if (!isoDate) return "";
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const renderBlocks = (blocks: QuoteDescriptionBlock[]) =>
  blocks.map((block, index) => {
    if (block.type === "bullets") {
      return (
        <ul key={index} className="list-disc pl-5 text-sm text-slate-600 space-y-1">
          {block.bullets.map((bullet, bulletIndex) => (
            <li key={bulletIndex} className="leading-relaxed">
              {bullet}
            </li>
          ))}
        </ul>
      );
    }
    return (
      <p key={index} className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">
        {block.text}
      </p>
    );
  });

const renderValue = (value: string) => value || "—";

type QuoteDocumentProps = {
  viewModel: QuoteViewModel;
  hidePricing?: boolean;
};

export function QuoteDocument({ viewModel, hidePricing = false }: QuoteDocumentProps) {
  const { quoteMeta, comments, lineItems, totals, delivery, paymentSchedule, companyFooter } = viewModel;
  const showPricing = !hidePricing;

  return (
    <section className="quote-document bg-white border border-slate-200 shadow-sm rounded-2xl p-6 md:p-10 space-y-10">
      <header className="quote-section">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Quote</p>
            <h1 className="text-3xl font-semibold text-slate-900 mt-2">Products & Services Quote</h1>
          </div>
          <div className="text-sm text-slate-600 space-y-1 text-right">
            <p className="font-semibold text-slate-900">Reference</p>
            <p>{renderValue(quoteMeta.referenceId)}</p>
            <p className="pt-2 text-xs uppercase tracking-wide text-slate-500">Created</p>
            <p>{renderValue(formatDate(quoteMeta.createdDate))}</p>
            <p className="pt-2 text-xs uppercase tracking-wide text-slate-500">Expires</p>
            <p>{renderValue(formatDate(quoteMeta.expiresDate))}</p>
          </div>
        </div>

        <Separator className="my-6" />

        <div className="grid gap-6 md:grid-cols-2 text-sm text-slate-700">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-slate-500">Customer</p>
            <p className="text-lg font-semibold text-slate-900">{renderValue(quoteMeta.customerName)}</p>
            <p>{renderValue(quoteMeta.customerEmail)}</p>
          </div>
          <div className="space-y-2 md:text-right">
            <p className="text-xs uppercase tracking-wide text-slate-500">Sales contact</p>
            <p className="text-lg font-semibold text-slate-900">{renderValue(quoteMeta.createdByName)}</p>
            <p>{renderValue(quoteMeta.createdByEmail)}</p>
            <p>{renderValue(quoteMeta.createdByPhone)}</p>
          </div>
        </div>
      </header>

      <section className="quote-section space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Comments from Sales Team</h2>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 whitespace-pre-line min-h-[80px]">
          {comments.salesTeamComments || "No comments added."}
        </div>
      </section>

      <section className="quote-section space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Products and Services</h2>
        </div>
        <div className="rounded-lg border border-slate-200 overflow-hidden">
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="w-[55%]">Description</TableHead>
                <TableHead className="w-[15%] text-right">Quantity</TableHead>
                {showPricing && <TableHead className="w-[15%] text-right">Unit Price</TableHead>}
                {showPricing && <TableHead className="w-[15%] text-right">Total</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={showPricing ? 4 : 2} className="text-center text-sm text-slate-500">
                    No line items available.
                  </TableCell>
                </TableRow>
              ) : (
                lineItems.map((item) => (
                  <TableRow key={item.id} className="align-top">
                    <TableCell>
                      <div className="space-y-2">
                        <p className="font-semibold text-slate-900">{item.title}</p>
                        {renderBlocks(item.longDescriptionBlocks)}
                        {item.displayNotes.length > 0 && (
                          <ul className="list-disc pl-5 text-sm text-amber-700 space-y-1">
                            {item.displayNotes.map((note, noteIndex) => (
                              <li key={noteIndex}>{note}</li>
                            ))}
                          </ul>
                        )}
                        {showPricing && (
                          <div className="text-xs text-slate-500 space-y-1">
                            <p>after {item.discountPercent}% discount</p>
                            <p>+{formatAUD(item.gstAmount)} GST on Income</p>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-slate-700">{item.quantity}</TableCell>
                    {showPricing && (
                      <TableCell className="text-right text-slate-700">
                        {formatAUD(item.unitPriceExDiscount)}
                      </TableCell>
                    )}
                    {showPricing && (
                      <TableCell className="text-right font-semibold text-slate-900">
                        {formatAUD(item.totalAfterDiscount)}
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className={`quote-section grid gap-6 ${showPricing ? "md:grid-cols-2" : ""}`}>
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">Delivery</h2>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 space-y-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Deliver to</p>
              <p className="font-medium text-slate-900">{renderValue(delivery.deliveryAddress)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Freight method</p>
              <p className="font-medium text-slate-900">{renderValue(delivery.freightMethod)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Delivery terms</p>
              <ul className="list-disc pl-5 text-sm text-slate-700 space-y-1">
                {delivery.deliveryTerms.map((term, index) => (
                  <li key={index}>{term}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {showPricing && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-900">Totals</h2>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 space-y-3">
              <div className="flex items-center justify-between">
                <span>Subtotal</span>
                <span className="font-semibold text-slate-900">
                  {formatAUD(totals.subtotalAfterDiscount)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Tax (10%)</span>
                <span className="font-semibold text-slate-900">
                  {formatAUD(totals.taxAmount)}
                </span>
              </div>
              <Separator />
              <div className="flex items-center justify-between text-base font-semibold text-slate-900">
                <span>Total</span>
                <span>{formatAUD(totals.total)}</span>
              </div>
              <p className="text-xs text-slate-500">
                after {formatAUD(totals.discountAmount)} discount
              </p>
            </div>
          </div>
        )}
      </section>

      {showPricing && (
        <section className="quote-section space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Payment Schedule</h2>
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Name</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paymentSchedule.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-sm text-slate-500">
                      No payment schedule available.
                    </TableCell>
                  </TableRow>
                ) : (
                  paymentSchedule.map((payment, index) => (
                    <TableRow key={`${payment.name}-${index}`}>
                      <TableCell className="font-medium text-slate-900">
                        {payment.name}
                        {payment.isDueNow && (
                          <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                            Due now
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{payment.due}</TableCell>
                      <TableCell className="text-right">{formatAUD(payment.amount)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      <footer className="quote-section grid gap-6 md:grid-cols-2 text-sm text-slate-700">
        <div className="rounded-lg border border-slate-200 p-4 space-y-2">
          <p className="text-xs uppercase tracking-wide text-slate-500">Questions?</p>
          <p className="text-lg font-semibold text-slate-900">Contact me</p>
          <p>{renderValue(quoteMeta.createdByName)}</p>
          <p>{renderValue(quoteMeta.createdByEmail)}</p>
          <p>{renderValue(quoteMeta.createdByPhone)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 p-4 space-y-2">
          <p className="text-xs uppercase tracking-wide text-slate-500">{companyFooter.companyName}</p>
          {companyFooter.companyAddressLines.map((line, index) => (
            <Fragment key={`${line}-${index}`}>
              <p>{line}</p>
            </Fragment>
          ))}
          <p>{companyFooter.abn}</p>
        </div>
      </footer>
    </section>
  );
}
