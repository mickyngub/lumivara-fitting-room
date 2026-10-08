import { RIDING } from "../../game/riding";
import type { DrawnMount } from "../mounts";
import { bayer, put, rgb, wrap, type Pixels, type Rgb } from "../pixels";

type V3 = [number, number, number];
type Xy = [number, number];

const CELL = { w: 100, h: 88 };
const W = CELL.w;
const H = CELL.h;
const TAU = Math.PI * 2;
/** Screen pixels per body unit. */
const SIZE = 1.3;

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: V3): V3 => scale(a, 1 / (Math.hypot(...a) || 1));
const sum = (...vs: V3[]): V3 => vs.reduce<V3>((s, v) => add(s, v), [0, 0, 0]);
const square = (p: V3, q: V3) =>
  (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));

const inks = (...hex: string[]) => hex.map(rgb);
const FUR = inks(
  "#9d92d4",
  "#5f548f",
  "#43396d",
  "#2c2550",
  "#1c1738",
  "#110d25",
);
const DEEP = FUR.length - 1;
const FUR_LINE = rgb("#0b0716");
const EAR = inks("#74479a", "#4d2b6c");
const NOSE = inks("#a878b8", "#6e4a88");
const CYAN = inks("#f2ffff", "#8cf6ff", "#37c8ee", "#1d82b6");
const VIOLET = inks("#fdecff", "#d69fff", "#a65cf2", "#6c32b8");
const LEATHER = inks("#4d5590", "#373e70", "#252a50", "#171a34");
const LEATHER_LINE = rgb("#080a18");
const SILVER = inks("#f4f7ff", "#cdd5e8", "#97a3c0", "#5f6a8c");

const TILT = Math.PI / 6;
const SIN = Math.sin(TILT);
const COS = Math.cos(TILT);
/** View space: x right, y down, z away from the viewer; the light comes from the top left, in front. */
const LIGHT = unit([-0.5, -0.62, -0.6]);

const HEADING: Record<string, Xy> = {
  south: [0, -1],
  "south-east": [Math.SQRT1_2, -Math.SQRT1_2],
  east: [1, 0],
  "north-east": [Math.SQRT1_2, Math.SQRT1_2],
  north: [0, 1],
};
const ORIGIN: Record<string, Xy> = {
  south: [50, 48],
  "south-east": [49, 49],
  east: [48, 55],
  "north-east": [49, 50],
  north: [50, 50],
};
/** Seen from behind, the head drops to where the rider and the saddle hide it. */
const HEAD: Record<string, V3> = {
  south: [29.5, 0, -0.6],
  "south-east": [29.5, 0, -0.6],
  east: [29.5, 0, -0.6],
  "north-east": [29, 0, -3],
  north: [27, 0, -10.5],
};
/** In the front view the tail would rise right behind the saddle, so it swings out to one side. */
const TAIL_SIDE: Record<string, number> = {
  south: 14,
  "south-east": 0,
  east: 0,
  "north-east": 0,
  north: 19,
};
/** How far the tail tip swings sideways; the side-on views see that swing foreshortened, so they add a rise and fall too. */
const SWAY: Record<string, number> = {
  south: 8,
  "south-east": 6.5,
  east: 5,
  "north-east": 6.5,
  north: 7,
};
const WHISKERED = ["south", "south-east"];
const BOB = [0, -1, 0, 0, -1, 0];

type Pose = {
  direction: string;
  t: number;
  phase: number;
  o: Xy;
  F: V3;
  R: V3;
  U: V3;
};

function posed(direction: string, frame: number, bobbing = true): Pose {
  const [fx, fy] = HEADING[direction];
  const [ox, oy] = ORIGIN[direction];
  const t = frame / RIDING.framesPerDirection;
  return {
    direction,
    t,
    phase: t * TAU,
    o: [ox, oy + (bobbing ? BOB[frame] : 0)],
    F: [fx, -fy * SIN, fy * COS],
    R: [fy, fx * SIN, -fx * COS],
    U: [0, -COS, -SIN],
  };
}

const turn = (p: Pose, v: V3): V3 => [
  v[0] * p.F[0] + v[1] * p.R[0] + v[2] * p.U[0],
  v[0] * p.F[1] + v[1] * p.R[1] + v[2] * p.U[1],
  v[0] * p.F[2] + v[1] * p.R[2] + v[2] * p.U[2],
];
const at = (p: Pose, v: V3): V3 => {
  const t = turn(p, v);
  return [p.o[0] + t[0] * SIZE, p.o[1] + t[1] * SIZE, t[2] * SIZE];
};

