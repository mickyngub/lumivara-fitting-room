import type { Effect } from "../effects";
import { calm, jagged } from "../scene-kit";
import {
  hash,
  mix,
  put,
  quantize,
  rgb,
  ring,
  TAU,
  wrap,
  type Pixels,
  type Point,
  type Rgb,
} from "../pixels";

type Ramp = Rgb[];
type Ctx = { px: Pixels; feet: Point; hz: number; k: number };
type Lobe = [x: number, y: number, r: number, seed: number, squash?: number];
type Crown = [
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  r: number,
  seed: number,
];
type Tree = [
  x: number,
  w: number,
  cy: number,
  rx: number,
  ry: number,
  favour?: number,
];
type Layer = {
  haze: number;
  fog: Rgb;
  hues: number[];
  clump: number;
  base: number;
  levels: [number, number];
  tall?: boolean;
  trees: Tree[];
};

const ramp = (...hex: string[]): Ramp => hex.map(rgb);
const clamp = (v: number, lo = 0, hi = 1): number =>
  Math.max(lo, Math.min(hi, v));
const veil = (r: Ramp, t: number, fog: Rgb): Ramp =>
  r.map((c) => mix(c, fog, t));

const noise = (x: number, y: number, seed: number): number => {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const sx = (x - ix) ** 2 * (3 - 2 * (x - ix));
  const sy = (y - iy) ** 2 * (3 - 2 * (y - iy));
  const at = (i: number, j: number) => hash(i * 1.7 + j * 9.3 + seed);
  const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx;
  const low = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx;
  return top + (low - top) * sy;
};

const SKY = ramp(
  "#b9531c",
  "#d6772a",
  "#ec9c3b",
  "#f8c15f",
  "#fddb8d",
  "#fff0bf",
);
const CROWNS = [
  ramp("#6d3912", "#a9651b", "#d99829", "#f5c542", "#ffe58a"),
  ramp("#56270f", "#8f421a", "#c6661f", "#ee982c", "#fcc156"),
  ramp("#4a1c10", "#7c2d14", "#b3491a", "#dc6b23", "#f68f39"),
  ramp("#481210", "#7a1b19", "#ab2a21", "#d4442b", "#ee6a3a"),
];
const HUE_BASE = [-0.55, -0.05, 0.1, 0];
const HUE_SLOPE = [-0.6, -0.2, 0.15, 0.55];
const LIGHT_STEPS = [0.26, 0.5, 0.72, 0.9];
const BARK = ramp("#25120b", "#3d2214", "#5b351d", "#82522b", "#a97640");

const LAYERS: Layer[] = [
  {
    haze: 0.58,
    fog: rgb("#b8805a"),
    hues: [1, 2],
    clump: 2.8,
    base: 0,
    levels: [1, 4],
    trees: [
      [0.02, 1, 0.4, 0.08, 0.2],
      [0.12, 1, 0.52, 0.06, 0.14],
      [0.22, 1, 0.34, 0.07, 0.2],
      [0.33, 1, 0.48, 0.06, 0.16],
      [0.44, 1, 0.37, 0.08, 0.22],
      [0.55, 1, 0.54, 0.06, 0.13],
      [0.65, 1, 0.42, 0.07, 0.19],
      [0.76, 1, 0.33, 0.07, 0.22],
      [0.87, 1, 0.5, 0.06, 0.15],
      [0.97, 1, 0.4, 0.08, 0.2],
    ],
  },
  {
    haze: 0.36,
    fog: rgb("#cf9658"),
    hues: [1, 2, 3],
    clump: 3.4,
    base: 0.04,
    levels: [1, 5],
    trees: [
      [0.09, 1.6, 0.32, 0.11, 0.26],
      [0.31, 1.4, 0.4, 0.09, 0.2],
      [0.7, 1.4, 0.36, 0.09, 0.22],
      [0.9, 1.6, 0.3, 0.11, 0.26],
    ],
  },
  {
    haze: 0.14,
    fog: rgb("#d9a05c"),
    hues: [0, 1, 2, 3],
    clump: 4,
    base: 0.1,
    levels: [0, 5],
    trees: [
      [0.19, 3, 0.22, 0.12, 0.3, 1],
      [0.8, 3, 0.24, 0.12, 0.3, 2],
    ],
  },
  {
    haze: 0,
    fog: rgb("#000000"),
    hues: [0, 1, 2, 3],
    clump: 4.8,
    base: 0.3,
    levels: [0, 5],
    tall: true,
    trees: [
      [0.1, 14, 0.14, 0.24, 0.4, 2],
      [0.92, 12, 0.14, 0.2, 0.38, 1],
    ],
  },
];

