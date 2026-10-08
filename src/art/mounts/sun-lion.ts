import { RIDING } from "../../game/riding";
import type { DrawnMount } from "../mounts";
import { bayer, hash, put, rgb, wrap, type Pixels, type Rgb } from "../pixels";

type V3 = [number, number, number];
type Xy = [number, number];

const CELL = { w: 100, h: 88 };
const W = CELL.w;
const H = CELL.h;
const TAU = Math.PI * 2;
/** Screen pixels per body unit. */
const SIZE = 1.12;

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
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

const inks = (...hex: string[]) => hex.map(rgb);
const FUR = inks("#ffe9a2", "#f9cc58", "#e5a533", "#bb7620", "#86491c");
const FUR_LINE = rgb("#4c2411");
const CREAM = inks("#fff7da", "#f7e2a6", "#e5c47c", "#c19653");
const MANE = inks(
  "#fff4aa",
  "#ffd23c",
  "#ff9a26",
  "#ee5a20",
  "#c42a2c",
  "#86202f",
);
const MANE_LINE = rgb("#4a0f1c");
const MANE_LINE_IN = rgb("#8a2412");
const CLOTH = inks("#e2433f", "#bf2c3a", "#932134", "#64162b");
const GOLD = inks("#fff1a6", "#ffd24a", "#e49b28", "#a76420");
const CLOTH_LINE = rgb("#3a0c18");
const EYE = inks("#fffbd6", "#ffb81c");

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
  south: [50, 51],
  "south-east": [48, 51],
  east: [56, 57],
  "north-east": [50, 52],
  north: [50, 53],
};
/** Seen from behind the head drops to where the rider hides it, so the mane never stands over the seat. */
const HEAD: Record<string, V3> = {
  south: [26, 0, 6.5],
  "south-east": [26, 0, 6.5],
  east: [26, 0, 6.5],
  "north-east": [24.5, 0, -4.5],
  north: [24, 0, -4],
};
/** Seen from the front the mane's locks would reach back over the saddle, so they spread round the face instead. */
const SWEEP: Record<string, number> = {
  south: 0.55,
  "south-east": 0.85,
  east: 1.1,
  "north-east": 1,
  north: 1,
};
/** From the front the tail would rise right behind the saddle, so it swings out to one side. */
const TAIL_SIDE: Record<string, number> = {
  south: 13,
  "south-east": 0,
  east: 0,
  "north-east": 0,
  north: 0,
};
/** How far below the top of the cushion the seat sits, so that the back rises over the rider. */
const SEAT_SINK: Record<string, number> = {
  south: 0,
  "south-east": 2,
  east: 2,
  "north-east": 1,
  north: 0,
};

type Pose = {
  direction: string;
  phase: number;
  o: Xy;
  F: V3;
  R: V3;
  U: V3;
  rise: number;
};

