import { RIDING } from "../../game/riding";
import type { DrawnMount } from "../mounts";
import { bayer, put, rgb, wrap, type Pixels, type Rgb } from "../pixels";

type V3 = [number, number, number];
type Xy = [number, number];

const CELL = { w: 112, h: 90 };
const W = CELL.w;
const H = CELL.h;
const TAU = Math.PI * 2;
/** Screen pixels per body unit. */
const SIZE = 1.25;

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a: V3): V3 => scale(a, 1 / (Math.hypot(...a) || 1));
const sum = (...vs: V3[]): V3 => vs.reduce<V3>((s, v) => add(s, v), [0, 0, 0]);
const square = (p: V3, q: V3) =>
  (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));

const inks = (...hex: string[]) => hex.map(rgb);
const COPPER = inks("#ffd79b", "#f09a52", "#c8652f", "#923c26", "#58211f");
const COPPER_LINE = rgb("#2a100e");
const BRASS = inks("#fff3b0", "#f2d14e", "#d4a22a", "#9a6a1e", "#5e3d17");
const BRASS_LINE = rgb("#3a230d");
const STEEL = inks("#b4c2d6", "#8494ad", "#5b6a86", "#3a4560");
const STEEL_LINE = rgb("#161c2c");
const GLOW = inks("#f2ffff", "#8af5ff", "#26cfe6", "#0d8aa6");
const LEATHER = inks("#b97a48", "#94562f", "#6a381f", "#432114");
const LEATHER_LINE = rgb("#1f0f09");

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
  south: [56, 41],
  "south-east": [53, 41],
  east: [50, 49],
  "north-east": [53, 41],
  north: [56, 41],
};
/** Seen from behind the head drops out of sight behind the barrel, so it never stands over the seat. */
const HEAD: Record<string, V3> = {
  south: [34, 0, 12],
  "south-east": [32, 0, 16],
  east: [32, 0, 18.5],
  "north-east": [31, 0, 7],
  north: [26, 0, -8],
};
const PITCH = -0.55;

type Pose = {
  direction: string;
  frame: number;
  phase: number;
  raise: number;
  o: Xy;
  F: V3;
  R: V3;
  U: V3;
};

function posed(direction: string, frame: number, bobbing = true): Pose {
  const [fx, fy] = HEADING[direction];
  const phase = (frame / RIDING.framesPerDirection) * TAU;
  const raise = bobbing && frame % 3 === 1 ? 1 : 0;
  const [ox, oy] = ORIGIN[direction];
  return {
    direction,
    frame,
    phase,
    raise,
    o: [ox, oy - raise],
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

const band = (
  lam: number,
  x: number,
  y: number,
  cuts: number[],
  jitter = 0.1,
): number => {
  const v = lam + (bayer(x, y) - 0.5) * jitter;
  let i = 0;
  while (i < cuts.length && v < cuts[i]) i++;
  return i;
};
const COPPER_CUTS = [0.92, 0.64, 0.2, -0.3];
const BRASS_CUTS = [0.85, 0.5, 0, -0.45];
const STEEL_CUTS = [0.75, 0.3, -0.25];

/** p and n are the hit point and normal in the horse's own frame (forward, right, up), reused between calls. */
type Shade = (p: V3, n: V3, lam: number, x: number, y: number) => Rgb;
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

/** Ray-casts an ellipsoid into the buffer, one ray per pixel straight into the screen. */
function blob(buf: Buf, pose: Pose, b: Blob): void {
  const [a0, a1, a2] = b.axes ?? IDENTITY;
  const C = at(pose, b.c);
  const A0 = turn(pose, a0);
  const A1 = turn(pose, a1);
  const A2 = turn(pose, a2);
  const [u0, u1, u2] = b.r;
  const r0 = u0 * SIZE;
  const r1 = u1 * SIZE;
  const r2 = u2 * SIZE;
  const ex = Math.hypot(r0 * A0[0], r1 * A1[0], r2 * A2[0]);
  const ey = Math.hypot(r0 * A0[1], r1 * A1[1], r2 * A2[1]);
  const d0 = A0[2] / r0;
  const d1 = A1[2] / r1;
  const d2 = A2[2] / r2;
  const qa = d0 * d0 + d1 * d1 + d2 * d2;
  const L0 = dot(A0, LIGHT) / u0;
  const L1 = dot(A1, LIGHT) / u1;
  const L2 = dot(A2, LIGHT) / u2;
  const [cf, cr, cu] = b.c;
  const line = b.line ?? COPPER_LINE;
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
      const g0 = h0 / u0;
      const g1 = h1 / u1;
      const g2 = h2 / u2;
      const g = Math.sqrt(g0 * g0 + g1 * g1 + g2 * g2);
      const k0 = h0 * u0;
      const k1 = h1 * u1;
      const k2 = h2 * u2;
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
  line?: Rgb,
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
      c: bezier(pts, t),
      r: [r, r, r],
      part,
      line,
      shade: shade(t),
    });
    if (s >= length) return blobs;
    s = Math.min(length, s + Math.max(0.45, r * 0.32));
  }
}