const DRIFTS = [
  [0, 0.012, 2, 0.1],
  [0.07, 0.016, 1, 0.55],
  [0.15, 0.02, 1.5, 0.2],
  [0.26, 0.02, 1, 0.8],
];
const LITTER = [
  ramp("#f6c46a", "#e39a42", "#cc7c34"),
  ramp("#f0a24a", "#d4782f", "#b45a28"),
  ramp("#e0803a", "#bb5026", "#963c20"),
  ramp("#c8602c", "#8e3320", "#6a2518"),
];
const SHADE = rgb("#3c1410");
const FLOOR = LITTER.map((tones) => [
  tones.map((c) => mix(c, SHADE, 0.5)),
  tones,
  tones.map((c) => mix(c, rgb("#ffe08a"), 0.35)),
]);
const FLECKS = ramp("#b3321e", "#d9531f", "#f0a030", "#7a2a1a");
const DIRT = ramp("#b98250", "#d6a068", "#ecc080");

const MIST = rgb("#fbe3a0");
const MIST_UP = [3, 6, 10, 14];
const MIST_DOWN = [3, 6, 9];
const BEAMS = [
  [1.02, 0.1, 0],
  [0.82, 0.07, 0.4],
];
const SHAFT = [40, 28, 8];
const MOTE = rgb("#fff8d0");

const LEAF_SHAPES = [
  [["xl"], ["x", "l"]],
  [
    [".x.", "xlx", ".d."],
    ["x.x", ".l.", "d.x"],
  ],
  [
    ["x.x", "xlx", ".xd", ".d."],
    ["..x", "lxx", "xxd", "d.."],
  ],
  [
    [".lx.", "xxxx", ".xxd", "..d."],
    ["..lx", ".lxx", "lxxd", ".dd."],
  ],
];
const LEAF_SIZES = [1, 2, 0, 3, 1, 2, 0, 3, 1, 0, 2, 3, 1];
const LEAF_COLOURS = [
  { x: rgb("#d9381f"), l: rgb("#ff8a5c"), d: rgb("#8c1d18") },
  { x: rgb("#f0731c"), l: rgb("#ffb35a"), d: rgb("#a8400f") },
  { x: rgb("#ffc02a"), l: rgb("#fff4b0"), d: rgb("#c9801a") },
];

function paintSky({ px, hz }: Ctx): void {
  for (let y = 0; y < px.h; y++)
    for (let x = 0; x < px.w; x++) {
      const d = Math.hypot(
        (x - px.w * 0.34) / (px.w * 0.8),
        (y - hz * 0.85) / hz,
      );
      const t = quantize(1 - Math.min(1, d), 12, x, y) * (SKY.length - 1);
      const i = Math.min(SKY.length - 2, Math.floor(t));
      put(px, x, y, mix(SKY[i], SKY[i + 1], t - i));
    }
}

function pathAt({ px, feet, hz, k }: Ctx, y: number): [number, number] {
  const t = (y - hz) / (px.h - hz);
  const mid =
    feet.x + px.w * 0.06 * Math.sin(TAU * ((y - feet.y) / (px.h * 0.9)));
  const half = (0.04 + 0.3 * t) * px.w;
  const step = Math.max(2, 4 * k);
  return [
    mid - half + (jagged(y, step, 31) - 0.5) * 3 * k,
    mid + half + (jagged(y, step, 47) - 0.5) * 3 * k,
  ];
}

