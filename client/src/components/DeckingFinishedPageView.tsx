import { Button } from "@/components/ui/button";
import { QuoteDocument } from "@/components/QuoteDocument";
import { useQuoteViewModel } from "@/hooks/useQuoteViewModel";
import { useLocation } from "wouter";
import { useState } from "react";
import "@/styles/quotePrint.css";

export function DeckingFinishedPageView() {
  const [, setLocation] = useLocation();
  const viewModel = useQuoteViewModel();
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
            <div className="text-lg font-semibold text-slate-900">Finished page</div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={() => setLocation("/decking")}>Back to planner</Button>
            <Button variant="outline" onClick={handleCopyLink} disabled={isCopied}>
              {isCopied ? "Link copied" : "Copy link"}
            </Button>
            <Button onClick={() => window.print()}>Print</Button>
          </div>
        </div>
      </div>

      <main className="quote-page max-w-6xl mx-auto px-4 md:px-6 py-8">
        <QuoteDocument viewModel={viewModel} />
      </main>
    </div>
  );
}
