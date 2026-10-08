import type { Effect } from "../effects";
import { calm, jagged, WHITE } from "../scene-kit";
import {
  bayer,
  hash,
  mix,
  put,
  quantize,
  rgb,
  ring,
  TAU,
  verticalGradient,
  wrap,
  type Pixels,
  type Point,
  type Rgb,
} from "../pixels";

const ramp = (...hex: string[]): Rgb[] => hex.map(rgb);
const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

// Like quantize, but flat inside each level and dithered only near the edges between levels.
const crisp = (
  v: number,
  levels: number,
  x: number,
  y: number,
  sharp: number,
) => {
  const k = clamp(v, 0, 1) * levels;
  const i = Math.min(levels - 1, Math.floor(k));
  const f = clamp((k - i - 0.5) * sharp + 0.5, 0, 1);
  return (i + (f > bayer(x, y) ? 1 : 0)) / levels;
};

const SKY = ramp("#8ccbea", "#c8e8ec", "#fbf0d2");
const FAR = ramp("#c2e2d4", "#a2cfbf", "#88baa9");
const STONE = ramp("#2a3d40", "#46605f", "#6f877c", "#9aad97");
const STONE_HI = rgb("#d3dfc2");
const CLEFT = rgb("#1a2a2e");
const MOSS = ramp("#2a5a33", "#4a8a3a", "#86b84a");
const BUSH = ramp("#10361e", "#1c5a2c", "#2f8a3d", "#6cba56");
const FALL = ramp("#4d9bc2", "#82c4e0", "#bde4f1", "#e8f6fb", "#ffffff");
const POOL = ramp("#62cbc2", "#38a8ab", "#22818f", "#175b6c");
const FOAM = ramp("#9fd5e6", "#d6eff7", "#ffffff");
const MIST = rgb("#eaf8fb");
const GLINT = rgb("#d8f7f2");
const BEAM = rgb("#fff6d2");
const RAINBOW = ramp(
  "#ff8f8f",
  "#ffb773",
  "#ffe680",
  "#9ae6a0",
  "#7ccbff",
  "#a99cff",
);
const SHEEN = ramp("#5f9a98", "#a6dcd6", "#e2f7f3");
const FLOOR = ramp("#3d5856", "#2c4241", "#1f3130", "#152526");
const SEAM = rgb("#0e1b1c");
const LEAF_BACK = ramp("#0c2a1a", "#133d24", "#1c5530", "#2a7040");
const LEAF_FRONT = ramp("#113a22", "#1b5430", "#2a7a3a", "#4f9f4a");
const FLOWER = ramp("#ff5d8f", "#ffd45e");
const RING = rgb("#d4f1ee");

type Geo = {
  cx: number;
  top: number;
  lip: number;
  base: number;
  ledge: number;
  span: number;
  hwTop: number;
  hwBase: number;
};

function layout(px: Pixels, feet: Point): Geo {
  const ledge = feet.y - Math.min(8, Math.round(px.h * 0.09));
  const base = ledge - clamp(Math.round(px.h * 0.14), 2, 14);
  const lip = Math.min(Math.round(px.h * 0.24), base - 4);
  return {
    cx: feet.x,
    top: Math.round(px.h * 0.15),
    lip,
    base,
    ledge,
    span: Math.max(1, base - lip),
    hwTop: px.w * 0.14,
    hwBase: px.w * 0.17,
  };
}

function noise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const sx = (x - ix) ** 2 * (3 - 2 * (x - ix));
  const sy = (y - iy) ** 2 * (3 - 2 * (y - iy));
  const at = (i: number, j: number) => hash(i * 12.9898 + j * 78.233 + seed);
  const a = at(ix, iy);
  const c = at(ix, iy + 1);
  const top = a + (at(ix + 1, iy) - a) * sx;
  return top + (c + (at(ix + 1, iy + 1) - c) * sx - top) * sy;
}

const halfWidth = (g: Geo, y: number) =>
  g.hwTop + (g.hwBase - g.hwTop) * clamp((y - g.lip) / g.span, 0, 1) ** 1.5;

const edgeX = (g: Geo, y: number, side: number, phase: number) =>
  g.cx +
  side *
    (halfWidth(g, y) +
      1.6 * (jagged(y, 2.5, 17 + side * 4) - 0.5) +
      0.8 * Math.sin(TAU * (y * 0.05 - phase + side * 0.2)));

const ledgeEdge = (g: Geo, x: number) =>
  g.ledge + Math.floor(hash(Math.floor(x / 7) * 1.3 + 2) * 2);