function posed(direction: string, frame: number, bobbing = true): Pose {
  const [fx, fy] = HEADING[direction];
  const phase = (frame / RIDING.framesPerDirection) * TAU;
  return {
    direction,
    phase,
    o: ORIGIN[direction],
    F: [fx, -fy * SIN, fy * COS],
    R: [fy, fx * SIN, -fx * COS],
    U: [0, -COS, -SIN],
    rise: bobbing ? 0.65 + 0.65 * Math.cos(2 * phase - 0.9) : 0,
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
const FUR_CUTS = [0.78, 0.42, 0.02, -0.38];
const CREAM_CUTS = [0.68, 0.28, -0.2];
const CLOTH_CUTS = [0.72, 0.34, -0.1];
const GOLD_CUTS = [0.66, 0.2, -0.3];

/** p and n are the hit point and normal in the lion's own frame (forward, right, up), reused between calls. */
type Shade = (p: V3, n: V3, lam: number, x: number, y: number) => Rgb;
type Blob = {
  c: V3;
  r: V3;
  axes?: [V3, V3, V3];
  part: number;
  line?: Rgb;
  /** Draws the blob this much nearer than it is, so the outline falls round it. */
  lead?: number;
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
  const line = b.line ?? FUR_LINE;
  const lead = b.lead ?? 0;
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
      const z = C[2] + t - lead;
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

const straight = (a: V3, b: V3): V3[] => [
  a,
  add(a, scale(add(b, scale(a, -1)), 1 / 3)),
  add(a, scale(add(b, scale(a, -1)), 2 / 3)),
  b,
];

const PART = {
  body: 1,
  head: 2,
  muzzle: 3,
  ear: 4,
  tail: 5,
  legs: 6,
  core: 12,
  cushion: 20,
  flame: 30,
  mane: 40,
} as const;

const GROUND = -24;
const HULL: { c: V3; r: V3 }[] = [
  { c: [8.5, 0, 0.8], r: [11.5, 10.4, 11.4] },
  { c: [-1.5, 0, 0], r: [11, 9.6, 10] },
  { c: [-11, 0, -0.6], r: [9.6, 10, 10.2] },
];

const CUSHION = { c: [2, 0, 10.8] as V3, r: [7, 8.2, 2.2] as V3 };
const BLANKET = { f: 2, half: 8.6, hem: -1.8 };

const fur: Shade = (_p, _n, lam, x, y) => FUR[band(lam, x, y, FUR_CUTS)];
const pale: Shade = (_p, _n, lam, x, y) => CREAM[band(lam, x, y, CREAM_CUTS)];
const coat: Shade = (p, n, lam, x, y) =>
  n[2] < -0.5 || (n[0] > 0.62 && n[2] < 0.1)
    ? pale(p, n, lam, x, y)
    : fur(p, n, lam, x, y);
const gold = (lam: number, x: number, y: number) =>
  GOLD[band(lam, x, y, GOLD_CUTS)];
const cloth = (lam: number, x: number, y: number) =>
  CLOTH[band(lam, x, y, CLOTH_CUTS)];

/** The torso with the blanket painted over its back and down both flanks: gold piping, a dark inner line, a sun medallion. */
const dressed =
  (rise: number): Shade =>
  (p, n, lam, x, y) => {
    const u = p[2] - rise;
    const edge = Math.min(
      BLANKET.half - Math.abs(p[0] - BLANKET.f),
      u - BLANKET.hem,
    );
    if (edge < 0) return coat(p, n, lam, x, y);
    if (edge < 1.2) return gold(lam, x, y);
    if (edge < 2) return CLOTH[2 + (lam < 0 ? 1 : 0)];
    if (Math.abs(p[1]) > 4) {
      const d = Math.hypot(p[0] - BLANKET.f, u - 3.4);
      if (d < 1) return CLOTH[2];
      if (d < 2.6) return gold(lam, x, y);
    }
    return cloth(lam, x, y);
  };

const cushion: Shade = (_p, n, lam, x, y) =>
  Math.abs(n[2]) < 0.34 ? gold(lam, x, y) : cloth(lam, x, y);

const underfur: Shade = (_p, _n, lam, x, y) =>
  MANE[3 + band(lam, x, y, [0.2, -0.3])];

/** The face is drawn this much nearer than it is, so an outline falls between it and the mane. */
const LEAD = 2.6;
const PITCH = -0.1;
const SKULL: V3 = [8, 7.6, 7.2];

type Face = {
  here: (f: number, r: number, u: number) => V3;
  axes: [V3, V3, V3];
  eyes: { at: V3; n: V3 }[];
};

/** The head's own frame at `centre`, and where its eyes sit on the skull with the way each faces. */
function face(centre: V3): Face {
  const hF: V3 = [Math.cos(PITCH), 0, Math.sin(PITCH)];
  const hR: V3 = [0, 1, 0];
  const hU: V3 = [-Math.sin(PITCH), 0, Math.cos(PITCH)];
  const here = (f: number, r: number, u: number): V3 =>
    sum(centre, scale(hF, f), scale(hR, r), scale(hU, u));
  const eyes = [1, -1].map((side) => {
    const d: V3 = [5.4, 3.2 * side, 1.2];
    const s = 1 / Math.hypot(d[0] / SKULL[0], d[1] / SKULL[1], d[2] / SKULL[2]);
    const n = unit([
      (d[0] * s) / SKULL[0] ** 2,
      (d[1] * s) / SKULL[1] ** 2,
      (d[2] * s) / SKULL[2] ** 2,
    ]);
    return {
      at: here(d[0] * s, d[1] * s, d[2] * s),
      n: sum(scale(hF, n[0]), scale(hR, n[1]), scale(hU, n[2])),
    };
  });
  return { here, axes: [hF, hR, hU], eyes };
}

function head(f: Face, pose: Pose): Blob[] {
  const { here, axes } = f;
  const brows = f.eyes.map((e) => add(e.at, scale(axes[2], 2.6)));
  const nose = here(12.2, 0, -1);
  const skullShade: Shade = (p, n, lam, x, y) =>
    brows.some((b) => square(p, b) < 2.4)
      ? FUR[4]
      : FUR[Math.max(0, band(lam, x, y, FUR_CUTS) - 1)];
  const muzzleShade: Shade = (p, n, lam, x, y) =>
    square(p, nose) < 3 ? FUR_LINE : pale(p, n, lam, x, y);
  return [
    {
      c: here(0, 0, 0),
      r: SKULL,
      axes,
      part: PART.head,
      lead: LEAD,
      shade: skullShade,
    },
    {
      c: here(7.2, 0, -2.2),
      r: [5.2, 4.5, 3.7],
      axes,
      part: PART.muzzle,
      lead: LEAD,
      shade: muzzleShade,
    },
    ...[1, -1].map(
      (side): Blob => ({
        c: here(6.3, 3.1 * side, -3.3),
        r: [3.9, 3.3, 2.9],
        axes,
        part: PART.muzzle,
        lead: LEAD,
        shade: pale,
      }),
    ),
    {
      c: here(5.6, 0, -5.3),
      r: [3.6, 3.4, 2.4],
      axes,
      part: PART.muzzle,
      lead: LEAD,
      shade: pale,
    },
    ...[1, -1].map((side): Blob => {
      const ear = here(0.6, 4.9 * side, 6.9);
      const far = side * pose.R[2] > 0.2;
      return {
        c: ear,
        r: [2.2, 2.6, 2.9],
        axes,
        part: PART.ear,
        lead: LEAD + 2.6,
        shade: (p, n, lam, x, y) =>
          n[0] > 0.4 && (p[1] - ear[1]) ** 2 + (p[2] - ear[2]) ** 2 < 1.4
            ? MANE[4]
            : FUR[Math.min(4, band(lam, x, y, FUR_CUTS) + (far ? 1 : 0))],
      };
    }),
  ];
}

const EYES = [
  ["wkk", "kkk", "aaa"],
  ["wk", "kk", "aa"],
  ["k", "k", "a"],
];
const EYE_INK: Record<string, Rgb> = {
  w: EYE[0],
  a: EYE[1],
  k: FUR_LINE,
};

/** Stamps each eye as a little sprite on the skull, narrower the more it turns away, so it reads the same in every view. */
function eyes(buf: Buf, pose: Pose, f: Face): void {
  for (const { at: p, n } of f.eyes) {
    const v = at(pose, p);
    const facing = -turn(pose, n)[2];
    const rows =
      facing > 0.5
        ? EYES[0]
        : facing > 0.3
          ? EYES[1]
          : facing > 0.15
            ? EYES[2]
            : undefined;
    if (!rows) continue;
    const left = Math.round(v[0] - rows[0].length / 2);
    const top = Math.round(v[1] - rows.length / 2);
    rows.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        const x = left + c;
        const y = top + r;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const i = y * W + x;
        if (buf.part[i] === PART.head && Math.abs(buf.depth[i] - (v[2] - LEAD)) < 2.5)
          buf.ink[i] = EYE_INK[row[c]];
      }
    });
  }
}

