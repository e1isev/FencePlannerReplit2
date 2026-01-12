import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useAuthStore } from "@/store/authStore";

export default function StartPage() {
  const [, setLocation] = useLocation();
  const user = useAuthStore((state) => state.user);
  const loading = useAuthStore((state) => state.loading);

  useEffect(() => {
    if (user) {
      setLocation("/projects");
    }
  }, [user, setLocation]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-8 space-y-6">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-500 mb-2">
            Fence Planner
          </p>
          <h1 className="text-2xl font-semibold text-slate-900">
            Start your next project
          </h1>
          <p className="text-sm text-slate-600 mt-2">
            Create a new plan or sign in to manage saved projects.
          </p>
        </div>
        <div className="grid gap-3">
          <Button
            size="lg"
            onClick={() => setLocation("/new")}
            data-testid="button-start-new-project"
          >
            Create new project
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => setLocation("/login")}
            disabled={loading}
            data-testid="button-start-login"
          >
            Log in
          </Button>
        </div>
        <div className="text-xs text-slate-500">
          Continue as a guest and save locally, or log in to sync across devices.
        </div>
      </div>
    </div>
  );
}
