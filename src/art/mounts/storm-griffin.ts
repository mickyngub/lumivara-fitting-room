import { RIDING } from "../../game/riding";
import type { DrawnMount } from "../mounts";
import { bayer, hash, put, rgb, wrap, type Pixels, type Rgb } from "../pixels";

type V3 = [number, number, number];
type Xy = [number, number];

const CELL = { w: 112, h: 104 };
const W = CELL.w;
const H = CELL.h;
const TAU = Math.PI * 2;
/** Screen pixels per body unit. */
const SIZE = 1.22;

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a: V3): V3 => scale(a, 1 / (Math.hypot(...a) || 1));

const inks = (...hex: string[]) => hex.map(rgb);
const FUR = inks("#a9bbe6", "#7f95d0", "#5f74b8", "#47579a", "#333f74");
const FEATHER = inks("#ffffff", "#e3e9f7", "#b9c5e3", "#8c9bc6");
const FLIGHT = inks("#6a80c4", "#4f62a6", "#3b4a88", "#2b3566");
const TIP = inks("#f2fbff", "#b6e6ff");
const GOLD = inks("#fff3a6", "#ffd24a", "#e39a22", "#a8641c");
const EYE = inks("#ffffff", "#3fdcff");
const LINE = rgb("#161b3f");
const LEATHER = inks("#c88a50", "#a2663a", "#7a4826", "#552f19");
const LEATHER_LINE = rgb("#2a160c");
const CLOTH = inks("#3b4f9e", "#2c3a7a", "#1f2a5c");
const SPARK = inks("#ffffff", "#fff7a0");
const SPARK_LINE = rgb("#4cb4ff");

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
  south: [56, 73],
  "south-east": [70, 72],
  east: [62, 76],
  "north-east": [70, 71],
  north: [56, 71],
};
/** Seen from behind, the head would rise right above the saddle, so it ducks behind the rider. */
const HEAD: Record<string, V3> = {
  south: [21, 0, 12],
  "south-east": [21, 0, 12],
  east: [21, 0, 12],
  "north-east": [21, 0, 10],
  north: [20, 0, 4],
};
/** Seen from the front the tail would rise right behind the saddle, so it swings out to one side. */
const TAIL_SIDE: Record<string, number> = {
  south: 14,
  "south-east": 0,
  east: 0,
  "north-east": 0,
  north: 0,
};

