import type { Effect } from "../effects";
import { calm, stars } from "../scene-kit";
import {
  hash,
  mix,
  put,
  quantize,
  rgb,
  ring,
  stamp,
  TAU,
  wrap,
  type Pixels,
  type Point,
  type Rgb,
} from "../pixels";

const SKY = ["#04071c", "#0c1240", "#1f1d5c", "#4a3070"].map(rgb);
const WATER_FAR = rgb("#2a2a70");
const WATER_NEAR = rgb("#080c2c");
const HILL = rgb("#161850");
const SHORE = rgb("#0a0c27");
const WINDOW = rgb("#ffc45e");
const GLOW = rgb("#ff8a3c");
const RIPPLE = rgb("#6a82d0");
const FLAME = rgb("#ffd36a");
const EMBER = rgb("#ff8f3a");
const DEEP = rgb("#c4602a");
const GRASS = [rgb("#173a2c"), rgb("#07161a")];
const TUFT = [rgb("#1f4a36"), rgb("#2e6b49")];
const RIM = rgb("#2a5a46");
const POLE = rgb("#2a1b16");
const REED = [rgb("#143426"), rgb("#24523a")];
const CATTAIL = rgb("#4a3224");
const STONE = [rgb("#4a5a6c"), rgb("#2a3646")];

const NEAR = ["DDD", "OOO", "YYY", ".F."];
const MID = ["OO", "YF"];
const LAMP = [".DD.", "DOOD", "DYYD", "DYYD", "DOOD", ".DD."];
const FLOAT = ["OYO", "DDD"];
const NEAR_COLOURS = {
  D: rgb("#b8481c"),
  O: rgb("#f0862a"),
  Y: rgb("#ffc65a"),
  F: rgb("#fff2b0"),
};
const MID_COLOURS = {
  O: rgb("#e0922c"),
  Y: rgb("#f6d070"),
  F: rgb("#fff0b0"),
};
const FAR_COLOURS = [rgb("#c8962c"), rgb("#e8cc70")];
const LAMP_COLOURS = {
  D: rgb("#4a2412"),
  O: rgb("#f0862a"),
  Y: rgb("#ffe08a"),
};
const FLOAT_COLOURS = {
  D: rgb("#3a1c10"),
  O: rgb("#f0862a"),
  Y: rgb("#ffe08a"),
};

const LANES = [
  { x: 0.09, offset: 0.44, count: 3, size: 2 },
  { x: 0.66, offset: 0, count: 3, size: 2 },
  { x: 0.34, offset: 0.84, count: 2, size: 2 },
  { x: 0.91, offset: 0.67, count: 4, size: 2 },
  { x: 0.21, offset: 0.28, count: 4, size: 1 },
  { x: 0.45, offset: 0.16, count: 3, size: 1 },
  { x: 0.79, offset: 0.84, count: 4, size: 1 },
  { x: 0.05, offset: 0.95, count: 3, size: 0 },
  { x: 0.34, offset: 0.61, count: 2, size: 0 },
  { x: 0.56, offset: 0.24, count: 4, size: 0 },
  { x: 0.95, offset: 0.89, count: 3, size: 0 },
];

const FLOATERS = [
  { x: 0.3, depth: 0.62, big: true },
  { x: 0.72, depth: 0.72, big: true },
  { x: 0.16, depth: 0.38, big: false },
  { x: 0.87, depth: 0.42, big: false },
];

const ROOF = [
  { half: 15, rows: 1 },
  { half: 12, rows: 1 },
  { half: 10, rows: 1 },
  { half: 8, rows: 1 },
  { half: 5, rows: 2 },
  { half: 10, rows: 1 },
  { half: 7, rows: 1 },
  { half: 5, rows: 1 },
  { half: 3, rows: 1 },
  { half: 1, rows: 1 },
];

type Plot = (x: number, y: number, c: Rgb) => void;
type Light = { x: number; y: number; size: number; t: number; lane: number };
type Stage = {
  px: Pixels;
  feet: Point;
  phase: number;
  w: number;
  h: number;
  k: number;
  small: boolean;
  wl: number;
  bank: number;
};