const STRIDE = 6.5;
const LIFT = 4.2;
const LEGS = [
  { front: false, side: -1, at: 0 },
  { front: true, side: -1, at: 0.25 },
  { front: false, side: 1, at: 0.5 },
  { front: true, side: 1, at: 0.75 },
];

/** A foot's place at the cycle's phase p: x runs from 1 (forward) to -1 as it carries the body, then swings back up and over. */
function stride(p: number): { x: number; lift: number } {
  if (p < 0.5) return { x: 1 - 4 * p, lift: 0 };
  const s = (p - 0.5) * 2;
  return {
    x: -1 + 2 * (s - Math.sin(TAU * s) / TAU),
    lift: Math.sin(Math.PI * s),
  };
}

function leg(pose: Pose, k: number): Blob[] {
  const { front, side, at: offset } = LEGS[k];
  const { x, lift } = stride(wrap(pose.phase / TAU + offset));
  const part = PART.legs + k;
  const hip: V3 = [
    front ? 9.5 : -10.6,
    side * (front ? 6.6 : 7.4),
    -5.5 + pose.rise,
  ];
  const l1 = 8;
  const l2 = 8;
  const rest = front ? 11.5 : -9.5;
  const target: V3 = [
    rest + x * STRIDE,
    side * (front ? 7.2 : 7.8),
    GROUND + 4.4 + lift * LIFT,
  ];
  const dx = target[0] - hip[0];
  const dz = target[2] - hip[2];
  const dist = Math.hypot(dx, dz);
  const d = Math.min(dist, l1 + l2 - 0.05);
  const ux = dx / dist;
  const uz = dz / dist;
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const bend = front ? -1 : 1;
  const knee: V3 = [
    hip[0] + ux * a - uz * h * bend,
    hip[1],
    hip[2] + uz * a + ux * h * bend,
  ];
  const ankle: V3 = [hip[0] + ux * d, target[1], hip[2] + uz * d];
  const toe: V3 = [ankle[0] + 1.6, ankle[1], ankle[2] - 2];
  return [
    ...tube(
      straight(hip, knee),
      (t) => (front ? 5.2 : 5.8) - 1.2 * t,
      part,
      () => fur,
    ),
    ...tube(
      straight(knee, ankle),
      (t) => 4 - 0.7 * t,
      part,
      () => fur,
    ),
    {
      c: toe,
      r: [4.6, 3.5, 2.5],
      part,
      shade: (p, n, lam, x2, y2) => {
        const across = p[1] - toe[1];
        return p[0] - toe[0] > 2.2 &&
          (Math.abs(across - 1.5) < 0.4 || Math.abs(across + 1.5) < 0.4)
          ? FUR[4]
          : fur(p, n, lam, x2, y2);
      },
    },
  ];
}

