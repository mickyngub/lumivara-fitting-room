import type { Effect } from "../effects";
import { calm, WHITE } from "../scene-kit";
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

const HAZE = ["#d6eedd", "#bfe3cb", "#9bcfae", "#79b992"].map(rgb);
const MOSS = [rgb("#86bf8c"), rgb("#2f6a3c")];
const MOSS_LIGHT = rgb("#7cc070");
const MOSS_DARK = rgb("#1f4a2c");
const SPECK = rgb("#a8d46a");
const EARTH = [rgb("#dccd9e"), rgb("#bba878"), rgb("#96835a")];
const BEAM = rgb("#fff0a0");
const LEAF = [rgb("#2e6e3c"), rgb("#4b9a4a"), rgb("#b2dc5c")];
const STONE = [rgb("#c3cdbf"), rgb("#9aab9c"), rgb("#5d6f62")];
const FALLEN = [rgb("#c9d85a"), rgb("#9bb140"), rgb("#b78a3a"), rgb("#7a8f3a")];
const FAR = [rgb("#a9d2b8"), rgb("#8dbb9f")];
const MID = [rgb("#8bcf8e"), rgb("#58a572"), rgb("#336e50")];
const NEAR = [
  rgb("#c2ea86"),
  rgb("#6dba68"),
  rgb("#4fa058"),
  rgb("#3d8a50"),
  rgb("#245a3a"),
];
const NEAR_RING = [rgb("#d8f6a8"), rgb("#a5de92"), rgb("#58a062")];
const DRIFT = [
  [rgb("#b9dc48"), rgb("#5f9b3a")],
  [rgb("#d8bc44"), rgb("#9a7a2a")],
];

const NEAR_STALKS = [
  { x: 0.04, width: 5 },
  { x: 0.17, width: 4 },
  { x: 0.85, width: 5 },
  { x: 0.96, width: 6 },
];

const DRIFTERS = [
  { x: 0.15, offset: 0 },
  { x: 0.62, offset: 1 / 12 },
  { x: 0.38, offset: 2 / 12 },
  { x: 0.85, offset: 3 / 12 },
];

type Stage = {
  px: Pixels;
  feet: Point;
  phase: number;
  w: number;
  h: number;
  k: number;
  small: boolean;
  floor: number;
  haze: Rgb[];
};
type Stalk = {
  x: number;
  base: number;
  width: number;
  lean: number;
  sway: number;
  gap: number;
  first: number;
  seed: number;
};

const dim = (c: Rgb, f: number): Rgb => [c[0] * f, c[1] * f, c[2] * f];

const hazeAt = (s: Stage, y: number): Rgb =>
  s.haze[Math.max(0, Math.min(s.h - 1, Math.round(y)))];

const noise = (x: number, y: number): number => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const sx = (x - xi) ** 2 * (3 - 2 * (x - xi));
  const sy = (y - yi) ** 2 * (3 - 2 * (y - yi));
  const a = hash(xi * 3.7 + yi * 17.3);
  const b = hash((xi + 1) * 3.7 + yi * 17.3);
  const c = hash(xi * 3.7 + (yi + 1) * 17.3);
  const d = hash((xi + 1) * 3.7 + (yi + 1) * 17.3);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
};

const columnAt = (s: Stage, st: Stalk, y: number): number => {
  const up = (st.base - y) / Math.max(1, st.base);
  return (
    st.x +
    st.lean * (st.base - y) +
    st.sway * up * up * Math.sin(TAU * (s.phase + hash(st.seed * 3.1)))
  );
};

function stalkList(s: Stage, layer: number): Stalk[] {
  const { w, h, k, floor, small } = s;
  const list: Stalk[] = [];
  const make = (seed: number, x: number, width: number, base: number) => {
    const gap = Math.max(4, Math.round((10 + 6 * hash(seed * 6.7)) * k));
    list.push({
      x,
      base,
      width,
      lean: (hash(seed * 1.9) - 0.5) * [0.14, 0.1, 0.07][layer],
      sway: [0.8, 1.2, 1.6][layer],
      gap,
      first: Math.floor(hash(seed * 4.3) * gap),
      seed,
    });
  };
  if (layer === 2) {
    NEAR_STALKS.forEach((near, i) => {
      if (small && i % 3) return;
      const seed = 200 + i;
      const base = h * (0.84 + 0.08 * hash(seed * 2.1));
      make(seed, near.x * w, Math.max(2, Math.round(near.width * k)), base);
    });
    return list;
  }
  const n = Math.max(3, Math.round(w / (layer ? 17 : 8)));
  for (let i = 0; i < n; i++) {
    const seed = layer * 100 + i;
    const x = ((i + 0.5 + (hash(seed * 2.7) - 0.5) * 0.7) / n) * w;
    const width = Math.max(1, Math.round((layer ? 3 : 2) * k));
    make(seed, x, width, floor - 1 + layer * 4 * k);
  }
  return list;
}