/** A flat blade standing in the forward-up plane; the angle runs from straight up toward backward and keeps curling that way. */
function blade(
  base: V3,
  angle: number,
  length: number,
  width: number,
  curl: number,
  lean: number,
  part: number,
  shade: Shade,
): Blob[] {
  const K = Math.ceil(length / 0.8);
  const blobs: Blob[] = [];
  let [f, , u] = base;
  let a = angle;
  for (let k = 0; k <= K; k++) {
    const s = k / K;
    const w = width * (1 - s) ** 0.8 + 0.25;
    blobs.push({
      c: [f, base[1] + lean * s, u],
      r: [w, 0.5, w],
      part,
      line: BRASS_LINE,
      shade,
    });
    a += curl / K;
    f -= (Math.sin(a) * length) / K;
    u += (Math.cos(a) * length) / K;
  }
  return blobs;
}

const PART = {
  chest: 1,
  barrel: 2,
  rump: 3,
  neck: 4,
  head: 5,
  jaw: 6,
  ear: 7,
  mane: 8,
  tail: 12,
  saddle: 20,
  housing: 30,
  gear: 40,
  leg: 50,
  key: 70,
} as const;

/** The ink for a lambert value; the darkest rim lifts a shade, as light bounces back off the metal below. */
const lit = (
  ramp: Rgb[],
  cuts: number[],
  lam: number,
  x: number,
  y: number,
  shift = 0,
): Rgb => {
  const last = ramp.length - 1;
  const i = Math.min(last, band(lam, x, y, cuts) + shift);
  return ramp[i === last && lam < -0.62 ? last - 1 : i];
};

const brass =
  (shift = 0): Shade =>
  (_p, _n, lam, x, y) =>
    lit(BRASS, BRASS_CUTS, lam, x, y, shift);
const steel: Shade = (_p, _n, lam, x, y) => lit(STEEL, STEEL_CUTS, lam, x, y);
const copper: Shade = (_p, _n, lam, x, y) =>
  lit(COPPER, COPPER_CUTS, lam, x, y);