type Buf = {
  depth: Float32Array;
  ink: (Rgb | undefined)[];
  line: Rgb[];
  part: Uint8Array;
};

const buffer = (): Buf => ({
  depth: new Float32Array(W * H).fill(Infinity),
  ink: new Array(W * H),
  line: new Array(W * H),
  part: new Uint8Array(W * H),
});

function plot(
  buf: Buf,
  x: number,
  y: number,
  z: number,
  ink: Rgb,
  line: Rgb,
  part: number,
): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = y * W + x;
  if (z >= buf.depth[i]) return;
  buf.depth[i] = z;
  buf.ink[i] = ink;
  buf.line[i] = line;
  buf.part[i] = part;
}

const band = (lam: number, x: number, y: number, cuts: number[]): number => {
  const v = lam + (bayer(x, y) - 0.5) * 0.1;
  let i = 0;
  while (i < cuts.length && v < cuts[i]) i++;
  return i;
};
const FUR_CUTS = [0.985, 0.72, 0.38, 0.06, -0.4];

/** p and n are the hit point and normal in the panther's own frame (forward, right, up), reused between calls; facing is 1 head on and 0 at the silhouette. */
type Shade = (
  p: V3,
  n: V3,
  lam: number,
  x: number,
  y: number,
  facing: number,
) => Rgb;
type Blob = {
  c: V3;
  r: V3;
  axes?: [V3, V3, V3];
  part: number;
  line?: Rgb;
  shade: Shade;
};

const IDENTITY: [V3, V3, V3] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const HIT: V3 = [0, 0, 0];
const NORMAL: V3 = [0, 0, 0];

function blob(buf: Buf, pose: Pose, b: Blob): void {
  const [a0, a1, a2] = b.axes ?? IDENTITY;
  const C = at(pose, b.c);
  const A0 = turn(pose, a0);
  const A1 = turn(pose, a1);
  const A2 = turn(pose, a2);
  const [s0, s1, s2] = b.r;
  const r0 = s0 * SIZE;
  const r1 = s1 * SIZE;
  const r2 = s2 * SIZE;
  const ex = Math.hypot(r0 * A0[0], r1 * A1[0], r2 * A2[0]);
  const ey = Math.hypot(r0 * A0[1], r1 * A1[1], r2 * A2[1]);
  const d0 = A0[2] / r0;
  const d1 = A1[2] / r1;
  const d2 = A2[2] / r2;
  const qa = d0 * d0 + d1 * d1 + d2 * d2;
  const L0 = dot(A0, LIGHT) / r0;
  const L1 = dot(A1, LIGHT) / r1;
  const L2 = dot(A2, LIGHT) / r2;
  const [cf, cr, cu] = b.c;
  const line = b.line ?? FUR_LINE;
  const { depth } = buf;
  const yEnd = Math.min(H - 1, Math.floor(C[1] + ey));
  const xEnd = Math.min(W - 1, Math.floor(C[0] + ex));
  for (let y = Math.max(0, Math.floor(C[1] - ey)); y <= yEnd; y++) {
    const oy = y + 0.5 - C[1];
    for (let x = Math.max(0, Math.floor(C[0] - ex)); x <= xEnd; x++) {
      const ox = x + 0.5 - C[0];
      const q0 = (ox * A0[0] + oy * A0[1]) / r0;
      const q1 = (ox * A1[0] + oy * A1[1]) / r1;
      const q2 = (ox * A2[0] + oy * A2[1]) / r2;
      const qb = q0 * d0 + q1 * d1 + q2 * d2;
      const disc = qb * qb - qa * (q0 * q0 + q1 * q1 + q2 * q2 - 1);
      if (disc < 0) continue;
      const t = (-qb - Math.sqrt(disc)) / qa;
      const i = y * W + x;
      const z = C[2] + t;
      if (z >= depth[i]) continue;
      const h0 = q0 + t * d0;
      const h1 = q1 + t * d1;
      const h2 = q2 + t * d2;
      const g0 = h0 / r0;
      const g1 = h1 / r1;
      const g2 = h2 / r2;
      const g = Math.sqrt(g0 * g0 + g1 * g1 + g2 * g2);
      const k0 = h0 * s0;
      const k1 = h1 * s1;
      const k2 = h2 * s2;
      HIT[0] = cf + a0[0] * k0 + a1[0] * k1 + a2[0] * k2;
      HIT[1] = cr + a0[1] * k0 + a1[1] * k1 + a2[1] * k2;
      HIT[2] = cu + a0[2] * k0 + a1[2] * k1 + a2[2] * k2;
      NORMAL[0] = (a0[0] * g0 + a1[0] * g1 + a2[0] * g2) / g;
      NORMAL[1] = (a0[1] * g0 + a1[1] * g1 + a2[1] * g2) / g;
      NORMAL[2] = (a0[2] * g0 + a1[2] * g1 + a2[2] * g2) / g;
      depth[i] = z;
      buf.ink[i] = b.shade(
        HIT,
        NORMAL,
        (h0 * L0 + h1 * L1 + h2 * L2) / g,
        x,
        y,
        -(A0[2] * g0 + A1[2] * g1 + A2[2] * g2) / g,
      );
      buf.line[i] = line;
      buf.part[i] = b.part;
    }
  }
}