function leaf(
  s: Stage,
  x: number,
  y: number,
  side: number,
  angle: number,
  len: number,
  seed: number,
  fog: number,
): void {
  const sway = 0.25 * Math.sin(TAU * (s.phase + hash(seed * 2.1)));
  let lx = x;
  let ly = y;
  for (let i = 1; i <= len; i++) {
    const a = angle + (0.4 * i) / len + (sway * i) / len;
    lx += side * Math.cos(a);
    ly += Math.sin(a);
    const hz = hazeAt(s, ly);
    put(s.px, lx, ly, mix(LEAF[i < 3 ? 0 : 1], hz, fog));
    if (i > 1 && i < len) {
      const flat = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a));
      const edge = mix(LEAF[i > len / 2 ? 2 : 1], hz, fog);
      put(s.px, lx - (flat ? 0 : side), ly - (flat ? 1 : 0), edge);
    }
  }
}

function spray(
  s: Stage,
  x: number,
  y: number,
  seed: number,
  fog: number,
  size: number,
): void {
  for (const side of [-1, 1]) {
    if (hash(seed * 3.3 + side) < 0.3) continue;
    const n = 3 + Math.floor(hash(seed * 1.7 + side) * 3);
    for (let j = 0; j < n; j++) {
      const angle = -0.35 + (1.5 * j) / (n - 1);
      const reach = (4 + 3 * hash(seed * 2.3 + j + side)) * size;
      const len = Math.max(3, Math.round(reach));
      leaf(s, x + side, y, side, angle, len, seed + j * 1.3 + side, fog);
    }
  }
}

function drawStalks(s: Stage, layer: number): void {
  const { px, k, floor, small } = s;
  const fog = [0.45, 0.2, 0][layer];
  for (const st of stalkList(s, layer)) {
    if (layer === 2)
      for (let i = -st.width; i <= st.width * 2; i++)
        for (let j = 0; j < 3; j++) {
          const reach = 0.55 - Math.abs(i - st.width / 2) / (st.width * 2);
          const q = quantize(reach, 2, st.x + i, st.base + j);
          if (q > 0) put(px, st.x + i, st.base + j, MOSS_DARK, 0.45 * q);
        }
    const nodeRows = layer === 2 ? 2 : 1;
    for (let y = -1; y <= st.base; y++) {
      const hz = hazeAt(s, y);
      const cx = columnAt(s, st, y);
      const left = Math.round(cx - st.width / 2);
      const rel = st.base - y - st.first;
      const node = rel >= 0 ? rel % st.gap : -1;
      const swollen = node >= 0 && node < nodeRows;
      const shadow = node === nodeRows && layer > 0;
      const span = st.width + (swollen ? 2 : 0);
      for (let i = 0; i < span; i++) {
        const col = i - (swollen ? 1 : 0);
        let c: Rgb;
        if (layer === 2) {
          const tone = Math.round(
            (col / Math.max(1, st.width - 1)) * (NEAR.length - 1),
          );
          c = swollen
            ? NEAR_RING[i === 0 ? 0 : i === span - 1 ? 2 : 1]
            : NEAR[Math.max(0, Math.min(NEAR.length - 1, tone))];
          if (swollen && node === 1) c = mix(c, NEAR[2], 0.4);
        } else if (layer === 1) {
          const tone =
            st.width < 3
              ? Math.min(1, col)
              : Math.round((col / (st.width - 1)) * 2);
          c = swollen ? mix(MID[0], WHITE, 0.35) : MID[tone];
        } else {
          c = swollen ? mix(FAR[0], WHITE, 0.4) : FAR[col > 0 ? 1 : 0];
        }
        if (shadow) c = dim(c, 0.7);
        put(px, left - (swollen ? 1 : 0) + i, y, mix(c, hz, fog));
      }
      const budding =
        layer > 0 &&
        !small &&
        node === 0 &&
        y > 2 &&
        y < floor - 8 &&
        hash(st.seed * 5.1 + rel) > 0.35;
      if (budding) {
        const size = [0, 0.9, 1.15][layer] * Math.max(0.8, k);
        spray(s, cx, y, st.seed * 13 + rel, fog + 0.05, size);
      }
    }
  }
}

