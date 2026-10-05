import type { Head } from "../game/head";

export type Hsl = { h: number; s: number; l: number };

const OPAQUE = 128;
// Pixel art is held together by its dark outlines, so a dye leaves pixels
// this dark alone and eases in above them.
const OUTLINE = { from: 0.12, to: 0.32 };
const MIN_SATURATION = 0.05;

export function rgbToHsl(r: number, g: number, b: number): Hsl {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h =
    max === R
      ? ((G - B) / d + 6) % 6
      : max === G
        ? (B - R) / d + 2
        : (R - G) / d + 4;
  return { h: h * 60, s, l };
}

export function hslToRgb({ h, s, l }: Hsl): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [r, g, b].map((v) =>
    Math.round(Math.min(1, Math.max(0, v + m)) * 255),
  ) as [number, number, number];
}

export const hexToHsl = (hex: string): Hsl => {
  const n = parseInt(hex.replace(/^#/, ""), 16);
  return rgbToHsl((n >> 16) & 255, (n >> 8) & 255, n & 255);
};

/** An image's main colour: the alpha-weighted mean, its hue weighted by saturation. */
export function mainColour(data: Uint8ClampedArray): Hsl {
  let x = 0;
  let y = 0;
  let s = 0;
  let l = 0;
  let weight = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < OPAQUE) continue;
    const c = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    const angle = (c.h * Math.PI) / 180;
    x += Math.cos(angle) * c.s * a;
    y += Math.sin(angle) * c.s * a;
    s += c.s * a;
    l += c.l * a;
    weight += a;
  }
  if (!weight) return { h: 0, s: 0, l: 0.5 };
  return {
    h: ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360,
    s: s / weight,
    l: l / weight,
  };
}

/**
 * Moves a colour the way the dye moves the item's main colour onto the target:
 * the same hue turn, saturation scaled by the same ratio, and lightness pulled
 * towards the target without crossing black or white.
 */
export function dyeHsl(
  c: Hsl,
  main: Hsl,
  target: Hsl,
  keepLightness = false,
): Hsl {
  const h = (((c.h + target.h - main.h) % 360) + 360) % 360;
  const s = Math.min(1, (c.s * target.s) / Math.max(main.s, MIN_SATURATION));
  if (keepLightness) return { h, s, l: c.l };
  const lit =
    target.l <= main.l
      ? (c.l * target.l) / Math.max(main.l, 1e-6)
      : 1 - ((1 - c.l) * (1 - target.l)) / Math.max(1 - main.l, 1e-6);
  const t = Math.min(
    1,
    Math.max(0, (c.l - OUTLINE.from) / (OUTLINE.to - OUTLINE.from)),
  );
  return { h, s, l: c.l + (lit - c.l) * t * t * (3 - 2 * t) };
}

export function dyeRgb(
  rgb: number,
  main: Hsl,
  target: Hsl,
  keepLightness = false,
): number {
  const c = dyeHsl(
    rgbToHsl((rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255),
    main,
    target,
    keepLightness,
  );
  const [r, g, b] = hslToRgb(c);
  return (r << 16) | (g << 8) | b;
}

export function dyePixels(
  data: Uint8ClampedArray,
  main: Hsl,
  target: Hsl,
): void {
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    const [r, g, b] = hslToRgb(
      dyeHsl(rgbToHsl(data[i], data[i + 1], data[i + 2]), main, target),
    );
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
}

const pack = (r: number, g: number, b: number) => (r << 16) | (g << 8) | b;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const hueGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
};

// Clothes this saturated are dyed in full, fading out to none at `fade`, so
// greys, metal and whites keep their colour.
const CLOTH = { s: 0.18, fade: 0.08, minL: 0.12, maxL: 0.92 };
// Degrees from a part's hue dyed in full, fading out at `edge`, so trims in
// other colours stay as drawn.
const FAMILY = { core: 28, edge: 50 };
const FACE_DIRECTIONS = ["south", "south-east", "east", "south-west", "west"];
// A head is about as tall as it is wide, and never more than half the figure.
const HEAD_ASPECT = 0.95;
const MAX_HEAD_SHARE = 0.5;
// The body skin is weighed against: this share of the figure's height, from the top of the head.
const BODY_BAND = [0.4, 0.75];
// A skin tone the face shows at least this much of, against the body, is skin.
const FACE_TO_BODY = 0.6;

const brightSkin = (c: Hsl, r: number, g: number, b: number) =>
  c.h >= 5 && c.h <= 40 && c.s >= 0.2 && c.s <= 0.92 && c.l >= 0.5 && c.l <= 0.92 && r > g && g > b;

