import { useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/appStore";
import { useProjectSessionStore } from "@/store/projectSessionStore";
import type { FenceCategoryId } from "@/types/models";
import { getStylesByCategory } from "@/data/fenceStyles";

const isFenceCategory = (value: string | undefined): value is FenceCategoryId =>
  value === "residential" || value === "rural";

const defaultProjectName = () =>
  `Untitled project ${new Date().toLocaleString()}`;

export default function StylesPage({ params }: { params: { category?: string } }) {
  const [location, setLocation] = useLocation();
  const fenceStyleId = useAppStore((state) => state.fenceStyleId);
  const fenceCategoryId = useAppStore((state) => state.fenceCategoryId);
  const setFenceCategory = useAppStore((state) => state.setFenceCategory);
  const setFenceStyle = useAppStore((state) => state.setFenceStyle);
  const setSessionIntent = useProjectSessionStore((state) => state.setSessionIntent);

  const query = useMemo(
    () => new URLSearchParams(location.split("?")[1] ?? ""),
    [location]
  );
  const projectName = query.get("name");
  const categoryParam = params.category;
  const category = isFenceCategory(categoryParam) ? categoryParam : null;

  useEffect(() => {
    if (!category) {
      setLocation("/styles/residential");
      return;
    }
    if (category !== fenceCategoryId) {
      setFenceCategory(category);
    }
  }, [category, fenceCategoryId, setFenceCategory, setLocation]);

  const styles = getStylesByCategory(category ?? "residential");
  const titleCategory = (category ?? "residential").toLowerCase();
  const resolvedName = projectName ? decodeURIComponent(projectName) : defaultProjectName();
  const encodedName = encodeURIComponent(resolvedName);

  const handleContinue = () => {
    if (!category) return;
    const projectType = category === "rural" ? "rural" : "residential";
    setSessionIntent("new");
    setLocation(`/planner/new?projectType=${projectType}&name=${encodedName}`);
  };

  const handleBack = () => {
    setLocation(`/new?name=${encodedName}`);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-slate-900">
            Choose your {titleCategory} fence style
          </h1>
          <p className="text-sm text-slate-600">
            Select a {titleCategory} style to start planning {resolvedName}.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {styles.map((style) => (
            <button
              key={style.id}
              type="button"
              onClick={() => setFenceStyle(style.id)}
              className={`flex h-full flex-col gap-3 rounded-2xl border p-4 text-left transition ${
                fenceStyleId === style.id
                  ? "border-primary bg-primary/5"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
              data-testid={`card-style-${style.id}`}
            >
              <div className="flex h-24 items-center justify-center rounded-lg bg-slate-50">
                <img
                  src={style.image}
                  alt={style.name}
                  className="h-full w-full object-contain"
                  loading="lazy"
                />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">{style.name}</p>
                <p className="text-xs text-slate-500">
                  Heights: {style.availableHeights.join(", ")}m
                </p>
              </div>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={handleContinue} data-testid="button-styles-continue">
            Continue
          </Button>
          <Button variant="outline" onClick={handleBack}>
            Back
          </Button>
        </div>
      </div>
    </div>
  );
}