function rimAt(g: Geo, x: number): number {
  const out = Math.abs(x - g.cx) - (g.hwTop + 1);
  const high = g.top * (0.6 + 0.9 * noise(x / 12, 0.3, 21));
  return out <= 0
    ? g.lip
    : Math.round(g.lip + (high - g.lip) * clamp(out / 3, 0, 1));
}

function paintRidge(px: Pixels, g: Geo): void {
  for (let x = 0; x < px.w; x++) {
    const crest = Math.round(
      g.top * (0.3 + 0.5 * noise(x / 14, 1.5, 5)) +
        1.4 * noise(x / 3.5, 4.2, 6),
    );
    for (let y = crest; y <= g.lip + 2; y++) {
      const speck = hash(x * 3.7 + y * 1.3);
      const band =
        Math.floor((y - crest) / 2.5) +
        (speck > 0.9 ? 1 : speck < 0.06 ? -1 : 0);
      put(px, x, y, FAR[clamp(band, 0, 2)]);
    }
    if (Math.abs(x - g.cx) <= g.hwTop) {
      put(px, x, g.lip - 2, FALL[2]);
      put(px, x, g.lip - 1, FALL[3]);
    }
  }
}

type Block = {
  x: number;
  s: number;
  bias: number;
  cap: number;
  crack: boolean;
};

function makeBlocks(rows: number, w: number): Block[][] {
  const out: Block[][] = [];
  for (let k = 0; k < rows; k++) {
    const row: Block[] = [];
    let x = -Math.floor(hash(k * 7.7 + 2) * 12);
    for (let j = 0; x < w + 24; j++) {
      row.push({
        x,
        s: (hash(k * 3.1 + j * 1.9) - 0.5) * 0.9,
        bias: hash(k * 5.7 + j * 2.3) * 1.7 - 0.85,
        cap:
          hash(k * 9.1 + j * 4.7) > 0.5
            ? 1 + Math.floor(hash(k * 2.9 + j * 6.1) * 3)
            : 0,
        crack: hash(k * 1.7 + j * 8.3) > 0.5,
      });
      x += 5 + Math.floor(15 * hash(k * 13.1 + j * 5.3));
    }
    out.push(row);
  }
  return out;
}

function paintCliff(px: Pixels, g: Geo): void {
  const depth = g.base - g.top;
  const strata = Math.max(2, Math.round(depth / 7));
  const weights = Array.from(
    { length: strata },
    (_, k) => 0.5 + 1.1 * hash(k * 3.3 + 1),
  );
  const total = weights.reduce((a, b) => a + b, 0);
  const start: number[] = [];
  let acc = 0;
  weights.forEach((wt, k) => {
    start[k] = g.top + (depth * acc) / total;
    acc += wt;
  });
  const blocks = makeBlocks(strata + 1, px.w);
  const line: number[] = [];
  for (let x = 0; x < px.w; x++) {
    for (let k = 0; k < strata; k++) {
      const seg = 5 + 7 * hash(k * 3.3);
      const step = Math.floor(
        hash(Math.floor((x + k * 13) / seg) * 1.7 + k * 9.1) * 3,
      );
      line[k] = Math.round(start[k] + step - 1);
    }
    const rim = rimAt(g, x);
    let k = -1;
    for (let y = rim; y < g.base; y++) {
      while (k + 1 < strata && y >= line[k + 1]) k++;
      const top = k < 0 ? rim : line[k];
      const next = k + 1 < strata ? line[k + 1] : g.base;
      const d = y === rim ? 0 : Math.max(0, y - top);
      const row = blocks[k + 1];
      let j = 0;
      while (j + 1 < row.length && row[j + 1].x + row[j + 1].s * d <= x) j++;
      const b = row[j];
      const left = Math.round(b.x + b.s * d);
      const right = Math.round(row[j + 1].x + row[j + 1].s * d) - 1;
      const wet = Math.exp(-Math.abs(Math.abs(x - g.cx) - halfWidth(g, y)) / 4);
      const v = (y - g.top) / depth;
      const light =
        0.92 -
        0.45 * ((left + right) / 2 / px.w) -
        0.36 * v -
        0.22 * wet +
        0.5 * (noise(x / 16, y / 9, 3) - 0.5);
      const tone = clamp(Math.round(light * 3 + b.bias), 1, 3);
      let i = tone;
      if (d === 0 || x === left) i = tone + 1;
      if (d === 0 && x === left) i = tone;
      if (x === right && (d > 0 || b.crack)) i = tone - 1;
      if (next - 1 === y) i = tone - (b.crack ? 2 : 1);
      else if (d > 0 && d < 4 && hash(x * 2.3 + k * 11.7) > 0.88) i = tone - 1;
      const mark = hash(Math.floor(x / 2) * 7.1 + y * 3.3 + k * 5);
      if (mark > 0.93) i -= 1;
      else if (mark < 0.05) i += 1;
      let c = i > 3 ? STONE_HI : STONE[clamp(i, 0, 3)];
      if (x === right && b.crack) c = CLEFT;
      const cap = Math.round(b.cap * (0.5 + 1.1 * noise(x / 2.5, k * 7.3, 9)));
      if (d < cap)
        c =
          MOSS[
            clamp(
              (light > 0.5 ? 2 : 1) -
                Math.min(d, 1) -
                (d + 1 === cap && d > 0 ? 1 : 0),
              0,
              2,
            )
          ];
      const mf = noise(x / 7, y / 4.5, 11) + 0.35 * wet + 0.12 * v;
      if (mf > 1) c = MOSS[mf > 1.12 ? 2 : 1];
      else if (mf > 0.9 && bayer(x, y) > 0.5) c = MOSS[0];
      put(px, x, y, c);
    }
  }
  for (let i = 0; i < 5; i++) {
    const x0 = px.w * (0.05 + 0.9 * hash(i * 5.1 + 2));
    if (Math.abs(x0 - g.cx) < g.hwBase + 3) continue;
    const y0 = g.top + depth * 0.6 * hash(i * 2.3);
    const y1 = y0 + depth * (0.3 + 0.4 * hash(i * 7.9));
    for (let y = Math.round(y0); y < Math.min(g.base - 1, y1); y++) {
      const x = Math.round(x0 + 2.2 * (noise(y / 6, i * 3.3, 77) - 0.5) * 2);
      if (hash(x * 1.3 + y * 2.9) < 0.12) continue;
      put(px, x, y, CLEFT);
      put(px, x + 1, y, STONE[2], 0.6);
    }
  }
}