function mist(s: Stage, top: number, bottom: number, a: number): void {
  const { px, phase, w } = s;
  for (let y = Math.max(0, Math.floor(top)); y < bottom; y++) {
    const v = (y - top) / (bottom - top);
    const c = mix(hazeAt(s, y), WHITE, 0.35);
    for (let x = 0; x < w; x++) {
      const drift =
        0.5 + 0.5 * Math.sin(TAU * ((x / w) * 2 + phase + y * 0.04));
      const q = quantize(v * a * (0.6 + 0.4 * drift), 4, x, y);
      if (q > 0) put(px, x, y, c, q);
    }
  }
}

function beams(s: Stage): void {
  const { px, phase, w, floor } = s;
  for (let i = 0; i < 3; i++) {
    const phi = hash(i * 4.1);
    const x0 = (0.12 + 0.3 * i) * w + 3 * Math.sin(TAU * (phase + phi));
    const half = (3.5 + 1.5 * hash(i * 7.3)) * s.k + 1;
    const breath = 0.85 + 0.15 * Math.sin(TAU * (phase + phi * 2));
    for (let y = 0; y < floor + 12; y++) {
      const centre = x0 + 0.55 * y;
      const reach = half * (1 + (0.7 * y) / floor);
      const along =
        Math.min(1, (y + 6) / (floor * 0.5)) *
        Math.min(1, (floor + 12 - y) / 14);
      for (let x = Math.floor(centre - reach); x <= centre + reach; x++) {
        const v = (1 - Math.abs(x - centre) / reach) * along * 1.4;
        const q = quantize(v * breath, 3, x, y);
        if (q > 0) put(px, x, y, BEAM, 0.15 + 0.1 * q);
      }
    }
  }
}

function pathAt(s: Stage, y: number): { x: number; half: number } {
  const { feet, h, k, floor } = s;
  return {
    x: feet.x + 9 * k * Math.sin(TAU * (((y - feet.y) / h) * 0.8)),
    half: (2.5 + 14 * ((y - floor) / (h - floor))) * Math.max(0.4, k),
  };
}

function stone(s: Stage, x: number, y: number, wd: number): void {
  const ht = Math.max(2, Math.round(wd / 3));
  for (let j = 0; j <= ht; j++) {
    const t = (j - (ht - 1) / 2) / (ht / 2);
    const half = Math.max(0.5, (wd / 2) * Math.sqrt(Math.max(0, 1 - t * t)));
    for (let i = -Math.round(half); i <= Math.round(half); i++)
      put(s.px, x + i, y + j, STONE[j === ht ? 2 : j === 0 ? 0 : 1]);
  }
}

function fern(s: Stage, x: number, y: number, size: number, seed: number) {
  for (let j = 0; j < 5; j++) {
    const lean = -1 + (2 * j) / 4;
    const sway = 0.4 * Math.sin(TAU * (s.phase + hash(seed + j)));
    for (let i = 1; i <= size; i++) {
      const fx = x + (lean + sway * (i / size)) * i * 0.85;
      const fy =
        y - i * (1 - Math.abs(lean) * 0.3) + 0.14 * i * i * Math.abs(lean);
      const c = i > size - 2 ? LEAF[2] : i > 1 ? LEAF[1] : LEAF[0];
      put(s.px, fx, fy, c);
      if (i > 1 && i % 2 === 0)
        put(s.px, fx + (lean > 0 ? -1 : 1), fy, LEAF[0]);
    }
  }
}

