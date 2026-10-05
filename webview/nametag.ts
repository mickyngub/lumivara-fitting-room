import type { Edges, NameFrame } from "../src/game/types";

// The game mirrors its Phaser name tag into a DOM label: 12px bold on a world
// drawn at 2x, top-centred 7 world px below the feet, outlined by four 1px
// text shadows.
const GAME_WORLD_ZOOM = 2;
const BELOW_FEET = 7;
const LINE_HEIGHT = 1.2;
const OUTLINE = "#18201d";
export const NAME_FONT =
  '"Google Sans", "Noto Sans Thai", Tahoma, Arial, sans-serif';
const NAME_LINE = { px: 12, color: "#b9eab5" };
// The class goes under the name, smaller and gold, the way MMO nameplates show a title.
const CLASS_LINE = { px: 10, color: "#f0d58c" };
// A framed label, from the game's [data-name-frame] rules (checked by
// scripts/name-frames.mjs), in label px: 4 px side padding, at least 2em wide,
// and 13 px tall inside the frame.
const FRAME_PAD_X = 4;
const FRAME_MIN_WIDTH_EM = 2;
const FRAME_INSIDE = 13;

const OUTLINE_OFFSETS = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };

export type NameplateLine = {
  text: string;
  kind: "name" | "class";
  px: number;
  color: string;
};

export const nameplate = (name: string, className: string): NameplateLine[] => [
  ...(name ? [{ text: name, kind: "name" as const, ...NAME_LINE }] : []),
  ...(className
    ? [{ text: `‹${className}›`, kind: "class" as const, ...CLASS_LINE }]
    : []),
];

export type PlacedLine = {
  text: string;
  color: string;
  size: number;
  x: number;
  y: number;
};
export type PlacedFrame = { box: Rect; area: Rect; gem: Rect };
export type PlateLayout = {
  lines: PlacedLine[];
  frame?: PlacedFrame;
  outline: number;
};

/**
 * Where the nameplate goes, in world pixels. A name frame is the game's
 * pixel-art border-image, one image pixel to a label pixel: the frame takes
 * the label's place under the feet, the name sits in its 13 px middle, the gem
 * strip is centred over the stretched seam, and the class goes under the
 * whole frame. A plate that would leave `room` shrinks about the top centre
 * until it fits.
 */
export function layoutNameplate(
  lines: NameplateLine[],
  measure: (line: NameplateLine) => number,
  feet: Point,
  room: Rect,
  frame?: NameFrame,
): PlateLayout {
  const anchor = { x: feet.x, y: feet.y + BELOW_FEET };
  const placed: PlacedLine[] = [];
  const bounds: Rect[] = [];
  let framed: PlacedFrame | undefined;
  let y = anchor.y;
  let rest = lines;
  if (frame) {
    const name = lines.find((l) => l.kind === "name");
    rest = lines.filter((l) => l !== name);
    const px = 1 / GAME_WORLD_ZOOM;
    const em = NAME_LINE.px * px;
    const w = Math.max(
      (name ? measure(name) : 0) + 2 * FRAME_PAD_X * px,
      FRAME_MIN_WIDTH_EM * em,
    );
    const [t, r, b, l] = frame.width.map((v) => v * px);
    const box = {
      x: anchor.x - w / 2,
      y: y + t,
      w,
      h: FRAME_INSIDE * px,
    };
    const area = {
      x: box.x - l,
      y,
      w: box.w + l + r,
      h: box.h + t + b,
    };
    const gemW = frame.gemWidth * px;
    framed = {
      box,
      area,
      gem: { x: anchor.x - gemW / 2, y: area.y, w: gemW, h: area.h },
    };
    bounds.push(area);
    if (name)
      placed.push({
        text: name.text,
        color: name.color,
        size: em,
        x: anchor.x,
        y: box.y + box.h / 2,
      });
    y = area.y + area.h;
  }
  for (const line of rest) {
    const size = line.px / GAME_WORLD_ZOOM;
    const w = measure(line);
    bounds.push({ x: anchor.x - w / 2, y, w, h: size * LINE_HEIGHT });
    placed.push({
      text: line.text,
      color: line.color,
      size,
      x: anchor.x,
      y: y + (size * LINE_HEIGHT) / 2,
    });
    y += size * LINE_HEIGHT;
  }

  const ratio = (space: number, reach: number) =>
    reach > 0 ? space / reach : Infinity;
  const fit = Math.min(
    1,
    ...bounds.flatMap((r) => [
      ratio(anchor.x - room.x, anchor.x - r.x),
      ratio(room.x + room.w - anchor.x, r.x + r.w - anchor.x),
      ratio(anchor.y - room.y, anchor.y - r.y),
      ratio(room.y + room.h - anchor.y, r.y + r.h - anchor.y),
    ]),
  );
  const at = (v: number, from: number) => from + (v - from) * fit;
  const shrink = (r: Rect): Rect => ({
    x: at(r.x, anchor.x),
    y: at(r.y, anchor.y),
    w: r.w * fit,
    h: r.h * fit,
  });
  return {
    lines: placed.map((l) => ({
      ...l,
      size: l.size * fit,
      x: at(l.x, anchor.x),
      y: at(l.y, anchor.y),
    })),
    ...(framed
      ? {
          frame: {
            box: shrink(framed.box),
            area: shrink(framed.area),
            gem: shrink(framed.gem),
          },
        }
      : {}),
    outline: fit / GAME_WORLD_ZOOM,
  };
}