const headAt = (pose: Pose): V3 =>
  add(HEAD[pose.direction], [
    0,
    0,
    0.5 * Math.sin(2 * pose.phase + 0.8) + pose.rise,
  ]);

function body(pose: Pose): Blob[] {
  const { phase, direction, rise } = pose;
  const up = (v: V3): V3 => [v[0], v[1], v[2] + rise];
  const skull = headAt(pose);
  const side = TAIL_SIDE[direction];
  const tailPts: V3[] = [
    [-18, 0, 1.5 + rise],
    [-29, 0, -1 + rise],
    [-38, 0, 1 + rise],
    [-42, 0, 8 + rise],
  ];
  const sway = (t: number): V3 => [
    0,
    side * t ** 1.5 + 3.4 * t * t * Math.sin(phase - 2.2 * t),
    0,
  ];
  const shade = dressed(rise);
  return [
    ...HULL.map(({ c, r }): Blob => ({ c: up(c), r, part: PART.body, shade })),
    {
      c: up(CUSHION.c),
      r: CUSHION.r,
      part: PART.cushion,
      line: CLOTH_LINE,
      shade: cushion,
    },
    ...LEGS.flatMap((_, k) => leg(pose, k)),
    {
      c: add(skull, [-8, 0, 0.5]),
      r: [6.8, 9.6, 10],
      part: PART.core,
      line: MANE_LINE,
      shade: underfur,
    },
    ...head(face(skull), pose),
    ...tube(
      tailPts,
      (t) => 2.9 - 1.1 * t,
      PART.tail,
      () => fur,
      sway,
    ),
  ];
}