function boulder(
  px: Pixels,
  x0: number,
  y0: number,
  rx: number,
  ry: number,
  seed: number,
  waterline = Infinity,
): void {
  for (let y = Math.floor(y0 - ry - 1); y <= y0 + ry + 1; y++)
    for (let x = Math.floor(x0 - rx - 1); x <= x0 + rx + 1; x++) {
      if (y > waterline) continue;
      const nx = (x - x0) / rx;
      const ny = (y - y0) / ry;
      const rr =
        nx * nx + ny * ny + 0.4 * (noise(x / 2.5, y / 2.5, seed) - 0.5);
      if (rr > 1) continue;
      const s = -nx * 0.6 - ny * 0.8;
      let c = s > 0.35 ? STONE[3] : s > -0.25 ? STONE[2] : STONE[1];
      if (rr > 0.7) c = s > 0.15 ? STONE_HI : STONE[0];
      if (ny < -0.35 && noise(x / 2, y / 2, seed + 5) > 0.42)
        c = MOSS[s > 0.2 ? 2 : 1];
      if (y === waterline) c = FOAM[x % 2 ? 1 : 0];
      put(px, x, y, c);
    }
}

function paintBoulders(px: Pixels, g: Geo): void {
  const depth = g.base - g.top;
  for (const [fx, fy, rx, ry] of [
    [0.26, 0.45, 5.5, 3.6],
    [0.35, 0.85, 4.5, 3],
    [0.73, 0.35, 5, 3.4],
    [0.83, 0.75, 6, 3.8],
  ])
    boulder(
      px,
      fx * px.w,
      g.top + fy * depth,
      rx * (px.w / 118 + 0.2),
      ry * (px.h / 88 + 0.2),
      fx * 31,
    );
}

function blob(
  px: Pixels,
  x0: number,
  y0: number,
  r: number,
  tones: Rgb[],
): void {
  for (let y = Math.floor(y0 - r); y <= y0 + r; y++)
    for (let x = Math.floor(x0 - r); x <= x0 + r; x++) {
      const d =
        Math.hypot(x - x0, y - y0) + (hash(x * 7.1 + y * 3.3) - 0.5) * 1.2;
      if (d > r) continue;
      const s = (-(x - x0) * 0.55 - (y - y0) * 0.8) / r;
      let tone = Math.round(quantize((s + 1) / 2, 3, x, y) * 3);
      if (hash(x * 3.1 + y * 7.7) > 0.92) tone = Math.min(3, tone + 1);
      put(px, x, y, tones[tone]);
    }
}

function paintBushes(px: Pixels, g: Geo): void {
  const step = Math.max(3.5, px.w / 16);
  for (let i = 0; i * step < px.w + step; i++) {
    const x0 = i * step + (hash(i * 3.1) - 0.5) * step;
    if (Math.abs(x0 - g.cx) < g.hwTop + 3) continue;
    const r = (2.2 + 3 * hash(i * 5.7)) * (px.h / 88 + 0.3);
    blob(
      px,
      x0,
      rimAt(g, clamp(Math.round(x0), 0, px.w - 1)) - r * 0.25,
      r,
      BUSH,
    );
  }
}

