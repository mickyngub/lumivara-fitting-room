import type { Effect } from "../effects";
import { calm, line, PLUS, stars } from "../scene-kit";
import {
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
  type Rgb,
} from "../pixels";

type Tone = { light: Rgb; mid: Rgb; dark: Rgb; edge: Rgb; cut: Rgb };
type Mask = boolean[][];
type Node = [number, number, number];

const FOG = rgb("#c4b5f0");
const IRON = rgb("#0b0612");
const STONE: Tone = {
  light: rgb("#b4bdd2"),
  mid: rgb("#7f89a8"),
  dark: rgb("#4a5174"),
  edge: IRON,
  cut: rgb("#3b4262"),
};
const TUFT = [rgb("#2c4a38"), rgb("#4d7558")];
const DIRT = rgb("#21172a");
const DIRT_LIT = rgb("#4a3a52");
const DIRT_LOW = rgb("#130c19");

const fromRows = (rows: string[]): Mask =>
  rows.map((r) => [...r].map((ch) => ch === "#"));

const archMask = (w: number, h: number): Mask => {
  const r = w / 2;
  return Array.from({ length: h }, (_, y) =>
    Array.from(
      { length: w },
      (_, x) =>
        y >= r ||
        Math.abs(x + 0.5 - r) <= Math.sqrt(r * r - (r - y - 0.5) ** 2),
    ),
  );
};

const CROSS = fromRows([
  "..##..",
  "..##..",
  "######",
  "######",
  "..##..",
  "..##..",
  "..##..",
  ".####.",
  ".####.",
]);

const SLAB = fromRows([
  "......##.",
  ".....####",
  ".....####",
  "....#####",
  "....#####",
  "...#####.",
  "...#####.",
  "..#####..",
  "..#####..",
]);

function carve(
  px: Pixels,
  m: Mask,
  x: number,
  y: number,
  t: Tone,
  litW: number,
): void {
  const rows = m.length;
  const cols = m[0].length;
  const at = (r: number, c: number) =>
    r >= 0 && r < rows && c >= 0 && c < cols && m[r][c];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      if (at(r, c))
        for (const [dc, dr] of PLUS)
          if (!at(r + dr, c + dc) && r + dr < rows)
            put(px, x + c + dc, y + r + dr, t.edge);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      if (!at(r, c)) continue;
      let left = 0;
      while (at(r, c - left - 1)) left++;
      put(
        px,
        x + c,
        y + r,
        left < litW ? t.light : at(r, c + 1) ? t.mid : t.dark,
      );
    }
}

function mound(px: Pixels, cx: number, base: number, rx: number): void {
  const ry = 2.2;
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -Math.ceil(rx); dx <= Math.ceil(rx); dx++) {
      if ((dx / rx) ** 2 + (dy / ry) ** 2 > 1) continue;
      const rim = dy < 0 || (dy === 0 && dx < 0);
      put(
        px,
        cx + dx,
        base + dy,
        rim && dx <= 1 ? DIRT_LIT : dy === 2 ? DIRT_LOW : DIRT,
      );
    }
}

function tuft(px: Pixels, x: number, y: number, a: Rgb, b: Rgb, sway: number) {
  for (const dx of [-1, 0, 1]) put(px, x + dx, y, a);
  put(px, x, y - 1, a);
  put(px, x - 2, y - 1, b);
  put(px, x + 2, y - 1, b);
  put(px, x + sway, y - 2, b);
}

function limb(px: Pixels, a: Node, b: Node, c: Rgb): void {
  const [x0, y0, w0] = a;
  const [x1, y1, w1] = b;
  if (Math.max(w0, w1) <= 1.3) {
    line(px, x0, y0, x1, y1, c);
    return;
  }
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy || 1;
  const m = Math.ceil(Math.max(w0, w1) / 2) + 1;
  for (let y = Math.floor(Math.min(y0, y1) - m); y <= Math.max(y0, y1) + m; y++)
    for (
      let x = Math.floor(Math.min(x0, x1) - m);
      x <= Math.max(x0, x1) + m;
      x++
    ) {
      const t = Math.max(
        0,
        Math.min(1, ((x - x0) * dx + (y - y0) * dy) / len2),
      );
      const hw = Math.max(0.5, (w0 + (w1 - w0) * t) / 2);
      if (Math.hypot(x - x0 - dx * t, y - y0 - dy * t) <= hw) put(px, x, y, c);
    }
}

