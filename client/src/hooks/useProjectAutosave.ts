import { useEffect, useRef } from "react";
import { useDeckingStore } from "@/store/deckingStore";
import { useAppStore } from "@/store/appStore";
import { useProjectSessionStore } from "@/store/projectSessionStore";
import { serializePlannerSnapshot } from "@/lib/plannerSnapshot";

const AUTOSAVE_DEBOUNCE_MS = 2500;

export const useProjectAutosave = () => {
  const saveProject = useProjectSessionStore((state) => state.saveProject);
  const refreshDependencies = useProjectSessionStore((state) => state.refreshDependencies);
  const dependencies = useProjectSessionStore((state) => state.dependencies);
  const projectType = useProjectSessionStore((state) => state.projectType);
  const projectName = useProjectSessionStore((state) => state.projectName);

  const fencingState = useAppStore((state) => ({
    productKind: state.productKind,
    fenceStyleId: state.fenceStyleId,
    fenceCategoryId: state.fenceCategoryId,
    fenceHeightM: state.fenceHeightM,
    fenceColorId: state.fenceColorId,
    selectedGateType: state.selectedGateType,
    drawingMode: state.drawingMode,
    mmPerPixel: state.mmPerPixel,
    selectedLineId: state.selectedLineId,
    lines: state.lines,
    gates: state.gates,
    panels: state.panels,
    posts: state.posts,
    leftovers: state.leftovers,
    warnings: state.warnings,
    panelPositionsMap: state.panelPositionsMap,
  }));

  const deckingState = useDeckingStore((state) => ({
    decks: state.decks,
    activeDeckId: state.activeDeckId,
    joistSpacingMode: state.joistSpacingMode,
    showClips: state.showClips,
    selectedDeckId: state.selectedDeckId,
    selectedBreakerId: state.selectedBreakerId,
    editingBreakerId: state.editingBreakerId,
  }));

  const timerRef = useRef<number | null>(null);
  const lastSnapshotRef = useRef<string | null>(null);

  useEffect(() => {
    void refreshDependencies();
  }, [refreshDependencies]);

  useEffect(() => {
    if (!projectType) return;
    const snapshot = serializePlannerSnapshot(projectType, projectName, dependencies);
    const snapshotText = JSON.stringify(snapshot);
    if (snapshotText === lastSnapshotRef.current) return;

    lastSnapshotRef.current = snapshotText;
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      void saveProject();
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [
    projectType,
    projectName,
    dependencies,
    fencingState,
    deckingState,
    saveProject,
  ]);
};