const TORSO = {
  chest: { c: [14, 0, -0.6] as V3, r: [10.5, 11.6, 11.3] as V3 },
  barrel: { c: [0, 0, -0.5] as V3, r: [13, 11.2, 11.5] as V3 },
  rump: { c: [-14.5, 0, -0.8] as V3, r: [10.5, 11.6, 10.8] as V3 },
};
const torsoTop = (f: number, r: number) =>
  Math.max(
    ...Object.values(TORSO).map(
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

const SADDLE = { f: -1.5, a: 7.4, b: 6.8 };
/** The pad lies on the back like a cushion, with a low cantle behind the seat and a pommel before it. */
const padTop = (f: number, r: number) =>
  torsoTop(SADDLE.f + f, r) +
  1.5 +
  1.1 * clamp((Math.abs(f) - (SADDLE.a - 2.6)) / 2.6);

const HOOPS = [-8.5, 8.5];
const SEAMS = [3.5, -4.5];
const rivetAround = (p: V3, step: number, radius: number): boolean => {
  const phi = Math.atan2(p[2], p[1]);
  const along = Math.round(phi / step) * step;
  return Math.abs(phi - along) * Math.hypot(p[1], p[2]) < radius;
};

const plated: Shade = (p, n, lam, x, y) => {
  if (Math.abs(p[0] - SADDLE.f) < 1.5 && p[2] < 7.5)
    return LEATHER[lam > 0.4 ? 1 : lam > -0.2 ? 2 : 3];
  for (const hoop of HOOPS)
    if (Math.abs(p[0] - hoop) < 1.25) {
      if (Math.abs(p[0] - hoop) < 0.55 && rivetAround(p, 0.34, 0.75))
        return BRASS[0];
      return lit(BRASS, BRASS_CUTS, lam, x, y, 1);
    }
  if (Math.abs(p[1]) > 2)
    for (const seam of SEAMS)
      if (Math.abs(p[2] - seam) < 0.5) {
        if (wrap(p[0] / 4.4 + 0.25) < 0.11) return BRASS[1];
        return COPPER[4];
      }
  return copper(p, n, lam, x, y);
};
const platedEnd =
  (sign: number, edge: number, rise: number): Shade =>
  (p, n, lam, x, y) => {
    const face = sign * n[0];
    if (face > edge && p[2] < 9) {
      if (face < edge + 0.06 && rivetAround([0, p[1], p[2] + rise], 0.3, 0.7))
        return BRASS[0];
      return lit(BRASS, BRASS_CUTS, lam, x, y);
    }
    return plated(p, n, lam, x, y);
  };
const chestPlate = platedEnd(1, 0.66, 2);
const rumpPlate = platedEnd(-1, 0.78, 0.8);

const GROUND = -30.2;
const ANKLE = 4.4;
const UPPER = 12.5;
const LOWER = 12.5;
const STEP = 8.5;
const LIFT = 8;
const HIP_R = 7.2;
const HIPS = { front: [13.5, -2.5], hind: [-15, -2.5] };

/** Two-bone leg in the forward-up plane; the knee is pushed forward on the fore legs and back on the hind ones. */
function twoBone(hip: Xy, foot: Xy, forward: boolean): Xy {
  const dx = foot[0] - hip[0];
  const du = foot[1] - hip[1];
  const far = Math.hypot(dx, du);
  const d = Math.min(far, UPPER + LOWER - 0.05);
  const a = (d * d + UPPER * UPPER - LOWER * LOWER) / (2 * d);
  const h = Math.sqrt(Math.max(0, UPPER * UPPER - a * a));
  const ex = dx / far;
  const eu = du / far;
  const k = forward ? 1 : -1;
  return [hip[0] + ex * a - eu * h * k, hip[1] + eu * a + ex * h * k];
}

/** Fore and hind legs on opposite sides move together, as a trot does. */
const LEGS = [
  { front: true, side: 1, lead: 0.5 },
  { front: true, side: -1, lead: 0 },
  { front: false, side: 1, lead: 0 },
  { front: false, side: -1, lead: 0.5 },
];

type Joint = { hip: V3; knee: V3; ankle: V3; dir: V3 };

function joints(pose: Pose, front: boolean, side: number, lead: number): Joint {
  const u = wrap((pose.frame + 0.5) / RIDING.framesPerDirection + lead);
  const [hf, hu] = front ? HIPS.front : HIPS.hind;
  const swing = u >= 0.5;
  const v = (u - 0.5) * 2;
  const off = swing ? -STEP * Math.cos(Math.PI * v) : STEP * (1 - 4 * u);
  const lift = swing ? LIFT * Math.sin(Math.PI * v) : 0;
  const down = pose.raise / (COS * SIZE);
  const foot: Xy = [hf + (front ? 1.2 : 0) + off, GROUND + ANKLE + lift - down];
  const [kf, ku] = twoBone([hf, hu], foot, front);
  const r = side * HIP_R;
  const knee: V3 = [kf, r, ku];
  const ankle: V3 = [foot[0], r, foot[1]];
  return { hip: [hf, r, hu], knee, ankle, dir: unit(sub(ankle, knee)) };
}

const line3 = (a: V3, b: V3): V3[] => [
  a,
  add(a, scale(sub(b, a), 1 / 3)),
  add(a, scale(sub(b, a), 2 / 3)),
  b,
];

function legBlobs(pose: Pose, index: number): Blob[] {
  const { front, side, lead } = LEGS[index];
  const j = joints(pose, front, side, lead);
  const far = side * pose.R[2] > 0.2 ? 1 : 0;
  const part = PART.leg + index * 4;
  const upperDir = unit(sub(j.knee, j.hip));
  const upperLen = Math.hypot(...sub(j.knee, j.hip));
  const lowerLen = Math.hypot(...sub(j.ankle, j.knee));
  const shaded = (
    ramp: Rgb[],
    cuts: number[],
    lam: number,
    x: number,
    y: number,
  ) => lit(ramp, cuts, lam, x, y, far);
  const sleeve: Shade = (p, _n, lam, x, y) => {
    const s = dot(sub(p, j.hip), upperDir) / upperLen;
    if (Math.abs(s - 0.52) < 0.07) return shaded(BRASS, BRASS_CUTS, lam, x, y);
    return shaded(COPPER, COPPER_CUTS, lam, x, y);
  };
  const piston: Shade = (p, _n, lam, x, y) => {
    const s = dot(sub(p, j.knee), j.dir) / lowerLen;
    if (s < 0.16 || s > 0.86) return shaded(BRASS, BRASS_CUTS, lam, x, y);
    return shaded(STEEL, STEEL_CUTS, lam, x, y);
  };
  const hoofSide: V3 = [0, 1, 0];
  const hoofC = add(j.ankle, scale(j.dir, 1.8));
  const hoof: Shade = (p, _n, lam, x, y) =>
    dot(sub(p, hoofC), j.dir) > 0.9
      ? STEEL[3]
      : shaded(BRASS, BRASS_CUTS, lam, x, y);
  const kneeCap: Shade = (p, _n, lam, x, y) => {
    const d = Math.hypot(p[0] - j.knee[0], p[2] - j.knee[2]);
    if (side * (p[1] - j.knee[1]) > 1.8 && d < 1.3) return STEEL[3];
    return shaded(BRASS, BRASS_CUTS, lam, x, y);
  };
  return [
    ...tube(
      line3(j.hip, j.knee),
      (t) => 4 - 0.7 * t,
      part,
      () => sleeve,
      COPPER_LINE,
    ),
    {
      c: j.knee,
      r: [3.5, 3.5, 3.5],
      part: part + 1,
      line: BRASS_LINE,
      shade: kneeCap,
    },
    ...tube(
      line3(j.knee, j.ankle),
      (t) => 3.1 - 0.4 * t,
      part + 2,
      () => piston,
      STEEL_LINE,
    ),
    {
      c: hoofC,
      r: [2.6, 3.4, 3.5],
      axes: [j.dir, hoofSide, cross(j.dir, hoofSide)],
      part: part + 3,
      line: BRASS_LINE,
      shade: hoof,
    },
  ];
}

const NECK_R = (t: number) => 7.8 - 3 * t;
const neckCurve = (skull: V3): V3[] => [
  [14, 0, 2],
  [20, 0, 7 + (skull[2] - 16) * 0.25],
  add(skull, [-8, 0, -4.5]),
  add(skull, [-3.4, 0, -2.4]),
];

function head(centre: V3, pitch: number): Blob[] {
  const hF: V3 = [Math.cos(pitch), 0, Math.sin(pitch)];
  const hR: V3 = [0, 1, 0];
  const hU: V3 = [-Math.sin(pitch), 0, Math.cos(pitch)];
  const axes: [V3, V3, V3] = [hF, hR, hU];
  const here = (f: number, r: number, u: number): V3 =>
    sum(centre, scale(hF, f), scale(hR, r), scale(hU, u));
  const skull: V3 = [7.6, 6.2, 6.9];
  const onSkull = (d: V3): V3 => {
    const s = 1 / Math.hypot(d[0] / skull[0], d[1] / skull[1], d[2] / skull[2]);
    return here(d[0] * s, d[1] * s, d[2] * s);
  };
  const sides = [1, -1];
  const eyes = sides.map((side) => onSkull([0.9, side, 0.5]));
  const cheeks = sides.map((side) => here(0.6, 5.9 * side, -2.6));
  const nostrils = sides.map((side) => here(16.4, 2.2 * side, 0.4));
  const noseband = here(12, 0, 0);
  const face: Shade = (p, n, lam, x, y) => {
    for (const e of eyes) {
      const d = square(p, e);
      if (d < 2) return GLOW[0];
      if (d < 4.4) return GLOW[1];
      if (d < 7.5) return GLOW[2];
    }
    for (const c of cheeks) {
      const d = square(p, c);
      if (d < 1.1) return STEEL[3];
      if (d < 6) return lit(BRASS, BRASS_CUTS, lam, x, y);
    }
    if (Math.abs(dot(sub(p, centre), hR)) < 1.3 && n[2] > 0.3)
      return lit(BRASS, BRASS_CUTS, lam, x, y);
    return copper(p, n, lam, x, y);
  };
  const muzzle: Shade = (p, n, lam, x, y) => {
    for (const nostril of nostrils)
      if (square(p, nostril) < 1.2) return STEEL[3];
    if (Math.abs(dot(sub(p, noseband), hF)) < 1.3)
      return lit(BRASS, BRASS_CUTS, lam, x, y);
    return copper(p, n, lam, x, y);
  };
  const ears = sides.flatMap((side) =>
    blade(
      here(side > 0 ? 0.6 : -2.8, 3.7 * side, 5.7),
      side > 0 ? 0.05 : 0.3,
      5.6,
      1.5,
      0.5,
      1.2 * side,
      PART.ear,
      brass(side > 0 ? 0 : 1),
    ),
  );
  return [
    { c: centre, r: skull, axes, part: PART.head, shade: face },
    {
      c: here(9.8, 0, -1.2),
      r: [7.4, 4.5, 4.6],
      axes,
      part: PART.head,
      shade: muzzle,
    },
    {
      c: here(2.9, 0, -4.2),
      r: [7, 5.1, 4.1],
      axes,
      part: PART.jaw,
      shade: steel,
      line: STEEL_LINE,
    },
    ...ears,
  ];
}

const MANE = [
  { t: 0.2, len: 9 },
  { t: 0.37, len: 11 },
  { t: 0.54, len: 11.5 },
  { t: 0.71, len: 10 },
  { t: 0.87, len: 8 },
];

/** Seen head on, the blades would climb across the saddle, so they stay short there and vanish behind the barrel from behind. */
const MANE_LENGTH: Record<string, number> = {
  south: 0.5,
  "south-east": 0.85,
  east: 1,
  "north-east": 0.7,
  north: 0,
};

function mane(pose: Pose, skull: V3): Blob[] {
  const pts = neckCurve(skull);
  const reach = MANE_LENGTH[pose.direction];
  if (!reach) return [];
  return MANE.flatMap(({ t, len }, k) => {
    const pos = bezier(pts, t);
    const tan = unit(sub(bezier(pts, t + 0.02), pos));
    const base = add(pos, scale([-tan[2], 0, tan[0]], NECK_R(t) * 0.75));
    return blade(
      base,
      0.18 + 0.12 * Math.sin(pose.phase - 1.1 * k),
      len * reach,
      1.4,
      0.8,
      k % 2 ? 0.9 : -0.9,
      PART.mane + (k % 2),
      brass(k % 2),
    );
  });
}

function tail(pose: Pose): Blob[] {
  const root: V3 = [-24, 0, 3.5];
  return [0, 1, 2, 3, 4].flatMap((k) => {
    const sway = Math.sin(pose.phase - 1.4 - k * 0.45);
    return blade(
      root,
      Math.PI / 2 + 0.2 + 0.12 * sway,
      15 + (k % 3) * 2,
      1.5,
      1.3,
      (k - 2) * 1.5 + 2.4 * sway,
      PART.tail + (k % 2),
      brass(1 + (k % 2)),
    );
  });
}

const HOUSING = { r: 9.2, half: 3.2, rad: 8.8 };
const GEAR_PLANE = HOUSING.r + HOUSING.half + 0.12;
const HOUSINGS = [
  { f: HIPS.front[0], u: HIPS.front[1] + 1, turn: 1 },
  { f: HIPS.hind[0], u: HIPS.hind[1] + 1, turn: -1 },
].flatMap((g) => [1, -1].map((side) => ({ ...g, side })));

function housings(): Blob[] {
  return HOUSINGS.map(({ f, u, side }, i) => ({
    c: [f, side * HOUSING.r, u],
    r: [HOUSING.rad, HOUSING.half, HOUSING.rad],
    part: PART.housing + i,
    line: BRASS_LINE,
    shade: (p, _n, lam, x, y) =>
      Math.hypot(p[0] - f, p[2] - u) > 8
        ? lit(BRASS, BRASS_CUTS, lam, x, y)
        : STEEL[3],
  }));
}

function bodyBlobs(pose: Pose): Blob[] {
  const { direction, phase } = pose;
  const bob = 1.3 * Math.cos(2 * (phase - Math.PI / 3) - 0.6);
  const skull = add(HEAD[direction], [0, 0, bob]);
  const neck = tube(neckCurve(skull), NECK_R, PART.neck, (t) =>
    wrap(t * 5 + 0.1) < 0.1 ? brass() : copper,
  );
  return [
    { ...TORSO.chest, part: PART.chest, shade: chestPlate },
    { ...TORSO.barrel, part: PART.barrel, shade: plated },
    { ...TORSO.rump, part: PART.rump, shade: rumpPlate },
    ...housings(),
    ...keyBlobs(),
    ...LEGS.flatMap((_, i) => legBlobs(pose, i)),
    ...neck,
    ...head(skull, PITCH),
    ...mane(pose, skull),
    ...tail(pose),
  ];
}

const GEAR = { tip: 7, root: 5.3, teeth: 8, spokes: 4 };

/** The gear's ink at a point (a, b) of its face, undefined where the housing shows through; the light comes from the top left. */
function gearInk(a: number, b: number, turned: number): Rgb | undefined {
  const rho = Math.hypot(a, b);
  const theta = Math.atan2(b, a) - turned;
  const tooth = Math.abs(wrap(theta / (TAU / GEAR.teeth)) - 0.5);
  const reach =
    GEAR.root + (GEAR.tip - GEAR.root) * clamp((0.3 - tooth) / 0.14);
  if (rho > reach + 0.9) return undefined;
  if (rho > reach) return BRASS_LINE;
  const facing = (-0.55 * a + 0.83 * b) / (rho || 1);
  if (reach - rho < 0.9)
    return BRASS[
      facing > 0.55 ? 0 : facing > 0.15 ? 1 : facing < -0.3 ? 3 : 2
    ];
  if (rho > 3.7) return BRASS[1];
  if (rho < 0.6) return STEEL[3];
  if (rho < 1.8) return BRASS[1];
  const quarter = TAU / GEAR.spokes;
  const off = Math.abs(wrap(theta / quarter + 0.5) - 0.5) * quarter;
  return off * rho < 0.85 ? BRASS[2] : STEEL[3];
}

/** The winding key stands out of the barrel's flank under the saddle and turns half a revolution a stride. */
const KEY = { f: -0.75, u: -1.5, lobe: 2.1, spread: 3.4, bar: 0.85 };
const KEY_PLANE = 13.6;

function keyBlobs(): Blob[] {
  return [1, -1].flatMap((side, i) => [
    {
      c: [KEY.f, side * 11.4, KEY.u],
      r: [2.6, 0.9, 2.6],
      part: PART.key + i,
      line: BRASS_LINE,
      shade: brass(1),
    },
    {
      c: [KEY.f, side * 12.4, KEY.u],
      r: [1.1, 1.4, 1.1],
      part: PART.key + i,
      line: BRASS_LINE,
      shade: brass(1),
    },
  ]);
}

function keyInk(a: number, b: number, turned: number): Rgb | undefined {
  const cos = Math.cos(turned);
  const sin = Math.sin(turned);
  const s = a * cos + b * sin;
  const t = b * cos - a * sin;
  const toLobe = Math.hypot(Math.abs(s) - KEY.spread, t);
  const lobe = KEY.lobe - toLobe;
  const bar = Math.min(KEY.bar - Math.abs(t), KEY.spread - Math.abs(s));
  const depth = Math.max(lobe, bar);
  if (depth < -0.9) return undefined;
  if (depth < 0) return BRASS_LINE;
  if (toLobe < 0.8) return STEEL[3];
  if (depth > 0.9) return BRASS[1];
  const [va, vb] =
    lobe > bar
      ? [
          (s - Math.sign(s) * KEY.spread) * cos - t * sin,
          (s - Math.sign(s) * KEY.spread) * sin + t * cos,
        ]
      : [-Math.sign(t) * sin, Math.sign(t) * cos];
  const facing = (-0.55 * va + 0.83 * vb) / (Math.hypot(va, vb) || 1);
  return BRASS[facing > 0.3 ? 0 : facing < -0.3 ? 3 : 2];
}

type Plate = {
  at: V3;
  reach: number;
  part: number;
  ink: (a: number, b: number) => Rgb | undefined;
};

/** The gears and keys: flat faces in the forward-up plane, a along the horse and b up. */
function plates(pose: Pose): Plate[] {
  const cycle = pose.frame / RIDING.framesPerDirection;
  return [
    ...HOUSINGS.map(({ f, u, side, turn: dir }, i) => ({
      at: [f, side * GEAR_PLANE, u] as V3,
      reach: GEAR.tip + 1,
      part: PART.gear + i,
      ink: (a: number, b: number) =>
        gearInk(a, b, dir * cycle * (TAU / GEAR.spokes)),
    })),
    ...[1, -1].map((side, i) => ({
      at: [KEY.f, side * KEY_PLANE, KEY.u] as V3,
      reach: KEY.spread + KEY.lobe + 1,
      part: PART.key + 2 + i,
      ink: (a: number, b: number) => keyInk(a, b, cycle * Math.PI),
    })),
  ];
}

/** Maps the screen pixels around each plate back onto its plane, so every pixel is the exact colour there; edge-on faces vanish. */
function drawPlates(buf: Buf, pose: Pose): void {
  const ea = scale(turn(pose, [1, 0, 0]), SIZE);
  const eb = scale(turn(pose, [0, 0, 1]), SIZE);
  const det = ea[0] * eb[1] - eb[0] * ea[1];
  if (Math.abs(det) < 0.3) return;
  for (const { at: where, reach, part, ink: inkOf } of plates(pose)) {
    const P = at(pose, where);
    const ex = (Math.abs(ea[0]) + Math.abs(eb[0])) * reach + 1;
    const ey = (Math.abs(ea[1]) + Math.abs(eb[1])) * reach + 1;
    for (let y = Math.floor(P[1] - ey); y <= P[1] + ey; y++)
      for (let x = Math.floor(P[0] - ex); x <= P[0] + ex; x++) {
        const dx = x + 0.5 - P[0];
        const dy = y + 0.5 - P[1];
        const a = (eb[1] * dx - eb[0] * dy) / det;
        const b = (ea[0] * dy - ea[1] * dx) / det;
        if (a * a + b * b > reach * reach) continue;
        const c = inkOf(a, b);
        if (c)
          plot(buf, x, y, P[2] + a * ea[2] + b * eb[2], c, BRASS_LINE, part);
      }
  }
}

type PadDot = { p: V3; n: V3; kind: number };

/** The saddle pad: kind 0 seat, 1 rim, 2 stud, 3 side wall. */
const PAD_DOTS: PadDot[] = (() => {
  const { f: f0, a, b } = SADDLE;
  const e = 2.5;
  const dots: PadDot[] = [];
  const studs = Array.from({ length: 8 }, (_, k) => {
    const t = ((k + 0.5) / 8) * TAU;
    const c = Math.cos(t);
    const s = Math.sin(t);
    return [
      a * 0.84 * Math.sign(c) * Math.abs(c) ** (2 / e),
      b * 0.84 * Math.sign(s) * Math.abs(s) ** (2 / e),
    ];
  });
  const slope = (f: number, r: number): V3 => {
    const d = 0.3;
    const dz = (g: number, s: number) => padTop(g, s);
    return unit([
      -(dz(f + d, r) - dz(f - d, r)) / (2 * d),
      -(dz(f, r + d) - dz(f, r - d)) / (2 * d),
      1,
    ]);
  };
  for (let f = -a; f <= a; f += 0.42)
    for (let r = -b; r <= b; r += 0.42) {
      const rho = (Math.abs(f) / a) ** e + (Math.abs(r) / b) ** e;
      if (rho > 1) continue;
      const kind = studs.some(([sf, sr]) => Math.hypot(f - sf, r - sr) < 0.8)
        ? 2
        : rho ** (1 / e) > 0.8
          ? 1
          : 0;
      dots.push({ p: [f0 + f, r, padTop(f, r)], n: slope(f, r), kind });
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
    const depth = Math.min(4.5, Math.max(1.6, top - torsoTop(f0 + f, r) + 0.5));
    for (let h = 0; h <= depth; h += 0.42)
      dots.push({ p: [f0 + f, r, top - h], n, kind: 3 });
  }
  return dots;
})();

function saddle(buf: Buf, pose: Pose): void {
  for (const { p, n, kind } of PAD_DOTS) {
    const v = at(pose, p);
    const lam = dot(turn(pose, n), LIGHT);
    const ink =
      kind === 2
        ? BRASS[lam > 0.6 ? 0 : 1]
        : kind === 3
          ? LEATHER[lam > 0.3 ? 2 : 3]
          : LEATHER[kind === 1 ? (lam > 0.75 ? 0 : 1) : lam > 0.75 ? 1 : 2];
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
          buf.depth[j] < buf.depth[i] - 2.5
        )
          colour = buf.line[i];
      }
      if (colour) put(px, x, y, colour);
    }
}