// 0 under the trees, 1 in between, 2 where the clearing catches the light.
function zoneAt(
  { px, feet }: Ctx,
  x: number,
  y: number,
  rough: number,
): number {
  const u = (x - feet.x) / px.w;
  const clearing = Math.exp(
    -(((u + 0.05) / 0.24) ** 2) - ((y - feet.y) / (px.h * 0.16)) ** 2,
  );
  const z =
    0.5 +
    0.55 * clearing -
    0.7 * clamp((Math.abs(u) - 0.26) / 0.18) +
    rough * (noise(x / 13, y / 7, 3) - 0.5);
  return z < 0.3 ? 0 : z > 0.78 ? 2 : 1;
}

function paintFloor(c: Ctx): void {
  const { px, hz, k } = c;
  const crest = DRIFTS.map(() => 0);
  for (let x = 0; x < px.w; x++) {
    DRIFTS.forEach(([off, amp, f, ph], l) => {
      crest[l] =
        hz +
        px.h * (off + amp * Math.sin(TAU * ((x / px.w) * f + ph))) +
        (jagged(x, Math.max(2, 3 * k), l * 7) - 0.5) * 2.4 * k;
    });
    for (let y = Math.floor(crest[0]); y < px.h; y++) {
      const l = y >= crest[3] ? 3 : y >= crest[2] ? 2 : y >= crest[1] ? 1 : 0;
      const thick = (l < 3 ? crest[l + 1] : px.h) - crest[l];
      const s = (y - crest[l]) / thick;
      const tone = y - crest[l] < 1 ? 0 : s < 0.62 ? 1 : 2;
      put(px, x, y, FLOOR[l][zoneAt(c, x, y, 0.36)][tone]);
    }
  }
}

function paintPath(c: Ctx): void {
  const { px, hz } = c;
  for (let y = Math.ceil(hz); y < px.h; y++) {
    const [left, right] = pathAt(c, y);
    const glow = y < hz + (px.h - hz) * 0.14;
    for (let x = Math.ceil(left); x <= right; x++) {
      const tone =
        x - left < 1.5 ? 0 : right - x < 1 || glow ? 2 : zoneAt(c, x, y, 0.1);
      put(px, x, y, DIRT[tone]);
    }
  }
}

function paintLitter(c: Ctx): void {
  const { px, hz, k } = c;
  for (let i = 0; i < 7; i++) {
    const t = 0.25 + 0.7 * hash(i * 4.7);
    const y = hz + t * (px.h - hz);
    const side = i % 2 ? 1 : -1;
    const x = pathAt(c, y)[i % 2] + side * (3 + 8 * hash(i * 1.9)) * k;
    const r = (1.8 + 3.2 * t) * k;
    const tones = CROWNS[[2, 3, 1][i % 3]].slice(0, 4);
    for (let dx = -Math.ceil(r * 1.7); dx <= Math.ceil(r * 1.7); dx++)
      put(
        px,
        x + dx,
        y + r * 0.6 + 1,
        SHADE,
        0.35 * (1 - Math.abs(dx) / (r * 1.8)),
      );
    blob(px, [x - r, y + r * 0.2, r * 0.6, 900 + i, 0.55], tones, -0.06);
    blob(
      px,
      [x + r * 0.9, y + r * 0.15, r * 0.65, 920 + i, 0.55],
      tones,
      -0.06,
    );
    blob(px, [x, y, r, 940 + i, 0.55], tones, 0);
  }
  const count = Math.round(((px.h - hz) * px.w) / 70);
  for (let i = 0; i < count; i++) {
    const t = hash(i * 2.3) ** 1.2;
    const y = Math.round(hz + 2 + t * (px.h - hz - 3));
    const x = Math.round(hash(i * 7.1) * px.w);
    const [left, right] = pathAt(c, y);
    if (x > left && x < right && hash(i * 3.3) < 0.7) continue;
    const col = FLECKS[Math.floor(hash(i * 5.9) * FLECKS.length)];
    for (let j = 0; j <= Math.round(t * 2); j++) put(px, x + j, y, col);
  }
}

