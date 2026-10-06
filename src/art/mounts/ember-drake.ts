import { RIDING } from "../../game/riding";
import type { DrawnMount } from "../mounts";
import { bayer, put, rgb, wrap, type Pixels, type Rgb } from "../pixels";

type V3 = [number, number, number];
type Xy = [number, number];

const CELL = { w: 116, h: 108 };
const W = CELL.w;
const H = CELL.h;
const TAU = Math.PI * 2;

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
const SCALE = inks("#ff7a5c", "#e8433f", "#c0283a", "#8e1a32", "#5e1029");
const SCALE_LINE = rgb("#2c0716");
const BELLY = inks("#ffe7a0", "#ffc45a", "#f59a35", "#d26a22", "#a8481c");
const HORN = inks("#fff4d6", "#e8cf9a", "#b8925e");
const EYE = inks("#fffbd0", "#ffd23a");
const BONE = inks("#7a2236", "#561729", "#3a0f1d");
const GLOW = inks("#ffe08a", "#ffad42", "#f2742a", "#c8452a", "#8e2128");
const GLOW_LINE = rgb("#3b0d10");
const LEATHER = inks("#8a5a3c", "#6d412a", "#4f2b1c", "#361a12");
const LEATHER_LINE = rgb("#1c0c08");
const BRASS = inks("#ffe9a8", "#e0a83c");
const FLAME = inks("#fffbd0", "#ffe25a", "#ffa62b", "#f26a1f", "#cf2f25");
const FLAME_LINE = rgb("#4a0f0c");

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
  south: [58, 76],
  "south-east": [66, 76],
  east: [61, 81],
  "north-east": [64, 77],
  north: [58, 78],
};
/** Seen from behind, the head drops to where the rider hides it, so it never stands over the seat. */
const HEAD: Record<string, V3> = {
  south: [31, 0, 12],
  "south-east": [31, 0, 12],
  east: [31, 0, 12],
  "north-east": [31, 0, 9.5],
  north: [30, 0, 0],
};
/** In the front view the tail would rise right behind the saddle, so it swings out to one side. */
const TAIL_SIDE: Record<string, number> = {
  south: 15,
  "south-east": 0,
  east: 0,
  "north-east": 0,
  north: 0,
};

type Pose = {
  direction: string;
  phase: number;
  o: Xy;
  F: V3;
  R: V3;
  U: V3;
};

