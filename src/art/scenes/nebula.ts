import type { Effect } from "../effects";
import {
  bayer,
  hash,
  mix,
  put,
  rgb,
  ring,
  TAU,
  verticalGradient,
  wrap,
  type Pixels,
  type Point,
  type Rgb,
} from "../pixels";
import { jagged, PLUS, stars, WHITE } from "../scene-kit";

const LATTICE = Float32Array.from({ length: 4096 }, (_, i) =>
  hash(i * 1.37 + 7),
);

function noise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const x0 = xi & 63;
  const x1 = (xi + 1) & 63;
  const y0 = (yi & 63) << 6;
  const y1 = ((yi + 1) & 63) << 6;
  const a = LATTICE[y0 + x0];
  const b = LATTICE[y0 + x1];
  const c = LATTICE[y1 + x0];
  const d = LATTICE[y1 + x1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x: number, y: number, octaves: number): number {
  let sum = 0;
  let amp = 0.5;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise(x, y);
    total += amp;
    const nx = x * 1.6 - y * 1.2;
    y = x * 1.2 + y * 1.6;
    x = nx;
    amp *= 0.5;
  }
  return sum / total;
}

const smooth = (lo: number, hi: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};

const level = (v: number, n: number, x: number, y: number): number =>
  Math.max(0, Math.min(n, Math.floor(v * n + 0.2 + 0.6 * bayer(x, y))));

const VIOLET = ["#1d0e58", "#33198f", "#5233c4", "#7f5df0", "#b8a4ff"].map(rgb);
const MAGENTA = ["#400a4c", "#7a157a", "#b72a9c", "#ee55c0", "#ff9fe6"].map(
  rgb,
);
const TEAL = ["#04303a", "#07596a", "#0f8f94", "#4ed0c4"].map(rgb);
const CORE = rgb("#fff3fb");
const STAR_WHITE = ["#ffffff", "#d6ebff", "#a8d0ff"].map(rgb);
const ROCK_TOP = ["#2b2330", "#443844", "#64544f", "#86746a", "#a89686"].map(
  rgb,
);
const ROCK_SIDE = ["#16111d", "#241d29", "#352b30", "#4a3d3a"].map(rgb);
const PEBBLE = ["#3f363b", "#6b5d58", "#a39382"].map(rgb);
const GLOW = rgb("#c05ad8");

const screen = (a: number, b: number): number =>
  255 - ((255 - a) * (255 - b)) / 255;

const CELL = 2;
let grid = new Float32Array(0);

