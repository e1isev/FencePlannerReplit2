import { useEffect, useRef } from "react";
import { useDeckingStore } from "@/store/deckingStore";
import { useProjectStore } from "@/store/projectStore";
import { stringifySnapshot, serializeProject } from "@/lib/projectSnapshot";
import { buildDeckingBomLines } from "@/lib/deckingBom";

const AUTOSAVE_DEBOUNCE_MS = 2500;

export const useProjectAutosave = () => {
  const saveCurrentProject = useProjectStore((state) => state.saveCurrentProject);
  const fetchDependencies = useProjectStore((state) => state.fetchDependencies);
  const dependencies = useProjectStore((state) => state.dependencies);
  const projectMeta = useProjectStore((state) => state.projectMeta);
  const projectId = useProjectStore((state) => state.projectId);
  const revisionId = useProjectStore((state) => state.revisionId);

  const timerRef = useRef<number | null>(null);
  const lastSnapshotRef = useRef<string | null>(null);

  useEffect(() => {
    void fetchDependencies();
  }, [fetchDependencies]);

  useEffect(() => {
    const unsubscribe = useDeckingStore.subscribe((state) => {
      const meta = projectMeta ?? {
        name: "Untitled deck",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const bomLines = buildDeckingBomLines();
      const snapshot = serializeProject({
        meta,
        dependencies,
        projectId: projectId ?? undefined,
        revisionId: revisionId ?? undefined,
        state: {
          decks: state.decks.map((deck) => ({
            id: deck.id,
            name: deck.name,
            polygon: JSON.parse(JSON.stringify(deck.polygon)),
            selectedColor: deck.selectedColor,
            boardDirection: deck.boardDirection,
            finishes: JSON.parse(JSON.stringify(deck.finishes)),
            pictureFrameBoardWidthMm: deck.pictureFrameBoardWidthMm,
            pictureFrameGapMm: deck.pictureFrameGapMm,
            fasciaThicknessMm: deck.fasciaThicknessMm,
            edgeConstraints: JSON.parse(JSON.stringify(deck.edgeConstraints ?? {})),
            baselineEdgeIndex: deck.baselineEdgeIndex ?? null,
            breakerLines: JSON.parse(JSON.stringify(deck.breakerLines ?? [])),
            joistSpacingMode: deck.joistSpacingMode ?? state.joistSpacingMode,
          })),
          activeDeckId: state.activeDeckId,
          joistSpacingMode: state.joistSpacingMode,
          showClips: state.showClips,
          uiState: {
            selectedDeckId: state.selectedDeckId ?? null,
            selectedBreakerId: state.selectedBreakerId ?? null,
            editingBreakerId: state.editingBreakerId ?? null,
          },
        },
        exports: bomLines.length ? { bomLines } : undefined,
      });
      const snapshotText = stringifySnapshot(snapshot);
      if (snapshotText === lastSnapshotRef.current) return;

      lastSnapshotRef.current = snapshotText;
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        void saveCurrentProject();
      }, AUTOSAVE_DEBOUNCE_MS);
    });

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
      unsubscribe();
    };
  }, [dependencies, projectId, projectMeta, revisionId, saveCurrentProject]);

  useEffect(() => {
    const handleOnline = () => {
      void useProjectStore.getState().retryPendingSave();
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, []);
};