type Pose = {
  direction: string;
  frame: number;
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
    frame,
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
const FEATHER_CUTS = [0.62, 0.22, -0.25];
const GOLD_CUTS = [0.6, 0.15, -0.3];

/** p and n are the hit point and normal in the griffin's own frame: forward, right, up. */
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

/** Ray-casts an ellipsoid into the buffer, one ray per pixel straight into the screen. */
function blob(buf: Buf, pose: Pose, b: Blob): void {
  const axes = b.axes ?? IDENTITY;
  const C = at(pose, b.c);
  const A = axes.map((a) => turn(pose, a));
  const [b0, b1, b2] = b.r;
  const r0 = b0 * SIZE;
  const r1 = b1 * SIZE;
  const r2 = b2 * SIZE;
  const ex = Math.hypot(r0 * A[0][0], r1 * A[1][0], r2 * A[2][0]);
  const ey = Math.hypot(r0 * A[0][1], r1 * A[1][1], r2 * A[2][1]);
  const d0 = A[0][2] / r0;
  const d1 = A[1][2] / r1;
  const d2 = A[2][2] / r2;
  const qa = d0 * d0 + d1 * d1 + d2 * d2;
  const line = b.line ?? LINE;
  const [a0, a1, a2] = axes;
  for (
    let y = Math.max(0, Math.floor(C[1] - ey));
    y <= Math.min(H - 1, C[1] + ey);
    y++
  )
    for (
      let x = Math.max(0, Math.floor(C[0] - ex));
      x <= Math.min(W - 1, C[0] + ex);
      x++
    ) {
      const ox = x + 0.5 - C[0];
      const oy = y + 0.5 - C[1];
      const q0 = (ox * A[0][0] + oy * A[0][1]) / r0;
      const q1 = (ox * A[1][0] + oy * A[1][1]) / r1;
      const q2 = (ox * A[2][0] + oy * A[2][1]) / r2;
      const qb = 2 * (q0 * d0 + q1 * d1 + q2 * d2);
      const disc = qb * qb - 4 * qa * (q0 * q0 + q1 * q1 + q2 * q2 - 1);
      if (disc < 0) continue;
      const t = (-qb - Math.sqrt(disc)) / (2 * qa);
      const i = y * W + x;
      if (C[2] + t >= buf.depth[i]) continue;
      const h0 = q0 + t * d0;
      const h1 = q1 + t * d1;
      const h2 = q2 + t * d2;
      const p: V3 = [
        b.c[0] + a0[0] * h0 * b0 + a1[0] * h1 * b1 + a2[0] * h2 * b2,
        b.c[1] + a0[1] * h0 * b0 + a1[1] * h1 * b1 + a2[1] * h2 * b2,
        b.c[2] + a0[2] * h0 * b0 + a1[2] * h1 * b1 + a2[2] * h2 * b2,
      ];
      const n = unit([
        (a0[0] * h0) / b0 + (a1[0] * h1) / b1 + (a2[0] * h2) / b2,
        (a0[1] * h0) / b0 + (a1[1] * h1) / b1 + (a2[1] * h2) / b2,
        (a0[2] * h0) / b0 + (a1[2] * h1) / b1 + (a2[2] * h2) / b2,
      ]);
      buf.depth[i] = C[2] + t;
      buf.ink[i] = b.shade(p, n, dot(turn(pose, n), LIGHT), x, y);
      buf.line[i] = line;
      buf.part[i] = b.part;
    }
}

const bezier = (pts: V3[], t: number): V3 => {
  const u = 1 - t;
  const k = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return [0, 1, 2].map((i) =>
    pts.reduce((s, p, j) => s + k[j] * p[i], 0),
  ) as V3;
};

/** A tapering tube as a run of overlapping spheres along a cubic curve. */
function tube(
  pts: V3[],
  radius: (t: number) => number,
  part: number,
  shade: (t: number) => Shade,
  step = 0.8,
  bend: (t: number) => V3 = () => [0, 0, 0],
): Blob[] {
  let length = 0;
  for (let i = 1; i <= 16; i++) {
    const a = bezier(pts, (i - 1) / 16);
    const b = bezier(pts, i / 16);
    length += Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  }
  const n = Math.max(2, Math.ceil(length / step));
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const r = radius(t);
    return {
      c: add(bezier(pts, t), bend(t)),
      r: [r, r, r],
      part,
      shade: shade(t),
    };
  });
}

const PART = {
  body: 1,
  head: 2,
  beak: 3,
  tuft: 4,
  legs: 5,
  talons: 6,
  tail: 7,
  wing: 10,
  saddle: 20,
  flap: 21,
  spark: 30,
} as const;

const zig = (v: number) => Math.abs(wrap(v) - 0.5) * 2;
const fur: Shade = (_p, _n, lam, x, y) => FUR[band(lam, x, y, FUR_CUTS)];
const down: Shade = (_p, _n, lam, x, y) =>
  FEATHER[band(lam, x, y, FEATHER_CUTS)];
/** Rows of overlapping feathers: each row's lower rim one shade darker. */
const plumage: Shade = (p, _n, lam, x, y) => {
  const i = band(lam, x, y, FEATHER_CUTS);
  const around = Math.atan2(p[2], p[1]);
  const rim = wrap(p[0] / 3.6 + 0.2 * Math.abs(Math.sin(around * 4))) < 0.17;
  return FEATHER[Math.min(3, i + (rim ? 1 : 0))];
};
/** White feathers on the chest, fur behind, meeting in a zigzag. */
const torso: Shade = (p, n, lam, x, y) =>
  p[0] > 4.2 - 2.6 * zig(p[2] / 4.6)
    ? plumage(p, n, lam, x, y)
    : fur(p, n, lam, x, y);
