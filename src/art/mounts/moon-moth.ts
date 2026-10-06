import type { DrawnMount } from "../mounts";
import { bayer, put, rgb, TAU, type Pixels, type Rgb } from "../pixels";

const CELL = { w: 124, h: 96 };
const W = CELL.w;
const H = CELL.h;
const FRAMES = 6;
const LIFT = 0.5;
const FACE = Math.sqrt(1 - LIFT * LIFT);
const STEP = 0.5;
const DEG = Math.PI / 180;

type Xy = [number, number];
type Vec = [number, number, number];

const R2 = Math.SQRT1_2;
const HEADING: Record<string, Xy> = {
  south: [0, -1],
  "south-east": [R2, -R2],
  east: [1, 0],
  "north-east": [R2, R2],
  north: [0, 1],
};
const ORIGIN: Record<string, Xy> = {
  south: [62, 65],
  "south-east": [66, 63],
  east: [67, 66],
  "north-east": [65, 65],
  north: [62, 66],
};
const NUDGE: Record<string, Xy> = {
  south: [0, 3],
  "south-east": [0, 2],
  east: [0, 2],
  "north-east": [0, 2],
  north: [0, 1],
};
/**
 * Each direction's wing beat: the middle of the stroke and half its sweep in
 * degrees above level, and how far ahead in the stroke its first frame starts.
 * Seen from the side the far forewing rises right behind the seat, so the east
 * row starts where no frame catches it lying level on the saddle.
 */
const BEAT: Record<string, Vec> = {
  south: [6, 18, 0],
  "south-east": [6, 18, 0],
  east: [6, 18, 105],
  "north-east": [6, 18, 0],
  north: [6, 18, 0],
};
const BOB = [0, 0, 1, 1, 1, 0];

const ramp = (...hex: string[]): Rgb[] => hex.map(rgb);
const FUR = ramp("#ffffff", "#f2effc", "#dcd5f3", "#b8aee0", "#8c82c4");
const WING = ramp(
  "#f1fff4",
  "#d4f5df",
  "#b0e7cb",
  "#89d2b8",
  "#64b3a6",
  "#478c8b",
);
const COSTA = ramp("#d6c9fb", "#a693e6", "#7a66c3", "#54459c");
const GOLD = ramp("#fff5c4", "#ffd66b", "#eaa93d", "#b5732a");
const SADDLE = ramp("#6470d6", "#4650b0", "#323a8e", "#232965");
const EYE = ramp("#1c1745", "#3e3488");
const GLINT = rgb("#ffffff");
const LINE = rgb("#1e1a44");
const WING_LINE = rgb("#1d3b52");

const PART = {
  none: 0,
  fur: 1,
  fore: 2,
  hind: 3,
  saddle: 4,
  trim: 5,
  eye: 6,
  feeler: 7,
  foreLeft: 8,
  hindLeft: 9,
} as const;
const LEFT = PART.foreLeft - PART.fore;
const OUTLINE: Rgb[] = [
  LINE,
  LINE,
  WING_LINE,
  WING_LINE,
  LINE,
  LINE,
  LINE,
  LINE,
  WING_LINE,
  WING_LINE,
];

const LIGHT: Vec = (() => {
  const v: Vec = [-0.5, 0.62, 0.6];
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
})();

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

const pick = (palette: Rgb[], v: number, k: number) =>
  palette[
    clamp(
      Math.floor(v + (bayer(k % W, (k / W) | 0) - 0.5) * 0.6 + 0.5),
      0,
      palette.length - 1,
    )
  ];

/** Distance from (x, y) to the polygon's edge, positive inside. */
function edge(points: Xy[], x: number, y: number): number {
  let inside = false;
  let best = Infinity;
  points.forEach(([x1, y1], i) => {
    const [x0, y0] = points[(i + points.length - 1) % points.length];
    if (y1 > y !== y0 > y && x < ((x0 - x1) * (y - y1)) / (y0 - y1) + x1)
      inside = !inside;
    const dx = x0 - x1;
    const dy = y0 - y1;
    const k = clamp(
      ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy),
      0,
      1,
    );
    best = Math.min(best, Math.hypot(x - x1 - k * dx, y - y1 - k * dy));
  });
  return inside ? best : -best;
}

/** Distance from (x, y) to the segment from a to b. */
function toSegment([ax, ay]: Xy, [bx, by]: Xy, x: number, y: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const k = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy), 0, 1);
  return Math.hypot(x - ax - k * dx, y - ay - k * dy);
}