function paintWater(px: Pixels, g: Geo): void {
  const room = g.ledge - g.base + 1;
  for (let y = g.base; y <= g.ledge + 1; y++)
    for (let x = 0; x < px.w; x++) {
      const t = (y - g.base) / room;
      const under = Math.exp(-(((x - g.cx) / (g.hwBase * 1.2)) ** 2)) * (1 - t);
      const shore =
        clamp(1 - (y - g.base) / 3, 0, 1) *
        (Math.abs(x - g.cx) > g.hwBase + 4 ? 1 : 0.2);
      const side = clamp(1 - Math.min(x, px.w - x) / (px.w * 0.2), 0, 1);
      const depth =
        t * 0.85 +
        0.1 -
        under * 0.45 +
        shore * 0.45 +
        side * 0.3 +
        0.2 * (noise(x / 6, y / 3, 31) - 0.5);
      put(px, x, y, POOL[Math.round(crisp(depth, 3, x, y, 2.4) * 3)]);
    }
  const scale = px.w / 118 + 0.3;
  for (const side of [-1, 1])
    for (const [fx, w, h] of [
      [0.2, 4.5, 3],
      [0.31, 3.5, 2.4],
    ])
      boulder(
        px,
        g.cx + side * (g.hwBase + fx * px.w * 0.7 + 4),
        g.base + 1,
        w * scale,
        h * scale,
        fx * 71 + side,
        g.base + 1,
      );
}

function cell(u: number, v: number): number {
  const iu = Math.floor(u);
  const iv = Math.floor(v);
  let best = 9;
  let id = 0;
  for (let j = iv - 1; j <= iv + 1; j++)
    for (let i = iu - 1; i <= iu + 1; i++) {
      const h = hash(i * 127.1 + j * 311.7 + 9);
      const d = Math.hypot(
        i + 0.15 + 0.7 * h - u,
        j + 0.15 + 0.7 * hash(h * 91.7) - v,
      );
      if (d < best) {
        best = d;
        id = h;
      }
    }
  return id;
}

function paintLedge(px: Pixels, g: Geo): void {
  const room = Math.max(1, px.h - g.ledge);
  const ids = new Float64Array(px.w * room);
  for (let y = 0; y < room; y++)
    for (let x = 0; x < px.w; x++)
      ids[y * px.w + x] = cell(
        (x - g.cx) / (12 + 0.35 * y),
        Math.log(1 + y / 7) * 3.2,
      );
  for (let x = 0; x < px.w; x++)
    for (let y = ledgeEdge(g, x); y < px.h; y++) {
      const d = y - g.ledge;
      const k = d * px.w + x;
      const id = ids[k];
      let i =
        d < 2
          ? 0
          : d < 5 + 3 * noise(x / 10, 0.5, 41)
            ? 1
            : d < room * 0.55
              ? 2
              : 3;
      i += id > 0.75 ? -1 : id < 0.2 ? 1 : 0;
      if (noise(x / 8, y / 3.5, 41) > 0.7) i -= 1;
      const crack =
        (x > 0 && ids[k - 1] !== id) || (d > 0 && ids[k - px.w] !== id);
      put(px, x, y, crack && d > 1 ? SEAM : FLOOR[clamp(i, 0, 3)]);
    }
}

function paintCanopy(px: Pixels, g: Geo): void {
  for (const side of [-1, 1])
    CANOPY.forEach(([fx, fy, fr], i) => {
      const j = side > 0 ? 0.85 + 0.3 * hash(i * 2.9) : 1;
      blob(
        px,
        (side < 0 ? fx : 1 - fx) * px.w,
        fy * g.ledge,
        fr * g.ledge * j,
        LEAF_BACK,
      );
    });
}

type Column = {
  tone: number;
  late: number;
  seam: number;
  streak: boolean;
  m: number;
  n: number;
  off: number;
};

function makeColumns(w: number): Column[] {
  const cols: Column[] = [];
  for (let x = 0; x < w;) {
    const rope = {
      tone: hash(x * 4.3 + 1) > 0.3 ? 2 : 1,
      late: 0.55 + 0.65 * hash(x * 5.9 + 4),
    };
    const seam = hash(x * 8.1) > 0.45 ? (hash(x * 2.3) > 0.7 ? 2 : 1) : 0;
    const width = 3 + Math.floor(hash(x * 2.7 + 1) * 3);
    for (let k = 0; k < width && x < w; k++, x++)
      cols[x] = {
        ...rope,
        seam: k === 0 ? seam : 0,
        streak: hash(x * 9.7 + 2) > 0.3,
        m: 1 + Math.floor(hash(x * 1.9 + 3) * 2),
        n: 1 + Math.floor(hash(x * 6.1 + 2) * 3),
        off: hash(x * 7.7 + 5),
      };
  }
  return cols;
}

