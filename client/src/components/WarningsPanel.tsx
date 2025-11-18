import { useAppStore } from "@/store/appStore";
import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";

export function WarningsPanel() {
  const warnings = useAppStore((state) => state.warnings);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const state = useAppStore.getState();
      const filtered = state.warnings.filter(
        (w) => now - w.timestamp < 15000
      );
      if (filtered.length !== state.warnings.length) {
        useAppStore.setState({ warnings: filtered });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  if (warnings.length === 0) return null;

  return (
    <div
      className="fixed bottom-6 right-6 w-96 bg-amber-50 border-l-4 border-amber-500 rounded-lg shadow-xl p-4"
      data-testid="panel-warnings"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-600" />
          <h3 className="font-semibold text-amber-900">Warnings</h3>
        </div>
      </div>
      <div className="space-y-2">
        {warnings.map((warning) => (
          <div
            key={warning.id}
            className="text-sm text-amber-800 flex items-start gap-2"
            data-testid={`warning-${warning.id}`}
          >
            <span className="mt-0.5">•</span>
            <span>{warning.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