type View = { ox: number; oy: number; R: Vec; U: Vec; D: Vec };

/** Screen right, screen up and away from the viewer, in the moth's own axes: x to its right, y ahead, z up. */
function viewOf(direction: string, bob: number): View {
  const [fx, fy] = HEADING[direction];
  const rx = fy;
  const ry = -fx;
  const [ox, oy] = ORIGIN[direction];
  return {
    ox,
    oy: oy - bob,
    R: [rx, fx, 0],
    U: [ry * LIFT, fy * LIFT, FACE],
    D: [ry * FACE, fy * FACE, -LIFT],
  };
}

function lit(v: View, n0: number, n1: number, n2: number): number {
  const a = n0 * v.R[0] + n1 * v.R[1] + n2 * v.R[2];
  const b = n0 * v.U[0] + n1 * v.U[1] + n2 * v.U[2];
  const c = -(n0 * v.D[0] + n1 * v.D[1] + n2 * v.D[2]);
  return (
    (a * LIGHT[0] + b * LIGHT[1] + c * LIGHT[2]) / (Math.hypot(a, b, c) || 1)
  );
}

type Canvas = {
  depth: Float32Array;
  ink: (Rgb | undefined)[];
  part: Uint8Array;
};

const canvas = (): Canvas => ({
  depth: new Float32Array(W * H).fill(Infinity),
  ink: new Array(W * H),
  part: new Uint8Array(W * H),
});

type Shade = (light: number, p: Vec, k: number, tuft: number) => Rgb;

const tuft = (u: number) => 1 - Math.abs(2 * (u - Math.floor(u)) - 1);

/** An ellipsoid along the moth's axes, its outline ruffled into tufts when it is fur. */
function blob(
  c: Canvas,
  v: View,
  [cx, cy, cz]: Vec,
  [a, b, h]: Vec,
  part: number,
  shade: Shade,
  fluff = 0,
  tufts = 12,
): void {
  const { R, U, D } = v;
  const scx = v.ox + R[0] * cx + R[1] * cy + R[2] * cz;
  const scy = v.oy - (U[0] * cx + U[1] * cy + U[2] * cz);
  const cd = D[0] * cx + D[1] * cy + D[2] * cz;
  const ia = 1 / (a * a);
  const ib = 1 / (b * b);
  const ih = 1 / (h * h);
  const dd = D[0] * D[0] * ia + D[1] * D[1] * ib + D[2] * D[2] * ih;
  const grow = 1 + fluff;
  const hw = Math.ceil(grow * Math.hypot(R[0] * a, R[1] * b, R[2] * h));
  const hh = Math.ceil(grow * Math.hypot(U[0] * a, U[1] * b, U[2] * h));
  const x0 = Math.max(0, Math.round(scx) - hw);
  const x1 = Math.min(W - 1, Math.round(scx) + hw);
  const y0 = Math.max(0, Math.round(scy) - hh);
  const y1 = Math.min(H - 1, Math.round(scy) + hh);
  for (let py = y0; py <= y1; py++) {
    const dy = scy - py;
    for (let px = x0; px <= x1; px++) {
      const dx = px - scx;
      const e0 = dx * R[0] + dy * U[0];
      const e1 = dx * R[1] + dy * U[1];
      const e2 = dx * R[2] + dy * U[2];
      const ee = e0 * e0 * ia + e1 * e1 * ib + e2 * e2 * ih;
      const ed = e0 * D[0] * ia + e1 * D[1] * ib + e2 * D[2] * ih;
      const tf = fluff ? tuft((Math.atan2(dy, dx) * tufts) / TAU) : 0;
      const kk = (1 + fluff * tf) ** 2;
      const disc = ed * ed - dd * (ee - kk);
      if (disc < 0) continue;
      const t = (-ed - Math.sqrt(disc)) / dd;
      const k = py * W + px;
      const depth = cd + t;
      if (depth >= c.depth[k]) continue;
      const q0 = e0 + t * D[0];
      const q1 = e1 + t * D[1];
      const q2 = e2 + t * D[2];
      c.depth[k] = depth;
      c.part[k] = part;
      c.ink[k] = shade(
        lit(v, q0 * ia, q1 * ib, q2 * ih),
        [cx + q0, cy + q1, cz + q2],
        k,
        tf,
      );
    }
  }
}