const bezier = (pts: V3[], t: number): V3 => {
  const u = 1 - t;
  const k = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return [0, 1, 2].map((i) =>
    pts.reduce((s, p, j) => s + k[j] * p[i], 0),
  ) as V3;
};

/** A tapering tube as a run of overlapping spheres along a cubic curve, spaced by a third of their radius. */
function tube(
  pts: V3[],
  radius: (t: number) => number,
  part: number,
  shade: (t: number) => Shade,
  bend: (t: number) => V3 = () => [0, 0, 0],
): Blob[] {
  const K = 16;
  const samples = Array.from({ length: K + 1 }, (_, i) => bezier(pts, i / K));
  const run = [0];
  for (let i = 1; i <= K; i++)
    run.push(run[i - 1] + Math.sqrt(square(samples[i], samples[i - 1])));
  const length = run[K];
  const blobs: Blob[] = [];
  for (let s = 0, k = 0; ;) {
    while (k < K - 1 && run[k + 1] < s) k++;
    const t = Math.min(1, (k + (s - run[k]) / (run[k + 1] - run[k] || 1)) / K);
    const r = radius(t);
    blobs.push({
      c: add(bezier(pts, t), bend(t)),
      r: [r, r, r],
      part,
      shade: shade(t),
    });
    if (s >= length) return blobs;
    s = Math.min(length, s + Math.max(0.45, r * 0.32));
  }
}

function limb(
  a: V3,
  b: V3,
  r0: number,
  r1: number,
  part: number,
  shade: Shade,
): Blob[] {
  const n = Math.ceil(Math.sqrt(square(a, b)) / (0.3 * Math.max(r0, r1))) || 1;
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const r = r0 + (r1 - r0) * t;
    return { c: add(a, scale(sub(b, a), t)), r: [r, r, r], part, shade };
  });
}

const PART = {
  body: 1,
  head: 2,
  jaw: 3,
  ear: 4,
  tail: 5,
  legFL: 10,
  legFR: 11,
  legHL: 12,
  legHR: 13,
  saddle: 20,
  flap: 21,
} as const;

const fur: Shade = (_p, _n, lam, x, y, facing) => {
  const rim = facing < 0.3 && lam < 0.25 ? 1 : 0;
  return FUR[Math.max(0, band(lam, x, y, FUR_CUTS) - rim)];
};
/** The side of the animal turned away from the viewer is a tone darker, so its legs read behind the near ones. */
const furFar: Shade = (p, n, lam, x, y, facing) =>
  FUR[Math.min(DEEP, FUR.indexOf(fur(p, n, lam, x, y, facing)) + 1)];

type Seg = [number, number, number, number];
const poly = (...c: number[]): Seg[] =>
  Array.from({ length: c.length / 2 - 1 }, (_, i): Seg => [
    c[i * 2],
    c[i * 2 + 1],
    c[i * 2 + 2],
    c[i * 2 + 3],
  ]);
const circle = (r: number, n = 12): Seg[] =>
  Array.from({ length: n }, (_, k): Seg => {
    const a = (k / n) * TAU;
    const b = ((k + 1) / n) * TAU;
    return [r * Math.cos(a), r * Math.sin(a), r * Math.cos(b), r * Math.sin(b)];
  });

type Glyph = { f: number; u: number; w: number; ramp: Rgb[]; segs: Seg[] };