function posed(direction: string, frame: number, bobbing = true): Pose {
  const [fx, fy] = HEADING[direction];
  const phase = (frame / RIDING.framesPerDirection) * TAU;
  const bob = bobbing && Math.cos(phase - 2.5) > 0.5 ? -1 : 0;
  const [ox, oy] = ORIGIN[direction];
  return {
    direction,
    phase,
    o: [ox, oy + bob],
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
  return [p.o[0] + t[0], p.o[1] + t[1], t[2]];
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
const SCALE_CUTS = [0.78, 0.42, 0.02, -0.38];
const BELLY_CUTS = [0.68, 0.28, -0.2];
const HORN_CUTS = [0.45, -0.15];

/** p and n are the hit point and normal in the drake's own frame (forward, right, up), reused between calls. */
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

function blob(buf: Buf, pose: Pose, b: Blob): void {
  const [a0, a1, a2] = b.axes ?? IDENTITY;
  const C = at(pose, b.c);
  const A0 = turn(pose, a0);
  const A1 = turn(pose, a1);
  const A2 = turn(pose, a2);
  const [r0, r1, r2] = b.r;
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
  const line = b.line ?? SCALE_LINE;
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
      const k0 = h0 * r0;
      const k1 = h1 * r1;
      const k2 = h2 * r2;
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

const PART = {
  body: 1,
  head: 2,
  jaw: 3,
  horn: 4,
  spike: 5,
  legs: 6,
  claw: 7,
  wing: 10,
  saddle: 20,
  flame: 30,
} as const;

const SADDLE = { f: 3, a: 9.5, b: 10.5, top: 15.6 };
const padTop = (f: number, r: number) =>
  SADDLE.top - 0.02 * r * r - 0.012 * f * f;
const TORSO = { c: [0, 0, 0] as V3, r: [17, 14, 13] as V3 };
const CHEST = { c: [10, 0, -1.5] as V3, r: [11.5, 12.5, 12] as V3 };
const top = (b: { c: V3; r: V3 }, f: number, r: number) =>
  b.c[2] +
  b.r[2] *
    Math.sqrt(
      Math.max(
        0,
        1 - ((f - b.c[0]) / b.r[0]) ** 2 - ((r - b.c[1]) / b.r[1]) ** 2,
      ),
    );
const torsoTop = (f: number, r: number) =>
  Math.max(top(TORSO, f, r), top(CHEST, f, r));

const belly = (p: V3, lam: number, x: number, y: number): Rgb =>
  wrap((p[0] + p[2] * 0.5) / 2.9) < 0.26
    ? BELLY[4]
    : BELLY[band(lam, x, y, BELLY_CUTS)];
const scales: Shade = (_p, _n, lam, x, y) => SCALE[band(lam, x, y, SCALE_CUTS)];
const hull: Shade = (p, n, lam, x, y) => {
  if (Math.abs(p[0] - SADDLE.f) < 1.3 && p[2] < 9) {
    if (Math.abs(p[2] - 1) < 1.5 && Math.abs(p[1]) > 6)
      return BRASS[lam > 0.3 ? 0 : 1];
    return LEATHER[lam > 0.4 ? 1 : lam > -0.2 ? 2 : 3];
  }
  return n[2] < -0.5 || (n[0] > 0.6 && n[2] < 0.15)
    ? belly(p, lam, x, y)
    : scales(p, n, lam, x, y);
};
const underside: Shade = (p, n, lam, x, y) =>
  n[2] < -0.45 ? belly(p, lam, x, y) : scales(p, n, lam, x, y);
const horn: Shade = (_p, _n, lam, x, y) => HORN[band(lam, x, y, HORN_CUTS)];

function head(centre: V3, pitch: number): Blob[] {
  const hF: V3 = [Math.cos(pitch), 0, Math.sin(pitch)];
  const hR: V3 = [0, 1, 0];
  const hU: V3 = [-Math.sin(pitch), 0, Math.cos(pitch)];
  const axes: [V3, V3, V3] = [hF, hR, hU];
  const here = (f: number, r: number, u: number): V3 =>
    sum(centre, scale(hF, f), scale(hR, r), scale(hU, u));
  const skull: V3 = [7.6, 6.8, 6.4];
  const onSkull = (d: V3): V3 => {
    const s = 1 / Math.hypot(d[0] / skull[0], d[1] / skull[1], d[2] / skull[2]);
    return here(d[0] * s, d[1] * s, d[2] * s);
  };
  const eyes = [1, -1].map((side) => onSkull([0.6, 0.62 * side, 0.32]));
  const pupils = eyes.map((e) => add(e, scale(hF, 0.7)));
  const brows = [1, -1].map((side) => onSkull([0.4, 0.5 * side, 0.72]));
  const nostrils = [1, -1].map((side) => here(13.6, 1.9 * side, 0.9));
  const skullShade: Shade = (p, n, lam, x, y) => {
    for (let k = 0; k < 2; k++) {
      if (square(p, pupils[k]) < 0.8) return SCALE_LINE;
      if (square(p, eyes[k]) < 4.4) return EYE[lam > 0.3 ? 0 : 1];
      if (square(p, brows[k]) < 4.4) return SCALE[lam > 0.5 ? 2 : 3];
    }
    return scales(p, n, lam, x, y);
  };
  const snoutShade: Shade = (p, n, lam, x, y) =>
    square(p, nostrils[0]) < 0.8 || square(p, nostrils[1]) < 0.8
      ? SCALE_LINE
      : scales(p, n, lam, x, y);
  const horns = [1, -1].flatMap((side) =>
    tube(
      [
        here(-2, 3.6 * side, 5),
        here(-5.5, 5.6 * side, 7.4),
        here(-9.5, 8 * side, 8.6),
        here(-13.5, 10.2 * side, 8.2),
      ],
      (t) => 2.3 - 1.8 * t,
      PART.horn,
      () => horn,
    ),
  );
  return [
    { c: centre, r: skull, axes, part: PART.head, shade: skullShade },
    {
      c: here(7.4, 0, -1.4),
      r: [6.6, 4.9, 4.1],
      axes,
      part: PART.head,
      shade: snoutShade,
    },
    {
      c: here(5.6, 0, -4.1),
      r: [6.6, 4.3, 2.8],
      axes,
      part: PART.jaw,
      shade: underside,
    },
    ...horns.map((b) => ({ ...b, line: SCALE_LINE })),
  ];
}

function spike(
  base: V3,
  lean: V3,
  size: number,
  part: number = PART.spike,
): Blob[] {
  return tube(
    [
      base,
      add(base, scale(lean, size * 0.33)),
      add(base, scale(lean, size * 0.66)),
      add(base, scale(lean, size)),
    ],
    (t) => (1 - t) * 0.42 * size + 0.3,
    part,
    () => horn,
  );
}

const claws = (toe: V3, side: number): Blob[] =>
  [-1.5, 0, 1.5].flatMap((d) =>
    spike(
      add(toe, [0, d * side, 0]),
      [1, 0.15 * d * side, -0.35],
      2.4,
      PART.claw,
    ),
  );

function body(pose: Pose): Blob[] {
  const { phase, direction } = pose;
  const legs = [1, -1].flatMap((side): Blob[] => [
    {
      c: [-9, 9.5 * side, -4],
      r: [8, 5, 8.5],
      part: PART.legs,
      shade: scales,
    },
    ...tube(
      [
        [-9.5, 10 * side, -9],
        [-11, 10 * side, -12],
        [-13, 9.8 * side, -14.5],
        [-14.5, 9.6 * side, -16.5],
      ],
      (t) => 4.6 - t,
      PART.legs,
      () => scales,
    ),
    {
      c: [-14.5, 9.4 * side, -18.4],
      r: [5, 3.4, 2.7],
      part: PART.legs,
      shade: scales,
    },
    ...claws([-10.3, 9.4 * side, -19], side),
    ...tube(
      [
        [11, 8.2 * side, -5],
        [12, 8.6 * side, -8.5],
        [12.8, 8.8 * side, -11],
        [13.5, 8.9 * side, -12],
      ],
      (t) => 5 - 0.8 * t,
      PART.legs,
      () => scales,
    ),
    ...tube(
      [
        [13.5, 8.9 * side, -12],
        [15, 8.7 * side, -13.4],
        [16.5, 8.6 * side, -14.8],
        [18, 8.5 * side, -16],
      ],
      (t) => 4 - 0.6 * t,
      PART.legs,
      () => scales,
    ),
    {
      c: [19.5, 8.5 * side, -17.2],
      r: [4.4, 3.4, 2.7],
      part: PART.legs,
      shade: scales,
    },
    ...claws([23.2, 8.5 * side, -17.8], side),
  ]);
  const skull = HEAD[direction];
  const neck = tube(
    [
      [11, 0, 3],
      [18, 0, 5],
      [23, 0, 7 + (skull[2] - 12) * 0.6],
      add(skull, [-4.5, 0, -1]),
    ],
    (t) => 9.4 - 2.8 * t,
    PART.body,
    () => hull,
  );
  const side = TAIL_SIDE[direction];
  const tailPts: V3[] = [
    [-13, 0, 1],
    [-28, 0, -4],
    [-39, 0, -1],
    [-45, 0, 6.5],
  ];
  const sway = (t: number): V3 => [
    0,
    side * t ** 1.5 + 3.4 * t * t * Math.sin(phase - 2.2 * t),
    0,
  ];
  const thickness = (t: number) => 9 - 6.8 * t ** 0.9;
  const tail = tube(tailPts, thickness, PART.body, () => underside, sway);
  const tailAt = (t: number) => add(bezier(tailPts, t), sway(t));
  const spikes = [
    ...[0.22, 0.38, 0.54, 0.7].map((t) =>
      spike(
        add(tailAt(t), [0, 0, thickness(t) * 0.8]),
        [-0.6, 0, 0.8],
        3.8 - 2 * t,
      ),
    ),
    ...[-11, -15.5].map((f) =>
      spike([f, 0, torsoTop(f, 0) - 0.6], [-0.5, 0, 0.86], 3.6),
    ),
  ].flat();
  return [
    { ...TORSO, part: PART.body, shade: hull },
    { ...CHEST, part: PART.body, shade: hull },
    ...legs,
    ...neck,
    ...head(skull, -0.12),
    ...tail,
    ...spikes,
  ];
}

const WING = {
  shoulder: [-9, 6, 10.6] as V3,
  wrist: [14, -3] as Xy,
  tips: [
    [39, 0],
    [33, 13],
    [22, 21],
  ] as Xy[],
  root: [0.5, 11] as Xy,
};

/** Screen angles in degrees, counter-clockwise from screen right: each wing turns in the picture plane so its membrane faces the viewer. */
type Beat = { up: number; down: number; tilt: number; trail: number };
const beat = (up: number, down: number, tilt: number, trail: number): Beat => ({
  up,
  down,
  tilt,
  trail,
});
/** The far wing in the south-east view sweeps back, since rising forward it would stand over the seat. */
const WING_BEAT: Record<string, { right: Beat; left: Beat }> = {
  south: { right: beat(120, 185, 0, 1), left: beat(60, -5, 0, -1) },
  "south-east": {
    right: beat(125, 200, 0.3, 1),
    left: beat(100, 160, -0.3, 1),
  },
  east: { right: beat(123, 207, 0.3, 1), left: beat(116, 196, -0.3, 1) },
  "north-east": {
    right: beat(45, -15, 0.3, -1),
    left: beat(125, 190, -0.3, 1),
  },
  north: { right: beat(60, -5, 0, -1), left: beat(120, 185, 0, 1) },
};

type Seg = [Xy, Xy];
const segDist = ([p, q]: Seg, x: number, y: number) => {
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  const k = Math.max(
    0,
    Math.min(1, ((x - p[0]) * dx + (y - p[1]) * dy) / (dx * dx + dy * dy)),
  );
  return { d: Math.hypot(x - p[0] - k * dx, y - p[1] - k * dy), k };
};

function inside(poly: Xy[], x: number, y: number): boolean {
  let hit = false;
  poly.forEach(([x1, y1], i) => {
    const [x0, y0] = poly[(i + poly.length - 1) % poly.length];
    if (y1 > y !== y0 > y && x < ((x0 - x1) * (y - y1)) / (y0 - y1) + x1)
      hit = !hit;
  });
  return hit;
}

/** The wing's shape in its own plane, a along the span and b along the chord; kind 0..3 glow, 4 bone, 5 claw. */
const WING_DOTS = (() => {
  const { wrist, tips, root } = WING;
  const trail = [...tips, root];
  const poly: Xy[] = [[0, -2], wrist, ...tips, root, [0, 5]];
  const scallops = trail.slice(1).map((q, i) => {
    const p = trail[i];
    const mx = (p[0] + q[0]) / 2;
    const my = (p[1] + q[1]) / 2;
    const out = Math.hypot(mx - 15, my - 6);
    const r = Math.hypot(p[0] - q[0], p[1] - q[1]) * 0.62;
    return {
      x: mx + ((mx - 15) / out) * (r - 2.6),
      y: my + ((my - 6) / out) * (r - 2.6),
      r,
    };
  });
  const bones: [Seg, number, number][] = [
    [[[0, 0], wrist], 1.7, 1.2],
    ...tips.map((t): [Seg, number, number] => [[wrist, t], 1.05, 0.5]),
  ];
  const claw: Seg = [wrist, [wrist[0] + 1.6, wrist[1] - 3.4]];
  const edges: Seg[] = poly.map((p, i) => [p, poly[(i + 1) % poly.length]]);
  const a: number[] = [];
  const b: number[] = [];
  const kind: number[] = [];
  const dot = (x: number, y: number, k: number) => {
    a.push(x);
    b.push(y);
    kind.push(k);
  };
  for (let x = -2; x <= 41; x += 0.42)
    for (let y = -8; y <= 24; y += 0.42) {
      const c = segDist(claw, x, y);
      if (c.d < 0.9 - 0.7 * c.k) {
        dot(x, y, 5);
        continue;
      }
      const boneD = Math.min(
        ...bones.map(([s, r0, r1]) => {
          const { d, k } = segDist(s, x, y);
          return d - (r0 + (r1 - r0) * k);
        }),
      );
      if (boneD < 0 || Math.hypot(x - wrist[0], y - wrist[1]) < 1.9) {
        dot(x, y, 4);
        continue;
      }
      if (
        !inside(poly, x, y) ||
        scallops.some((s) => Math.hypot(x - s.x, y - s.y) < s.r)
      )
        continue;
      const edge = Math.min(
        ...edges.map((s) => segDist(s, x, y).d),
        ...scallops.map((s) => Math.abs(Math.hypot(x - s.x, y - s.y) - s.r)),
      );
      const g = Math.min(boneD / 4.2, edge / 3.2);
      dot(x, y, g > 0.78 ? 0 : g > 0.48 ? 1 : g > 0.22 ? 2 : 3);
    }
  return {
    a: Float32Array.from(a),
    b: Float32Array.from(b),
    kind: Uint8Array.from(kind),
  };
})();

function wing(buf: Buf, pose: Pose, side: number): void {
  const { phase, direction } = pose;
  const { up, down, tilt, trail } =
    WING_BEAT[direction][side > 0 ? "right" : "left"];
  const k = 0.5 - 0.5 * Math.cos(phase);
  const fold = Math.max(0, -Math.sin(phase));
  const angle = ((up + (down - up) * k) * Math.PI) / 180;
  const { F, R, U } = pose;
  const across: V3 = [F[0], R[0], U[0]];
  const upward: V3 = [-F[1], -R[1], -U[1]];
  const toward: V3 = [-F[2], -R[2], -U[2]];
  const inPlane = (a: number) =>
    add(scale(across, Math.cos(a)), scale(upward, Math.sin(a)));
  const span = unit(add(inPlane(angle), scale(toward, tilt)));
  const back = inPlane(angle + (trail * Math.PI) / 2);
  const chord = unit(add(back, scale(span, -dot(back, span))));
  const [sf, sr, su] = WING.shoulder;
  const S = at(pose, [sf, sr * side, su]);
  const e1 = scale(turn(pose, span), 1 - 0.14 * fold);
  const e2 = turn(pose, chord);
  let n = turn(pose, cross(span, chord));
  if (n[2] > 0) n = scale(n, -1);
  const lam = dot(n, LIGHT);
  const dim = lam < 0.1 ? 1 : 0;
  const bone = BONE[lam > 0.45 ? 0 : lam > 0 ? 1 : 2];
  const inkOf = [
    GLOW[dim],
    GLOW[1 + dim],
    GLOW[2 + dim],
    GLOW[3 + dim],
    bone,
    HORN[1],
  ];
  const part = PART.wing + (side > 0 ? 0 : 1);
  const { a, b, kind } = WING_DOTS;
  for (let i = 0; i < a.length; i++) {
    const kd = kind[i];
    plot(
      buf,
      Math.floor(S[0] + a[i] * e1[0] + b[i] * e2[0]),
      Math.floor(S[1] + a[i] * e1[1] + b[i] * e2[1]),
      S[2] + a[i] * e1[2] + b[i] * e2[2],
      inkOf[kd],
      kd >= 4 ? SCALE_LINE : GLOW_LINE,
      part,
    );
  }
}

type PadDot = { p: V3; n: V3; kind: number };

/** The flat pad: kind 0 seat, 1 rim, 2 rivet, 3 side wall. */
const PAD_DOTS: PadDot[] = (() => {
  const { f: f0, a, b } = SADDLE;
  const e = 2.5;
  const dots: PadDot[] = [];
  const rivets = Array.from({ length: 10 }, (_, k) => {
    const t = ((k + 0.5) / 10) * TAU;
    const c = Math.cos(t);
    const s = Math.sin(t);
    return [
      a * 0.86 * Math.sign(c) * Math.abs(c) ** (2 / e),
      b * 0.86 * Math.sign(s) * Math.abs(s) ** (2 / e),
    ];
  });
  for (let f = -a; f <= a; f += 0.42)
    for (let r = -b; r <= b; r += 0.42) {
      const rho = (Math.abs(f) / a) ** e + (Math.abs(r) / b) ** e;
      if (rho > 1) continue;
      const n = unit([0.024 * f, 0.04 * r, 1]);
      const kind = rivets.some(([rf, rr]) => Math.hypot(f - rf, r - rr) < 0.8)
        ? 2
        : rho ** (1 / e) > 0.8
          ? 1
          : 0;
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
    const depth = Math.min(5.5, Math.max(1.6, top - torsoTop(f0 + f, r) + 0.4));
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

type Tongue = { x: number; y: number; r: number; h: number; lean: number };

function flame(buf: Buf, pose: Pose): void {
  const { phase, direction } = pose;
  const side = TAIL_SIDE[direction];
  const tip = at(pose, [-45, side + 3.4 * Math.sin(phase - 2.2), 7.2]);
  const tongues: Tongue[] = [
    {
      x: 0,
      y: 0,
      r: 3.7,
      h: 12 + 1.8 * Math.sin(phase),
      lean: 1.8 * Math.sin(phase + 0.8),
    },
    {
      x: -2.6,
      y: -1.5,
      r: 2.1,
      h: 6.5 + 2.4 * Math.sin(2 * phase + 1),
      lean: -1.6,
    },
    {
      x: 2.5,
      y: -1,
      r: 2,
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
        FLAME[k > 0.62 ? 0 : k > 0.44 ? 1 : k > 0.26 ? 2 : k > 0.12 ? 3 : 4];
      plot(buf, x, y, z, ink, FLAME_LINE, PART.flame);
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
  wing(buf, pose, 1);
  wing(buf, pose, -1);
  saddle(buf, pose);
  flame(buf, pose);
  ink(px, buf);
}

const seat = (direction: string): [number, number] => {
  const v = at(posed(direction, 0, false), [SADDLE.f, 0, padTop(0, 0)]);
  return [Math.floor(v[0]), Math.floor(v[1])];
};

export const EMBER_DRAKE: DrawnMount = {
  id: "own-ember-drake",
  name: "Ember Drake",
  description:
    "มังกรไฟตัวอ้วนป้อม เกล็ดสีแดงเข้มไล่ถึงแดงเลือดหมู ท้องสีส้มทองเหมือนถ่านไฟ มีเขาสีงาช้างสองข้างโค้งยาวไปด้านหลัง ดวงตาสีเหลืองสว่าง เท้ามีกรงเล็บ ปีกค้างคาวมีพังผืดเรืองแสงสีส้มระหว่างกระดูกนิ้วสีเข้ม ปลายหางมีเปลวไฟลุกไหว บนหลังมีเบาะนั่งแบนหนังสีเข้มตอกหมุดทองเหลือง รัดด้วยสายหนังรอบลำตัว",
  cell: CELL,
  seat: Object.fromEntries(
    RIDING.directions.map((d): [string, [number, number]] => [d, seat(d)]),
  ),
  paint,
};