const ZONE = {
  plain: 0,
  costa: 1,
  rim: 2,
  ring: 3,
  gold: 4,
  moon: 5,
  vein: 6,
  root: 7,
  tail: 8,
};

type Spot = { s: number; c: number; r: number };

type Wing = {
  part: number;
  cols: number;
  span: number;
  /** Where the beat reaches this wing, in radians behind the forewing. */
  lag: number;
  /** How far the wing sits above the hinge along its own normal, so the forewing covers the hindwing. */
  lift: number;
  col: Uint16Array;
  c: Float32Array;
  zone: Uint8Array;
  tone: Float32Array;
  /** How far the tails curl up off the wing's plane. */
  rise: Float32Array;
};

/** Samples a wing's outline, drawn at `size`, every half pixel as (s, c): s out from the hinge, c ahead along the body. */
function wingOf(
  part: number,
  size: number,
  outline: Xy[],
  spot: Spot,
  veins: Xy[],
  costa: (s: number, c: number, d: number) => boolean,
  lag: number,
  lift: number,
): Wing {
  const span = Math.max(...outline.map(([s]) => s)) * size;
  const cLo = Math.min(...outline.map(([, c]) => c)) * size;
  const cHi = Math.max(...outline.map(([, c]) => c)) * size;
  const cols = Math.ceil(span / STEP) + 1;
  const col: number[] = [];
  const cs: number[] = [];
  const zone: number[] = [];
  const tone: number[] = [];
  const rise: number[] = [];
  for (let i = 0; i < cols; i++)
    for (let cc = cLo; cc <= cHi; cc += STEP) {
      const s = (i * STEP) / size;
      const c = cc / size;
      const d = edge(outline, s, c);
      if (d <= 0) continue;
      const u = (i * STEP) / span;
      const r = Math.hypot(s - spot.s, c - spot.c) / spot.r;
      let z = ZONE.plain;
      if (s < 7 - d * 0.3) z = ZONE.root;
      else if (r < 1) {
        const inner =
          Math.hypot(s - spot.s, c - spot.c) < spot.r * 0.62 &&
          Math.hypot(s - spot.s - spot.r * 0.3, c - spot.c - spot.r * 0.22) >
            spot.r * 0.5;
        z = r > 0.78 ? ZONE.ring : inner ? ZONE.moon : ZONE.gold;
      } else if (costa(s, c, d)) z = ZONE.costa;
      else if (c < -27) z = ZONE.tail;
      else if (d < 1.3 && u > 0.45) z = ZONE.rim;
      else if (veins.some((p) => toSegment([4, p[1] * 0.2], p, s, c) < 0.45))
        z = ZONE.vein;
      col.push(i);
      cs.push(cc);
      zone.push(z);
      tone.push(0.4 + 2.8 * u * u + (c < -20 ? 0.6 : 0));
      rise.push(CURL * Math.max(0, -23 - c) ** 1.4 * size);
    }
  return {
    part,
    cols,
    span,
    lag,
    lift,
    col: Uint16Array.from(col),
    c: Float32Array.from(cs),
    zone: Uint8Array.from(zone),
    tone: Float32Array.from(tone),
    rise: Float32Array.from(rise),
  };
}

const CURL = 0.22;
const HINGE = { x: 9, z: 4 };
const BEND = 0.9;

// The seat's column must show nothing above the back but the back itself, so
// the forewing leaves a notch over the hinge's middle and the tails flare out
// to the sides instead of trailing behind the seat.
const FORE = wingOf(
  PART.fore,
  0.88,
  [
    [0, 7.5],
    [6, 10],
    [14, 13],
    [22, 16],
    [30, 19],
    [36, 21.5],
    [40, 22.5],
    [43, 21],
    [44, 17],
    [42.5, 11],
    [40, 5],
    [36.5, 0],
    [33, -3.5],
    [30, -2],
    [26, 0.5],
    [20, 1.8],
    [12, 2.2],
    [0, 2.5],
  ],
  { s: 25, c: 8.5, r: 4.2 },
  [
    [38, 15],
    [38, 3],
    [30, -3],
  ],
  (s, c, d) => d < 2.6 && c > 5 + s * 0.2 && s > 4,
  0,
  1.5,
);