/** Marks on the flank by forward and up position; the lower the index the nearer the head, which is the order the glow runs down the body. */
const GLYPHS: Glyph[] = [
  {
    f: 14,
    u: -0.8,
    w: 4,
    ramp: CYAN,
    segs: [...circle(3), ...poly(0, 0, 0, 0)],
  },
  {
    f: 9,
    u: -1.2,
    w: 3,
    ramp: VIOLET,
    segs: [...poly(0, -2.8, 0, 2.8), ...poly(-1.9, 2.8, 0, 0.6, 1.9, 2.8)],
  },
  {
    f: -6.8,
    u: -1.2,
    w: 3,
    ramp: CYAN,
    segs: [
      ...poly(0, 2.8, 1.9, 0, 0, -2.8, -1.9, 0, 0, 2.8),
      ...poly(0, 0, 0, 0),
    ],
  },
  {
    f: -14.5,
    u: -0.8,
    w: 4,
    ramp: VIOLET,
    segs: [...circle(3), ...poly(0, -4, 0, 4)],
  },
];
const TAIL_RUNES = [
  { t: 0.5, ramp: VIOLET },
  { t: 0.68, ramp: CYAN },
  { t: 0.86, ramp: VIOLET },
];

const segDist = ([x0, y0, x1, y1]: Seg, x: number, y: number) => {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const k = clamp(((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy || 1));
  return Math.hypot(x - x0 - k * dx, y - y0 - k * dy);
};

let runeDist = 0;
/** The glyph whose strokes pass nearest (f, u) within a pixel and a half, or -1; its distance is left in runeDist. */
function runeAt(f: number, u: number): number {
  let best = -1;
  runeDist = 1.3;
  GLYPHS.forEach((g, i) => {
    if (Math.abs(f - g.f) > g.w || Math.abs(u - g.u) > 4.5) return;
    for (const s of g.segs) {
      const d = segDist(s, f - g.f, u - g.u);
      if (d < runeDist) {
        runeDist = d;
        best = i;
      }
    }
  });
  return best;
}

const glowLevel = (phase: number, i: number) =>
  Math.round(1.5 + 1.5 * Math.cos(phase - i * 0.9));
const GLOW_CORE = [3, 2, 1, 1];
function glowAt(ramp: Rgb[], level: number, d: number): Rgb | undefined {
  if (d < 0.55) return ramp[level === 3 && d < 0.3 ? 0 : GLOW_CORE[level]];
  if (level >= 2 && d < 1.15) return ramp[level === 3 ? 2 : 3];
}

const SADDLE = { f: 0.5, a: 7.4, b: 5.8, top: 8.8 };
const padTop = (f: number, r: number) =>
  SADDLE.top - 0.022 * r * r - 0.012 * f * f;

const GROUND = -21.5;
const SPINE: [f: number, u: number, ru: number, rr: number][] = [
  [-19, 0.6, 5.6, 5.4],
  [-14, 0.6, 7.2, 8.8],
  [-6, 1.4, 6.4, 6.6],
  [1, 1.2, 5.9, 5.9],
  [8, 0.8, 7.4, 7],
  [14, 0.5, 8, 7.6],
  [19, -0.3, 6.2, 5.6],
  [24, -0.8, 4.4, 4],
];
function spineAt(f: number): [number, number, number] {
  let i = 0;
  while (i < SPINE.length - 2 && f > SPINE[i + 1][0]) i++;
  const [f0, ...a] = SPINE[i];
  const [f1, ...b] = SPINE[i + 1];
  const k = smooth(clamp((f - f0) / (f1 - f0)));
  return [
    a[0] + (b[0] - a[0]) * k,
    a[1] + (b[1] - a[1]) * k,
    a[2] + (b[2] - a[2]) * k,
  ];
}
const ring = (f: number): { c: V3; r: V3 } => {
  const [u, ru, rr] = spineAt(f);
  return { c: [f, 0, u], r: [Math.min(4.8, 2.6 + 0.4 * (f + 17)), rr, ru] };
};
const TORSO = Array.from({ length: 37 }, (_, i) => ring(-17 + i));
const torsoTop = (f: number, r: number) =>
  Math.max(
    ...TORSO.map(
      ({ c, r: k }) =>
        c[2] +
        k[2] *
          Math.sqrt(
            Math.max(
              0,
              1 - ((f - c[0]) / k[0]) ** 2 - ((r - c[1]) / k[1]) ** 2,
            ),
          ),
    ),
  );
const torsoSide = (f: number, u: number) =>
  Math.max(
    ...TORSO.map(
      ({ c, r: k }) =>
        k[1] *
        Math.sqrt(
          Math.max(0, 1 - ((f - c[0]) / k[0]) ** 2 - ((u - c[2]) / k[2]) ** 2),
        ),
    ),
  );

const hull =
  (phase: number, far: boolean): Shade =>
  (p, n, lam, x, y, facing) => {
    if (Math.abs(p[0] - SADDLE.f) < 1.2 && p[2] < 0.8) {
      if (Math.abs(p[1]) > 4.8 && Math.abs(p[2] + 2.4) < 1.4)
        return SILVER[lam > 0.3 ? 0 : 1];
      return LEATHER[lam > 0.4 ? 1 : lam > -0.2 ? 2 : 3];
    }
    if (Math.abs(n[1]) > 0.45 && Math.abs(p[2] - 0.3) < 5) {
      const i = runeAt(p[0], p[2]);
      if (i >= 0) {
        const glow = glowAt(GLYPHS[i].ramp, glowLevel(phase, i), runeDist);
        if (glow) return glow;
      }
    }
    return (far ? furFar : fur)(p, n, lam, x, y, facing);
  };

type Leg = {
  front: boolean;
  side: number;
  offset: number;
  hip: V3;
  rest: number;
  stride: number;
  part: number;
};
const LEGS: Leg[] = [
  {
    front: false,
    side: -1,
    offset: 0,
    hip: [-11.5, -6.8, -3.5],
    rest: -12.5,
    stride: 12,
    part: PART.legHL,
  },
  {
    front: true,
    side: -1,
    offset: 0.25,
    hip: [11.5, -5.8, -2.5],
    rest: 12.5,
    stride: 12,
    part: PART.legFL,
  },
  {
    front: false,
    side: 1,
    offset: 0.5,
    hip: [-11.5, 6.8, -3.5],
    rest: -12.5,
    stride: 12,
    part: PART.legHR,
  },
  {
    front: true,
    side: 1,
    offset: 0.75,
    hip: [11.5, 5.8, -2.5],
    rest: 12.5,
    stride: 12,
    part: PART.legFR,
  },
];
const DUTY = 0.66;
const STEP = 3.4;

function footAt(l: Leg, t: number): { f: number; lift: number } {
  const ph = wrap(t + l.offset);
  if (ph < DUTY) return { f: l.rest + l.stride * (0.5 - ph / DUTY), lift: 0 };
  const s = (ph - DUTY) / (1 - DUTY);
  return {
    f: l.rest + l.stride * (smooth(s) - 0.5),
    lift: STEP * Math.sin(Math.PI * s),
  };
}

/** The joint of a two-bone limb, bending forward (dir 1) or back (dir -1) in the plane the limb stands in. */
function joint(hip: V3, foot: V3, l1: number, l2: number, dir: number): V3 {
  const dx = foot[0] - hip[0];
  const dz = foot[2] - hip[2];
  const d = Math.min(Math.hypot(dx, dz), l1 + l2 - 0.01);
  const a = (d * d + l1 * l1 - l2 * l2) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const ux = dx / d;
  const uz = dz / d;
  const s = -uz * dir >= 0 ? 1 : -1;
  return [hip[0] + ux * a - uz * h * s, hip[1], hip[2] + uz * a + ux * h * s];
}

const farSide = (pose: Pose, side: number) => side * pose.R[2] > 0.2;

function legBlobs(pose: Pose, l: Leg): Blob[] {
  const { f, lift } = footAt(l, pose.t);
  const r = l.hip[1];
  const far = farSide(pose, l.side);
  const shade = far ? furFar : fur;
  const top = hull(pose.phase, far);
  const paw: V3 = [f + 1.3, r, GROUND + 2 + lift];
  const out: Blob[] = [{ c: paw, r: [3.8, 2.9, 2.1], part: l.part, shade }];
  if (l.front) {
    const wrist: V3 = [f, r, GROUND + 4.6 + lift];
    const elbow = joint(l.hip, wrist, 7.8, 7.8, -1);
    out.push(
      ...limb(l.hip, elbow, 4.2, 3.1, l.part, top),
      ...limb(elbow, wrist, 3.1, 2.5, l.part, shade),
      ...limb(wrist, paw, 2.5, 2.3, l.part, shade),
    );
  } else {
    const hock: V3 = [f - 1.2, r, GROUND + 6.4 + lift];
    const knee = joint(l.hip, hock, 8.4, 8.6, 1);
    out.push(
      ...limb(l.hip, knee, 5.2, 3.5, l.part, top),
      ...limb(knee, hock, 3.5, 2.6, l.part, shade),
      ...limb(hock, paw, 2.6, 2.5, l.part, shade),
    );
  }
  return out;
}

type Whisker = [V3, V3];

/** The muzzle and chin catch more light than the rest of the coat, so the face reads against the dark skull. */
const paler =
  (shade: Shade): Shade =>
  (p, n, lam, x, y, facing) =>
    FUR[Math.max(0, FUR.indexOf(shade(p, n, lam, x, y, facing)) - 1)];

function head(
  phase: number,
  centre: V3,
  pitch: number,
): { blobs: Blob[]; whiskers: Whisker[] } {
  const hF: V3 = [Math.cos(pitch), 0, Math.sin(pitch)];
  const hR: V3 = [0, 1, 0];
  const hU: V3 = [-Math.sin(pitch), 0, Math.cos(pitch)];
  const axes: [V3, V3, V3] = [hF, hR, hU];
  const here = (f: number, r: number, u: number): V3 =>
    sum(centre, scale(hF, f), scale(hR, r), scale(hU, u));
  const skull: V3 = [7.2, 6.6, 6.1];
  const onSkull = (d: V3): V3 => {
    const s = 1 / Math.hypot(d[0] / skull[0], d[1] / skull[1], d[2] / skull[2]);
    return here(d[0] * s, d[1] * s, d[2] * s);
  };
  const eyes = [1, -1].map((side) => onSkull([0.66, 0.5 * side, 0.2]));
  const gem = onSkull([0.38, 0, 0.9]);
  const slant = 0.45;
  const cs = Math.cos(slant);
  const sn = Math.sin(slant);
  const noseAt = here(9.3, 0, -1);
  const skullShade: Shade = (p, n, lam, x, y, facing) => {
    for (let k = 0; k < 2; k++) {
      const d = sub(p, eyes[k]);
      if (dot(d, hF) < -1.2) continue;
      const out = dot(d, hR) * (k === 0 ? 1 : -1);
      const up = dot(d, hU);
      const e = ((out * cs + up * sn) / 2.1) ** 2 + (-out * sn + up * cs) ** 2;
      if (e < 0.3) return CYAN[0];
      if (e < 1) return CYAN[1];
      if (e < 1.8) return CYAN[3];
      if (e < 3.6 && up > 0.4) return FUR[DEEP];
    }
    if (square(p, gem) < 1.3) return VIOLET[3 - glowLevel(phase, 0)];
    return fur(p, n, lam, x, y, facing);
  };
  const muzzle = paler(paler(fur));
  const snoutShade: Shade = (p, n, lam, x, y, facing) =>
    square(p, noseAt) < 3.2
      ? NOSE[lam > 0.2 ? 0 : 1]
      : muzzle(p, n, lam, x, y, facing);
  const earInside: Shade = (p, n, lam, x, y, facing) =>
    n[0] > 0.6 ? EAR[lam > 0.2 ? 0 : 1] : fur(p, n, lam, x, y, facing);
  const ears = [1, -1].flatMap((side) =>
    tube(
      [
        here(-1.4, 3.7 * side, 4.2),
        here(-1.8, 4.4 * side, 6.4),
        here(-2.4, 4.8 * side, 8.4),
        here(-3.2, 5 * side, 10.4),
      ],
      (t) => 3.4 - 2.9 * t,
      PART.ear,
      (t) => (t > 0.12 && t < 0.7 ? earInside : fur),
    ),
  );
  const whiskers = [1, -1].flatMap((side) =>
    [0, 1, 2].map((k): Whisker => [
      here(6.8, 3.4 * side, -1.2 - 0.7 * k),
      here(4.6 - 0.4 * k, (9.4 - 0.4 * k) * side, 1.6 - 2.5 * k),
    ]),
  );
  return {
    blobs: [
      { c: centre, r: skull, axes, part: PART.head, shade: skullShade },
      {
        c: here(5.2, 0, -2),
        r: [4.1, 4, 3],
        axes,
        part: PART.head,
        shade: snoutShade,
      },
      {
        c: here(4, 0, -3.8),
        r: [3.8, 2.9, 1.7],
        axes,
        part: PART.jaw,
        shade: fur,
      },
      ...ears,
    ],
    whiskers,
  };
}

const TAIL_HOOKED: V3[] = [
  [-17, 0, 1.5],
  [-26, 0, -4.5],
  [-32, 0, -0.5],
  [-33, 0, 10.5],
];
/** From behind a hooked tail would be a stump in front of the rump, so it trails low and long instead. */
const TAIL_TRAILING: V3[] = [
  [-17, 0, 1.5],
  [-27, 0, -5],
  [-35, 0, -7],
  [-40, 0, -2],
];

function body(pose: Pose): { blobs: Blob[]; whiskers: Whisker[] } {
  const { phase, direction } = pose;
  const skull = HEAD[direction];
  const face = head(phase, skull, -0.12);
  const neck = [20, 21, 22, 23, 24].map((f) => {
    const k = smooth(clamp((f - 19) / 5));
    const b = ring(f);
    return { ...b, c: [f, 0, b.c[2] + (skull[2] - b.c[2]) * k * 0.8] as V3 };
  });
  const flesh = (side: number) => hull(phase, farSide(pose, side));
  const muscles: Blob[] = [1, -1].flatMap((side) => [
    {
      c: [-11.5, 6.4 * side, -2.4] as V3,
      r: [6.6, 3.5, 7] as V3,
      part: side > 0 ? PART.legHR : PART.legHL,
      shade: flesh(side),
    },
    {
      c: [11.5, 5.5 * side, -1.8] as V3,
      r: [5.2, 3.2, 6.6] as V3,
      part: side > 0 ? PART.legFR : PART.legFL,
      shade: flesh(side),
    },
    {
      c: [10.5, 3.7 * side, 6.2] as V3,
      r: [4.4, 2.6, 3.2] as V3,
      part: PART.body,
      shade: flesh(side),
    },
  ]);
  const side = TAIL_SIDE[direction];
  const tailPts = direction === "north" ? TAIL_TRAILING : TAIL_HOOKED;
  const sway = (t: number): V3 => [
    0,
    side * t ** 1.5 + SWAY[direction] * t * t * Math.sin(phase - 2.2 * t),
    2.2 * t * t * Math.sin(phase - 2.2 * t + 1.5),
  ];
  const tail = tube(
    tailPts,
    (t) => 4.8 - 2.2 * t ** 0.8,
    PART.tail,
    (t) => {
      const k = TAIL_RUNES.findIndex((r) => Math.abs(t - r.t) < 0.02);
      if (k < 0) return fur;
      const { ramp } = TAIL_RUNES[k];
      const level = glowLevel(phase, GLYPHS.length + k);
      return () => ramp[GLOW_CORE[level]];
    },
    sway,
  );
  const torso = hull(phase, false);
  return {
    blobs: [
      ...[...TORSO, ...neck].map((b) => ({
        ...b,
        part: PART.body,
        shade: torso,
      })),
      ...muscles,
      ...LEGS.flatMap((l) => legBlobs(pose, l)),
      ...face.blobs,
      ...tail,
    ],
    whiskers: face.whiskers,
  };
}

type PadDot = { p: V3; n: V3; kind: number };

/** The flat pad: kind 0 seat, 1 silver rim at its front and back, 3 side wall. */
const PAD_DOTS: PadDot[] = (() => {
  const { f: f0, a, b } = SADDLE;
  const e = 2.5;
  const dots: PadDot[] = [];
  for (let f = -a; f <= a; f += 0.42)
    for (let r = -b; r <= b; r += 0.42) {
      const rho = (Math.abs(f) / a) ** e + (Math.abs(r) / b) ** e;
      if (rho > 1) continue;
      const n = unit([0.024 * f, 0.04 * r, 1]);
      const kind = Math.abs(f) > a * 0.5 && rho ** (1 / e) > 0.9 ? 1 : 0;
      dots.push({ p: [f0 + f, r, padTop(f, r)], n, kind });
    }
  for (let t = 0; t < TAU; t += 0.025) {
    const c = Math.cos(t);
    const s = Math.sin(t);
    const f = a * Math.sign(c) * Math.abs(c) ** (2 / e);
    const r = b * Math.sign(s) * Math.abs(s) ** (2 / e);
    const n = unit([
      (Math.sign(f) * Math.abs(f / a) ** (e - 1)) / a,
      (Math.sign(r) * Math.abs(r / b) ** (e - 1)) / b,
      0,
    ]);
    const top = padTop(f, r);
    const depth = Math.min(2.6, Math.max(1.2, top - torsoTop(f0 + f, r) + 0.4));
    for (let h = 0; h <= depth; h += 0.42)
      dots.push({ p: [f0 + f, r, top - h], n, kind: 3 });
  }
  return dots;
})();

/** The cloth hanging down each flank from under the pad: kind 0 cloth, 1 silver hem. */
const FLAP_DOTS: PadDot[] = (() => {
  const half = 4.2;
  const drop = 7;
  const top = 7.2;
  const round = 2.2;
  const dots: PadDot[] = [];
  for (let x = -half; x <= half; x += 0.35)
    for (let y = 0; y <= drop; y += 0.35) {
      const down = Math.max(0, y - (drop - round));
      const across = Math.max(0, Math.abs(x) - (half - round));
      const corner = Math.hypot(down, across);
      if (corner > round) continue;
      const f = SADDLE.f + x;
      const u = top - y;
      const out = torsoSide(f, u);
      if (out < 1) continue;
      const kind =
        half - Math.abs(x) < 0.6 || drop - y < 0.6 || corner > round - 0.6
          ? 1
          : 0;
      for (const side of [1, -1])
        dots.push({
          p: [f, side * (out + 0.35), u],
          n: unit([0.04 * x, side, 0.05 * (u - 1)]),
          kind,
        });
    }
  return dots;
})();

function saddle(buf: Buf, pose: Pose): void {
  for (const { p, n, kind } of PAD_DOTS) {
    const v = at(pose, p);
    const lam = dot(turn(pose, n), LIGHT);
    const ink =
      kind === 1
        ? SILVER[lam > 0.5 ? 1 : 2]
        : kind === 3
          ? LEATHER[lam > 0.3 ? 2 : 3]
          : LEATHER[lam > 0.86 ? 0 : lam > 0.8 ? 1 : 2];
    plot(
      buf,
      Math.floor(v[0]),
      Math.floor(v[1]),
      v[2],
      ink,
      LEATHER_LINE,
      PART.saddle,
    );
  }
  for (const { p, n, kind } of FLAP_DOTS) {
    const v = at(pose, p);
    const lam = dot(turn(pose, n), LIGHT);
    const ink =
      kind === 1
        ? SILVER[lam > 0.5 ? 1 : 2]
        : LEATHER[lam > 0.35 ? 1 : lam > -0.1 ? 2 : 3];
    plot(
      buf,
      Math.floor(v[0]),
      Math.floor(v[1]),
      v[2] - 0.2,
      ink,
      LEATHER_LINE,
      PART.flap,
    );
  }
}

const NEIGHBOURS: Xy[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Fills and outlines the frame: a 1-px edge round the silhouette, and a line where a part passes well in front of another. */
function ink(px: Pixels, buf: Buf): void {
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const own = buf.ink[i];
      let colour = own;
      let nearest = Infinity;
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (!buf.ink[j]) continue;
        if (!own) {
          if (buf.depth[j] < nearest) {
            nearest = buf.depth[j];
            colour = buf.line[j];
          }
        } else if (
          buf.part[j] !== buf.part[i] &&
          buf.depth[j] < buf.depth[i] - 1.8
        )
          colour = buf.line[i];
      }
      if (colour) put(px, x, y, colour);
    }
}