const gold =
  (shift = 0): Shade =>
  (_p, _n, lam, x, y) =>
    GOLD[Math.min(3, band(lam, x, y, GOLD_CUTS) + shift)];
const storm: Shade = (_p, _n, lam, x, y) =>
  FLIGHT[band(lam, x, y, [0.55, 0.1, -0.35])];

function head(centre: V3, pitch: number): Blob[] {
  const hF: V3 = [Math.cos(pitch), 0, Math.sin(pitch)];
  const hR: V3 = [0, 1, 0];
  const hU: V3 = [-Math.sin(pitch), 0, Math.cos(pitch)];
  const axes: [V3, V3, V3] = [hF, hR, hU];
  const here = (f: number, r: number, u: number): V3 =>
    add(centre, add(scale(hF, f), add(scale(hR, r), scale(hU, u))));
  const skull: V3 = [6.6, 6.3, 6.2];
  const onSkull = (d: V3): V3 => {
    const s = 1 / Math.hypot(d[0] / skull[0], d[1] / skull[1], d[2] / skull[2]);
    return here(d[0] * s, d[1] * s, d[2] * s);
  };
  const eyes = [1, -1].map((side) => onSkull([0.6, 0.66 * side, 0.32]));
  const near = (p: V3, q: V3, r: number) =>
    Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < r;
  const skullShade: Shade = (p, n, lam, x, y) => {
    for (const e of eyes) {
      if (near(p, add(e, add(scale(hU, 0.9), scale(hF, -0.2))), 0.8))
        return EYE[0];
      if (near(p, add(e, scale(hF, 0.3)), 1.35)) return LINE;
      if (near(p, e, 2.35)) return EYE[1];
      if (near(p, add(e, add(scale(hU, 2.5), scale(hF, -0.4))), 1.3))
        return FUR[3];
    }
    return down(p, n, lam, x, y);
  };
  const tufts = [1, -1].flatMap((side) =>
    tube(
      [
        here(-1.5, 3.4 * side, 4.2),
        here(-4, 4.4 * side, 6.6),
        here(-6.5, 5 * side, 8.2),
        here(-9, 5.3 * side, 8.6),
      ],
      (t) => 2.3 - 1.8 * t,
      PART.tuft,
      (t) => (t > 0.5 ? storm : down),
      0.5,
    ),
  );
  const beak = tube(
    [here(5, 0, 1.2), here(9, 0, 1.5), here(11.8, 0, 0), here(11.4, 0, -3)],
    (t) => 2.9 - 2.2 * t,
    PART.beak,
    () => gold(),
    0.5,
  );
  return [
    { c: centre, r: skull, axes, part: PART.head, shade: skullShade },
    {
      c: here(-3.2, 0, -0.6),
      r: [5.2, 5.7, 6.2],
      axes,
      part: PART.head,
      shade: plumage,
    },
    ...tufts,
    ...beak,
    {
      c: here(7.4, 0, -2.3),
      r: [3.4, 2.3, 1.5],
      axes,
      part: PART.beak,
      shade: gold(1),
    },
  ];
}

const SADDLE = { f: 2.5, a: 8.2, b: 9.2, top: 12.6 };
const padTop = (f: number, r: number) =>
  SADDLE.top - 0.024 * r * r - 0.012 * f * f;
/** The two ellipsoids of the body: the lion's haunches and the bird's chest. */
const HULL: { c: V3; r: V3 }[] = [
  { c: [-6, 0, -0.5], r: [12, 11, 10.5] },
  { c: [6.5, 0, 0.3], r: [11.5, 11.2, 11.5] },
];
const torsoTop = (f: number, r: number) =>
  Math.max(
    ...HULL.map(
      ({ c, r: k }) =>
        c[2] +
        k[2] *
          Math.sqrt(
            Math.max(0, 1 - ((f - c[0]) / k[0]) ** 2 - (r / k[1]) ** 2),
          ),
    ),
  );