const HIND = wingOf(
  PART.hind,
  0.88,
  [
    [0, -2.5],
    [8, -2.5],
    [16, -3.5],
    [24, -6],
    [30, -10],
    [33, -15],
    [32, -20],
    [30, -24],
    [34, -28],
    [39, -32],
    [44, -35.5],
    [47, -38],
    [45, -40],
    [40, -38.5],
    [35, -35.5],
    [30, -32],
    [25, -28.5],
    [20, -25],
    [14, -20],
    [8, -14.5],
    [3, -9],
    [0, -6],
  ],
  { s: 21, c: -14, r: 4.4 },
  [
    [30, -13],
    [26, -22],
  ],
  () => false,
  0.5,
  0,
);

const TH = new Float32Array(128);
const UU = new Float32Array(128);
const ZZ = new Float32Array(128);
const PX = new Float32Array(128);
const PY = new Float32Array(128);
const PD = new Float32Array(128);
const NX = new Float32Array(128);
const NY = new Float32Array(128);
const ND = new Float32Array(128);
const UNDER = new Uint8Array(128);
const LIT = new Float32Array(128);

function wingInk(
  zone: number,
  tone: number,
  light: number,
  under: number,
  k: number,
): Rgb {
  const shade = (0.55 - light) * 2.6 - under * 0.8;
  switch (zone) {
    case ZONE.costa:
      return pick(COSTA, 1 + shade, k);
    case ZONE.tail:
      return pick(COSTA, 0.3 + tone * 0.35 + shade, k);
    case ZONE.rim:
      return pick(GOLD, shade * 0.6, k);
    case ZONE.ring:
      return COSTA[3];
    case ZONE.gold:
      return pick(GOLD, 1 + shade * 0.5, k);
    case ZONE.moon:
      return under ? GOLD[0] : FUR[0];
    case ZONE.root:
      return pick(FUR, 1.2 + shade, k);
    case ZONE.vein:
      return pick(WING, tone + 1.3 + shade, k);
    default:
      return pick(WING, tone + shade, k);
  }
}

function paintWing(
  c: Canvas,
  v: View,
  wing: Wing,
  [mid, sweep, lead]: Vec,
  phase: number,
): void {
  let u = 0;
  let z = 0;
  for (let i = 0; i < wing.cols; i++) {
    const th =
      (mid +
        sweep *
          Math.cos(
            phase + lead * DEG - wing.lag - (BEND * i * STEP) / wing.span,
          )) *
      DEG;
    if (i > 0) {
      u += Math.cos(th) * STEP;
      z += Math.sin(th) * STEP;
    }
    TH[i] = th;
    UU[i] = u;
    ZZ[i] = z;
  }
  const { R, U, D } = v;
  for (const side of [1, -1]) {
    const part = side > 0 ? wing.part : wing.part + LEFT;
    for (let i = 0; i < wing.cols; i++) {
      const sn = Math.sin(TH[i]);
      const cs = Math.cos(TH[i]);
      const x = side * (HINGE.x + UU[i] - wing.lift * sn);
      const zz = HINGE.z + ZZ[i] + wing.lift * cs;
      PX[i] = v.ox + R[0] * x + R[2] * zz;
      PY[i] = v.oy - (U[0] * x + U[2] * zz);
      PD[i] = D[0] * x + D[2] * zz;
      const nx = -side * sn;
      const facing = nx * D[0] + cs * D[2];
      NX[i] = nx * R[0];
      NY[i] = nx * U[0] + cs * U[2];
      ND[i] = facing;
      UNDER[i] = facing > 0 ? 1 : 0;
      LIT[i] = facing > 0 ? lit(v, -nx, 0, -cs) : lit(v, nx, 0, cs);
    }
    for (let j = 0; j < wing.col.length; j++) {
      const i = wing.col[j];
      const cc = wing.c[j];
      const up = wing.rise[j];
      const sx = Math.round(PX[i] + cc * R[1] + up * NX[i]);
      const sy = Math.round(PY[i] - cc * U[1] - up * NY[i]);
      if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
      const k = sy * W + sx;
      const depth = PD[i] + cc * D[1] + up * ND[i];
      if (depth >= c.depth[k]) continue;
      c.depth[k] = depth;
      c.part[k] = part;
      c.ink[k] = wingInk(wing.zone[j], wing.tone[j], LIT[i], UNDER[i], k);
    }
  }
}

const fur =
  (base: number): Shade =>
  (l, _, k, tf) =>
    pick(FUR, base + (0.6 - l) * 3.2 + (0.5 - tf) * 0.9, k);