const skinTone = (c: Hsl, r: number, g: number, b: number) =>
  (c.h <= 36 || c.h >= 350) && c.s >= 0.12 && c.s <= 0.92 && c.l >= 0.2 && c.l <= 0.93 && r > g && g >= b - 4;

// Skin, hair and beards share warm hues with brown, orange and red clothes, so
// inside the head a warm colour is never dyed; a cool hat or hood still is.
const warm = (c: Hsl) => (c.h <= 50 || c.h >= 330) && c.s >= CLOTH.fade;
const MAX_PARTS = 3;
// A hue family needs this share of the clothes to be a part of its own.
const MIN_PART_SHARE = 0.08;

/** An outfit's colour parts, largest first, and the skin colours a dye leaves alone. */
export type Cloth = { parts: Hsl[]; skin: Set<number> };

type Layout = {
  cell: { w: number; h: number };
  baseline: number;
  rows: { anim: string; dir: string; count: number }[];
};

/** The rows a frame's head fills, from its top to its chin. */
const chinOf = (head: Head, baseline: number) =>
  head.top + Math.min(Math.round(head.w * HEAD_ASPECT), Math.round(MAX_HEAD_SHARE * (baseline - head.top)));

/** Visits every painted pixel of every frame with whether it lies in that frame's head. */
function eachPixel(
  data: Uint8ClampedArray,
  width: number,
  sheet: Layout,
  heads: Head[][],
  visit: (i: number, inHead: boolean) => void,
): void {
  const { cell, baseline, rows } = sheet;
  rows.forEach((row, r) => {
    for (let f = 0; f < row.count; f++) {
      const { top } = heads[r][f];
      const chin = chinOf(heads[r][f], baseline);
      for (let y = 0; y < cell.h; y++) {
        const from = ((r * cell.h + y) * width + f * cell.w) * 4;
        for (let i = from; i < from + cell.w * 4; i += 4) if (data[i + 3]) visit(i, y >= top && y < chin);
      }
    }
  });
}

const dyeable = (c: Hsl, key: number, inHead: boolean, skin: Set<number>) =>
  c.l >= CLOTH.minL && !skin.has(key) && !brightSkin(c, key >> 16, (key >> 8) & 255, key & 255) && !(inHead && warm(c));

/**
 * Skin is told from brown or orange clothes of the same hue by where it is:
 * a skin tone the standing frames' faces show, unless the body is mostly it.
 */
export function skinColours(data: Uint8ClampedArray, width: number, sheet: Layout, heads: Head[][]): Set<number> {
  const { cell, baseline, rows } = sheet;
  const face = new Map<number, number>();
  const body = new Map<number, number>();
  const count = (into: Map<number, number>, i: number) => {
    if (data[i + 3] < OPAQUE) return;
    const [R, G, B] = [data[i], data[i + 1], data[i + 2]];
    if (!skinTone(rgbToHsl(R, G, B), R, G, B)) return;
    const key = pack(R, G, B);
    into.set(key, (into.get(key) ?? 0) + 1);
  };
  rows.forEach((row, r) => {
    if (row.anim !== "idle" || !FACE_DIRECTIONS.includes(row.dir)) return;
    const head = heads[r][0];
    const chin = chinOf(head, baseline);
    const tall = baseline - head.top;
    const at = (x: number, y: number) => ((r * cell.h + y) * width + x) * 4;
    for (let y = head.top; y < chin; y++)
      for (let x = Math.max(0, Math.floor(head.x - head.w / 2)); x < Math.min(cell.w, Math.ceil(head.x + head.w / 2)); x++) count(face, at(x, y));
    for (let y = Math.max(chin, head.top + Math.floor(tall * BODY_BAND[0])); y < head.top + Math.floor(tall * BODY_BAND[1]); y++)
      for (let x = 0; x < cell.w; x++) count(body, at(x, y));
  });
  return new Set([...face].filter(([c, n]) => n >= 3 && n >= FACE_TO_BODY * (body.get(c) ?? 0)).map(([c]) => c));
}