type Lock = {
  row: number;
  theta: number;
  psi: number;
  swirl: number;
  size: number;
  id: number;
};

/**
 * Rows of flame locks down the neck, the one next to the face smallest and
 * yellowest; `bias` brings the front rows over the back ones from any side.
 */
const ROWS = [
  {
    n: 12,
    at: -3,
    ring: 8.8,
    len: 8.5,
    hw: 2.2,
    beta: 0.35,
    shift: 0.14,
    bias: 3.2,
    line: MANE_LINE_IN,
  },
  {
    n: 12,
    at: -5.5,
    ring: 9.8,
    len: 10.5,
    hw: 2.6,
    beta: 0.55,
    shift: -0.14,
    bias: 1.6,
    line: MANE_LINE,
  },
  {
    n: 12,
    at: -8,
    ring: 10.2,
    len: 12,
    hw: 3,
    beta: 0.75,
    shift: -0.4,
    bias: 0.4,
    line: MANE_LINE,
  },
];
const LOCKS: Lock[] = ROWS.flatMap((R, row) =>
  Array.from({ length: R.n }, (_, i) => ({
    row,
    theta:
      ((i + 0.5 * (row & 1)) / R.n) * TAU + (hash(row * 31 + i) - 0.5) * 0.18,
    psi: hash(row * 17 + i * 3.1) * TAU,
    swirl: 0.14 + (hash(row * 7 + i * 1.3) - 0.5) * 0.12,
    size: 0.82 + 0.36 * hash(row * 13 + i * 2.3),
    id: 0,
  })),
).map((l, id) => ({ ...l, id }));

const NECK = 0.2;

function lock(buf: Buf, pose: Pose, centre: V3, l: Lock): void {
  const R = ROWS[l.row];
  const { phase } = pose;
  const sinT = Math.sin(l.theta);
  const cosT = Math.cos(l.theta);
  const radial: V3 = [0, sinT, cosT];
  const around: V3 = [0, cosT, -sinT];
  const dir0 = unit(
    add(
      scale(radial, Math.cos(R.beta)),
      scale(
        [-Math.cos(NECK), 0, Math.sin(NECK)],
        Math.sin(R.beta) * SWEEP[pose.direction],
      ),
    ),
  );
  const len =
    R.len * l.size * (0.9 - 0.14 * cosT) * (1 + 0.07 * Math.sin(phase + l.psi * 1.7));
  const base = add(centre, add(scale(radial, R.ring), [R.at, 0, 0]));
  const rise = 0.16 + 0.1 * Math.cos(phase + l.psi + 0.8);
  const flick = 0.2 * Math.sin(phase + l.psi);
  const centreAt = (t: number): V3 =>
    add(
      base,
      scale(
        sum(
          scale(dir0, t),
          [-0.08 * t * t, 0, rise * t * t],
          scale(
            around,
            l.swirl * t * t + flick * t * Math.sin(1.6 * Math.PI * t),
          ),
        ),
        len,
      ),
    );
  const nt = Math.ceil(len / 0.55);
  for (let i = 0; i <= nt; i++) {
    const t = i / nt;
    const T = unit(
      add(
        centreAt(Math.min(1, t + 0.03)),
        scale(centreAt(Math.max(0, t - 0.03)), -1),
      ),
    );
    const wd = unit(add(around, scale(T, -dot(around, T))));
    const face = unit(cross(T, wd));
    const hw =
      R.hw *
      Math.sqrt(l.size) *
      (t < 0.28 ? 0.62 + 0.38 * (t / 0.28) : (1 - (t - 0.28) / 0.72) ** 0.85);
    const ns = Math.ceil((2 * hw) / 0.55) + 1;
    const c = centreAt(t);
    for (let j = 0; j <= ns; j++) {
      const s = -1 + (2 * j) / ns;
      const p = sum(c, scale(wd, s * hw), scale(face, 0.16 * hw * s * s));
      const v = at(pose, p);
      const px = Math.floor(v[0]);
      const py = Math.floor(v[1]);
      let n = turn(pose, unit(add(face, scale(wd, -0.32 * s))));
      if (n[2] > 0) n = scale(n, -1);
      const lam = dot(n, LIGHT);
      const heat =
        0.95 -
        0.42 * Math.abs(s) ** 1.4 -
        0.1 * t +
        R.shift +
        0.12 * (lam - 0.2) +
        (bayer(px, py) - 0.5) * 0.1;
      const idx =
        heat > 0.82
          ? 0
          : heat > 0.66
            ? 1
            : heat > 0.5
              ? 2
              : heat > 0.36
                ? 3
                : heat > 0.2
                  ? 4
                  : 5;
      plot(buf, px, py, v[2] - R.bias, MANE[idx], R.line, PART.mane + l.id);
    }
  }
}

