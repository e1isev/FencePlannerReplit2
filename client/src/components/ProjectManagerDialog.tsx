import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useProjectStore } from "@/store/projectStore";

type ProjectManagerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export const ProjectManagerDialog = ({ open, onOpenChange }: ProjectManagerDialogProps) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const {
    projectList,
    revisionHistory,
    projectId,
    projectMeta,
    warnings,
    pricingSummary,
    fetchProjectList,
    fetchRevisionHistory,
    loadProject,
    importSnapshot,
    exportSnapshot,
    clearCacheAndReload,
    setProjectName,
  } = useProjectStore();

  const handleOpen = async (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (nextOpen) {
      await fetchProjectList();
      if (projectId) {
        await fetchRevisionHistory(projectId);
      }
    }
  };

  const handleImport = async (file: File | null) => {
    if (!file) return;
    setImportError(null);
    try {
      const text = await file.text();
      await importSnapshot(text);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Unable to import project.");
    }
  };

  const handleExport = () => {
    const data = exportSnapshot();
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${projectMeta?.name ?? "deck-project"}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Projects & History</DialogTitle>
        </DialogHeader>
        <div className="grid gap-6 md:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="project-name">Project name</Label>
              <Input
                id="project-name"
                value={projectMeta?.name ?? ""}
                onChange={(event) => setProjectName(event.target.value)}
                placeholder="Untitled deck"
              />
            </div>
            <div className="rounded-lg border border-slate-200 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">My Projects</p>
                <Button variant="outline" size="sm" onClick={fetchProjectList}>
                  Refresh
                </Button>
              </div>
              <ScrollArea className="h-40 pr-2">
                <div className="space-y-2">
                  {projectList.length === 0 && (
                    <p className="text-xs text-slate-500">No saved projects yet.</p>
                  )}
                  {projectList.map((project) => (
                    <div
                      key={project.projectId}
                      className="flex items-center justify-between rounded-md border border-slate-100 p-2 text-xs"
                    >
                      <div>
                        <p className="font-semibold text-slate-700">{project.name}</p>
                        <p className="text-[11px] text-slate-500">
                          Updated {new Date(project.updatedAt).toLocaleString()}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadProject(project.projectId)}
                      >
                        Open
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">Revision history</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => projectId && fetchRevisionHistory(projectId)}
                  disabled={!projectId}
                >
                  Refresh
                </Button>
              </div>
              <ScrollArea className="h-36 pr-2">
                <div className="space-y-2">
                  {revisionHistory.length === 0 && (
                    <p className="text-xs text-slate-500">No revisions yet.</p>
                  )}
                  {revisionHistory.map((revision) => (
                    <div
                      key={revision.revisionId}
                      className="flex items-center justify-between rounded-md border border-slate-100 p-2 text-xs"
                    >
                      <div>
                        <p className="font-semibold text-slate-700">{revision.label ?? "Revision"}</p>
                        <p className="text-[11px] text-slate-500">
                          {new Date(revision.savedAt).toLocaleString()}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => projectId && loadProject(projectId, revision.revisionId)}
                        disabled={!projectId}
                      >
                        Load
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 p-3 space-y-2">
              <p className="text-sm font-semibold text-slate-700">Import / Export</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={handleExport}>
                  Export JSON
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Import JSON
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={(event) => handleImport(event.target.files?.[0] ?? null)}
                />
              </div>
              {importError && <p className="text-xs text-red-500">{importError}</p>}
            </div>

            <div className="rounded-lg border border-slate-200 p-3 space-y-2">
              <p className="text-sm font-semibold text-slate-700">Pricing warnings</p>
              {warnings.length === 0 && (
                <p className="text-xs text-slate-500">No pricing warnings.</p>
              )}
              {warnings.map((warning, index) => (
                <p key={`${warning}-${index}`} className="text-xs text-amber-600">
                  {warning}
                </p>
              ))}
              {pricingSummary && (
                <p className="text-xs text-slate-600">
                  Total {pricingSummary.totals.currency} {pricingSummary.totals.total.toFixed(2)}
                </p>
              )}
            </div>

            <div className="rounded-lg border border-slate-200 p-3 space-y-2">
              <p className="text-sm font-semibold text-slate-700">Support tools</p>
              <Button variant="outline" size="sm" onClick={clearCacheAndReload}>
                Clear cache and reload
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
