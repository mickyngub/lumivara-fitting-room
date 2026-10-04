import type {
  DrawdyElementSchema,
  LocalAnimation,
} from "@drawdy/driver-protocol";
import { DRAWDY_ICON_PNG, LUMIVARA_ICON_PNG, pngBytes } from "./brand-icons";
import type { CardPayload } from "./messages";

export const FRAME = { w: 336, h: 320 };
export const CARD = { w: 360, h: 420, gap: 32, pad: 12 };
export const PLATE_COLOR = "#16295a";

const GOLD = "#c9a45c";
const GOLD_DARK = "#7d6636";
const PARCHMENT = "#f7f0de";
const MUTED = "#a9b6d8";
// textWidth is the line measured in SourGummy, the board's text font, so the
// two logos sit right beside it.
const FOOTER = { text: "Lumivara × Drawdy", fontSize: 13, textWidth: 115.39, icon: 22, gap: 7 };

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

    elements.push(
      {
        type: "shape",
        componentType: "rect",
        drawdyElementId: generateId(),
        groupId,
        ...box(0, 0, CARD.w, CARD.h),
        fillColor: PLATE_COLOR,
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

    const below = CARD.pad + FRAME.h + 8;
    label(below, 36, card.title, 26, PARCHMENT);
    const footerY = below + 44;
    label(footerY, FOOTER.icon, FOOTER.text, FOOTER.fontSize, MUTED);
    const icon = (dx: number, png: string) =>
      elements.push({
        type: "image",
        drawdyElementId: generateId(),
        groupId,
        ...box(dx, footerY, FOOTER.icon, FOOTER.icon),
        blob: new Blob([pngBytes(png)], { type: "image/png" }),
      });
    icon(CARD.w / 2 - FOOTER.textWidth / 2 - FOOTER.gap - FOOTER.icon, LUMIVARA_ICON_PNG);
    icon(CARD.w / 2 + FOOTER.textWidth / 2 + FOOTER.gap, DRAWDY_ICON_PNG);
  });

  return { elements, animations };
}