const LEGS: Xy[] = [
  [6.5, 1.6],
  [0.5, 0.2],
  [-5.5, -0.8],
];

const ABDOMEN: [number, number, number, number][] = [
  [-11, -1.5, 10, 0],
  [-16, -3, 9, 0.15],
  [-20.5, -4.6, 7.6, 0.3],
  [-24.5, -6.1, 6.2, 0.5],
  [-28, -7.3, 4.6, 0.7],
  [-31, -8.2, 3.2, 0.9],
];

function paintBody(c: Canvas, v: View, phase: number): void {
  const sway = Math.sin(phase - 1.2);
  const stripes: Shade = (l, [, y], k) =>
    Math.floor((-y - 8) / 3.6) % 2
      ? pick(COSTA, 0.4 + (0.6 - l) * 3, k)
      : pick(FUR, 1 + (0.6 - l) * 3.2, k);
  for (const [y, z, r, u] of ABDOMEN)
    blob(
      c,
      v,
      [0, y, z + sway * u],
      [r, r * 0.9, r],
      PART.fur,
      stripes,
      0.1,
      10,
    );
  for (const side of [1, -1])
    for (const [y, lean] of LEGS)
      for (let n = 0; n <= 10; n++) {
        const u = n / 10;
        const swing = lean + Math.sin(phase - y * 0.08) * 0.6 * u;
        blob(
          c,
          v,
          [side * (5.5 + 6.5 * Math.sqrt(u)), y + swing * 4 * u, -8.5 - 13 * u],
          [2.4 - 1.1 * u, 2.4 - 1.1 * u, 2.4 - 1.1 * u],
          PART.fur,
          fur(1 + u * 1.2),
          0.25,
          7,
        );
      }
  blob(c, v, [0, 0, 0], [14, 13, 12.5], PART.fur, fur(0.6), 0.16, 16);
  blob(c, v, [0, 9, 3], [12.5, 7, 10.5], PART.fur, fur(0.1), 0.22, 14);
  blob(c, v, [0, 16, 0.5], [8, 6.5, 7.5], PART.fur, fur(0.4), 0.1, 12);
  for (const side of [1, -1])
    blob(c, v, [side * 5.8, 19.6, 3.2], [4.2, 4.2, 4.2], PART.eye, (l) =>
      l > 0.5 ? GLINT : l < -0.2 ? EYE[1] : EYE[0],
    );
}

const SEAT = { y: 0, z: 13, a: 8.5, b: 9, h: 3.6 };

function paintSaddle(c: Canvas, v: View): void {
  blob(
    c,
    v,
    [0, SEAT.y, SEAT.z],
    [SEAT.a, SEAT.b, SEAT.h],
    PART.saddle,
    (l, _, k) => pick(SADDLE, 1 + (0.6 - l) * 3, k),
  );
  const beads = 22;
  for (let n = 0; n < beads; n++) {
    const t = (n / beads) * TAU;
    blob(
      c,
      v,
      [
        Math.cos(t) * SEAT.a * 0.96,
        SEAT.y + Math.sin(t) * SEAT.b * 0.96,
        SEAT.z + 0.4,
      ],
      [0.95, 0.95, 0.95],
      PART.trim,
      (l) => GOLD[l > 0.5 ? 0 : l > 0 ? 1 : 2],
    );
  }
}

function feelerPoint(side: number, u: number, sway: number): Vec {
  const a = 1 - u;
  const p0: Vec = [side * 3.6, 20, 7];
  const p1: Vec = [side * 7, 28, 16];
  const p2: Vec = [side * 14, 23, 23 + sway];
  return [
    a * a * p0[0] + 2 * a * u * p1[0] + u * u * p2[0],
    a * a * p0[1] + 2 * a * u * p1[1] + u * u * p2[1],
    a * a * p0[2] + 2 * a * u * p1[2] + u * u * p2[2],
  ];
}