const dim = (c: Rgb, f: number): Rgb => [c[0] * f, c[1] * f, c[2] * f];
const dimAll = <K extends string>(p: Record<K, Rgb>, f: number) =>
  Object.fromEntries(
    Object.entries<Rgb>(p).map(([key, c]) => [key, dim(c, f)]),
  ) as Record<K, Rgb>;

const edge = (s: Stage, x: number) =>
  s.bank +
  Math.round(
    1.2 * Math.sin(TAU * ((x / s.w) * 2.3 + 0.1)) +
      0.8 * Math.sin(TAU * ((x / s.w) * 5.1 + 0.4)),
  );

function fill(
  plot: Plot,
  x: number,
  y: number,
  w: number,
  h: number,
  c: Rgb,
): void {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) plot(x + i, y + j, c);
}

function glow(
  px: Pixels,
  cx: number,
  cy: number,
  r: number,
  a: number,
  squash = 1,
): void {
  for (let y = Math.floor(cy - r * squash); y <= cy + r * squash; y++) {
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const v = 1 - Math.hypot(x - cx, (y - cy) / squash) / r;
      if (v <= 0) continue;
      const q = quantize(v * v, 3, x, y);
      if (q > 0) put(px, x, y, GLOW, q * a);
    }
  }
}

function skyLights({ w, wl, k, phase, small }: Stage): Light[] {
  const start = wl + 3 * k;
  const travel = start + 8 * k;
  const out: Light[] = [];
  LANES.forEach(({ x: lx, offset: o, count, size }, lane) => {
    if (small && lane % 3) return;
    const n = small ? Math.min(count, 2) : count;
    const phi = hash(lane * 3.7);
    const sway = (2.5 + size * 0.5) * k * (0.7 + 0.6 * hash(lane * 5.3));
    const period = 1.5 + 1.5 * hash(lane * 9.1);
    const lean = (hash(lane * 2.9) * 14 - 4) * k;
    for (let m = 0; m < n; m++) {
      const t = wrap(o + (m + phase) / n);
      out.push({
        x:
          lx * w +
          sway * Math.sin(TAU * ((t * n) / period + phi)) +
          lean * (t - 0.5) +
          0.7 * Math.sin(TAU * (phase + phi)),
        y: start - t * travel,
        size,
        t,
        lane,
      });
    }
  });
  return out.sort((a, b) => a.size - b.size);
}

function drawLight(s: Stage, l: Light): void {
  const { px, feet, phase } = s;
  const cx = Math.round(l.x);
  const cy = Math.round(l.y);
  const f = (0.5 + 0.5 * calm(px, feet, cx, cy)) * (1 - 0.2 * l.t);
  const flick = Math.sin(TAU * (phase * 2 + hash(l.lane * 1.9))) > 0;
  if (l.size === 2 && !s.small) {
    const p = dimAll(NEAR_COLOURS, f);
    if (!flick) p.F = p.Y;
    stamp(px, NEAR, cx - 1, cy - 2, p);
  } else if (l.size >= 1) {
    const p = dimAll(MID_COLOURS, f);
    if (!flick) p.F = p.Y;
    stamp(px, MID, cx, cy - 1, p);
  } else {
    put(px, cx, cy - 1, dim(FAR_COLOURS[0], f));
    put(px, cx, cy, dim(FAR_COLOURS[1], f));
  }
}

