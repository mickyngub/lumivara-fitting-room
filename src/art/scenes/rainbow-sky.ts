import type { Effect } from "../effects";
import {
  bayer,
  hash,
  mix,
  put,
  quantize,
  rgb,
  ring,
  TAU,
  wrap,
  type Pixels,
  type Rgb,
} from "../pixels";
import { calm, PLUS, WHITE } from "../scene-kit";

const SKY = ["#1b8cf0", "#46b0f4", "#8fdaf8", "#b9eef9"].map(rgb);
const BANDS = [
  "#ff4d5e",
  "#ff9a3d",
  "#ffe24f",
  "#52d96b",
  "#3a9bff",
  "#5b55e8",
  "#a35ced",
].map(rgb);
const GLOW_OUT = rgb("#ffd5e4");
const GLOW_IN = rgb("#e4dcff");
const NEAR = ["#8facd0", "#b4cde8", "#d6e7f7", "#eef6fd", "#ffffff"].map(rgb);
const FAR = ["#a2c4e2", "#bfd9ef", "#d8ebf9", "#ecf6fd", "#fafdff"].map(rgb);
const SPARK = [WHITE, rgb("#fff6c2")];

const LOBES = [
  [
    [-2.4, -0.45, 0.65],
    [-1.5, -0.9, 1.0],
    [-0.2, -1.35, 1.35],
    [1.2, -1.0, 1.05],
    [2.3, -0.55, 0.75],
    [0.4, -0.6, 1.0],
  ],
  [
    [-1.8, -0.5, 0.8],
    [-0.7, -1.1, 1.25],
    [0.7, -0.8, 1.05],
    [1.8, -0.45, 0.75],
    [0, -0.4, 0.9],
  ],
  [
    [-2.0, -0.4, 0.6],
    [-1.0, -0.8, 0.9],
    [0.1, -1.5, 1.4],
    [1.3, -0.9, 1.0],
    [2.2, -0.4, 0.6],
    [0.2, -0.5, 1.0],
  ],
];

const MOUND = [
  [-9, 1.5, 7.5],
  [9, 1.5, 8],
  [0, -1, 11],
];

const ROWS = [
  [2, 6.5, 7],
  [8.5, 8.5, 10],
  [18, 10.5, 13],
  [30, 12.5, 16],
];

function puff(
  px: Pixels,
  cx: number,
  cy: number,
  r: number,
  tones: Rgb[],
  maxY: number,
  edge = false,
): void {
  const reach = edge ? r + 1 : r;
  const bottom = Math.min(px.h - 1, Math.ceil(cy + reach), Math.floor(maxY));
  for (let y = Math.max(0, Math.floor(cy - reach)); y <= bottom; y++) {
    for (
      let x = Math.max(0, Math.floor(cx - reach));
      x <= Math.min(px.w - 1, Math.ceil(cx + reach));
      x++
    ) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > reach) continue;
      if (d > r) {
        if (y > cy + r * 0.15) put(px, x, y, tones[1]);
        continue;
      }
      const dx = (x - cx) / r;
      const dy = (y - cy) / r;
      const s =
        0.7 * dy +
        0.2 * dx +
        0.3 * (dx * dx + dy * dy) +
        (bayer(x, y) - 0.5) * 0.08;
      put(
        px,
        x,
        y,
        tones[s < -0.02 ? 4 : s < 0.2 ? 3 : s < 0.42 ? 2 : s < 0.66 ? 1 : 0],
      );
    }
  }
}

function drift(
  px: Pixels,
  phase: number,
  tones: Rgb[],
  size: number,
  count: number,
  span: number,
  rows: [number, number],
  seed: number,
): void {
  for (let i = 0; i < count; i++) {
    const x =
      wrap((i + 0.6 * hash(seed + i * 2.3)) / count + phase) * span - size * 4;
    const base = rows[0] + (rows[1] - rows[0]) * hash(seed + i * 5.1);
    const s = size * (0.85 + 0.3 * hash(seed + i * 7.7));
    for (const [dx, dy, r] of LOBES[(i + seed) % LOBES.length])
      puff(px, x + dx * s, base + dy * s, r * s, tones, base);
  }
}