const LIMBS: Node[][] = [
  [
    [0, -0.02, 4.4],
    [-0.05, 0.1, 3.9],
    [-0.07, 0.2, 3.4],
    [-0.01, 0.3, 3.1],
    [0.055, 0.4, 2.8],
    [0.04, 0.5, 2.4],
    [-0.02, 0.6, 2.1],
    [-0.03, 0.7, 1.8],
    [0, 0.8, 1.4],
    [-0.02, 0.92, 1.1],
    [0.01, 1, 1],
  ],
  [
    [-0.07, 0.2, 2.4],
    [-0.14, 0.25, 2],
    [-0.21, 0.23, 1.6],
    [-0.28, 0.16, 1.3],
    [-0.35, 0.12, 1],
  ],
  [
    [0.055, 0.4, 2.3],
    [0.15, 0.46, 1.9],
    [0.23, 0.43, 1.5],
    [0.33, 0.52, 1.2],
    [0.4, 0.5, 1],
  ],
  [
    [0.23, 0.43, 1.3],
    [0.28, 0.33, 1],
    [0.37, 0.3, 1],
  ],
  [
    [-0.02, 0.6, 2],
    [-0.1, 0.68, 1.6],
    [-0.17, 0.66, 1.4],
    [-0.27, 0.78, 1.1],
    [-0.34, 0.74, 1],
  ],
  [
    [-0.1, 0.68, 1.3],
    [-0.12, 0.78, 1],
    [-0.2, 0.9, 1],
  ],
  [
    [-0.03, 0.7, 1.8],
    [0.06, 0.78, 1.5],
    [0.12, 0.74, 1.3],
    [0.2, 0.84, 1.1],
    [0.28, 0.82, 1],
  ],
  [
    [0.06, 0.78, 1.2],
    [0.07, 0.9, 1],
    [0.15, 1, 1],
  ],
];

const TREE = rgb("#07030d");

function rimLight(px: Pixels, c: Rgb, rim: Rgb, bx: number, by: number) {
  const is = (x: number, y: number) => {
    const i = (y * px.w + x) * 4;
    return (
      x >= 0 &&
      x < px.w &&
      y >= 0 &&
      y < px.h &&
      px.data[i] === c[0] &&
      px.data[i + 1] === c[1] &&
      px.data[i + 2] === c[2]
    );
  };
  const edges: [number, number][] = [];
  for (let y = 0; y < Math.min(px.h, by + 3); y++)
    for (
      let x = Math.max(0, Math.floor(bx - by));
      x < Math.min(px.w, bx + by);
      x++
    )
      if (is(x, y) && is(x - 1, y) && is(x - 2, y) && !is(x + 1, y))
        edges.push([x, y]);
  for (const [x, y] of edges) put(px, x, y, rim);
}

function tree(px: Pixels, bx: number, by: number, size: number, k: number) {
  const c = TREE;
  const at = ([x, y, w]: Node): Node => [bx + x * size, by - y * size, w * k];
  LIMBS.forEach((nodes, n) => {
    for (let i = 1; i < nodes.length; i++)
      limb(px, at(nodes[i - 1]), at(nodes[i]), c);
    const [x0, y0] = at(nodes[nodes.length - 2]);
    const [x1, y1] = at(nodes[nodes.length - 1]);
    const a = Math.atan2(y1 - y0, x1 - x0);
    const reach = Math.max(2, size * (0.05 + 0.04 * hash(n * 3.3)));
    for (const turn of [-0.75, 0.05, 0.8]) {
      const len = turn === 0.05 ? reach * 1.2 : reach;
      const tx = x1 + Math.cos(a + turn) * len;
      const ty = y1 + Math.sin(a + turn) * len;
      line(px, x1, y1, tx, ty, c);
      if (turn !== 0.05)
        line(
          px,
          (x1 + tx) / 2,
          (y1 + ty) / 2,
          (x1 + tx) / 2 + Math.cos(a + turn * 2) * reach * 0.5,
          (y1 + ty) / 2 + Math.sin(a + turn * 2) * reach * 0.5,
          c,
        );
    }
  });
  for (const [dx, dy] of [
    [-4, 1],
    [4, 1],
    [-3, 0],
    [3, 0],
  ])
    line(px, bx, by, bx + dx * k, by + dy * k, c);
}