const torsoSide = (f: number, u: number) =>
  Math.max(
    ...HULL.map(
      ({ c, r: k }) =>
        k[1] *
        Math.sqrt(
          Math.max(0, 1 - ((f - c[0]) / k[0]) ** 2 - ((u - c[2]) / k[2]) ** 2),
        ),
    ),
  );

function body(pose: Pose): Blob[] {
  const { phase, direction } = pose;
  const legs = [1, -1].flatMap((side): Blob[] => [
    {
      c: [-10, 7.8 * side, -3],
      r: [7.6, 5.6, 7.6],
      part: PART.legs,
      shade: fur,
    },
    ...tube(
      [
        [-10.5, 8.3 * side, -8],
        [-12, 8.4 * side, -10.5],
        [-13.5, 8.3 * side, -12.5],
        [-15, 8.2 * side, -14],
      ],
      (t) => 3.6 - 0.7 * t,
      PART.legs,
      () => fur,
    ),
    {
      c: [-15.6, 8.1 * side, -15.6],
      r: [4, 3, 2.5],
      part: PART.legs,
      shade: down,
    },
    {
      c: [8.5, 6.4 * side, -6.5],
      r: [5.2, 4.2, 5.6],
      part: PART.legs,
      shade: plumage,
    },
    ...tube(
      [
        [8.6, 6.8 * side, -10],
        [9.5, 7 * side, -12],
        [10.5, 7 * side, -13.5],
        [11.5, 7 * side, -15],
      ],
      (t) => 2.3 - 0.3 * t,
      PART.talons,
      (t) => gold(wrap(t * 3.5) < 0.25 ? 1 : 0),
    ),
    ...[-1, 0, 1].flatMap((k) =>
      tube(
        [
          [11.6, 7 * side, -15.4],
          [13.2, (7 + 1.2 * k) * side, -16],
          [14.6, (7 + 1.7 * k) * side, -16.4],
          [15.6, (7 + 1.9 * k) * side, -17.1],
        ],
        (t) => 1.35 - 0.8 * t,
        PART.talons,
        (t) => (t > 0.62 ? storm : gold()),
        0.5,
      ),
    ),
  ]);
  const skull = HEAD[direction];
  const neck = tube(
    [
      [8, 0, 4],
      [13, 0, 6],
      [16, 0, 8 + (skull[2] - 12) * 0.6],
      add(skull, [-3, 0, -1.5]),
    ],
    (t) => 8 - 2 * t,
    PART.body,
    () => plumage,
  );
  const side = TAIL_SIDE[direction];
  const tailPts: V3[] = [
    [-16, 0, 1.5],
    [-25, 0, -3],
    [-33, 0, -1],
    [-37.5, 0, 6],
  ];
  const sway = (t: number): V3 => [
    0,
    side * t ** 1.5 + 3.2 * t * t * Math.sin(phase - 2.2 * t),
    0,
  ];
  const tail = tube(
    tailPts,
    (t) => 2.6 - 0.9 * t,
    PART.tail,
    () => fur,
    0.7,
    sway,
  );
  return [
    ...HULL.map(({ c, r }) => ({ c, r, part: PART.body, shade: torso })),
    ...legs,
    ...neck,
    ...head(skull, -0.1),
    ...tail,
    {
      c: add(tailEnd(direction, phase), [-0.6, 0, 1.2]),
      r: [4.4, 4.1, 5],
      part: PART.tuft,
      shade: storm,
    },
  ];
}

const tailEnd = (direction: string, phase: number): V3 => [
  -37.5,
  TAIL_SIDE[direction] + 3.2 * Math.sin(phase - 2.2),
  6,
];