function gas(px: Pixels, phase: number, core: Point, unit: number): void {
  const gw = Math.ceil(px.w / CELL) + 2;
  const gh = Math.ceil(px.h / CELL) + 2;
  if (grid.length < gw * gh * 4) grid = new Float32Array(gw * gh * 4);
  const th = TAU * phase;
  const c1 = Math.cos(th);
  const s1 = Math.sin(th);
  const c2 = Math.cos(th + 2.1);
  const s2 = Math.sin(th + 2.1);
  const c3 = Math.cos(th + 4.2);
  const s3 = Math.sin(th + 4.2);
  const rot = 0.06 * Math.sin(th + 0.7);
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const u0 = (i * CELL - core.x) / unit;
      const v0 = (j * CELL - core.y) / unit;
      const u = u0 * cr - v0 * sr;
      const v = u0 * sr + v0 * cr;
      const q1 = fbm(u * 1.3 + 0.12 * c1, v * 1.3 + 0.12 * s1, 3);
      const q2 = fbm(u * 1.3 + 7.1 - 0.1 * s2, v * 1.3 + 3.7 + 0.1 * c2, 3);
      const a = fbm(
        u * 1.7 + 2.2 * q1 + 0.1 * c3,
        v * 1.7 + 2.2 * q2 + 0.1 * s3,
        5,
      );
      const b = fbm(
        u * 1.5 - 2 * q2 + 11.3 + 0.1 * s1,
        v * 1.5 + 2 * q1 + 5.9 - 0.1 * c1,
        5,
      );
      const w = fbm(u * 1.8 + 2 * q1 + 20.1, v * 1.8 + 2 * q2 + 13.7, 3);
      const rr = Math.hypot(u * 0.85, v * 1.2);
      const em = 1 - smooth(0.08, 0.62, rr + 0.5 * (a - 0.5));
      const ev = 1 - smooth(0.15, 1.05, rr + 0.5 * (b - 0.5));
      const et = smooth(0.25, 0.55, rr) * (1 - smooth(0.8, 1.3, rr));
      const ridge = 1 - Math.abs(2 * w - 1);
      const lu = u * 0.88 + v * 0.48;
      const lv = v * 0.88 - u * 0.48;
      const ln = fbm(lu * 0.9 + 1.4 * q2 + 31.7, lv * 2.4 + 1.4 * q1 + 14.9, 3);
      const lm = fbm(lu * 1.1 + 1.2 * q1 + 4.2, lv * 2.6 + 1.2 * q2 + 27.5, 3);
      const o = (j * gw + i) * 4;
      grid[o] = ev * smooth(0.35, 0.85, b) * 0.9;
      grid[o + 1] = em * smooth(0.34, 0.8, a) * 1.1;
      grid[o + 2] = et * smooth(0.72, 0.97, ridge) ** 1.4 * 0.65;
      grid[o + 3] =
        Math.max(
          smooth(0.62, 0.91, 1 - Math.abs(2 * ln - 1)),
          0.7 * smooth(0.68, 0.93, 1 - Math.abs(2 * lm - 1)),
        ) *
        (1 - smooth(0.45, 0.85, rr));
    }
  }
  const sigma = unit * 0.085;
  const halo = unit * 0.28;
  const mixed = [0, 0, 0];
  const add = (colours: Rgb[], d: number, x: number, y: number): void => {
    const l = level(d, colours.length, x, y);
    if (!l) return;
    const c = colours[l - 1];
    mixed[0] = screen(mixed[0], c[0]);
    mixed[1] = screen(mixed[1], c[1]);
    mixed[2] = screen(mixed[2], c[2]);
  };
  for (let y = 0; y < px.h; y++) {
    const fy = y / CELL;
    const j = Math.floor(fy);
    const ty = fy - j;
    const low = 1 - 0.8 * smooth(0.55, 0.9, y / px.h);
    for (let x = 0; x < px.w; x++) {
      const fx = x / CELL;
      const i = Math.floor(fx);
      const tx = fx - i;
      const o = (j * gw + i) * 4;
      const p = o + gw * 4;
      const w00 = (1 - tx) * (1 - ty);
      const w10 = tx * (1 - ty);
      const w01 = (1 - tx) * ty;
      const w11 = tx * ty;
      const lan =
        grid[o + 3] * w00 +
        grid[o + 7] * w10 +
        grid[p + 3] * w01 +
        grid[p + 7] * w11;
      const dist2 = (x - core.x) ** 2 + (y - core.y) ** 2;
      const dark = (1 - 0.95 * lan) * low;
      const dc =
        dist2 < 12 * sigma * sigma
          ? Math.exp(-dist2 / (sigma * sigma)) * (1 - 0.45 * lan)
          : 0;
      const dh = dist2 < 8 * halo * halo ? Math.exp(-dist2 / (halo * halo)) : 0;
      mixed[0] = mixed[1] = mixed[2] = 0;
      add(
        VIOLET,
        (grid[o] * w00 +
          grid[o + 4] * w10 +
          grid[p] * w01 +
          grid[p + 4] * w11) *
          dark,
        x,
        y,
      );
      add(
        MAGENTA,
        (grid[o + 1] * w00 +
          grid[o + 5] * w10 +
          grid[p + 1] * w01 +
          grid[p + 5] * w11 +
          dh * 0.55) *
          dark,
        x,
        y,
      );
      add(
        TEAL,
        (grid[o + 2] * w00 +
          grid[o + 6] * w10 +
          grid[p + 2] * w01 +
          grid[p + 6] * w11) *
          dark,
        x,
        y,
      );
      const lc = level(dc, 4, x, y) / 4;
      const i4 = (y * px.w + x) * 4;
      const d = px.data;
      d[i4] = screen(d[i4], mixed[0] + (CORE[0] - mixed[0]) * lc);
      d[i4 + 1] = screen(d[i4 + 1], mixed[1] + (CORE[1] - mixed[1]) * lc);
      d[i4 + 2] = screen(d[i4 + 2], mixed[2] + (CORE[2] - mixed[2]) * lc);
    }
  }
}