function paintFall(px: Pixels, g: Geo, phase: number): void {
  const cols = makeColumns(px.w);
  for (let y = g.lip; y < g.base; y++) {
    const t = (y - g.lip) / g.span;
    const left = Math.round(edgeX(g, y, -1, phase));
    const right = Math.round(edgeX(g, y, 1, phase));
    for (let x = left; x <= right; x++) {
      const c = cols[clamp(x, 0, px.w - 1)];
      const body = Math.min(3, c.tone + (t > c.late ? 1 : 0));
      const s = wrap(((y - g.lip) * c.m) / g.span - (phase * c.n + c.off));
      let lvl = body;
      if (c.streak && t > 0.08) {
        if (s > 0.3 && s < 0.55) lvl = 4;
        else if (s > 0.05 && s <= 0.3) lvl = Math.min(3, body + 1);
      }
      lvl -=
        c.seam +
        (x === left || x === right ? 1 : 0) +
        ((x - g.cx) / halfWidth(g, y) > 0.55 && lvl > 2 ? 1 : 0);
      if (y === g.lip) lvl = 4;
      else if (y === g.lip + 1) lvl = Math.max(lvl, 3);
      put(px, x, y, FALL[clamp(lvl, 0, 4)]);
    }
    put(px, left - 1, y, CLEFT, 0.55);
    put(px, right + 1, y, CLEFT, 0.55);
    if (t > 0.3) {
      if (hash(y * 3.7) > 0.4) put(px, left - 1, y, WHITE, 0.85);
      if (hash(y * 5.3) > 0.4) put(px, right + 1, y, WHITE, 0.85);
      if (hash(y * 1.9) > 0.8) put(px, left - 2, y, WHITE, 0.5);
      if (hash(y * 2.9) > 0.8) put(px, right + 2, y, WHITE, 0.5);
    }
  }
}

function paintRainbow(px: Pixels, g: Geo, phase: number): void {
  const cx = g.cx + g.hwBase * 0.7;
  const cy = g.base + 2;
  const outer = Math.max(5, px.w * 0.13);
  const thick = Math.max(3, outer * 0.32);
  const glow = 0.85 + 0.15 * Math.sin(TAU * phase);
  for (let y = Math.max(0, Math.floor(cy - outer - 1)); y <= g.base; y++)
    for (
      let x = Math.max(0, Math.floor(cx - outer - 1));
      x <= Math.min(px.w - 1, cx + outer + 1);
      x++
    ) {
      const t = (outer - Math.hypot(x - cx, y - cy)) / thick;
      if (t < 0 || t > 1) continue;
      const f = t * (RAINBOW.length - 1);
      const i = Math.min(RAINBOW.length - 2, Math.floor(f));
      const at = (y * px.w + x) * 4;
      const lum =
        (px.data[at] * 0.3 + px.data[at + 1] * 0.59 + px.data[at + 2] * 0.11) /
        255;
      const a =
        0.34 *
        glow *
        clamp(lum * 1.5 - 0.15, 0.12, 1) *
        clamp(Math.min(t, 1 - t) * 6, 0, 1) *
        clamp((cy - y) / 3, 0, 1);
      put(px, x, y, mix(RAINBOW[i], RAINBOW[i + 1], f - i), a);
    }
}

function paintShafts(px: Pixels, g: Geo, phase: number): void {
  for (let i = 0; i < 3; i++) {
    const x0 = px.w * (0.05 + 0.22 * i);
    const pulse = 0.65 + 0.35 * Math.sin(TAU * (phase + i / 3));
    for (let y = 0; y < g.base; y++)
      for (let x = 0; x < px.w; x++) {
        const v =
          Math.max(0, 1 - Math.abs(x - x0 - y * 0.6) / (2.5 + y * 0.04)) *
          (1 - y / g.base) *
          pulse;
        const q = quantize(v * 0.8, 2, x, y);
        if (q > 0) put(px, x, y, BEAM, q * 0.18);
      }
  }
}

