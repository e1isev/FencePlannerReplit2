import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProjectType } from "@shared/projectSnapshot";

const PROJECT_TYPES: Array<{
  type: ProjectType;
  label: string;
  description: string;
  available: boolean;
}> = [
  {
    type: "decking",
    label: "Decking",
    description: "Plan decking layouts with boards and joists.",
    available: true,
  },
  {
    type: "residential_fencing",
    label: "Residential fencing",
    description: "Full residential fence design workflow.",
    available: true,
  },
  {
    type: "rural_fencing",
    label: "Rural fencing",
    description: "Rural fence styles without residential options.",
    available: true,
  },
  {
    type: "titan_rail",
    label: "Titan Rail",
    description: "Coming soon for rail planning.",
    available: false,
  },
];

const defaultProjectName = () =>
  `Untitled project ${new Date().toLocaleString()}`;

export default function NewProjectWizard() {
  const [location, setLocation] = useLocation();
  const [selectedType, setSelectedType] = useState<ProjectType>("residential_fencing");
  const [projectName, setProjectName] = useState(defaultProjectName());

  useEffect(() => {
    const query = new URLSearchParams(location.split("?")[1] ?? "");
    const name = query.get("name");
    if (name) {
      setProjectName(decodeURIComponent(name));
    }
  }, [location]);

  const chosenType = useMemo(
    () => PROJECT_TYPES.find((item) => item.type === selectedType),
    [selectedType]
  );

  const handleContinue = () => {
    if (selectedType === "titan_rail") {
      setLocation("/coming-soon/titan-rail");
      return;
    }

    const encodedName = encodeURIComponent(projectName.trim() || "Untitled project");
    if (selectedType === "decking") {
      setLocation(`/decking/new?name=${encodedName}`);
      return;
    }
    if (selectedType === "residential_fencing" || selectedType === "rural_fencing") {
      const category = selectedType === "rural_fencing" ? "rural" : "residential";
      setLocation(`/styles/${category}?name=${encodedName}`);
      return;
    }
    setLocation(`/planner/new?type=${selectedType}&name=${encodedName}`);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Create a new project
          </h1>
          <p className="text-sm text-slate-600">
            Choose a project type and give it a name.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {PROJECT_TYPES.map((option) => (
            <button
              key={option.type}
              type="button"
              onClick={() => setSelectedType(option.type)}
              className={`rounded-2xl border p-4 text-left transition ${
                selectedType === option.type
                  ? "border-primary bg-primary/5"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-900">{option.label}</h3>
                {!option.available && (
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">
                    Coming soon
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-600 mt-2">{option.description}</p>
            </button>
          ))}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
          <div>
            <p className="text-sm text-slate-600">Project name</p>
            <Input
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              placeholder="Untitled project"
            />
          </div>
          {chosenType && !chosenType.available && (
            <p className="text-sm text-amber-600">
              {chosenType.label} planning is coming soon.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={handleContinue} data-testid="button-new-project-continue">
            Continue
          </Button>
          <Button variant="outline" onClick={() => setLocation("/projects")}>
            Back to projects
          </Button>
        </div>
      </div>
    </div>
  );
}