function floorArea(s: Stage): void {
  const { px, w, h, k, floor } = s;
  const top = (x: number) =>
    floor + Math.round(1.5 * Math.sin(TAU * ((x / w) * 1.7 + 0.2)));
  for (let x = 0; x < w; x++) {
    for (let y = top(x); y < h; y++) {
      const depth = (y - floor) / (h - floor);
      const p = pathAt(s, y);
      const shade = quantize(Math.max(0, depth) ** 0.8, 6, x, y);
      const base = mix(MOSS[0], MOSS[1], shade);
      const blot =
        0.65 * noise(x / 8, y / 3.5) + 0.35 * noise(x / 3.5 + 9, y / 1.8);
      const q = quantize(blot, 4, x, y);
      let c = base;
      if (q > 0.7) c = mix(base, MOSS_LIGHT, 0.5);
      else if (q < 0.3) c = mix(base, MOSS_DARK, 0.45);
      if (hash(x * 5.3 + y * 7.7) > 0.992) c = SPECK;
      const d = Math.abs(x - p.x) - p.half;
      if (d < 1.5 && quantize(0.5 - d / 3, 2, x, y) > 0.4) {
        const u = Math.min(1, Math.abs(x - p.x) / p.half);
        c = mix(EARTH[0], EARTH[2], quantize(u * u, 3, x, y) * 0.9);
        if (hash(x * 3.7 + y * 9.1) > 0.95) c = EARTH[1];
      }
      put(px, x, y, c);
    }
  }
  if (s.small) return;
  const scale = Math.max(0.5, k);
  [0.1, 0.3, 0.52, 0.74, 0.93].forEach((depth, i) => {
    const y = Math.round(floor + depth * (h - floor));
    const p = pathAt(s, y);
    const x = Math.round(p.x + (i % 2 ? 0.3 : -0.3) * p.half);
    stone(s, x, y, Math.round((3 + 5 * depth) * scale));
  });
  for (let i = 0; i < 8; i++) {
    const side = i % 2 ? 1 : -1;
    const y = Math.round(floor + (0.15 + 0.8 * hash(i * 3.7)) * (h - floor));
    const p = pathAt(s, y);
    const x = Math.round(p.x + side * (p.half + 4 + 8 * hash(i * 5.9)));
    fern(s, x, y, Math.round((4 + 3 * hash(i * 2.9)) * scale), i * 3.3);
  }
  for (let i = 0; i < 16; i++) {
    const y = Math.round(floor + 2 + hash(i * 6.1) * (h - floor - 3));
    const p = pathAt(s, y);
    const near = p.x + (hash(i * 8.3) - 0.5) * 2.4 * p.half;
    const x = Math.round(i % 3 ? near : hash(i * 8.3) * w);
    put(px, x, y, FALLEN[i % 4]);
    if (i % 2) put(px, x + 1, y, FALLEN[i % 4]);
  }
}

function drifting(s: Stage): void {
  const { px, feet, phase, w, h, k } = s;
  DRIFTERS.forEach(({ x: lx, offset }, lane) => {
    const phi = hash(lane * 3.9);
    const period = 1.6 + 0.8 * hash(lane * 5.7);
    const [light, dark] = DRIFT[lane % 2];
    for (let m = 0; m < 3; m++) {
      const t = wrap(offset + (m + phase) / 3);
      const x = lx * w + 7 * k * Math.sin(TAU * ((t * 3) / period + phi));
      const y = -4 + t * (h + 8);
      const flat = Math.sin(TAU * (t * 4.5 + phi * 3)) > 0;
      const a = 0.9 * calm(px, feet, x, y);
      put(px, x, y, light, a);
      put(px, x + (flat ? 1 : 0), y + (flat ? 0 : 1), dark, a);
    }
  });
}

export const bambooGrove: Effect = {
  id: "bamboo-grove",
  name: "ป่าไผ่",
  plate: "#2f6a46",
  paint(px, feet, phase) {
    phase = wrap(phase);
    const { w, h } = px;
    const floor = Math.max(1, Math.round(h * 0.62));
    const gradient = (t: number): Rgb => {
      const at = Math.min(1, t) * (HAZE.length - 1);
      const i = Math.min(HAZE.length - 2, Math.floor(at));
      return mix(HAZE[i], HAZE[i + 1], at - i);
    };
    const s: Stage = {
      px,
      feet,
      phase,
      w,
      h,
      k: h / 88,
      small: h < 50,
      floor,
      haze: Array.from({ length: h }, (_, y) => gradient(y / (floor * 1.05))),
    };

    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        put(
          px,
          x,
          y,
          gradient(quantize(Math.min(1, y / (floor * 1.05)), 12, x, y)),
        );
    drawStalks(s, 0);
    mist(s, floor * 0.45, floor, 0.9);
    drawStalks(s, 1);
    mist(s, floor * 0.7, floor + 4, 0.5);
    floorArea(s);
    beams(s);
    drawStalks(s, 2);
    drifting(s);
    ring(px, feet, 24, 7, rgb("#f6f2c8"), 0.7);
  },
};