function paintRipples(px: Pixels, g: Geo, feet: Point, phase: number): void {
  const room = g.ledge - g.base + 1;
  const reach = px.w * 0.48;
  for (let j = 0; j < 3; j++) {
    const p = wrap(phase + j / 3);
    const r = 4 + p * reach;
    const a = 0.9 * (1 - p) ** 1.1;
    const seen = new Set<number>();
    const steps = Math.ceil(Math.PI * r * 1.4);
    for (let s = 0; s <= steps; s++) {
      const th = (s / steps) * Math.PI;
      const x = Math.round(g.cx + Math.cos(th) * r);
      const y = Math.round(g.base + 1 + Math.sin(th) * r * 0.24);
      const key = y * px.w + x;
      if (seen.has(key) || y > g.ledge) continue;
      seen.add(key);
      put(px, x, y, GLINT, a * calm(px, feet, x, y));
      put(px, x, y + 1, POOL[3], a * 0.55);
    }
  }
  for (let r = 0; r < 4; r++)
    for (let i = 0; i < 2; i++) {
      const y = g.base + 3 + Math.round((r * (room - 5)) / 4);
      const x =
        hash(r * 3.3 + i * 7.1) * px.w +
        2 * Math.sin(TAU * (phase + hash(r * 5.7 + i * 1.3)));
      const len = 2 + Math.floor(hash(r * 9.9 + i) * 4);
      for (let k = 0; k < len; k++)
        put(px, x + k, y, GLINT, 0.28 * calm(px, feet, x + k, y));
    }
  for (let i = 0; i < Math.max(2, Math.round(px.w / 9)); i++) {
    const x = Math.floor(hash(i * 4.1 + 3) * px.w);
    const y =
      g.base + 2 + Math.floor(hash(i * 6.7 + 1) * Math.max(1, room - 4));
    const a =
      Math.max(0, Math.sin(TAU * (phase * (1 + (i % 2)) + hash(i * 2.9)))) ** 6;
    put(px, x, y, WHITE, a * 0.85 * calm(px, feet, x, y));
  }
}

function ball(px: Pixels, x0: number, y0: number, r: number): void {
  for (let y = Math.floor(y0 - r); y <= y0 + r; y++)
    for (let x = Math.floor(x0 - r); x <= x0 + r; x++) {
      const dx = x - x0;
      const dy = y - y0;
      if (Math.hypot(dx, dy) > r) continue;
      const low = (dx * 0.5 + dy * 0.85) / r;
      put(px, x, y, low > 0.55 ? FOAM[0] : low > 0.2 ? FOAM[1] : FOAM[2]);
    }
}

function paintFoam(px: Pixels, g: Geo, feet: Point, phase: number): void {
  const reach = g.hwBase + 3;
  const rows = Math.max(2, Math.round(px.h * 0.07));
  const below = Math.min(
    rows + 2,
    Math.max(1, Math.round((g.ledge - g.base) * 0.75)),
  );
  for (let y = g.base - 3; y <= g.base + below; y++)
    for (let x = Math.floor(g.cx - reach - 3); x <= g.cx + reach + 3; x++) {
      const dx = (x - g.cx) / (reach + 3);
      const dy = y < g.base ? (g.base - y) / 4 : (y - g.base) / (below + 1);
      const churn =
        0.6 +
        0.2 * Math.sin(TAU * (x * 0.37 + phase)) +
        0.2 * Math.sin(TAU * (y * 0.5 - x * 0.21 - phase * 2));
      const q = Math.round(
        crisp((1 - dx * dx) * (1 - dy * dy) * churn * 1.3, 3, x, y, 2.6) * 3,
      );
      if (q > 0) put(px, x, y, FOAM[q - 1]);
    }
  for (let i = 0; i < Math.max(2, Math.round(px.w / 9)); i++) {
    const x =
      g.cx +
      (hash(i * 6.9 + 4) * 2 - 1) * (reach + 7) +
      1.5 * Math.sin(TAU * (phase + hash(i * 3.1)));
    const y = Math.min(
      g.ledge - 1,
      g.base + below - 1 + Math.floor(hash(i * 2.7) * 3),
    );
    put(px, x, y, FOAM[2], 0.55 * calm(px, feet, x, y));
  }
  const n = Math.max(4, Math.round(px.w / 3.5));
  for (let i = 0; i < n; i++) {
    const k = 1 + (i % 3);
    const u = hash(i * 3.3 + 1) * 2 - 1;
    const bx =
      g.cx + u * reach + 1.2 * Math.sin(TAU * (phase * k + hash(i * 5.1)));
    const by =
      g.base +
      (hash(i * 7.1) - 0.45) * rows * 1.4 +
      1.4 * Math.sin(TAU * (phase * (1 + ((i + 1) % 3)) + hash(i * 1.7)));
    ball(px, bx, by, (1.3 + 1.7 * hash(i * 9.3)) * (1.25 - 0.5 * Math.abs(u)));
  }
  const drops = Math.max(2, Math.round(px.w / 12));
  for (let i = 0; i < drops; i++) {
    const p = wrap(phase * (1 + (i % 2)) + hash(i * 4.7));
    const x =
      g.cx + (hash(i * 8.3) - 0.5) * 2 * reach + (hash(i * 2.9) - 0.5) * 9 * p;
    const y = g.base - 3 - 4 * (3 + 5 * hash(i * 6.1)) * p * (1 - p);
    put(px, x, y, WHITE, Math.sin(Math.PI * p) * calm(px, feet, x, y));
  }
}