function shore(plot: Plot, lit: Point[], s: Stage): void {
  const { w, wl, k, small } = s;
  const u = (n: number) => Math.max(1, Math.round(n * k));
  for (let x = 0; x < w; x++) {
    const t = x / w;
    const ridge =
      wl -
      k *
        (5 +
          3.5 * Math.sin(TAU * (t * 1.1 + 0.1)) +
          1.5 * Math.sin(TAU * (t * 2.7 + 0.6)));
    for (let y = Math.max(0, Math.floor(ridge)); y < wl; y++) plot(x, y, HILL);
    const low =
      wl - k * (1 + 2 * (0.5 + 0.5 * Math.sin(TAU * (t * 1.7 + 0.45))));
    for (let y = Math.floor(low); y < wl; y++) plot(x, y, SHORE);
  }

  const tower = Math.round(w * 0.2);
  let y = wl;
  fill(plot, tower - u(7), y - u(2), u(7) * 2 + 1, u(2), SHORE);
  y -= u(2);
  for (let i = 0; i < (small ? 2 : 3); i++) {
    const body = u(4 - i);
    const eave = u(8 - 1.5 * i);
    fill(plot, tower - body, y - u(3), body * 2 + 1, u(3), SHORE);
    if (i < 2) lit.push({ x: tower, y: y - u(2) });
    y -= u(3);
    fill(plot, tower - eave, y - u(2), eave * 2 + 1, u(2), SHORE);
    plot(tower - eave - 1, y - u(2) - 1, SHORE);
    plot(tower + eave + 1, y - u(2) - 1, SHORE);
    y -= u(2);
  }
  fill(plot, tower, y - u(6), 1, u(6) + 1, SHORE);

  const hall = Math.round(w * 0.8);
  fill(plot, hall - u(9), wl - u(3), u(9) * 2 + 1, u(3), SHORE);
  let top = wl - u(3);
  ROOF.forEach(({ half: hw, rows }, i) => {
    if (small && i % 3) return;
    fill(plot, hall - u(hw), top - u(rows), u(hw) * 2 + 1, u(rows), SHORE);
    top -= u(rows);
    if (i % 5) return;
    plot(hall - u(hw) - 1, top - 1, SHORE);
    plot(hall + u(hw) + 1, top - 1, SHORE);
  });
  for (const dx of [-6, -2, 2, 6]) lit.push({ x: hall + u(dx), y: wl - u(2) });
}

function reflection(
  s: Stage,
  x: number,
  y: number,
  size: number,
  a: number,
  phi: number,
): void {
  const { px, phase, bank } = s;
  const widths = [
    [1, 1],
    [2, 2, 1],
    [3, 3, 2, 2, 1],
  ][size];
  widths.forEach((w, i) => {
    const yy = Math.round(y + 2 * i + 0.5 * Math.sin(TAU * (phase + phi)));
    if (yy > bank) return;
    const cx = Math.round(x + Math.sin(TAU * (i * 0.9 + phase + phi)));
    const alpha = Math.min(1, a * (1 - i / (widths.length + 1)) + 0.1);
    for (let dx = 0; dx < w; dx++)
      put(
        px,
        cx - (w >> 1) + dx,
        yy,
        i === 0 ? FLAME : i < 3 ? EMBER : DEEP,
        alpha,
      );
  });
}

function ripples(s: Stage): void {
  const { px, phase, w, wl, bank } = s;
  const span = Math.max(1, bank - wl);
  const rows = Math.max(3, Math.round(span / 2));
  for (let r = 0; r < rows; r++) {
    const y = wl + 1 + Math.round(((r + 0.5) / rows) * (span - 2));
    const v = (y - wl) / span;
    for (let j = 0; j < 3; j++) {
      const n = r * 7 + j * 3.3;
      const cx = hash(n) * w + 2.5 * Math.sin(TAU * (phase + hash(n + 1)));
      const len = Math.max(2, Math.round((2 + 4 * hash(n + 2)) * (0.5 + v)));
      const lit =
        0.5 + 0.5 * Math.sin(TAU * (phase * (1 + (j % 2)) + hash(n + 3)));
      for (let i = -len; i <= len; i++) {
        const q = quantize((1 - Math.abs(i) / (len + 1)) * lit, 3, cx + i, y);
        if (q > 0) put(px, cx + i, y, RIPPLE, q * 0.6);
      }
    }
  }
}

