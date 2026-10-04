import type {
  DrawdyElementSchema,
  LocalAnimation,
} from "@drawdy/driver-protocol";
import { FRAME_GRID } from "./art/frames";
import { DRAWDY_SYMBOL } from "./brand-icons";
import type { CardPayload } from "./messages";

export const FRAME = { w: FRAME_GRID.picture.w * FRAME_GRID.scale, h: FRAME_GRID.picture.h * FRAME_GRID.scale };
export const CARD = {
  w: FRAME_GRID.w * FRAME_GRID.scale,
  h: FRAME_GRID.h * FRAME_GRID.scale,
  gap: 32,
  pad: FRAME_GRID.picture.x * FRAME_GRID.scale,
};
// A frame overlay is drawn on a 4x grid and has rounded pixel corners; the
// plate sits one grid pixel inside it so it never shows past them.
const PLATE_INSET = 4;
export const PLATE_COLOR = "#16295a";

const GOLD = "#c9a45c";
const GOLD_DARK = "#7d6636";
// The Drawdy symbol is drawn into the picture, since Drawdy paints animated
// images above still ones; it sits as far from the picture's right edge as its bottom.
const LOGO_INSET = 12;
export const LOGO = {
  x: FRAME.w - LOGO_INSET - DRAWDY_SYMBOL.w,
  y: FRAME.h - LOGO_INSET - DRAWDY_SYMBOL.h,
  w: DRAWDY_SYMBOL.w,
  h: DRAWDY_SYMBOL.h,
};

// Each frame owns two animation steps; values far above 1 make the ramp cross
// full opacity within 0.1% of a step, so frames swap with hard cuts.
export function frameAnimation(
  frame: number,
  frames: number,
  loopMs: number,
): LocalAnimation {
  const opacity = Array.from({ length: frames * 2 + 1 }, (_, i) =>
    i === frame * 2 + 1 ? 1000 : 0,
  );
  return {
    time: { durationMs: loopMs, curve: "linear", repeat: "loop" },
    animation: { transform: { opacity }, curve: "linear" },
  };
}

export function buildCards(
  cards: CardPayload[],
  origin: { x: number; y: number },
  generateId: () => string,
): {
  elements: DrawdyElementSchema[];
  animations: { id: string; animation: LocalAnimation }[];
} {
  const elements: DrawdyElementSchema[] = [];
  const animations: { id: string; animation: LocalAnimation }[] = [];

  cards.forEach((card, index) => {
    const groupId = generateId();
    const x = origin.x + index * (CARD.w + CARD.gap);
    const y = origin.y;
    const box = (dx: number, dy: number, w: number, h: number) => ({
      x: x + dx,
      y: y + dy,
      width: w,
      height: h,
    });
    const plate = card.plate ?? PLATE_COLOR;
    if (card.frame) {
      elements.push(
        {
          type: "shape",
          componentType: "rect",
          drawdyElementId: generateId(),
          groupId,
          ...box(PLATE_INSET, PLATE_INSET, CARD.w - PLATE_INSET * 2, CARD.h - PLATE_INSET * 2),
          fillColor: plate,
          fillStyle: "solid",
          strokeColor: "transparent",
          strokeWidth: 0,
          cornerRadius: 12,
          roughness: 0,
        },
        {
          type: "image",
          drawdyElementId: generateId(),
          groupId,
          ...box(0, 0, CARD.w, CARD.h),
          blob: new Blob([card.frame], { type: "image/png" }),
        },
      );
    } else {
      elements.push(
        {
          type: "shape",
          componentType: "rect",
          drawdyElementId: generateId(),
          groupId,
          ...box(0, 0, CARD.w, CARD.h),
          fillColor: plate,
          fillStyle: "solid",
          strokeColor: GOLD,
          strokeWidth: 3,
          cornerRadius: 20,
          roughness: 0,
        },
        {
          type: "shape",
          componentType: "rect",
          drawdyElementId: generateId(),
          groupId,
          ...box(6, 6, CARD.w - 12, CARD.h - 12),
          fillColor: "transparent",
          strokeColor: GOLD_DARK,
          strokeWidth: 1,
          cornerRadius: 15,
          roughness: 0,
        },
      );
    }

    const frameIds = card.frames.map(() => generateId());
    // Frame 0 goes last with a higher layer so still renders show it on top;
    // the plate colour is baked into every frame, so it hides the others.
    card.frames
      .map((buffer, i) => ({ buffer, i }))
      .sort((a, b) => (a.i === 0 ? 1 : b.i === 0 ? -1 : a.i - b.i))
      .forEach(({ buffer, i }) => {
        elements.push({
          type: "image",
          drawdyElementId: frameIds[i],
          groupId,
          ...box(CARD.pad, CARD.pad, FRAME.w, FRAME.h),
          blob: new Blob([buffer], { type: "image/png" }),
          ...(i === 0 ? { layer: 2 } : {}),
        });
      });
    if (card.frames.length > 1) {
      frameIds.forEach((id, i) =>
        animations.push({
          id,
          animation: frameAnimation(i, card.frames.length, card.loopMs),
        }),
      );
    }
  });

  return { elements, animations };
}