function paintMist(px: Pixels, g: Geo, feet: Point, phase: number): void {
  const n = Math.max(3, Math.round(px.w / 8));
  for (let i = 0; i < n; i++) {
    const p = wrap(phase * (1 + (i % 2)) + hash(i * 2.1));
    const x0 =
      g.cx +
      (hash(i * 6.3) - 0.5) * 2 * (g.hwBase + 6) +
      2.5 * Math.sin(TAU * (phase + hash(i * 3.7)));
    const y0 = g.base + 2 - p * px.h * 0.3;
    const r = 2.2 + p * 3.8;
    const fade = Math.sin(Math.PI * p);
    for (let y = Math.floor(y0 - r); y <= y0 + r; y++)
      for (let x = Math.floor(x0 - r); x <= x0 + r; x++) {
        const v = (1 - Math.hypot(x - x0, y - y0) / r) * fade;
        const q = quantize(v * 1.1, 3, x, y);
        if (q > 0) put(px, x, y, MIST, q * 0.5 * calm(px, feet, x, y));
      }
  }
}

function paintSheen(px: Pixels, g: Geo, phase: number): void {
  for (let x = 0; x < px.w; x++) {
    const edge = ledgeEdge(g, x);
    const s =
      0.5 + 0.5 * Math.sin(TAU * (x * 0.08 - phase) + 2 * Math.sin(x * 0.19));
    put(px, x, edge, SHEEN[s > 0.8 ? 2 : s > 0.35 ? 1 : 0]);
    if (s > 0.5) put(px, x, edge + 1, SHEEN[0], 0.5);
  }
  const room = px.h - g.ledge;
  for (let i = 0; i < Math.round(px.w / 14); i++) {
    const x = Math.floor(hash(i * 5.3 + 1) * px.w);
    const y = Math.round(g.ledge + 3 + hash(i * 3.7) * Math.min(12, room - 4));
    const a = Math.max(0, Math.sin(TAU * (phase + hash(i * 9.1)))) ** 4;
    put(px, x, y, SHEEN[1], 0.7 * a);
    put(px, x + 1, y, SHEEN[1], 0.5 * a);
  }
}

type LeafSpec = [
  x: number,
  y: number,
  deg: number,
  len: number,
  wid: number,
  bend: number,
  front: boolean,
];

const LEAVES: LeafSpec[] = [
  [0.0, 0.05, 82, 0.5, 0.065, 0.2, false],
  [0.06, 0.02, 64, 0.42, 0.06, 0.25, false],
  [-0.02, 0.26, 28, 0.3, 0.05, 0.3, false],
  [-0.02, 1.0, -68, 0.42, 0.065, 0.2, false],
  [0.02, 0.04, 50, 0.32, 0.06, 0.3, true],
  [-0.02, 0.45, 12, 0.24, 0.045, 0.4, true],
  [0.0, 1.04, -40, 0.32, 0.06, 0.3, true],
  [0.05, 1.02, -22, 0.25, 0.05, 0.25, true],
];

const CANOPY: [x: number, y: number, r: number][] = [
  [0.0, 0.03, 0.2],
  [0.07, -0.04, 0.16],
  [0.15, -0.07, 0.11],
  [0.23, -0.08, 0.08],
  [-0.01, 0.2, 0.1],
];

const VINES: [x: number, y: number, len: number, bloom: boolean][] = [
  [0.05, 0.1, 0.42, true],
  [0.11, 0.06, 0.26, false],
  [0.18, 0.02, 0.34, false],
  [0.24, -0.02, 0.14, false],
];