function blob(px: Pixels, lobe: Lobe, colours: Ramp, lift: number): void {
  const [cx, cy, r, seed, squash = 1] = lobe;
  const n = colours.length;
  const wa = 0.14 + 0.16 * hash(seed + 1);
  const wb = 0.1 + 0.14 * hash(seed + 2);
  const pa = TAU * hash(seed + 3);
  const pb = TAU * hash(seed + 4);
  const reach = Math.ceil(r * 1.3);
  const rows = Math.ceil(reach * squash);
  for (let y = Math.round(cy) - rows; y <= Math.round(cy) + rows; y++)
    for (let x = Math.round(cx) - reach; x <= Math.round(cx) + reach; x++) {
      const dx = x - cx;
      const dy = (y - cy) / squash;
      const a = Math.atan2(dy, dx);
      const edge =
        r * (1 + wa * Math.sin(2 * a + pa) + wb * Math.sin(3 * a + pb));
      const d = Math.hypot(dx, dy) / edge;
      if (d > 1) continue;
      const light = clamp(
        (-0.55 * (dx / edge) -
          0.65 * (dy / edge) +
          0.6 * Math.sqrt(1 - d * d) +
          1) /
          2.2 +
          lift +
          (noise(x / 2.4, y / 2.4, seed) - 0.5) * 0.3,
      );
      let level = LIGHT_STEPS.filter((s) => light > s).length;
      if (r > 3 && hash(x * 12.9 + y * 78.2 + seed) > 0.96) level++;
      put(
        px,
        x,
        y,
        colours[clamp(Math.round(level * ((n - 1) / 4)), 0, n - 1)],
      );
    }
}

function crown(
  c: Ctx,
  [cx, cy, rx, ry, r, seed]: Crown,
  ramps: Ramp[],
  layer: Layer,
  favour: number,
): void {
  const gap = r * 1.05;
  const lobes: Lobe[] = [];
  for (let j = 0, gy = cy - ry; gy <= cy + ry; gy += gap * 0.8, j++)
    for (let gx = cx - rx + (j % 2) * gap * 0.5; gx <= cx + rx; gx += gap) {
      const i = lobes.length;
      const x = gx + (hash(seed + i * 3.1) - 0.5) * gap * 0.8;
      const y = gy + (hash(seed + i * 5.7) - 0.5) * gap * 0.7;
      const ey = (y - cy) / ry;
      const sag = 1.15 + 0.7 * noise(x / (r * 3), 0, seed);
      if (Math.hypot((x - cx) / rx, ey * (ey > 0 ? sag : 1)) > 1) continue;
      lobes.push([x, y, r * (0.7 + 0.7 * hash(seed + i * 7.3)), seed + i]);
    }
  const tufts = Math.round((TAU * Math.max(rx, ry)) / (r * 1.5));
  for (let i = 0; i < tufts; i++) {
    const a = ((i + hash(seed + i * 2.1) * 0.7) / tufts) * TAU;
    const s = Math.sin(a);
    lobes.push([
      cx + Math.cos(a) * rx,
      cy + s * ry * (s > 0 ? 0.77 : 1),
      r * (0.45 + 0.4 * hash(seed + i * 4.9)),
      seed + 50 + i,
    ]);
  }
  lobes.sort((a, b) => a[1] - b[1]);
  for (const lobe of lobes) {
    const [x, y, , s] = lobe;
    const warm = (x - cx) / rx + (y - cy) / ry;
    const under = Math.max(0, (y - cy) / ry - 0.2);
    const sun = clamp(1 - (x / c.px.w + y / (c.px.h * 0.6)) * 1.1);
    let pick = 0;
    let best = -9;
    for (const h of layer.hues) {
      const score =
        HUE_BASE[h] +
        HUE_SLOPE[h] * warm +
        (h === 3 ? 0.9 * under : 0) +
        (h === 0 ? 0.8 * sun : h === 1 ? 0.25 * sun : 0) +
        (h === favour ? 0.3 : 0) +
        (noise(x / (r * 2.5), y / (r * 2.5), h * 13 + seed) - 0.5) * 1.3;
      if (score > best) [pick, best] = [h, score];
    }
    const lift =
      -0.3 * clamp((y - cy) / ry) - 0.05 + (hash(s * 3.3) - 0.5) * 0.16;
    blob(c.px, lobe, ramps[pick], lift);
  }
}

