import type {
  DrawdyElementSchema,
  LocalAnimation,
} from "@drawdy/driver-protocol";
import { FRAME_GRID, frameById, paintFrame } from "./art/frames";
import { DRAWDY_SYMBOL, DRAWDY_SYMBOL_PNG, pngBytes } from "./brand-icons";
import type { CardPayload } from "./messages";

export const FRAME = { w: 336, h: 320 };
export const CARD = { w: FRAME_GRID.w * FRAME_GRID.scale, h: FRAME_GRID.h * FRAME_GRID.scale, gap: 32, pad: 24 };
// A frame overlay is drawn on a 4x grid and has rounded pixel corners; the
// plate sits one grid pixel inside it so it never shows past them.
const PLATE_INSET = 4;
export const PLATE_COLOR = "#16295a";

const GOLD = "#c9a45c";
const GOLD_DARK = "#7d6636";
const PARCHMENT = "#f7f0de";
// The frame's line around the picture is one grid pixel thick.
const STRIP_TOP = CARD.pad + FRAME.h + FRAME_GRID.scale;
const TITLE = { h: 36, fontSize: 26 };
// One art pixel, less than the logo pack's 43% clear space, so the logo sits
// in the corner as asked.
export const LOGO_GAP = FRAME_GRID.scale;
const PLAIN_INSET = 6;

type Box = { x: number; y: number; w: number; h: number };

/** The title centred between the picture and the frame's bottom band, and the logo as far into the bottom-right corner as the frame allows. */
export function cardBottom(frameStyle?: string): { title: Box; logo: Box } {
  const { w, h } = DRAWDY_SYMBOL;
  const titleAbove = (edge: number): Box => ({
    x: CARD.pad,
    y: (STRIP_TOP + edge) / 2 - TITLE.h / 2,
    w: CARD.w - CARD.pad * 2,
    h: TITLE.h,
  });
  if (!frameStyle) {
    return {
      title: titleAbove(CARD.h - PLAIN_INSET),
      logo: { x: CARD.w - CARD.pad - w, y: CARD.h - CARD.pad - h, w, h },
    };
  }
  const style = frameById(frameStyle);
  const px = paintFrame(style);
  const { scale } = FRAME_GRID;
  const clear = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = Math.floor(y0 / scale); y < Math.ceil(y1 / scale); y++) {
      for (let x = Math.floor(x0 / scale); x < Math.ceil(x1 / scale); x++) {
        if (px.data[(y * FRAME_GRID.w + x) * 4 + 3]) return false;
      }
    }
    return true;
  };
  let logo: Box = { x: 0, y: 0, w, h };
  for (let bottom = CARD.h - LOGO_GAP; bottom >= STRIP_TOP + h; bottom--) {
    for (let right = CARD.w - LOGO_GAP; right >= CARD.w / 2 + w; right--) {
      if (
        right + bottom > logo.x + logo.y + w + h &&
        clear(right - w - LOGO_GAP, bottom - h - LOGO_GAP, right + LOGO_GAP, bottom + LOGO_GAP)
      )
        logo = { x: right - w, y: bottom - h, w, h };
    }
  }
  return { title: titleAbove(CARD.h - style.band * scale), logo };
}

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
    const label = (
      dy: number,
      h: number,
      text: string,
      fontSize: number,
      color: string,
    ) =>
      elements.push({
        type: "shape",
        componentType: "rect",
        drawdyElementId: generateId(),
        groupId,
        ...box(CARD.pad, dy, CARD.w - CARD.pad * 2, h),
        fillColor: "transparent",
        strokeColor: "transparent",
        strokeWidth: 0,
        roughness: 0,
        text,
        fontSize,
        textColor: color,
        textAlign: "center",
        textVerticalAlign: "middle",
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

    const { title, logo } = cardBottom(card.frame ? card.frameStyle : undefined);
    label(title.y, title.h, card.title, TITLE.fontSize, PARCHMENT);
    elements.push({
      type: "image",
      drawdyElementId: generateId(),
      groupId,
      ...box(logo.x, logo.y, logo.w, logo.h),
      blob: new Blob([pngBytes(DRAWDY_SYMBOL_PNG)], { type: "image/png" }),
    });
  });

  return { elements, animations };
}