function river(s: Stage, lights: Light[], lit: Point[]): void {
  const { px, feet, phase, w, k, small, wl, bank } = s;
  const span = Math.max(1, bank - wl);
  for (let y = wl; y < bank + 3; y++) {
    const v = (y - wl) / span;
    for (let x = 0; x < w; x++)
      put(px, x, y, mix(WATER_FAR, WATER_NEAR, quantize(v, 6, x, y)));
  }
  shore(
    (x, y, c) => {
      const ry = Math.round(wl + (wl - 1 - y) * 0.5);
      if (ry >= bank + 2 || Math.sin(TAU * (ry * 0.23 + x * 0.04 + phase)) > 0.75)
        return;
      const ox = Math.round(1.2 * Math.sin(TAU * (phase + ry * 0.31)));
      put(px, x + ox, ry, mix(c, WATER_NEAR, 0.4));
    },
    [],
    s,
  );
  ripples(s);
  for (const p of lit)
    reflection(s, p.x, wl + (wl - 1 - p.y) * 0.5, 0, 0.7, hash(p.x * 2.3));
  for (const l of lights) {
    const reach = (wl - l.y) / 2.1;
    if (reach < 0) continue;
    const c = calm(px, feet, l.x, l.y);
    const size = small ? 0 : l.size;
    if (size > 0) glow(px, l.x, wl + reach + 2 * k, 4 + 2 * size, 0.2 * c, 0.5);
    reflection(
      s,
      l.x,
      wl + reach,
      size,
      [0.55, 0.75, 0.95][size] * c,
      hash(l.lane * 4.1),
    );
  }
}

function floaters(s: Stage): void {
  const { px, phase, w, wl, bank } = s;
  FLOATERS.forEach(({ x: fx, depth, big }, i) => {
    const x = Math.round(fx * w);
    const bob = Math.round(0.7 * Math.sin(TAU * (phase + hash(i * 2.1))));
    const y = Math.round(wl + (bank - wl) * depth) + bob;
    glow(px, x, y, big ? 7 : 4, 0.4, 0.7);
    if (big) stamp(px, FLOAT, x - 1, y - 1, FLOAT_COLOURS);
    else {
      put(px, x, y, FLAME);
      put(px, x + 1, y, EMBER);
    }
    reflection(s, x, y + (big ? 2 : 1), big ? 1 : 0, 0.9, hash(i * 7.7));
  });
}

function reed(
  s: Stage,
  x: number,
  y: number,
  height: number,
  lean: number,
  seed: number,
): void {
  const { px, phase } = s;
  const sway = 1.4 * Math.sin(TAU * (phase + hash(seed * 1.3)));
  for (let j = 0; j < height; j++) {
    const t = j / height;
    put(px, x + lean * t + sway * t * t, y - j, REED[t < 0.5 ? 0 : 1]);
  }
  if (hash(seed * 2.7) > 0.45)
    for (let j = 0; j < 3; j++)
      put(px, x + lean + sway, y - height + 2 - j, CATTAIL);
}

function lamp(s: Stage, x: number, base: number, height: number, i: number) {
  const { px, phase, k, small } = s;
  const top = Math.round(base - height);
  const steady = 0.85 + 0.15 * Math.sin(TAU * (phase * 2 + hash(i * 3.3)));
  if (small) {
    glow(px, x, base - 1, 3, 0.4 * steady);
    put(px, x, base - 1, FLAME);
    put(px, x, base, EMBER);
    return;
  }
  glow(px, x, base + 1, 13 * k, 0.2 * steady, 0.35);
  glow(px, x, top + 3, 10 * k, 0.34 * steady);
  for (let y = top + 5; y <= base; y++) put(px, x, y, POLE);
  stamp(px, LAMP, x - 2, top, LAMP_COLOURS);
}