/** The hue families a sheet's clothes are in, largest first, or null when it has none to dye. */
export function clothParts(data: Uint8ClampedArray, width: number, sheet: Layout, heads: Head[][]): Cloth | null {
  const skin = skinColours(data, width, sheet, heads);
  const hsl = new Map<number, Hsl>();
  const counts = new Map<number, number>();
  eachPixel(data, width, sheet, heads, (i, inHead) => {
    if (data[i + 3] < OPAQUE) return;
    const key = pack(data[i], data[i + 1], data[i + 2]);
    let c = hsl.get(key);
    if (!c) hsl.set(key, (c = rgbToHsl(data[i], data[i + 1], data[i + 2])));
    if (c.s >= CLOTH.s && c.l <= CLOTH.maxL && dyeable(c, key, inHead, skin)) counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  let left = [...counts].map(([key, n]) => ({ c: hsl.get(key)!, n }));
  const total = left.reduce((sum, e) => sum + e.n, 0);
  const parts: Hsl[] = [];
  while (parts.length < MAX_PARTS && left.length) {
    const bins = new Array<number>(36).fill(0);
    for (const { c, n } of left) bins[Math.floor(c.h / 10) % 36] += n;
    const smooth = bins.map((v, i) => bins[(i + 35) % 36] + 2 * v + bins[(i + 1) % 36]);
    const peak = smooth.indexOf(Math.max(...smooth)) * 10 + 5;
    let [x, y, s, l, weight] = [0, 0, 0, 0, 0];
    for (const { c, n } of left) {
      if (hueGap(c.h, peak) > FAMILY.core) continue;
      const angle = (c.h * Math.PI) / 180;
      x += Math.cos(angle) * n;
      y += Math.sin(angle) * n;
      s += c.s * n;
      l += c.l * n;
      weight += n;
    }
    if (weight < MIN_PART_SHARE * total) break;
    const part = { h: ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360, s: s / weight, l: l / weight };
    parts.push(part);
    // Its fading edge belongs to it too, so the next part is a hue of its own.
    left = left.filter(({ c }) => hueGap(c.h, part.h) > FAMILY.edge);
  }
  return parts.length ? { parts, skin } : null;
}

/**
 * Dyes each part's clothes onto its target, or leaves the part as drawn where
 * it has none. A colour belongs to the part nearest it in hue; skin, greys,
 * outlines, warm colours in the head and hues far from every part keep theirs.
 */
export function dyeCloth(
  data: Uint8ClampedArray,
  width: number,
  sheet: Layout,
  heads: Head[][],
  cloth: Cloth,
  targets: (Hsl | null)[],
): void {
  const done = [new Map<number, number>(), new Map<number, number>()];
  const dyed = (key: number, inHead: boolean): number => {
    const [r, g, b] = [key >> 16, (key >> 8) & 255, key & 255];
    const c = rgbToHsl(r, g, b);
    if (!dyeable(c, key, inHead, cloth.skin)) return key;
    const gaps = cloth.parts.map((p) => hueGap(c.h, p.h));
    const k = gaps.indexOf(Math.min(...gaps));
    const target = targets[k];
    const w =
      clamp01((c.s - CLOTH.fade) / (CLOTH.s - CLOTH.fade)) *
      (gaps[k] <= FAMILY.core ? 1 : clamp01(1 - (gaps[k] - FAMILY.core) / (FAMILY.edge - FAMILY.core)));
    if (!target || w <= 0) return key;
    const [R, G, B] = hslToRgb(dyeHsl(c, cloth.parts[k], target));
    return pack(Math.round(r + (R - r) * w), Math.round(g + (G - g) * w), Math.round(b + (B - b) * w));
  };
  eachPixel(data, width, sheet, heads, (i, inHead) => {
    const key = pack(data[i], data[i + 1], data[i + 2]);
    const cache = done[inHead ? 1 : 0];
    let out = cache.get(key);
    if (out === undefined) cache.set(key, (out = dyed(key, inHead)));
    data[i] = out >> 16;
    data[i + 1] = (out >> 8) & 255;
    data[i + 2] = out & 255;
  });
}

// Shades of an item's body keep at most this much of their hue step from its base.
const SHADE_HUE_STEP = 20;

/**
 * Turns an item's body onto the target: its base shade becomes the target and
 * every other body shade keeps its step from the base in hue, saturation and
 * lightness. Pixels in other colours are left as drawn.
 */
export function dyeShades(data: Uint8ClampedArray, shades: string[], target: Hsl): void {
  const base = hexToHsl(shades[0]);
  const moved = new Map<number, number>();
  for (const hex of shades) {
    const c = hexToHsl(hex);
    const step = ((c.h - base.h + 540) % 360) - 180;
    const [r, g, b] = hslToRgb({
      h: (target.h + (base.s < CLOTH.fade ? 0 : Math.max(-SHADE_HUE_STEP, Math.min(SHADE_HUE_STEP, step))) + 360) % 360,
      s: clamp01(target.s + c.s - base.s),
      l: Math.min(0.97, Math.max(0.06, target.l + c.l - base.l)),
    });
    moved.set(parseInt(hex.slice(1), 16), pack(r, g, b));
  }
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    const out = moved.get(pack(data[i], data[i + 1], data[i + 2]));
    if (out === undefined) continue;
    data[i] = out >> 16;
    data[i + 1] = (out >> 8) & 255;
    data[i + 2] = out & 255;
  }
}