function paint(px: Pixels, direction: string, frame: number): void {
  const pose = posed(direction, frame);
  const buf = buffer();
  for (const b of bodyBlobs(pose)) blob(buf, pose, b);
  drawPlates(buf, pose);
  saddle(buf, pose);
  ink(px, buf);
}

const seat = (direction: string): [number, number] => {
  const v = at(posed(direction, 0, false), [SADDLE.f, 0, padTop(0, 0)]);
  return [Math.floor(v[0]), Math.floor(v[1])];
};

export const CLOCKWORK_STEED: DrawnMount = {
  id: "own-clockwork-steed",
  name: "Clockwork Steed",
  description:
    "ม้ากลไกตัวป้อมประกอบจากแผ่นทองแดงตอกหมุด คาดห่วงทองเหลืองรอบลำตัว ดวงตาเรืองแสงสีฟ้าอมเขียวสว่าง แผงคอเป็นใบมีดทองเหลืองบางเรียวเรียงเป็นแถว หางเป็นพู่ใบมีดทองเหลืองโค้งลู่ลง เฟืองทองเหลืองที่หัวไหล่และสะโพกหมุนสวนทางกัน ตรงกลางสีข้างมีกุญแจไขลานหมุนช้า ๆ ขาเป็นลูกสูบเหล็กต่อข้อเข่าทองเหลือง กีบเป็นฝาทองเหลือง วิ่งเหยาะก้าวขาสลับเป็นคู่เฉียง หัวพยักขึ้นลงตามจังหวะ บนหลังมีอานหนังตอกหมุดทองเหลือง รัดด้วยสายหนังรอบลำตัว",
  cell: CELL,
  seat: Object.fromEntries(
    RIDING.directions.map((d): [string, [number, number]] => [d, seat(d)]),
  ),
  paint,
};