const CLUSTER = [
  [0, 0, 1],
  [7, -4, 0.8],
  [-8, 3, 0.8],
  [3, 9, 0.7],
  [-5, -8, 0.7],
  [11, 3, 0.6],
  [-12, -3, 0.6],
  [6, -10, 0.5],
  [-3, 11, 0.5],
];

const TOP: [number, number][] = [
  [-32, -1],
  [-26, -7],
  [-14, -9.5],
  [-3, -8],
  [9, -10],
  [21, -7.5],
  [31, -2.5],
  [33, 2],
  [29, 6.5],
  [20, 9],
  [9, 10.5],
  [-2, 9.5],
  [-12, 10.5],
  [-23, 8],
  [-30, 4],
];

const HULL: [number, number][] = [
  ...TOP.slice(0, 8),
  [30, 8],
  [25, 12.5],
  [19, 16.5],
  [13, 19],
  [7, 17.5],
  [2, 20.5],
  [-4, 18],
  [-9, 21],
  [-15, 17],
  [-21, 14],
  [-27, 10],
  [-31, 6],
];

const CRATERS = [
  [-17, -2, 5],
  [-5, 4.5, 3],
  [17, 2.5, 4.5],
  [10, -5.5, 2.6],
  [-26, 2, 2.2],
];

const DENTS = [
  [-18, 0.45, 2.6],
  [12, 0.55, 2],
];

const PEBBLES = [
  [-44, -4, 3.2],
  [-39, 12, 2.2],
  [44, -8, 3.8],
  [38, 10, 2],
  [-50, -18, 1.6],
  [50, 3, 1.6],
  [-33, -20, 1.4],
];

function span(poly: Point[], x: number): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.x === b.x || x < Math.min(a.x, b.x) || x > Math.max(a.x, b.x))
      continue;
    const y = a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
    lo = Math.min(lo, y);
    hi = Math.max(hi, y);
  }
  return lo <= hi ? [lo, hi] : null;
}