/**
 * Behind the saddle and swept back the further they spread, so that seen
 * from the diagonals the far wing never reaches across the seat's column.
 */
const WING = {
  shoulder: [-9.5, 6.8, 7] as V3,
  sweep: 0.1,
  swept: 0.9,
  reach: 0.94,
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

type Feather = { seg: Seg; w: number };
const feather = (base: Xy, tip: Xy, w: number): Feather => ({
  seg: [base, tip],
  w,
});
/** Topmost first: the small coverts over the long hand and arm feathers. */
const COVERTS: Feather[] = [1, 4.5, 8, 11.5, 15, 18.5].map((a, i) =>
  feather([a, 1], [a + 1 + i * 0.3, 7.6 - i * 0.4], 2),
);
const PRIMARIES: Feather[] = [
  feather([14, 3], [25.5, 17], 2.1),
  feather([15.5, 2], [29.5, 14.5], 2.1),
  feather([17, 1], [33, 11], 2),
  feather([18, 0], [35.5, 6.5], 2),
  feather([19, -1], [37, 1.5], 1.9),
];
const SECONDARIES: Feather[] = [
  feather([15, 4], [21.5, 17.8], 2.3),
  feather([12, 4.5], [17, 18], 2.4),
  feather([8.5, 5], [12, 17.5], 2.4),
  feather([5, 5], [7, 16.5], 2.4),
  feather([1.5, 5], [2.5, 15], 2.4),
];
const LEADING: Xy[] = [
  [-1, -2],
  [6, -3.5],
  [12, -4.2],
  [17, -3.4],
  [21, -1.6],
  [21, 2],
  [-1, 3],
];

const KIND = {
  covert: 0,
  covertEdge: 1,
  flight: 2,
  flightEdge: 3,
  tip: 4,
  tipEdge: 5,
  lead: 6,
};
type WingDot = { a: number; b: number; kind: number };

/** The wing's shape in its own plane: a along the span, b back along the body. */
const WING_DOTS: WingDot[] = (() => {
  const dots: WingDot[] = [];
  const hit = (f: Feather, a: number, b: number) => {
    const { d, k } = segDist(f.seg, a, b);
    const w = f.w * (1 - 0.3 * k * k);
    return d < w ? { edge: d > w - 0.75, k } : undefined;
  };
  for (let a = -1.5; a <= 38.5; a += 0.35)
    for (let b = -4.5; b <= 19.5; b += 0.35) {
      if (inside(LEADING, a, b)) {
        dots.push({ a, b, kind: KIND.lead });
        continue;
      }
      let kind = -1;
      for (const f of COVERTS) {
        const h = hit(f, a, b);
        if (h) {
          kind = h.edge ? KIND.covertEdge : KIND.covert;
          break;
        }
      }
      if (kind < 0)
        for (const f of [...PRIMARIES, ...SECONDARIES]) {
          const h = hit(f, a, b);
          if (!h) continue;
          const tip = h.k > 0.72;
          kind = tip
            ? h.edge
              ? KIND.tipEdge
              : KIND.tip
            : h.edge
              ? KIND.flightEdge
              : KIND.flight;
          break;
        }
      if (kind >= 0) dots.push({ a, b, kind });
    }
  return dots;
})();

function wing(buf: Buf, pose: Pose, side: number): void {
  const { phase } = pose;
  const up = 0.42 + 0.68 * Math.cos(phase);
  const folding = Math.max(0, -Math.sin(phase));
  const span = unit([
    -WING.sweep - WING.swept * Math.cos(up) - 0.14 * folding,
    side * Math.cos(up),
    Math.sin(up),
  ]);
  const chord: V3 = [-1, 0, 0];
  const [sf, sr, su] = WING.shoulder;
  const S = at(pose, [sf, sr * side, su]);
  const e1 = scale(turn(pose, span), SIZE * WING.reach * (1 - 0.16 * folding));
  const e2 = scale(turn(pose, chord), SIZE);
  let n = turn(pose, cross(span, chord));
  if (n[2] > 0) n = scale(n, -1);
  const lam = dot(n, LIGHT);
  const o = lam > 0.4 ? 0 : lam > -0.05 ? 1 : 2;
  const colour = [
    FUR[o],
    FUR[o + 2],
    FLIGHT[o],
    FLIGHT[Math.min(3, o + 2)],
    TIP[o ? 1 : 0],
    o ? FLIGHT[0] : TIP[1],
    FEATHER[o],
  ];
  const part = PART.wing + (side > 0 ? 0 : 1);
  for (const { a, b, kind } of WING_DOTS)
    plot(
      buf,
      Math.floor(S[0] + a * e1[0] + b * e2[0]),
      Math.floor(S[1] + a * e1[1] + b * e2[1]),
      S[2] + a * e1[2] + b * e2[2],
      colour[kind],
      LINE,
      part,
    );
}

type PadDot = { p: V3; n: V3; kind: number };

/** The flat pad: kind 0 seat, 1 gold rim, 2 side wall. */
const PAD_DOTS: PadDot[] = (() => {
  const { f: f0, a, b } = SADDLE;
  const e = 2.5;
  const dots: PadDot[] = [];
  for (let f = -a; f <= a; f += 0.35)
    for (let r = -b; r <= b; r += 0.35) {
      const rho = (Math.abs(f) / a) ** e + (Math.abs(r) / b) ** e;
      if (rho > 1) continue;
      dots.push({
        p: [f0 + f, r, padTop(f, r)],
        n: unit([0.024 * f, 0.048 * r, 1]),
        kind: rho ** (1 / e) > 0.82 ? 1 : 0,
      });
    }
  for (let t = 0; t < TAU; t += 0.02) {
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
    const depth = Math.min(3.4, Math.max(1.6, top - torsoTop(f0 + f, r) + 0.4));
    for (let h = 0; h <= depth; h += 0.35)
      dots.push({ p: [f0 + f, r, top - h], n, kind: 2 });
  }
  return dots;
})();

/** A lightning bolt in the flap's own units: x forward, y down from its top. */
const BOLT: Xy[] = [
  [0.4, 1.6],
  [2.2, 1.6],
  [0.9, 4],
  [2.4, 4],
  [-1, 8.2],
  [0, 5.1],
  [-1.6, 5.1],
];

/** The cloth hanging down each flank: kind 0 cloth, 1 gold hem, 2 gold bolt. */
const FLAP_DOTS: PadDot[] = (() => {
  const dots: PadDot[] = [];
  const half = 4.6;
  const drop = 9.2;
  const top = 8.6;
  for (let x = -half; x <= half; x += 0.35)
    for (let y = 0; y <= drop; y += 0.35) {
      const corner = Math.max(0, y - (drop - 2.4));
      const inset = Math.max(0, Math.abs(x) - (half - 2.4));
      if (Math.hypot(corner, inset) > 2.4) continue;
      const f = SADDLE.f + x;
      const u = top - y;
      const hull = HULL.reduce((best, h) =>
        Math.abs(f - h.c[0]) / h.r[0] < Math.abs(f - best.c[0]) / best.r[0]
          ? h
          : best,
      );
      const edge =
        half - Math.abs(x) < 0.8 ||
        drop - y < 0.8 ||
        Math.hypot(corner, inset) > 1.6;
      const kind = inside(BOLT, x, y) ? 2 : edge ? 1 : 0;
      for (const side of [1, -1]) {
        const r = side * (torsoSide(f, u) + 0.35);
        dots.push({
          p: [f, r, u],
          n: unit([
            (f - hull.c[0]) / hull.r[0] ** 2,
            r / hull.r[1] ** 2,
            (u - hull.c[2]) / hull.r[2] ** 2,
          ]),
          kind,
        });
      }
    }
  return dots;
})();

function saddle(buf: Buf, pose: Pose): void {
  for (const { p, n, kind } of PAD_DOTS) {
    const v = at(pose, p);
    const lam = dot(turn(pose, n), LIGHT);
    const ink =
      kind === 1
        ? GOLD[lam > 0.7 ? 0 : lam > 0.2 ? 1 : 2]
        : kind === 2
          ? LEATHER[lam > 0.3 ? 2 : 3]
          : LEATHER[lam > 0.75 ? 0 : lam > 0.55 ? 1 : 2];
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
      kind === 0
        ? CLOTH[lam > 0.35 ? 0 : lam > -0.1 ? 1 : 2]
        : GOLD[(lam > 0.35 ? 0 : 1) + (kind === 1 ? 1 : 0)];
    plot(
      buf,
      Math.floor(v[0]),
      Math.floor(v[1]),
      v[2] - 0.2,
      ink,
      LINE,
      PART.flap,
    );
  }
}

function strike(
  buf: Buf,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  z: number,
  ink: Rgb,
) {
  const n = Math.max(
    1,
    Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))),
  );
  for (let s = 0; s <= n; s++)
    plot(
      buf,
      Math.round(x0 + ((x1 - x0) * s) / n),
      Math.round(y0 + ((y1 - y0) * s) / n),
      z,
      ink,
      SPARK_LINE,
      PART.spark,
    );
}