function grass(s: Stage): void {
  const { px, feet, phase, w, h, k, small } = s;
  for (let x = 0; x < w; x++) {
    const top = edge(s, x);
    for (let y = top; y < h; y++) {
      const v = (y - s.bank) / (h - s.bank);
      put(px, x, y, mix(GRASS[0], GRASS[1], quantize(v, 4, x, y)));
    }
    put(px, x, top, RIM, 0.8);
  }
  const tufts = Math.round((w * (h - s.bank)) / 90);
  for (let i = 0; i < tufts; i++) {
    const x = Math.floor(hash(i * 4.4) * w);
    const top = edge(s, x) + 2;
    const y = top + Math.floor(hash(i * 6.2) * (h - top - 1));
    if (((x - feet.x) / 27) ** 2 + ((y - feet.y) / 9) ** 2 < 1) continue;
    const sway = Math.round(Math.sin(TAU * (phase + hash(i * 2.6))));
    const c = TUFT[i % 2];
    put(px, x, y, c);
    put(px, x - 1, y, c);
    put(px, x + 1, y, c);
    put(px, x, y - 1, c);
    put(px, x - 2, y - 1, c);
    put(px, x + 2, y - 1, c);
    put(px, x + sway, y - 2, c);
  }
  if (!small)
    for (const [sx, sy, sw] of [
      [0.24, 7, 4],
      [0.78, 6, 3],
      [0.96, 14, 4],
    ]) {
      const x = Math.round(w * sx);
      const y = Math.round(s.bank + sy * k);
      fill((a, b, c) => put(px, a, b, c), x, y, sw, 1, STONE[0]);
      fill((a, b, c) => put(px, a, b, c), x - 1, y + 1, sw + 2, 1, STONE[1]);
    }
  for (const [rx, rn] of [
    [0.05, 4],
    [0.15, 3],
    [0.92, 4],
    [0.84, 3],
  ]) {
    for (let j = 0; j < rn; j++) {
      const x = Math.round(w * rx + (j - rn / 2) * 2 * k);
      reed(
        s,
        x,
        edge(s, x) + 1,
        Math.round((8 + 5 * hash(j + rx * 9)) * k),
        (j % 2 ? 1 : -1) * 2 * hash(j * 3.1 + rx),
        j + rx * 20,
      );
    }
  }
  lamp(s, Math.round(w * 0.1), s.bank + 8 * k, 11 * k, 0);
  lamp(s, Math.round(w * 0.9), s.bank + 11 * k, 13 * k, 1);
}

export const lanterns: Effect = {
  id: "lanterns",
  name: "เทศกาลโคมลอย",
  plate: "#0a0f33",
  paint(px, feet, phase) {
    phase = wrap(phase);
    const { w, h } = px;
    const wl = Math.max(1, Math.round(h * 0.47));
    const s: Stage = {
      px,
      feet,
      phase,
      w,
      h,
      k: h / 88,
      small: h < 50,
      wl,
      bank: Math.round(h * 0.66),
    };

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const t = quantize(Math.min(1, y / wl), 16, x, y) * 3;
        const i = Math.min(2, Math.floor(t));
        put(px, x, y, mix(SKY[i], SKY[i + 1], t - i));
      }
    }
    stars(
      px,
      phase,
      Math.round((w * h) / 520),
      5,
      [rgb("#5a6699"), rgb("#8a97cc")],
      0.38,
    );

    const lights = skyLights(s);
    for (const l of lights) {
      const r = (l.size === 2 ? 7 : l.size === 1 ? 4 : 3) * s.k;
      const a = (l.size === 2 ? 0.3 : 0.26) * calm(px, feet, l.x, l.y);
      const lift = a * Math.min(1, l.t / 0.2) * (1 - 0.3 * l.t);
      glow(px, l.x, l.y, r, lift);
      if (l.size === 2) glow(px, l.x, l.y, r / 2, lift);
    }
    for (const l of lights) drawLight(s, l);

    const lit: Point[] = [];
    shore((x, y, c) => put(px, x, y, c), lit, s);
    for (const p of lit) {
      const a =
        0.75 + 0.25 * Math.sin(TAU * (phase * 2 + hash(p.x * 1.7 + p.y)));
      put(px, p.x, p.y, WINDOW, a);
    }

    river(s, lights, lit);
    if (!s.small) floaters(s);
    grass(s);
    ring(px, feet, 24, 7, rgb("#ffd38a"), 0.55);
  },
};
