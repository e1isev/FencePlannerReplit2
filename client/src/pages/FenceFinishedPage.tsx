import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { QuoteDocument } from "@/components/QuoteDocument";
import { CanvasStage } from "@/components/CanvasStage";
import { useFenceQuoteViewModel } from "@/hooks/useFenceQuoteViewModel";
import "@/styles/quotePrint.css";

export default function FenceFinishedPage() {
  const [, setLocation] = useLocation();
  const viewModel = useFenceQuoteViewModel();
  const [isCopied, setIsCopied] = useState(false);

  const handleCopyLink = async () => {
    if (!navigator?.clipboard) return;
    await navigator.clipboard.writeText(window.location.href);
    setIsCopied(true);
    window.setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 print:bg-white">
      <div className="no-print sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 py-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wide text-slate-500">Get a Quote</div>
            <div className="text-lg font-semibold text-slate-900">Fence quote</div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={() => setLocation("/planner")}>Back to planner</Button>
            <Button variant="outline" onClick={handleCopyLink} disabled={isCopied}>
              {isCopied ? "Link copied" : "Copy link"}
            </Button>
            <Button onClick={() => window.print()}>Print</Button>
          </div>
        </div>
      </div>

      <main className="quote-page max-w-6xl mx-auto px-4 md:px-6 py-8">
        <QuoteDocument
          viewModel={viewModel}
          hidePricing
          headerAddon={
            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200">
                <p className="text-sm font-semibold text-slate-900">Fence layout</p>
                <p className="text-xs text-slate-500">Satellite map underlay with fence footprint.</p>
              </div>
              <div className="h-72 md:h-96 flex">
                <CanvasStage readOnly initialMapMode="satellite" />
              </div>
            </section>
          }
        />
      </main>
    </div>
  );
}