type Grave = {
  u: number;
  row: 0 | 1 | 2;
  kind: "arch" | "cross" | "slab";
  w: number;
  h: number;
};

const GRAVES: Grave[] = [
  { u: 0.25, row: 0, kind: "arch", w: 5, h: 7 },
  { u: 0.37, row: 0, kind: "arch", w: 5, h: 8 },
  { u: 0.64, row: 0, kind: "arch", w: 5, h: 7 },
  { u: 0.78, row: 0, kind: "arch", w: 6, h: 8 },
  { u: 0.12, row: 1, kind: "cross", w: 8, h: 10 },
  { u: 0.31, row: 1, kind: "arch", w: 6, h: 9 },
  { u: 0.72, row: 1, kind: "arch", w: 6, h: 8 },
  { u: 0.9, row: 1, kind: "slab", w: 9, h: 10 },
  { u: 0.06, row: 2, kind: "arch", w: 8, h: 10 },
  { u: 0.22, row: 2, kind: "arch", w: 7, h: 9 },
  { u: 0.82, row: 2, kind: "arch", w: 7, h: 9 },
  { u: 0.95, row: 2, kind: "cross", w: 8, h: 10 },
];

export const graveyard: Effect = {
  id: "graveyard",
  name: "สุสานผีสิง",
  plate: "#1a0f2e",
  paint(px, feet, phase) {
    phase = wrap(phase);
    const W = px.w;
    const H = px.h;
    const k = Math.min(1, H / 80);
    const ground = Math.round(Math.min(H * 0.74, feet.y - H * 0.09));
    const crest = ground - Math.round(H * 0.17);
    const moon = { x: W * 0.75, y: H * 0.25 };
    const hill = (x: number) =>
      crest +
      H * 0.075 * (1 - Math.exp(-(((x / W - 0.56) / 0.42) ** 2))) +
      0.8 * Math.sin(TAU * ((x / W) * 1.7 + 0.1));
    const farHill = (x: number) =>
      crest -
      H * 0.07 +
      H * 0.03 * Math.sin(TAU * ((x / W) * 1.1 + 0.35)) +
      H * 0.015 * Math.sin(TAU * ((x / W) * 2.6 + 0.1));

    verticalGradient(
      px,
      [rgb("#0a0620"), rgb("#150d34"), rgb("#281f56"), rgb("#3a3470")],
      12,
    );
    const haze = rgb("#8a80c8");
    for (let y = Math.floor(H * 0.18); y < ground; y++)
      for (let x = 0; x < W; x++) {
        const v = Math.min(1, (y - H * 0.18) / (H * 0.34)) ** 1.3;
        const q = quantize(v * 0.7, 5, x, y);
        if (q > 0) put(px, x, y, haze, q * 0.55);
      }

    stars(
      px,
      phase,
      Math.round((W * H) / 220),
      73,
      [rgb("#ccccff"), rgb("#aaaadd")],
      0.4,
    );

    const r = Math.max(3, Math.min(W, H) * 0.14);
    const pale = rgb("#d8f8d0");
    const halo = rgb("#6aff6a");
    const crater = rgb("#4a7a4a");
    const craters = [
      [0.35, -0.2, 0.25, 0.3],
      [-0.25, 0.3, 0.2, 0.35],
    ];
    for (let y = Math.floor(moon.y - r * 1.8); y <= moon.y + r * 1.8; y++)
      for (let x = Math.floor(moon.x - r * 1.8); x <= moon.x + r * 1.8; x++) {
        const d = Math.hypot(x - moon.x, y - moon.y);
        if (d > r) {
          const q = quantize((1 - (d - r) / (r * 0.8)) * 0.35, 3, x, y);
          if (q > 0) put(px, x, y, halo, q * 0.3);
          continue;
        }
        put(px, x, y, pale);
        for (const [cx, cy, cr, min] of craters) {
          const cd = Math.hypot(x - moon.x - r * cx, y - moon.y - r * cy);
          const q = quantize(1 - cd / (r * cr), 2, x, y);
          if (cd < r * cr && q > min) put(px, x, y, crater, q * 0.4);
        }
      }

    const farTop = rgb("#2d2656");
    const farLow = rgb("#1b1639");
    for (let x = 0; x < W; x++) {
      const top = farHill(x);
      for (
        let y = Math.max(0, Math.floor(top));
        y < Math.min(H, hill(x) + 2);
        y++
      )
        put(
          px,
          x,
          y,
          mix(farTop, farLow, quantize((y - top) / (H * 0.2), 2, x, y)),
        );
    }

    const grassTop = rgb("#1f3532");
    const grassLit = rgb("#2d4c47");
    const grassLow = rgb("#101b19");
    const rim = rgb("#4c726a");
    for (let x = 0; x < W; x++) {
      const top = hill(x);
      const lit = Math.exp(-(((x - moon.x) / (W * 0.5)) ** 2));
      const bottom = Math.min(H, ground + 2);
      for (let y = Math.max(0, Math.floor(top)); y < bottom; y++) {
        const t = quantize((y - top) / (H * 0.22), 3, x, y);
        put(
          px,
          x,
          y,
          y - top < 1 ? rim : mix(mix(grassTop, grassLit, lit), grassLow, t),
        );
      }
    }

    const bar = Math.max(3, Math.round(4 * k));
    const barH = Math.max(4, Math.round(9 * k));
    const posts: { x: number; top: number; base: number }[] = [];
    for (let i = 0, x = 1; x < W + bar; i++, x += bar) {
      if (hash(i * 3.7 + 5) > 0.9) {
        posts.push({ x, top: NaN, base: NaN });
        continue;
      }
      const base = Math.round(hill(x)) + 1;
      const lean = Math.round((hash(i * 2.9 + 1) - 0.5) * 3.4);
      const top = base - barH + Math.round((hash(i * 5.3) - 0.5) * 3);
      const tip = x + lean;
      line(px, x, base, tip, top, IRON);
      if (i % 3 === 0 && k >= 0.6) {
        put(px, tip, top - 3, IRON);
        put(px, tip - 1, top - 2, IRON);
        put(px, tip + 1, top - 2, IRON);
        put(px, tip, top - 1, IRON);
      } else put(px, tip, top - 1 - (i % 3 === 1 ? 1 : 0), IRON);
      posts.push({ x: tip, top, base });
    }
    posts.forEach((p, i) => {
      const n = posts[i + 1];
      if (!n || Number.isNaN(p.top) || Number.isNaN(n.top)) return;
      for (const f of [0.3, 0.75])
        line(
          px,
          p.x,
          p.top + (p.base - p.top) * f,
          n.x,
          n.top + (n.base - n.top) * f,
          IRON,
        );
    });

    const treeX = W * 0.17;
    const treeBase = hill(treeX) + 2;
    tree(px, treeX, treeBase, treeBase * 0.85, k);
    rimLight(px, TREE, rgb("#3a4766"), treeX, treeBase);

    const fog = (yc: number, thick: number, a: number, seed: number) => {
      for (let x = 0; x < W; x++) {
        const u = x / W;
        const d =
          0.55 +
          0.3 * Math.sin(TAU * (u * 2 - phase + seed)) +
          0.2 * Math.sin(TAU * (u * 3 + phase + seed * 2.3));
        const wob = 1.3 * Math.sin(TAU * (u * 2 + phase + seed));
        for (let y = Math.floor(yc - thick); y <= yc + thick; y++) {
          const t = (y - yc - wob) / thick;
          const v = Math.max(0, d - 0.15) * Math.max(0, 1 - t * t);
          const q = quantize(v * 1.2, 3, x, y);
          if (q > 0) put(px, x, y, FOG, q * a);
        }
      }
    };

    const fadeTo = rgb("#5a5594");
    const drawGrave = (g: Grave) => {
      const x = Math.round(g.u * W);
      const base = Math.round(hill(x)) + Math.round([4, 9, 15][g.row] * k);
      const kind = k < 0.6 ? "arch" : g.kind;
      const w = Math.max(3, Math.round(g.w * k));
      const h = Math.max(4, Math.round(g.h * k));
      const fade = [0.5, 0.25, 0][g.row];
      const tone: Tone = {
        light: mix(STONE.light, fadeTo, fade),
        mid: mix(STONE.mid, fadeTo, fade),
        dark: mix(STONE.dark, fadeTo, fade),
        edge: mix(IRON, fadeTo, fade * 0.6),
        cut: mix(STONE.cut, fadeTo, fade),
      };
      const m =
        kind === "cross"
          ? CROSS
          : kind === "slab"
            ? SLAB
            : archMask(w - 2, h - 1);
      const cols = m[0].length;
      const left = Math.round(x - cols / 2);
      const top = base - m.length + 1;
      carve(px, m, left, top, tone, cols >= 5 ? 2 : 1);
      if (kind === "arch" && cols >= 4 && m.length >= 7) {
        const cutRow = Math.ceil(cols / 2) + 1;
        for (let c = 1; c < cols - 1; c++)
          put(px, left + c, top + cutRow, tone.cut);
        for (let c = 1; c < cols - 2; c++)
          put(px, left + c, top + cutRow + 2, tone.cut);
      }
      mound(px, x, base + 2, Math.max(2, cols / 2 + 2 * k));
      if (g.row > 0)
        for (const side of [-1, 1])
          tuft(
            px,
            Math.round(x + side * (cols / 2 + 2)),
            base + 2,
            TUFT[0],
            TUFT[1],
            Math.round(0.9 * Math.sin(TAU * (phase + hash(g.u * 9 + side)))),
          );
    };

    GRAVES.filter((g) => g.row === 0).forEach(drawGrave);
    fog(hill(W * 0.5) + H * 0.05, H * 0.05, 0.5, 0.1);
    GRAVES.filter((g) => g.row === 1).forEach(drawGrave);
    fog(hill(W * 0.5) + H * 0.15, H * 0.06, 0.5, 0.55);

    const lawn = rgb("#13211e");
    const lawnLow = rgb("#0a1210");
    const lawnRim = rgb("#2f4a43");
    for (let x = 0; x < W; x++) {
      const top =
        ground + Math.round(1.2 * Math.sin(TAU * ((x / W) * 1.7 + 0.3)));
      for (let y = top; y < H; y++) {
        const t = quantize((y - top) / (H - top), 3, x, y);
        put(
          px,
          x,
          y,
          y === top || hash(x * 12.9 + y * 78.2) > 0.955
            ? lawnRim
            : mix(lawn, lawnLow, t),
        );
      }
    }
    for (let i = 0; i < Math.round(W / 3); i++) {
      const x = Math.round(hash(i * 4.4) * W);
      const y = Math.round(ground + 2 + hash(i * 6.2) * (H - ground - 3));
      const sway = Math.round(0.9 * Math.sin(TAU * (phase + hash(i * 2.6))));
      tuft(px, x, y, TUFT[0], TUFT[1], sway);
    }
    GRAVES.filter((g) => g.row === 2).forEach(drawGrave);
    fog(ground + H * 0.03, H * 0.05, 0.35, 0.8);

    const wispCore = rgb("#e4ffe0");
    const wispGlow = rgb("#4aea72");
    for (let i = 0; i < Math.max(2, Math.round((W * H) / 1200)); i++) {
      const orbit = (t: number) => ({
        x:
          hash(i * 5.5) * W +
          W * 0.09 * Math.sin(TAU * (t * (1 + (i % 2)) + hash(i * 1.7))),
        y:
          H * (0.38 + 0.3 * hash(i * 7.1)) +
          H * 0.06 * Math.sin(TAU * (t * (1 + (i % 3)) + hash(i * 3.3))),
      });
      const bright =
        0.5 + 0.5 * Math.sin(TAU * (phase * (1 + (i % 2)) + hash(i * 6.2)));
      for (let j = 3; j > 0; j--) {
        const tail = orbit(phase - j * 0.012);
        put(
          px,
          tail.x,
          tail.y,
          wispGlow,
          (0.55 - j * 0.14) * bright * calm(px, feet, tail.x, tail.y),
        );
      }
      const here = orbit(phase);
      const a = calm(px, feet, here.x, here.y);
      const cx = Math.round(here.x);
      const cy = Math.round(here.y);
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const q = quantize(
            (1 - Math.hypot(dx, dy) / 2.8) * (0.55 + 0.45 * bright),
            3,
            cx + dx,
            cy + dy,
          );
          if (q > 0) put(px, cx + dx, cy + dy, wispGlow, q * 0.7 * a);
        }
      put(px, cx, cy, wispCore, (0.6 + 0.4 * bright) * a);
    }

    ring(px, feet, 24, 7, rgb("#b6f0c4"), 0.55);
  },
};