/** Whiskers are one pixel thin, so they go over the outlined frame rather than through it; the heads that turn away show none. */
function whisk(px: Pixels, pose: Pose, whiskers: Whisker[]): void {
  if (!WHISKERED.includes(pose.direction)) return;
  for (const [a, b] of whiskers) {
    if (farSide(pose, Math.sign(a[1]))) continue;
    const p = at(pose, a);
    const q = at(pose, b);
    const n = Math.ceil(Math.max(Math.abs(q[0] - p[0]), Math.abs(q[1] - p[1])));
    for (let s = 0; s <= n; s++)
      put(
        px,
        Math.floor(p[0] + ((q[0] - p[0]) * s) / n),
        Math.floor(p[1] + ((q[1] - p[1]) * s) / n),
        SILVER[s < n * 0.6 ? 1 : 2],
      );
  }
}

function paint(px: Pixels, direction: string, frame: number): void {
  const pose = posed(direction, frame);
  const buf = buffer();
  const { blobs, whiskers } = body(pose);
  for (const b of blobs) blob(buf, pose, b);
  saddle(buf, pose);
  ink(px, buf);
  whisk(px, pose, whiskers);
}

const seat = (direction: string): [number, number] => {
  const v = at(posed(direction, 0, false), [SADDLE.f, 0, padTop(0, 0)]);
  return [Math.floor(v[0]), Math.floor(v[1])];
};

export const SHADOW_PANTHER: DrawnMount = {
  id: "own-shadow-panther",
  name: "Shadow Panther",
  description:
    "เสือดำร่างเพรียวสีดำอมม่วง ขนไล่เฉดม่วงเข้มเป็นเงาวาว ดวงตาเรืองแสงสีฟ้าสว่าง ตามสีข้างมีลายรูนเรืองแสงสีม่วงและสีฟ้ากะพริบเป็นจังหวะ ย่องเดินเท้าเบาก้าวต่ำ หางยาวแกว่งไปมามีวงแหวนเรืองแสงพันรอบ บนหลังมีเบาะอานหนังสีเข้มแต่งขอบเงิน",
  cell: CELL,
  seat: Object.fromEntries(
    RIDING.directions.map((d): [string, [number, number]] => [d, seat(d)]),
  ),
  paint,
};