function leaf(
  px: Pixels,
  x0: number,
  y0: number,
  angle: number,
  len: number,
  wid: number,
  bend: number,
  tones: Rgb[],
  frond: boolean,
): void {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const lit = -dy * -0.6 + dx * -0.8 > 0 ? 1 : -1;
  const droop = dx >= 0 ? bend : -bend;
  const pad = wid + 2;
  const xs = [
    x0,
    x0 + dx * len - dy * droop * len,
    x0 + dx * len * 0.5 - dy * droop * len * 0.25,
  ];
  const ys = [
    y0,
    y0 + dy * len + dx * droop * len,
    y0 + dy * len * 0.5 + dx * droop * len * 0.25,
  ];
  for (
    let y = Math.floor(Math.min(...ys) - pad);
    y <= Math.max(...ys) + pad;
    y++
  )
    for (
      let x = Math.floor(Math.min(...xs) - pad);
      x <= Math.max(...xs) + pad;
      x++
    ) {
      const rx = x - x0;
      const ry = y - y0;
      const t = (rx * dx + ry * dy) / len;
      if (t < 0 || t > 1) continue;
      const s = -rx * dy + ry * dx - droop * len * t * t;
      const half = wid * Math.sin(Math.PI * t ** 0.8) ** 0.75;
      const a = Math.abs(s);
      if (a > half) continue;
      if (frond && a > half * 0.4 && (t * len + a * 0.7) % 5 < 1.1) continue;
      const side = s * lit > 0;
      let i = side ? 2 : 1;
      if (a < 0.6) i = 3;
      else if (!frond && (((t * len - a * 1.1) % 3) + 3) % 3 < 0.8) i -= 1;
      else if (half - a < 1) i = side ? 3 : 0;
      put(px, x, y, tones[clamp(i, 0, 3)]);
    }
}

function vine(
  px: Pixels,
  x0: number,
  y0: number,
  len: number,
  phase: number,
  seed: number,
  bloom: boolean,
): void {
  const sway = 0.8 + len * 0.025;
  let x = x0;
  for (let j = 0; j < len; j++) {
    const t = j / len;
    x = x0 + sway * t * Math.sin(TAU * (phase + hash(seed)) - t * 2.4);
    const y = y0 + j;
    put(px, x, y, LEAF_BACK[1]);
    if (j % 4 === 1) put(px, x + 1, y, LEAF_BACK[2]);
    if (j % 7 === 3) {
      const dir = hash(seed + j) > 0.5 ? 1 : -1;
      put(px, x + dir, y, LEAF_FRONT[1]);
      put(px, x + dir * 2, y + 1, LEAF_FRONT[2]);
      put(px, x + dir * 2, y, LEAF_FRONT[3]);
    }
  }
  if (bloom) {
    const y = y0 + len;
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ])
      put(px, x + dx, y + dy, FLOWER[0]);
    put(px, x, y, FLOWER[1]);
  }
}

function paintLeaves(px: Pixels, g: Geo, phase: number): void {
  const unit = g.ledge;
  for (const side of [-1, 1]) {
    const at = (fx: number) => (side < 0 ? fx : 1 - fx) * px.w;
    const draw = (front: boolean) =>
      LEAVES.forEach(([lx, ly, deg, len, wid, bend, f], i) => {
        if (f !== front) return;
        const j = side > 0 ? 0.8 + 0.4 * hash(i * 3.7) : 1;
        const a =
          ((side < 0 ? deg : 180 - deg) * Math.PI) / 180 +
          0.07 * Math.sin(TAU * (phase + hash(i * 1.3 + side)));
        leaf(
          px,
          at(lx),
          ly * unit,
          a,
          len * unit * j,
          wid * unit * j,
          bend,
          front ? LEAF_FRONT : LEAF_BACK,
          !front && i < 3,
        );
      });
    draw(false);
    VINES.forEach(([fx, fy, len, bloom], i) =>
      vine(
        px,
        at(fx),
        fy * unit,
        len * unit * (side > 0 ? 0.8 + 0.4 * hash(i * 6.1) : 1),
        phase,
        i * 17 + side,
        bloom && side < 0,
      ),
    );
    draw(true);
  }
}

// The scenery that never moves is painted once per size and copied back each frame.
const STILL = new Map<string, Uint8ClampedArray>();

function paintStill(px: Pixels, g: Geo): void {
  verticalGradient(px, SKY);
  paintRidge(px, g);
  paintCliff(px, g);
  paintBoulders(px, g);
  paintBushes(px, g);
  paintWater(px, g);
  paintLedge(px, g);
  paintCanopy(px, g);
}

export const waterfall: Effect = {
  id: "waterfall",
  name: "น้ำตก",
  plate: "#15292a",
  paint(px, feet, phase) {
    phase = wrap(phase);
    const g = layout(px, feet);
    const key = `${px.w}x${px.h}@${feet.x},${feet.y}`;
    const still = STILL.get(key);
    if (still) px.data.set(still);
    else {
      paintStill(px, g);
      STILL.set(key, px.data.slice());
      if (STILL.size > 6) STILL.delete(STILL.keys().next().value as string);
    }
    paintFall(px, g, phase);
    paintRainbow(px, g, phase);
    paintShafts(px, g, phase);
    paintRipples(px, g, feet, phase);
    paintFoam(px, g, feet, phase);
    paintMist(px, g, feet, phase);
    paintSheen(px, g, phase);
    paintLeaves(px, g, phase);
    ring(px, feet, 24, 7, RING, 0.5);
  },
};
