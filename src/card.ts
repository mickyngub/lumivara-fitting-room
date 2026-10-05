import type { DrawdyElementSchema } from "@drawdy/driver-protocol";
import { FRAME_GRID } from "./art/frames";
import { DRAWDY_SYMBOL } from "./brand-icons";
import type { CardPayload } from "./messages";

export const FRAME = {
  w: FRAME_GRID.picture.w * FRAME_GRID.scale,
  h: FRAME_GRID.picture.h * FRAME_GRID.scale,
};
export const CARD = {
  w: FRAME_GRID.w * FRAME_GRID.scale,
  h: FRAME_GRID.h * FRAME_GRID.scale,
  gap: 32,
  pad: FRAME_GRID.picture.x * FRAME_GRID.scale,
};
// A frame overlay is drawn on a 4x grid and has rounded pixel corners; the
// plate sits one grid pixel inside it so it never shows past them.
export const PLATE = { inset: 4, radius: 12 };
// The Drawdy symbol sits in the picture's bottom-right corner, as far from the
// right edge as from the bottom.
const LOGO_INSET = 12;
export const LOGO = {
  x: FRAME.w - LOGO_INSET - DRAWDY_SYMBOL.w,
  y: FRAME.h - LOGO_INSET - DRAWDY_SYMBOL.h,
  w: DRAWDY_SYMBOL.w,
  h: DRAWDY_SYMBOL.h,
};

/**
 * Each card is one board element showing the card's animated image, so the
 * board can only select, move or copy it whole, and the browser plays all its
 * frames on one clock.
 */
export function buildCards(
  cards: CardPayload[],
  origin: { x: number; y: number },
  generateId: () => string,
): DrawdyElementSchema[] {
  return cards.map((card, index) => ({
    type: "component",
    drawdyElementId: generateId(),
    x: origin.x + index * (CARD.w + CARD.gap),
    y: origin.y,
    width: CARD.w,
    height: CARD.h,
    schema: {
      type: "image",
      child: card.image,
      styles: { width: [100, "%"], height: [100, "%"], pointerEvents: "none" },
    },
  }));
}
