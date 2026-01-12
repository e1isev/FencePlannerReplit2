import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function TitanRailComingSoonPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center space-y-4">
        <p className="text-xs uppercase tracking-wide text-slate-500">Titan Rail</p>
        <h1 className="text-2xl font-semibold text-slate-900">Coming soon</h1>
        <p className="text-sm text-slate-600">
          Titan Rail planning isn’t available yet. We’re working on it.
        </p>
        <Button onClick={() => setLocation("/new")}>Return to project selection</Button>
      </div>
    </div>
  );
}
