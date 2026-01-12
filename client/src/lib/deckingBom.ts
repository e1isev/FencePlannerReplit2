import type { ProjectExportPreview } from "@shared/project";
import type { DeckEntity } from "@/types/decking";
import { useDeckingStore } from "@/store/deckingStore";

export type BomLine = {
  sku: string;
  qty: number;
  uom: string;
  attributes?: Record<string, unknown>;
};

const toMetres = (mm: number) => Math.round((mm / 1000) * 100) / 100;

const skuForDecking = (deck: DeckEntity, suffix: string) =>
  `DECK-${deck.selectedColor.toUpperCase().replace(/[^A-Z0-9]+/g, "-")}-${suffix}`;

export const buildDeckingBomLines = (): BomLine[] => {
  const store = useDeckingStore.getState();
  const lines: BomLine[] = [];

  store.decks.forEach((deck) => {
    const cutting = store.getCuttingListForDeck(deck.id);
    if (cutting.totalBoardLength > 0) {
      lines.push({
        sku: skuForDecking(deck, "FIELD-BOARDS"),
        qty: toMetres(cutting.totalBoardLength),
        uom: "m",
        attributes: { deckId: deck.id, finish: "field" },
      });
    }

    if (cutting.totalFasciaLength > 0) {
      lines.push({
        sku: skuForDecking(deck, "FASCIA"),
        qty: toMetres(cutting.totalFasciaLength),
        uom: "m",
        attributes: { deckId: deck.id, finish: "fascia" },
      });
    }

    if (cutting.pictureFrame.length > 0) {
      const totalPictureFrame = cutting.pictureFrame.reduce(
        (sum, item) => sum + item.length * item.count,
        0
      );
      lines.push({
        sku: skuForDecking(deck, "PICTURE-FRAME"),
        qty: toMetres(totalPictureFrame),
        uom: "m",
        attributes: { deckId: deck.id, finish: "picture-frame" },
      });
    }

    if (cutting.clips > 0) {
      lines.push({
        sku: "DECK-CLIP-STD",
        qty: cutting.clips,
        uom: "ea",
        attributes: { deckId: deck.id, kind: "deck" },
      });
    }

    if (cutting.starterClips > 0) {
      lines.push({
        sku: "DECK-CLIP-STARTER",
        qty: cutting.starterClips,
        uom: "ea",
        attributes: { deckId: deck.id, kind: "starter" },
      });
    }

    if (cutting.fasciaClips > 0) {
      lines.push({
        sku: "DECK-CLIP-FASCIA",
        qty: cutting.fasciaClips,
        uom: "ea",
        attributes: { deckId: deck.id, kind: "fascia" },
      });
    }
  });

  return lines;
};

export const buildBomPreview = (): ProjectExportPreview => ({
  bomLines: buildDeckingBomLines(),
});