type Tongue = { x: number; y: number; r: number; h: number; lean: number };

function flame(buf: Buf, pose: Pose): void {
  const { phase, direction, rise } = pose;
  const side = TAIL_SIDE[direction];
  const tip = at(pose, [-42, side + 3.4 * Math.sin(phase - 2.2), 8.4 + rise]);
  const tongues: Tongue[] = [
    {
      x: 0,
      y: 0,
      r: 3.5,
      h: 11.5 + 1.8 * Math.sin(phase),
      lean: 1.8 * Math.sin(phase + 0.8),
    },
    {
      x: -2.6,
      y: -1.5,
      r: 2,
      h: 6.5 + 2.4 * Math.sin(2 * phase + 1),
      lean: -1.6,
    },
    {
      x: 2.5,
      y: -1,
      r: 1.9,
      h: 7 + 2.4 * Math.sin(2 * phase + 3.6),
      lean: 1.6,
    },
  ];
  const z = tip[2] - 1.5;
  for (let y = Math.floor(tip[1] - 17); y <= tip[1] + 4; y++)
    for (let x = Math.floor(tip[0] - 8); x <= tip[0] + 8; x++) {
      let heat = -1;
      for (const t of tongues) {
        const bx = tip[0] + t.x;
        const by = tip[1] + t.y;
        const v = (by - (y + 0.5)) / t.h;
        const cx = bx + t.lean * v * v;
        const hw =
          v < 0
            ? Math.sqrt(Math.max(0, t.r * t.r - (v * t.h) ** 2))
            : t.r * (1 - v) ** 0.9;
        const d = Math.abs(x + 0.5 - cx);
        if (v > 1 || d >= hw) continue;
        heat = Math.max(heat, 1 - Math.max(d / hw, Math.max(0, v) ** 1.3));
      }
      if (heat < 0) continue;
      const k = heat + (bayer(x, y) - 0.5) * 0.12;
      const ink =
        MANE[k > 0.62 ? 0 : k > 0.44 ? 1 : k > 0.26 ? 2 : k > 0.12 ? 3 : 4];
      plot(buf, x, y, z, ink, MANE_LINE, PART.flame);
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
  for (const b of body(pose)) blob(buf, pose, b);
  const skull = headAt(pose);
  for (const l of LOCKS) lock(buf, pose, skull, l);
  eyes(buf, pose, face(skull));
  flame(buf, pose);
  ink(px, buf);
}

const seat = (direction: string): [number, number] => {
  const v = at(posed(direction, 0, false), [
    CUSHION.c[0],
    0,
    CUSHION.c[2] + CUSHION.r[2],
  ]);
  return [Math.floor(v[0]), Math.floor(v[1]) + SEAT_SINK[direction]];
};

export const SUN_LION: DrawnMount = {
  id: "own-sun-lion",
  name: "Sun Lion",
  description:
    "สิงโตสีทองเดินสง่า แผงคอเป็นเปลวไฟลุกโชนซ้อนกันหลายชั้นสีเหลือง ส้ม และแดง ปลายหางมีพู่เปลวไฟแกว่งไหว ขาทั้งสี่ก้าวเดินสลับกัน บนหลังมีผ้าคลุมอานสีแดงขอบทองปักลายตะวัน",
  cell: CELL,
  seat: Object.fromEntries(
    RIDING.directions.map((d): [string, [number, number]] => [d, seat(d)]),
  ),
  paint,
};