function rock(px: Pixels, feet: Point, phase: number, k: number): void {
  const cx = feet.x;
  const cy = feet.y - 3.5 * k;
  const fit = Math.max(
    0.15,
    Math.min(1.15, (px.h - 2 - cy - 10 * k) / (11 * k)),
  );
  const place = (poly: [number, number][]): Point[] =>
    poly.map(([x, y]) => ({
      x: cx + x * k,
      y: cy + (y > 10 ? 10 + (y - 10) * fit : y) * k,
    }));
  const top = place(TOP);
  const hull = place(HULL);
  for (let x = Math.ceil(cx - 33 * k); x <= Math.floor(cx + 33 * k); x++) {
    const upper = span(top, x);
    const whole = span(hull, x);
    if (!upper || !whole) continue;
    const dxk = (x - cx) / k;
    for (
      let y = Math.ceil(whole[0]);
      y <= Math.min(px.h - 1, Math.floor(whole[1]));
      y++
    ) {
      const dyk = (y - cy) / k;
      const speck = hash(x * 12.9 + y * 78.2);
      const nudge = speck > 0.96 ? 1 : speck < 0.04 ? -1 : 0;
      if (y <= upper[1]) {
        const lit =
          2.7 -
          0.065 * dxk -
          0.12 * dyk +
          0.9 * (jagged(x * 0.7 + y, 5 * k, 31) - 0.5);
        let t = level(lit / 4, 4, x, y);
        for (const [cu, cv, size] of CRATERS) {
          const crx = size * k;
          if (crx < 1.2) continue;
          const a = (x - (cx + cu * k)) / crx;
          const b = (y - (cy + cv * k)) / (crx * 0.42);
          const d2 = a * a + b * b;
          if (d2 < 1) t -= a + b * 1.5 > 0.3 ? 1 : 2;
          else if (d2 < 1.5 && a + b < 0) t += 1;
        }
        if (y > upper[1] - 1) t = dxk < 10 ? 4 : 3;
        else if (y < upper[0] + 1) t += 1;
        put(px, x, y, ROCK_TOP[Math.min(4, Math.max(0, t + nudge))]);
      } else {
        const d = (y - upper[1]) / Math.max(1, whole[1] - upper[1]);
        const strata = jagged(x, 2.5 * k, 21) > 0.78 ? 1 : 0;
        let t = level(0.85 - 0.85 * d - 0.006 * dxk, 3, x, y) - strata + nudge;
        for (const [cu, cd, size] of DENTS) {
          const crx = size * k;
          if (crx < 1.2) continue;
          const a = (x - (cx + cu * k)) / crx;
          const b = (y - (upper[1] + cd * (whole[1] - upper[1]))) / (crx * 0.7);
          const d2 = a * a + b * b;
          if (d2 < 1) t -= a + b > 0.2 ? 0 : 1;
          else if (d2 < 1.6 && b > 0) t += 1;
        }
        const c = ROCK_SIDE[Math.min(3, Math.max(0, t))];
        put(px, x, y, y > whole[1] - 1.6 && dxk < 12 ? mix(c, GLOW, 0.35) : c);
      }
    }
  }
  PEBBLES.forEach(([dx, dy, size], i) => {
    const s = Math.max(1, size * k);
    const x0 = Math.min(px.w - 3, Math.max(3, cx + dx * k));
    const y0 = cy + dy * k + 1.6 * k * Math.sin(TAU * (phase + hash(i * 4.7)));
    for (let y = Math.floor(y0 - s); y <= y0 + s; y++) {
      for (let x = Math.floor(x0 - s); x <= x0 + s; x++) {
        const a = (x - x0) / s;
        const b = (y - y0) / (s * 0.75);
        if (a * a + b * b > 1) continue;
        put(px, x, y, PEBBLE[a + b < -0.4 ? 2 : a + b < 0.5 ? 1 : 0]);
      }
    }
  });
}

export const nebula: Effect = {
  id: "nebula",
  name: "เนบิวลา",
  plate: "#120a2a",
  paint(px, feet, phase) {
    phase = wrap(phase);
    const k = Math.min(px.w / 118, px.h / 88);
    const core = { x: px.w * 0.3, y: px.h * 0.33 };
    verticalGradient(px, [rgb("#04030f"), rgb("#090622"), rgb("#0e0a2c")]);
    gas(px, phase, core, px.w * 0.5);
    stars(
      px,
      phase,
      Math.round((px.w * px.h) / 150),
      41,
      [rgb("#7f89cc"), rgb("#9aa6e8"), rgb("#b8c2ff")],
      0.85,
    );
    stars(
      px,
      phase,
      Math.round((px.w * px.h) / 450),
      57,
      [WHITE, rgb("#cfe6ff"), rgb("#ffe8c4")],
      0.85,
    );
    CLUSTER.forEach(([dx, dy, power], i) => {
      const twinkle =
        0.75 + 0.25 * Math.sin(TAU * (phase * (1 + (i % 2)) + hash(i * 3.3)));
      const c = STAR_WHITE[i % 3];
      const x = core.x + dx * k;
      const y = core.y + dy * k;
      put(px, x, y, c, twinkle);
      if (power > 0.75)
        for (const [ax, ay] of PLUS)
          put(px, x + ax, y + ay, c, twinkle * power * 0.6);
    });
    const floor = px.w > 60 ? 1 : k;
    rock(px, feet, phase, floor);
    ring(
      px,
      feet,
      24 * floor,
      7 * floor,
      rgb("#b99aff"),
      px.w > 60 ? 0.55 : 0.35,
    );
  },
};