export const rainbowSky: Effect = {
  id: "rainbow-sky",
  name: "ฟ้าสายรุ้ง",
  plate: "#3f8fd6",
  paint(px, feet, phase) {
    phase = wrap(phase);
    const k = Math.min(px.w / 118, px.h / 88);
    const floorTop = Math.round(feet.y - Math.min(9, Math.max(3, px.h * 0.11)));
    const cx = feet.x;
    const cy = floorTop + 3 * k;
    const thick = Math.max(1, 1.85 * k);
    const outer = Math.min(px.w * 0.49, cy - 1 - 3 * k);
    const inner = outer - thick * BANDS.length;
    const mid = (outer + inner) / 2;
    const spread = Math.max(2, 7 * k);

    for (let y = 0; y < px.h; y++) {
      for (let x = 0; x < px.w; x++) {
        const t =
          quantize(Math.min(1, y / floorTop), 12, x, y) * (SKY.length - 1);
        const i = Math.min(SKY.length - 2, Math.floor(t));
        put(px, x, y, mix(SKY[i], SKY[i + 1], t - i));
      }
    }

    drift(
      px,
      phase,
      FAR,
      3 * k,
      5,
      px.w + 24 * k,
      [floorTop * 0.55, floorTop * 0.92],
      3,
    );

    for (let y = 0; y <= cy; y++) {
      for (let x = 0; x < px.w; x++) {
        const d = Math.hypot(x - cx, y - cy);
        const away = Math.abs(d - mid) - thick * 3.5;
        if (away < spread) {
          const g = away <= 0 ? 1 : (1 - away / spread) ** 2;
          const q = quantize(g, 4, x, y);
          if (q > 0) put(px, x, y, d > mid ? GLOW_OUT : GLOW_IN, q * 0.62);
        }
        if (d <= outer && d > inner) {
          const b = Math.min(BANDS.length - 1, Math.floor((outer - d) / thick));
          put(px, x, y, BANDS[b], 0.86);
        }
      }
    }

    drift(
      px,
      phase,
      NEAR,
      5.6 * k,
      3,
      1.4 * px.w + 40 * k,
      [floorTop * 0.42, floorTop * 0.78],
      11,
    );

    for (let i = 0; i < 10; i++) {
      const a = Math.PI * (0.08 + 0.84 * hash(i * 3.7 + 1));
      const r = inner + (outer - inner) * hash(i * 5.1 + 2);
      const sx = cx + Math.cos(a) * r;
      const sy = cy - Math.sin(a) * r;
      const t = Math.sin(TAU * (phase * (1 + (i % 2)) + hash(i * 2.9)));
      if (t < 0.35 || sy > floorTop - 5 * k) continue;
      const alpha = Math.min(1, (t - 0.35) / 0.4) * calm(px, feet, sx, sy);
      const c = SPARK[i % 2];
      put(px, sx, sy, c, alpha);
      if (t > 0.7)
        for (const [dx, dy] of PLUS)
          put(px, sx + dx, sy + dy, c, alpha * (t - 0.4));
    }

    const body = floorTop + 4 * k;
    for (let y = Math.ceil(body); y < px.h; y++) {
      for (let x = 0; x < px.w; x++) {
        const v = quantize((y - body) / (px.h - body), 4, x, y);
        put(px, x, y, mix(NEAR[2], NEAR[1], v));
      }
    }

    ROWS.forEach(([depth, r0, gap], row) => {
      const lumps: [number, number, number][] = [];
      if (!row)
        for (const side of [-1, 1])
          for (const [dx, dy, r] of MOUND)
            lumps.push([
              cx + side * mid + dx * k,
              floorTop + dy * k,
              Math.max(2, r * k),
            ]);
      for (let x = -r0 * k, i = 0; x < px.w + r0 * k; i++) {
        const j = hash(row * 17 + i * 3.1);
        const r = r0 * k * (0.65 + 0.7 * hash(row * 7 + i * 1.3));
        const bob = row ? 0 : 0.7 * k * Math.sin(TAU * (phase + j));
        lumps.push([x, floorTop + depth * k + (j - 0.5) * 3 * k + bob, r]);
        x += gap * k * (0.7 + 0.6 * hash(row * 5 + i * 2.1));
      }
      for (const [x, y, r] of lumps.reverse())
        if (y - r < px.h) puff(px, x, y, r, NEAR, px.h, true);
    });

    const reach = px.w > 60 ? 1 : k;
    ring(
      px,
      feet,
      24 * reach,
      7 * reach,
      rgb("#6fa8dc"),
      px.w > 60 ? 0.7 : 0.5,
    );
  },
};
