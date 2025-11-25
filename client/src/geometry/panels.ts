import { PanelSegment, Leftover } from "@/types/models";
import { generateId } from "@/lib/ids";

const PANEL_LENGTH_MM = 2390;
const CUT_BUFFER_MM = 300;
const MIN_LEFTOVER_MM = 300;

export interface PanelFitResult {
  segments: PanelSegment[];
  panelPositions: number[];
  newLeftovers: Leftover[];
  warnings: string[];
}

const EPSILON_MM = 0.5;

export function fitPanels(
  runId: string,
  length_mm: number,
  evenSpacing: boolean,
  existingLeftovers: Leftover[]
): PanelFitResult {
  const segments: PanelSegment[] = [];
  const panelPositions: number[] = [];
  const newLeftovers: Leftover[] = [];
  const warnings: string[] = [];
  
  const numPanels = Math.floor(length_mm / PANEL_LENGTH_MM);
  let remainder = length_mm % PANEL_LENGTH_MM;

  if (remainder < EPSILON_MM) {
    remainder = 0;
  }

  if (evenSpacing) {
    const panelCount = Math.max(1, Math.ceil(length_mm / PANEL_LENGTH_MM));
    const spacing = length_mm / panelCount;

    for (let i = 0; i < panelCount; i++) {
      const actualLength = spacing;
      const requiresCut = spacing < PANEL_LENGTH_MM;

      let materialLength = PANEL_LENGTH_MM;
      let usedLeftover: string | undefined;

      if (requiresCut) {
        const leftover = findLeftoverForCut(actualLength, existingLeftovers);
        if (leftover) {
          usedLeftover = leftover.id;
          materialLength = leftover.length_mm;
          leftover.consumed = true;
          const newLeftoverLength = leftover.length_mm - actualLength - CUT_BUFFER_MM;
          if (newLeftoverLength >= MIN_LEFTOVER_MM) {
            newLeftovers.push({
              id: generateId("leftover"),
              length_mm: newLeftoverLength,
              consumed: false,
            });
          }
        } else {
          const newLeftoverLength = PANEL_LENGTH_MM - actualLength - CUT_BUFFER_MM;
          if (newLeftoverLength >= MIN_LEFTOVER_MM) {
            newLeftovers.push({
              id: generateId("leftover"),
              length_mm: newLeftoverLength,
              consumed: false,
            });
          }
        }
      }

      segments.push({
        id: generateId("seg"),
        runId,
        start_mm: i * spacing,
        end_mm: (i + 1) * spacing,
        length_mm: actualLength,
        uses_leftover_id: usedLeftover,
      });

      if (i > 0) {
        panelPositions.push(i * spacing);
      }
    }
  } else {
    for (let i = 0; i < numPanels; i++) {
      segments.push({
        id: generateId("seg"),
        runId,
        start_mm: i * PANEL_LENGTH_MM,
        end_mm: (i + 1) * PANEL_LENGTH_MM,
        length_mm: PANEL_LENGTH_MM,
      });
      if (i > 0) {
        panelPositions.push(i * PANEL_LENGTH_MM);
      }
    }
    
    if (remainder > 0) {
      if (remainder < MIN_LEFTOVER_MM) {
        warnings.push(
          `Short segment (${(remainder / 1000).toFixed(2)}m) detected. Consider enabling even spacing or extending the run.`
        );
      }
      
const leftover = findLeftoverForCut(remainder, existingLeftovers);
      
      segments.push({
        id: generateId("seg"),
        runId,
        start_mm: numPanels * PANEL_LENGTH_MM,
        end_mm: length_mm,
        length_mm: remainder,
        uses_leftover_id: leftover?.id,
        is_remainder: true,
      });
      
      if (leftover) {
        leftover.consumed = true;
        const newLeftoverLength = leftover.length_mm - remainder - CUT_BUFFER_MM;
        if (newLeftoverLength >= MIN_LEFTOVER_MM) {
          newLeftovers.push({
            id: generateId("leftover"),
            length_mm: newLeftoverLength,
            consumed: false,
          });
        }
      } else {
        const newLeftoverLength = PANEL_LENGTH_MM - remainder - CUT_BUFFER_MM;
        if (newLeftoverLength >= MIN_LEFTOVER_MM) {
          newLeftovers.push({
            id: generateId("leftover"),
            length_mm: newLeftoverLength,
            consumed: false,
          });
        }
      }
    }
  }
  
  return { segments, panelPositions, newLeftovers, warnings };
}

function findLeftoverForCut(
  requiredLength: number,
  leftovers: Leftover[]
): Leftover | undefined {
  const available = leftovers
    .filter((l) => !l.consumed)
    .sort((a, b) => b.length_mm - a.length_mm);
  
  for (const leftover of available) {
    if (leftover.length_mm >= requiredLength + CUT_BUFFER_MM) {
      return leftover;
    }
  }
  
  return undefined;
}

export function countUniquePanels(segments: PanelSegment[]): number {
  const lengths = new Set(
    segments.map((seg) => Math.round(seg.length_mm / 100) * 100)
  );
  return segments.filter(
    (seg) => !seg.uses_leftover_id || seg.length_mm > PANEL_LENGTH_MM
  ).length;
}