export type Piece = {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
};

/** The nine parts of a filled, stretched border-image: corners as they are, edges and middle stretched around `box`. */
export function slicePieces(
  slice: Edges,
  image: { w: number; h: number },
  box: Rect,
  area: Rect,
): Piece[] {
  const [t, r, b, l] = slice;
  const sx = [0, l, image.w - r, image.w];
  const sy = [0, t, image.h - b, image.h];
  const dx = [area.x, box.x, box.x + box.w, area.x + area.w];
  const dy = [area.y, box.y, box.y + box.h, area.y + area.h];
  const pieces: Piece[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const piece = {
        sx: sx[col],
        sy: sy[row],
        sw: sx[col + 1] - sx[col],
        sh: sy[row + 1] - sy[row],
        dx: dx[col],
        dy: dy[row],
        dw: dx[col + 1] - dx[col],
        dh: dy[row + 1] - dy[row],
      };
      if (piece.sw > 0 && piece.sh > 0 && piece.dw > 0 && piece.dh > 0)
        pieces.push(piece);
    }
  }
  return pieces;
}

export type NameFrameArt = {
  frame: NameFrame;
  image: HTMLImageElement;
  gem?: HTMLImageElement;
};

export async function loadNameFont(lines: NameplateLine[]): Promise<void> {
  try {
    await document.fonts.load(
      `700 ${NAME_LINE.px}px ${NAME_FONT}`,
      lines.map((l) => l.text).join(""),
    );
  } catch {
    // Offline: the fallback fonts in NAME_FONT still draw the plate.
  }
}

/** Draws the plate onto a canvas that shows world pixels at `scale` canvas px each. */
export function drawNameplate(
  ctx: CanvasRenderingContext2D,
  lines: NameplateLine[],
  feet: Point,
  scale: number,
  room: Rect,
  art?: NameFrameArt,
): void {
  const font = (size: number) => `700 ${size}px ${NAME_FONT}`;
  ctx.save();
  const plate = layoutNameplate(
    lines,
    (line) => {
      ctx.font = font((line.px / GAME_WORLD_ZOOM) * scale);
      return ctx.measureText(line.text).width / scale;
    },
    feet,
    room,
    art?.frame,
  );
  // Rounding each edge once keeps the nine parts seamless.
  const snap = (r: Rect): Rect => {
    const x = Math.round(r.x * scale);
    const y = Math.round(r.y * scale);
    return {
      x,
      y,
      w: Math.round((r.x + r.w) * scale) - x,
      h: Math.round((r.y + r.h) * scale) - y,
    };
  };
  if (art && plate.frame) {
    ctx.imageSmoothingEnabled = false;
    const { image, gem } = art;
    const size = { w: image.naturalWidth, h: image.naturalHeight };
    for (const p of slicePieces(
      art.frame.slice,
      size,
      snap(plate.frame.box),
      snap(plate.frame.area),
    ))
      ctx.drawImage(image, p.sx, p.sy, p.sw, p.sh, p.dx, p.dy, p.dw, p.dh);
    if (gem) {
      const g = snap(plate.frame.gem);
      ctx.drawImage(gem, g.x, g.y, g.w, g.h);
    }
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const outline = plate.outline * scale;
  for (const line of plate.lines) {
    const x = line.x * scale;
    const y = line.y * scale;
    ctx.font = font(line.size * scale);
    ctx.fillStyle = OUTLINE;
    for (const [dx, dy] of OUTLINE_OFFSETS)
      ctx.fillText(line.text, x + dx * outline, y + dy * outline);
    ctx.fillStyle = line.color;
    ctx.fillText(line.text, x, y);
  }
  ctx.restore();
}