function trunk(
  px: Pixels,
  x: number,
  base: number,
  top: number,
  w: number,
  seed: number,
  bark: Ramp,
): void {
  const span = Math.max(1, base - top);
  for (let y = Math.max(0, Math.floor(top)); y <= base; y++) {
    const t = (y - top) / span;
    const half = (w / 2) * (0.85 + 0.15 * t + (t > 0.93 ? (t - 0.93) * 7 : 0));
    const left = Math.round(x - half);
    const right = Math.round(x + half);
    for (let xx = left; xx <= right; xx++) {
      const col = xx - left;
      const u = right > left ? col / (right - left) : 0.5;
      let tone = u < 0.45 ? 2 : u < 0.78 ? 1 : 0;
      if (w >= 5) {
        const g =
          col +
          1.4 * Math.sin(y * 0.21 + seed) +
          3 * hash(seed + Math.floor(y / 13));
        const f = g - 3.4 * Math.floor(g / 3.4);
        if (f < 1 && hash(seed + col * 3.1 + Math.floor(y / 6)) > 0.2)
          tone -= 1;
        else if (f < 1.8 && u < 0.6) tone += 1;
      }
      if (xx === left) tone = w >= 5 ? 4 : 3;
      put(px, xx, y, bark[clamp(tone, 0, 4)]);
    }
  }
}

function paintLayer(c: Ctx, layer: Layer, l: number): void {
  const { px, hz, k } = c;
  const base = hz + layer.base * px.h;
  const [from, to] = layer.levels;
  const bark = veil(BARK, layer.haze, layer.fog);
  const ramps = CROWNS.map((r) =>
    veil(r, layer.haze, layer.fog).slice(from, to),
  );
  const trees = layer.trees.map(([x, w, cy, rx, ry, favour], i) => ({
    x: x * px.w,
    w: Math.max(1, Math.round(w * k)),
    cy: cy * hz,
    rx: rx * px.w,
    ry: ry * hz,
    favour: favour ?? -1,
    seed: l * 100 + i * 7,
  }));
  if (layer.haze < 0.2)
    for (const t of trees)
      for (let dx = -t.w; dx <= t.w; dx++)
        for (let dy = 0; dy < 3; dy++)
          put(
            px,
            t.x + dx,
            base + dy,
            SHADE,
            0.5 * (1 - Math.abs(dx) / (t.w + 1)) * (1 - dy / 3),
          );
  for (const t of trees)
    trunk(px, t.x, base, layer.tall ? -1 : t.cy, t.w, t.seed, bark);
  const r = Math.max(1.4, layer.clump * k);
  for (const t of trees)
    crown(c, [t.x, t.cy, t.rx, t.ry, r, t.seed], ramps, layer, t.favour);
}

function paintMist({ px, hz }: Ctx): void {
  const s = px.h / 88;
  const strength = Math.min(1, px.h / 70);
  for (let x = 0; x < px.w; x++) {
    const wobble = (jagged(x, 5, 17) - 0.5) * 3 * s;
    for (let y = 0; y < px.h; y++) {
      const d = (y - hz + wobble) / s;
      const a =
        d < 0
          ? MIST_UP.filter((r) => -d < r).length
          : MIST_DOWN.filter((r) => d < r).length;
      if (a) put(px, x, y, MIST, 0.1 * a * strength);
    }
  }
}