function paintFeelers(c: Canvas, v: View, phase: number): void {
  const sway = Math.sin(phase + 0.8) * 0.9;
  const gold: Shade = (l, _, k) => pick(GOLD, 1.6 - l * 1.5, k);
  for (const side of [1, -1]) {
    const steps = 40;
    for (let n = 0; n <= steps; n++) {
      const u = n / steps;
      const p = feelerPoint(side, u, sway);
      blob(c, v, p, [0.6, 0.6, 0.6], PART.feeler, gold);
      if (n % 3 || n === 0 || n === steps) continue;
      const q = feelerPoint(side, u + 0.02, sway);
      const t: Vec = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
      const tl = Math.hypot(...t);
      const across: Vec = [t[1] / tl, -t[0] / tl, 0];
      const len = 4.4 * (1 - u) + 1;
      for (const dir of [1, -1])
        for (let m = 1; m <= 3; m++) {
          const f = (m / 3) * len;
          blob(
            c,
            v,
            [
              p[0] + dir * across[0] * f + (t[0] / tl) * f * 0.5,
              p[1] + dir * across[1] * f + (t[1] / tl) * f * 0.5,
              p[2] + (t[2] / tl) * f * 0.5,
            ],
            [0.45, 0.45, 0.45],
            PART.feeler,
            gold,
          );
        }
    }
  }
}

function fillHoles(c: Canvas): void {
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const k = y * W + x;
      if (c.part[k]) continue;
      const around = [k - 1, k + 1, k - W, k + W].filter((n) => c.part[n]);
      if (around.length < 3) continue;
      const near = around.reduce((a, b) => (c.depth[a] <= c.depth[b] ? a : b));
      c.part[k] = c.part[near];
      c.ink[k] = c.ink[near];
      c.depth[k] = c.depth[near];
    }
}

const isWing = (p: number) =>
  p === PART.fore ||
  p === PART.hind ||
  p === PART.foreLeft ||
  p === PART.hindLeft;

function outline(c: Canvas): (Rgb | undefined)[] {
  const out = c.ink.slice();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const k = y * W + x;
      const p = c.part[k];
      if (p === PART.eye) continue;
      let best = -1;
      for (const n of [
        x > 0 ? k - 1 : -1,
        x < W - 1 ? k + 1 : -1,
        y > 0 ? k - W : -1,
        y < H - 1 ? k + W : -1,
      ]) {
        if (n < 0) continue;
        const q = c.part[n];
        if (!q || q === PART.eye) continue;
        const nearer = c.depth[k] - c.depth[n];
        const edgeHere =
          !p ||
          (q === p && nearer > 3 && !isWing(p)) ||
          (q !== p &&
            nearer > (isWing(p) && isWing(q) ? 0.7 : 0.3) &&
            !(p === PART.feeler || q === PART.feeler));
        if (edgeHere && (best < 0 || c.depth[n] < c.depth[best])) best = n;
      }
      if (best >= 0) out[k] = OUTLINE[c.part[best]];
    }
  return out;
}

function paint(px: Pixels, direction: string, frame: number): void {
  const phase = (frame / FRAMES) * TAU;
  const v = viewOf(direction, BOB[frame % FRAMES]);
  const c = canvas();
  paintWing(c, v, FORE, BEAT[direction], phase);
  paintWing(c, v, HIND, BEAT[direction], phase);
  paintBody(c, v, phase);
  paintSaddle(c, v);
  paintFeelers(c, v, phase);
  fillHoles(c);
  const ink = outline(c);
  for (let k = 0; k < W * H; k++) {
    const colour = ink[k];
    if (colour) put(px, k % W, (k / W) | 0, colour);
  }
}

function seatOf(direction: string): [number, number] {
  const v = viewOf(direction, 0);
  const top = SEAT.z + SEAT.h;
  const [dx, dy] = NUDGE[direction];
  return [
    Math.round(v.ox + v.R[1] * SEAT.y) + dx,
    Math.round(v.oy - (v.U[1] * SEAT.y + v.U[2] * top)) + dy,
  ];
}

export const MOON_MOTH: DrawnMount = {
  id: "own-moon-moth",
  name: "Moon Moth",
  description:
    "ผีเสื้อกลางคืนแสงจันทร์ตัวโต ขนฟูสีขาวนวลอมม่วงอ่อน ปีกสี่ปีกสีเขียวมิ้นต์จางเหมือนแสงจันทร์ ขอบปีกหน้าสีม่วงลาเวนเดอร์ มีจุดรูปพระจันทร์เสี้ยวสีทองบนปีกทุกปีก ปีกหลังมีหางยาวพลิ้ว หนวดสีทองเป็นพู่เหมือนขนนก ตาโตสีม่วงเข้ม บนหลังมีเบาะนั่งสีน้ำเงินขลิบทอง",
  cell: CELL,
  seat: Object.fromEntries(
    Object.keys(HEADING).map((d) => [d, seatOf(d)]),
  ) as Record<string, [number, number]>,
  paint,
};