/** Little forks of lightning crackling off the tail's tuft, new ones every frame. */
function sparks(buf: Buf, pose: Pose): void {
  const { direction, phase, frame } = pose;
  const o = at(pose, add(tailEnd(direction, phase), [-0.6, 0, 1.2]));
  const seed = frame * 7.31 + RIDING.directions.indexOf(direction) * 3.7;
  for (let k = 0; k < 3; k++) {
    if (hash(seed + k * 1.9) < 0.3) continue;
    let angle = -Math.PI / 2 + (hash(seed + k * 5.3) - 0.5) * 3.4;
    let [x, y] = [o[0], o[1]];
    const steps = 3;
    for (let s = 0; s < steps; s++) {
      angle += (hash(seed + k * 11.1 + s * 2.7) - 0.5) * 1.8;
      const l = 2.6 + hash(seed + k * 3.3 + s) * 1.6;
      const nx = x + Math.cos(angle) * l;
      const ny = y + Math.sin(angle) * l;
      strike(buf, x, y, nx, ny, o[2] - 7, SPARK[s ? 1 : 0]);
      [x, y] = [nx, ny];
    }
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
  sparks(buf, pose);
  ink(px, buf);
}

const seat = (direction: string): [number, number] => {
  const v = at(posed(direction, 0, false), [SADDLE.f, 0, padTop(0, 0)]);
  return [Math.floor(v[0]), Math.floor(v[1])];
};

export const STORM_GRIFFIN: DrawnMount = {
  id: "own-storm-griffin",
  name: "Storm Griffin",
  description:
    "กริฟฟินสายฟ้าตัวกลมป้อม หัวและอกเป็นขนนกสีขาวนวล จะงอยปากสีทองโค้งงุ้ม ดวงตาสีฟ้าสว่างเหมือนประกายไฟฟ้า มีพู่ขนบนหัวสองข้าง ท่อนหลังเป็นสิงโตขนสีฟ้าเทาเหมือนเมฆพายุ ปีกขนนกสีน้ำเงินครามปลายขนขาวเรืองฟ้า ขาหน้าเป็นกรงเล็บนกอินทรีสีทอง ปลายหางเป็นพู่ขนที่มีสายฟ้าแลบแปลบปลาบ บนหลังมีเบาะหนังขอบทอง ห้อยผ้าสีน้ำเงินปักลายสายฟ้าสีทองทั้งสองข้าง",
  cell: CELL,
  seat: Object.fromEntries(
    RIDING.directions.map((d): [string, [number, number]] => [d, seat(d)]),
  ),
  paint,
};