function paintShafts({ px, feet }: Ctx, phase: number): void {
  const src = { x: -0.22 * px.w, y: -0.5 * px.h };
  const beams = BEAMS.map(([a, w, o]) => ({
    a: a + 0.015 * Math.sin(TAU * (phase + o)),
    w,
    power: 0.8 + 0.2 * Math.sin(TAU * (phase + o * 1.7)),
  }));
  for (let y = 0; y < px.h; y++)
    for (let x = 0; x < px.w; x++) {
      const ang = Math.atan2(y - src.y, x - src.x);
      for (const b of beams) {
        const q = quantize(clamp((1 - Math.abs(ang - b.a) / b.w) * 4), 2, x, y);
        const i = (y * px.w + x) * 4;
        for (let ch = 0; ch < 3; ch++)
          px.data[i + ch] += SHAFT[ch] * q * b.power;
      }
    }
  for (let i = 0; i < 9; i++) {
    const b = beams[i % beams.length];
    const d = px.h * (0.9 + 0.9 * hash(i * 4.1));
    const a = b.a + (hash(i * 2.3) - 0.5) * b.w * 1.2;
    const x = src.x + Math.cos(a) * d + 1.5 * Math.sin(TAU * (phase + hash(i)));
    const y =
      src.y + Math.sin(a) * d + 1.5 * Math.cos(TAU * (phase + hash(i * 1.7)));
    const glint =
      0.5 + 0.5 * Math.sin(TAU * (phase * (1 + (i % 2)) + hash(i * 6.1)));
    put(px, x, y, MOTE, (0.3 + 0.6 * glint) * calm(px, feet, x, y));
  }
}

function paintLeaves({ px, feet }: Ctx, phase: number): void {
  const count = clamp(Math.round((px.w * px.h) / 380), 6, 30);
  for (let i = 0; i < count; i++) {
    const p = wrap(phase + wrap(0.5 + i * 0.5698403));
    const size = Math.min(LEAF_SIZES[i % LEAF_SIZES.length], px.w > 60 ? 3 : 1);
    const amp = 1.5 + size;
    const x =
      wrap(wrap(0.5 + i * 0.7548777) + 0.22 * p) * (px.w + 24) -
      12 +
      amp * Math.sin(TAU * (p + hash(i * 3.1))) +
      0.4 * amp * Math.sin(TAU * (2 * p + hash(i * 5.3)));
    const y =
      -6 + p * (px.h + 12) + 1.2 * Math.sin(TAU * (2 * p + hash(i * 2.7)));
    const flip = Math.floor(phase * 4 + hash(i * 6.1)) % 2;
    const pal = LEAF_COLOURS[i % 3];
    const a = calm(px, feet, x, y);
    const ix = Math.round(x);
    const iy = Math.round(y);
    LEAF_SHAPES[size][flip].forEach((row, r) => {
      for (let col = 0; col < row.length; col++) {
        const ch = row[col];
        if (ch !== ".")
          put(px, ix + col, iy + r, pal[ch as "x" | "l" | "d"], a);
      }
    });
  }
}

// Sky, ground and trees never move, so each size is painted once and copied.
const stills = new Map<string, Uint8ClampedArray<ArrayBuffer>>();

function paintStill(c: Ctx): void {
  const { px, feet } = c;
  const key = `${px.w}x${px.h}@${feet.x},${feet.y}`;
  const saved = stills.get(key);
  if (saved) return px.data.set(saved);
  paintSky(c);
  paintFloor(c);
  paintPath(c);
  paintLitter(c);
  LAYERS.forEach((layer, l) => {
    paintLayer(c, layer, l);
    if (l === 0) paintMist(c);
  });
  if (stills.size >= 4) stills.clear();
  stills.set(key, px.data.slice());
}

export const autumnLeaves: Effect = {
  id: "autumn-leaves",
  name: "ใบไม้ร่วง",
  plate: "#5a2a14",
  paint(px, feet, phase) {
    phase = wrap(phase);
    const k = Math.sqrt((px.w / 118) * (px.h / 88));
    const c: Ctx = { px, feet, hz: feet.y - px.h * 0.2, k };
    paintStill(c);
    paintShafts(c, phase);
    paintLeaves(c, phase);
    ring(px, feet, 24, 7, rgb("#fff0c4"), 0.7);
  },
};
