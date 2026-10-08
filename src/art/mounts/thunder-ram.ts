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
const SIZE = 1.45;

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: V3): V3 => scale(a, 1 / (Math.hypot(...a) || 1));
const zig = (v: number) => Math.abs(2 * wrap(v) - 1);

const inks = (...hex: string[]) => hex.map(rgb);
const WOOL = inks("#ffffff", "#e9eef8", "#c3cee4", "#97a5c6");
const STORM = inks("#a3afc9", "#7c89a9", "#586488", "#3f4869");
const WOOL_LINE = rgb("#2a3052");
const WOOL_CREASE = [rgb("#7f8db6"), rgb("#4a5478")];
const SLATE = inks("#8793ae", "#5f6b88", "#444f6b", "#2e3650");
const SLATE_LINE = rgb("#121728");
const HOOF = inks("#4c556f", "#2b3148");
const HORN = inks("#fff3b0", "#ffd54a", "#e39a22", "#a8641c");
const HORN_LINE = rgb("#46280b");
const CLOTH = inks("#6aa0ff", "#3f75ee", "#2c55c2", "#1d3a92");
const CLOTH_LINE = rgb("#0e1848");
const SPARK = inks("#fffcd6", "#ffe94c");
const SPARK_LINE = rgb("#3d3a96");

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
  south: [56, 67],
  "south-east": [50, 67],
  east: [46, 73],
  "north-east": [50, 68],
  north: [56, 68],
};
/** Seen from behind, the head drops to where the rider hides it. */
const HEAD: Record<string, V3> = {
  south: [24.5, 0, 4.5],
  "south-east": [24.5, 0, 4.5],
  east: [24.5, 0, 4.5],
  "north-east": [24.5, 0, 3],
  north: [24, 0, -12],
};

type Pose = {
  direction: string;
  frame: number;
  phase: number;
  bob: number;
  o: Xy;
  F: V3;
  R: V3;
  U: V3;
};

function posed(direction: string, frame: number, bobbing = true): Pose {
  const [fx, fy] = HEADING[direction];
  const phase = (frame / RIDING.framesPerDirection) * TAU;
  const bob = bobbing && Math.cos(2 * phase) < -0.4 ? -1 : 0;
  const [ox, oy] = ORIGIN[direction];
  return {
    direction,
    frame,
    phase,
    bob,
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
  crease: Rgb[];
  part: Uint8Array;
};

const buffer = (): Buf => ({
  depth: new Float32Array(W * H).fill(Infinity),
  ink: new Array(W * H),
  line: new Array(W * H),
  crease: new Array(W * H),
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
  buf.crease[i] = line;
  buf.part[i] = part;
}

const band = (lam: number, x: number, y: number, cuts: number[]): number => {
  const v = lam + (bayer(x, y) - 0.5) * 0.1;
  let i = 0;
  while (i < cuts.length && v < cuts[i]) i++;
  return i;
};
const FLEECE_CUTS = [0.76, 0.42, 0.02];
const SLATE_CUTS = [0.7, 0.3, -0.2];
const HORN_CUTS = [0.62, 0.22, -0.25];

/** p and n are the hit point and normal in the ram's own frame (forward, right, up), reused between calls. */
type Shade = (p: V3, n: V3, lam: number, x: number, y: number) => Rgb;
type Blob = {
  c: V3;
  r: V3;
  axes?: [V3, V3, V3];
  part: number;
  line?: Rgb;
  crease?: Rgb;
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
  const [b0, b1, b2] = b.r;
  const r0 = b0 * SIZE;
  const r1 = b1 * SIZE;
  const r2 = b2 * SIZE;
  const ex = Math.hypot(r0 * A0[0], r1 * A1[0], r2 * A2[0]);
  const ey = Math.hypot(r0 * A0[1], r1 * A1[1], r2 * A2[1]);
  const d0 = A0[2] / r0;
  const d1 = A1[2] / r1;
  const d2 = A2[2] / r2;
  const qa = d0 * d0 + d1 * d1 + d2 * d2;
  const L0 = dot(A0, LIGHT) / b0;
  const L1 = dot(A1, LIGHT) / b1;
  const L2 = dot(A2, LIGHT) / b2;
  const [cf, cr, cu] = b.c;
  const line = b.line ?? SLATE_LINE;
  const crease = b.crease ?? line;
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
      const g0 = h0 / b0;
      const g1 = h1 / b1;
      const g2 = h2 / b2;
      const g = Math.sqrt(g0 * g0 + g1 * g1 + g2 * g2);
      const k0 = h0 * b0;
      const k1 = h1 * b1;
      const k2 = h2 * b2;
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
      buf.crease[i] = crease;
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

/** A tapering tube as a run of overlapping spheres along a curve. */
function tube(
  path: (t: number) => V3,
  radius: (t: number) => number,
  part: number,
  shade: (t: number) => Shade,
  line?: Rgb,
): Blob[] {
  const K = 24;
  const samples = Array.from({ length: K + 1 }, (_, i) => path(i / K));
  const run = [0];
  for (let i = 1; i <= K; i++)
    run.push(
      run[i - 1] +
        Math.hypot(
          samples[i][0] - samples[i - 1][0],
          samples[i][1] - samples[i - 1][1],
          samples[i][2] - samples[i - 1][2],
        ),
    );
  const length = run[K];
  const blobs: Blob[] = [];
  for (let s = 0, k = 0; ;) {
    while (k < K - 1 && run[k + 1] < s) k++;
    const t = Math.min(1, (k + (s - run[k]) / (run[k + 1] - run[k] || 1)) / K);
    const r = radius(t);
    blobs.push({ c: path(t), r: [r, r, r], part, line, shade: shade(t) });
    if (s >= length) return blobs;
    s = Math.min(length, s + Math.max(0.45, r * 0.32));
  }
}

const PART = {
  hull: 1,
  head: 2,
  snout: 3,
  ear: 4,
  horn: 5,
  neck: 6,
  legs: 7,
  hoof: 8,
  tail: 9,
  saddle: 20,
  flap: 21,
  spark: 30,
  puff: 40,
} as const;

const slate =
  (lift = 0): Shade =>
  (_p, _n, lam, x, y) =>
    SLATE[Math.max(0, band(lam, x, y, SLATE_CUTS) + lift)];
/** The eye is hand-pixelled so it keeps its shape as the head nods. */
const EYE_SHAPE = [".XXX.", "XXXXX", "XXXXX", "XXXXX", ".XXX."];
const hoof: Shade = (_p, _n, lam) => HOOF[lam > 0.1 ? 0 : 1];

type Puff = { c: V3; r: number; storm: boolean; curl: V3 };

const HULL = { c: [0, 0, 0] as V3, r: [14.4, 9.8, 8.6] as V3 };
const SADDLE = { f: 0.5, a: 6.2, b: 7.2, top: 12.6 };
const padTop = (f: number, r: number) =>
  SADDLE.top - 0.02 * r * r - 0.012 * f * f;
const hullTop = (f: number, r: number) =>
  HULL.c[2] +
  HULL.r[2] *
    Math.sqrt(Math.max(0, 1 - (f / HULL.r[0]) ** 2 - (r / HULL.r[1]) ** 2));

/** Lumps of wool spiralling over the hull from the chest to the rump, leaving the belly bare and the saddle's place clear. */
const PUFFS: Puff[] = (() => {
  const out: Puff[] = [];
  const lumps = (
    n: number,
    turnBy: number,
    spread: number,
    size: number,
    seed: number,
  ) => {
    for (let i = 0; i < n; i++) {
      const z = 1 - (2 * (i + 0.5)) / n;
      const a = turnBy + i * 2.399963;
      const ring = Math.sqrt(1 - z * z);
      const up = Math.sin(a);
      if (up < -0.5) continue;
      const c: V3 = [
        HULL.r[0] * z * spread,
        HULL.r[1] * ring * Math.cos(a) * spread,
        HULL.r[2] * ring * up * spread,
      ];
      if (
        up > 0.3 &&
        ((c[0] - SADDLE.f) / (SADDLE.a + 1.5)) ** 2 +
          (c[1] / (SADDLE.b + 1.5)) ** 2 <
          1
      )
        continue;
      const grey =
        hash(seed + i * 3.7) + 0.3 * (0.2 - ring * up) + 0.2 * (0.3 - z);
      out.push({
        c,
        r: size * (0.88 + hash(seed + i * 1.9) * 0.24),
        storm: grey > 0.6,
        curl: unit([
          hash(seed + i * 7.7) - 0.5,
          hash(seed + i * 9.1) - 0.5,
          hash(seed + i * 2.3) - 0.5,
        ]),
      });
    }
  };
  lumps(40, 0.4, 1, 6.1, 0);
  lumps(46, 2.1, 1.04, 3.7, 100);
  return out;
})();

const wool = (storm: boolean, curl: V3): Shade => {
  const ramp = storm ? STORM : WOOL;
  return (_p, n, lam, x, y) => {
    let k = band(lam, x, y, FLEECE_CUTS);
    if (Math.abs(dot(n, curl) - 0.2) < 0.08) k = Math.min(3, k + 1);
    return ramp[k];
  };
};

function fleece(pose: Pose): Blob[] {
  const { phase } = pose;
  return PUFFS.map((p, i) => {
    const bounce =
      1.2 *
      Math.sin(2 * phase - 0.12 * p.c[0] - 0.6) *
      Math.max(0.3, (p.c[2] + 5) / 14);
    return {
      c: [p.c[0], p.c[1], p.c[2] + bounce],
      r: [p.r, p.r, p.r],
      part: PART.puff + i,
      line: WOOL_LINE,
      crease: WOOL_CREASE[p.storm ? 1 : 0],
      shade: wool(p.storm, p.curl),
    };
  });
}

const GROUND = 17.8;
const STRIDE = { reach: 4.4, lift: 3.4 };

type Leg = { hip: V3; front: boolean; lag: number };
const LEGS: Leg[] = [
  { hip: [9.2, 7, -5.5], front: true, lag: 0 },
  { hip: [9.2, -7, -5.5], front: true, lag: 0.5 },
  { hip: [-9.2, 7, -5.5], front: false, lag: 0.5 },
  { hip: [-9.2, -7, -5.5], front: false, lag: 0 },
];

/** A foot's place along the stride, swinging forward in the air for the first half of the cycle and sliding back on the ground for the second. */
function foot(t: number): { f: number; lift: number } {
  const u = wrap(t);
  if (u < 0.5) {
    const s = u * 2;
    return {
      f: STRIDE.reach * (2 * (s * s * (3 - 2 * s)) - 1),
      lift: STRIDE.lift * Math.sin(Math.PI * s),
    };
  }
  return { f: STRIDE.reach * (1 - 4 * (u - 0.5)), lift: 0 };
}

function legs(pose: Pose): Blob[] {
  const t = pose.frame / RIDING.framesPerDirection;
  const sole = -GROUND + pose.bob / (COS * SIZE);
  return LEGS.flatMap(({ hip, front, lag }): Blob[] => {
    const { f, lift } = foot(t + lag);
    const ankle: V3 = [hip[0] + f, hip[1], sole + 2.6 + lift];
    const bow = (front ? 1 : -1) * (1.4 + 0.5 * lift);
    const path = (s: number) =>
      bezier(
        [
          hip,
          [
            hip[0] + (ankle[0] - hip[0]) / 3 + bow,
            hip[1],
            hip[2] + (ankle[2] - hip[2]) / 3,
          ],
          [
            hip[0] + ((ankle[0] - hip[0]) * 2) / 3 + bow * 0.6,
            hip[1],
            hip[2] + ((ankle[2] - hip[2]) * 2) / 3,
          ],
          ankle,
        ],
        s,
      );
    return [
      ...tube(
        path,
        (s) => 3 - 0.8 * s,
        PART.legs,
        () => slate(),
      ),
      {
        c: [ankle[0] + 0.8, ankle[1], sole + 1.5],
        r: [2.8, 2.3, 1.6],
        part: PART.hoof,
        shade: hoof,
      },
    ];
  });
}

function head(pose: Pose, centre: V3, pitch: number): Blob[] {
  const hF: V3 = [Math.cos(pitch), 0, Math.sin(pitch)];
  const hR: V3 = [0, 1, 0];
  const hU: V3 = [-Math.sin(pitch), 0, Math.cos(pitch)];
  const axes: [V3, V3, V3] = [hF, hR, hU];
  const here = (f: number, r: number, u: number): V3 =>
    add(centre, add(scale(hF, f), add(scale(hR, r), scale(hU, u))));
  const skull: V3 = [7.2, 6.2, 6.6];
  const muzzle = { c: [7.8, 0, -2.2] as V3, r: [7, 4.5, 4.2] as V3 };
  const onEllipsoid = (c: V3, r: V3, d: V3): V3 => {
    const s = 1 / Math.hypot(d[0] / r[0], d[1] / r[1], d[2] / r[2]);
    return here(c[0] + d[0] * s, c[1] + d[1] * s, c[2] + d[2] * s);
  };
  const nostrils = [1, -1].map((side): Xy => {
    const [nx, ny] = at(
      pose,
      onEllipsoid(muzzle.c, muzzle.r, [0.8, 0.42 * side, 0.32]),
    );
    return [Math.round(nx) - 1, Math.round(ny)];
  });
  const eyes = [1, -1].map((side): Xy => {
    const [ex, ey] = at(
      pose,
      onEllipsoid([0, 0, 0], skull, [0.55, 0.7 * side, 0.3]),
    );
    return [Math.round(ex) - 2, Math.round(ey) - 2];
  });
  const look = turn(pose, hF);
  const skullShade: Shade = (p, n, lam, x, y) => {
    for (const [k, side] of [1, -1].entries()) {
      if (p[1] * side < 0.5) continue;
      const cx = x - eyes[k][0];
      const cy = y - eyes[k][1];
      if (EYE_SHAPE[cy]?.[cx] !== "X") continue;
      const px = Math.abs(look[0]) > 0.4 ? 3 : k ? 1 : 2;
      const py = look[1] > 0.3 ? 2 : 1;
      if (cx >= px && cx < px + 2 && cy >= py && cy < py + 2) return SLATE_LINE;
      return HORN[cx + cy === 2 ? 0 : cy < 3 ? 1 : 2];
    }
    return slate()(p, n, lam, x, y);
  };
  const muzzleShade: Shade = (p, n, lam, x, y) => {
    for (const [k, side] of [1, -1].entries()) {
      const cx = x - nostrils[k][0];
      const cy = y - nostrils[k][1];
      if (
        p[1] * side > 0.5 &&
        cx >= 0 &&
        cx < 2 &&
        cy >= 0 &&
        cy < (Math.abs(look[0]) > 0.4 ? 2 : 1)
      )
        return SLATE_LINE;
    }
    return slate(-1)(p, n, lam, x, y);
  };
  const ears = [1, -1].map((side): Blob => {
    const tilt = 0.45;
    const out = add(
      scale(hR, side * Math.cos(tilt)),
      scale(hU, -Math.sin(tilt)),
    );
    const lift = add(
      scale(hR, side * Math.sin(tilt)),
      scale(hU, Math.cos(tilt)),
    );
    return {
      c: here(-1.1, 7.4 * side, 0.7),
      r: [1.9, 5.2, 3],
      axes: [hF, out, lift],
      part: PART.ear,
      shade: (p, n, lam, x, y) => slate(n[0] > 0.45 ? -1 : 0)(p, n, lam, x, y),
    };
  });
  const horns = [1, -1].flatMap((side) => {
    const rho0 = 6.2;
    const th0 = 1.1;
    const th1 = 5.5;
    const toward: V3 = [0.77, -0.64 * side, 0];
    const outward: V3 = [0.64, 0.77 * side, 0];
    const base: V3 = [-1.1, 4.2 * side, 5.7];
    const spiral = (th: number, rho: number): V3 => [
      toward[0] * Math.cos(th) * rho,
      toward[1] * Math.cos(th) * rho,
      Math.sin(th) * rho,
    ];
    const centre0 = sub(base, spiral(th0, rho0));
    const path = (t: number): V3 => {
      const th = th0 + (th1 - th0) * t;
      const rho = rho0 * (1 - 0.5 * t);
      return here(
        ...add(add(centre0, spiral(th, rho)), scale(outward, 6.5 * t)),
      );
    };
    return tube(
      path,
      (t) => 2.5 * (1 - t) ** 0.9 + 0.85,
      PART.horn,
      (t) => (_p, _n, lam, x, y) =>
        HORN[
          Math.min(
            3,
            band(lam, x, y, HORN_CUTS) + (wrap(t * 6.5) < 0.1 ? 2 : 0),
          )
        ],
      HORN_LINE,
    );
  });
  const topknot: Blob = {
    c: here(0.4, 0, 6.3),
    r: [3.6, 3.6, 3.2],
    part: PART.puff + 99,
    line: WOOL_LINE,
    crease: WOOL_CREASE[0],
    shade: wool(false, [0.3, 0.8, 0.5]),
  };
  return [
    { c: centre, r: skull, axes, part: PART.head, shade: skullShade },
    {
      c: here(...muzzle.c),
      r: muzzle.r,
      axes,
      part: PART.snout,
      shade: muzzleShade,
    },
    ...ears,
    ...horns,
    topknot,
  ];
}

function tail(pose: Pose): Blob[] {
  const wag = 1.2 * Math.sin(2 * pose.phase - 0.4);
  return [
    {
      c: [-17, wag * 0.4, 2.6],
      r: [3.4, 2.8, 2.8],
      part: PART.tail,
      shade: slate(),
    },
    {
      c: [-19.6, wag, 3.6],
      r: [3.6, 3.6, 3.6],
      part: PART.puff + 98,
      line: WOOL_LINE,
      crease: WOOL_CREASE[0],
      shade: wool(false, [0.5, 0.2, 0.8]),
    },
  ];
}

function body(pose: Pose): Blob[] {
  const { direction, phase } = pose;
  const skull = HEAD[direction];
  const nod = 0.5 * Math.sin(2 * phase - 0.8);
  const neck = tube(
    (t) =>
      bezier(
        [[10, 0, 2], [15, 0, 3], [19, 0, 4], add(skull, [-3.5, 0, -1])],
        t,
      ),
    (t) => 6 - 1.2 * t,
    PART.neck,
    () => slate(),
  );
  return [
    {
      c: HULL.c,
      r: HULL.r,
      part: PART.hull,
      line: WOOL_LINE,
      shade: (_p, _n, lam, x, y) => STORM[2 + (band(lam, x, y, [0.4]) ? 1 : 0)],
    },
    ...fleece(pose),
    ...legs(pose),
    ...neck,
    ...head(pose, add(skull, [0, 0, nod]), -0.1),
    ...tail(pose),
  ];
}

type Dot = { p: V3; n: V3; kind: number };

/** The flat pad: kind 0 seat, 1 yellow trim, 2 side wall. */
const PAD_DOTS: Dot[] = (() => {
  const { f: f0, a, b } = SADDLE;
  const e = 2.5;
  const dots: Dot[] = [];
  const teeth = 14;
  for (let f = -a; f <= a; f += 0.3)
    for (let r = -b; r <= b; r += 0.3) {
      const rho = (Math.abs(f) / a) ** e + (Math.abs(r) / b) ** e;
      if (rho > 1) continue;
      const tooth = zig((Math.atan2(r / b, f / a) / TAU) * teeth);
      dots.push({
        p: [f0 + f, r, padTop(f, r)],
        n: unit([0.05 * f, 0.07 * r, 1]),
        kind: rho ** (1 / e) > 0.72 + 0.12 * tooth ? 1 : 0,
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
    const depth = Math.min(5.5, Math.max(1.6, top - hullTop(f0 + f, r) + 0.4));
    for (let h = 0; h <= depth; h += 0.3)
      dots.push({ p: [f0 + f, r, top - h], n, kind: 2 });
  }
  return dots;
})();

const BLANKET = {
  e: [19, 14.7, 10.6] as V3,
  cu: -0.2,
  half: 5.2,
  hem: 0.42,
  top: 1.3,
};

/** The cloth draped over the wool on each flank: kind 0 blue, 1 yellow zigzag hem and edges. */
const FLAP_DOTS: Dot[] = (() => {
  const { e, cu, half, hem, top } = BLANKET;
  const dots: Dot[] = [];
  for (let x = -half; x <= half; x += 0.28)
    for (let ph = hem; ph <= top; ph += 0.02) {
      const y = (ph - hem) * 11;
      const corner = Math.max(0, 2.4 - y);
      const inset = Math.max(0, Math.abs(x) - (half - 2.4));
      if (Math.hypot(corner, inset) > 2.4) continue;
      const f = SADDLE.f + x;
      const s = Math.sqrt(Math.max(0, 1 - (f / e[0]) ** 2));
      const kind =
        y < 0.9 + 1.5 * zig(x / 3.3) || half - Math.abs(x) < 0.8 ? 1 : 0;
      for (const side of [1, -1]) {
        const r = side * e[1] * s * Math.cos(ph);
        const u = cu + e[2] * s * Math.sin(ph);
        dots.push({
          p: [f, r, u],
          n: unit([f / e[0] ** 2, r / e[1] ** 2, (u - cu) / e[2] ** 2]),
          kind,
        });
      }
    }
  return dots;
})();

const tier = (lam: number, cuts: number[]) =>
  cuts.filter((c) => lam < c).length;

function saddle(buf: Buf, pose: Pose): void {
  for (const { p, n, kind } of PAD_DOTS) {
    const v = at(pose, p);
    const lam = dot(turn(pose, n), LIGHT);
    const ink =
      kind === 1
        ? HORN[tier(lam, [0.92, 0.6])]
        : kind === 2
          ? CLOTH[lam > 0.3 ? 2 : 3]
          : CLOTH[tier(lam, [0.9, 0.7, 0.5])];
    plot(
      buf,
      Math.floor(v[0]),
      Math.floor(v[1]),
      v[2],
      ink,
      CLOTH_LINE,
      PART.saddle,
    );
  }
  for (const { p, n, kind } of FLAP_DOTS) {
    const v = at(pose, p);
    const lam = dot(turn(pose, n), LIGHT);
    const ink =
      kind === 1
        ? HORN[lam > 0.35 ? 1 : 2]
        : CLOTH[tier(lam, [0.88, 0.62, 0.3])];
    plot(
      buf,
      Math.floor(v[0]),
      Math.floor(v[1]),
      v[2] - 1.5,
      ink,
      CLOTH_LINE,
      PART.flap,
    );
  }
}

const BOLTS: Xy[][] = [
  [
    [3, 0],
    [0, 3],
    [3, 3],
    [0, 7],
  ],
  [
    [0, 0],
    [3, 2],
    [0, 4],
    [3, 7],
  ],
  [
    [2, 0],
    [0, 2],
    [2, 3],
    [0, 5],
  ],
  [
    [2, 0],
    [0, 2],
    [2, 2],
    [0, 4],
  ],
];

/** A bolt only shows on wool, so it never pokes out past the fleece's outline. */
function dab(buf: Buf, x: number, y: number, z: number, ink: Rgb): void {
  if (x >= 0 && y >= 0 && x < W && y < H && buf.part[y * W + x] >= PART.puff)
    plot(buf, x, y, z, ink, SPARK_LINE, PART.spark);
}

function line(buf: Buf, [x0, y0]: Xy, [x1, y1]: Xy, z: number, ink: Rgb): void {
  const n = Math.max(1, Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let s = 0; s <= n; s++)
    dab(
      buf,
      Math.round(x0 + ((x1 - x0) * s) / n),
      Math.round(y0 + ((y1 - y0) * s) / n),
      z,
      ink,
    );
}

/** Little yellow bolts crackling in the wool, new ones every frame. */
function sparks(buf: Buf, pose: Pose): void {
  const seed =
    pose.frame * 5.17 + RIDING.directions.indexOf(pose.direction) * 11.3;
  const placed: Xy[] = [];
  const target = 3 + (pose.frame % 2);
  for (let k = 0; k < 16 && placed.length < target; k++) {
    const puff = PUFFS[Math.floor(hash(seed + k * 1.7) * PUFFS.length)];
    const [cx, cy] = at(pose, puff.c);
    const x = Math.round(cx + (hash(seed + k * 2.9 + 4) - 0.5) * puff.r * SIZE);
    const y = Math.round(cy + (hash(seed + k * 4.1 + 7) - 0.5) * puff.r * SIZE);
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    if (buf.part[y * W + x] < PART.puff) continue;
    if (
      placed.some(([px, py]) => Math.abs(px - x) < 9 && Math.abs(py - y) < 11)
    )
      continue;
    placed.push([x, y]);
    const shape = BOLTS[Math.floor(hash(seed + k * 6.1) * BOLTS.length)];
    const flip = hash(seed + k * 8.3) < 0.5 ? -1 : 1;
    const z = buf.depth[y * W + x] - 12;
    const corners = shape.map(([bx, by]): Xy => [
      x + (bx - 2) * flip,
      y + by - 4,
    ]);
    dab(buf, ...corners[0], z, SPARK[0]);
    for (let s = 1; s < corners.length; s++)
      line(buf, corners[s - 1], corners[s], z, SPARK[1]);
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
        } else if (buf.part[j] !== buf.part[i]) {
          const woolly = buf.part[j] >= PART.puff && buf.part[i] >= PART.puff;
          if (buf.depth[j] < buf.depth[i] - (woolly ? 1 : 2.5))
            colour = buf.part[j] === PART.spark ? SPARK_LINE : buf.crease[i];
        }
      }
      if (colour) put(px, x, y, colour);
    }
}

function paint(px: Pixels, direction: string, frame: number): void {
  const pose = posed(direction, frame);
  const buf = buffer();
  for (const b of body(pose)) blob(buf, pose, b);
  saddle(buf, pose);
  sparks(buf, pose);
  ink(px, buf);
}

const seat = (direction: string): [number, number] => {
  const v = at(posed(direction, 0, false), [SADDLE.f, 0, padTop(0, 0)]);
  return [Math.floor(v[0]), Math.floor(v[1])];
};

export const THUNDER_RAM: DrawnMount = {
  id: "own-thunder-ram",
  name: "Thunder Ram",
  description:
    "แกะผู้ตัวอ้วนป้อม ขนฟูหนาสีขาวปนเทาพายุ มีเขาโค้งม้วนสีทองคู่ใหญ่ หน้าและขาสีเทาหินชนวนเข้ม เท้ามีกีบเล็ก ๆ มีประกายสายฟ้าสีเหลืองแลบแปลบปลาบอยู่ในขน วิ่งเหยาะ ๆ ขาก้าวสลับกันและขนฟูเด้งตามจังหวะ บนหลังมีเบาะสีน้ำเงินขลิบลายซิกแซกสีเหลือง",
  cell: CELL,
  seat: Object.fromEntries(
    RIDING.directions.map((d): [string, [number, number]] => [d, seat(d)]),
  ),
  paint,
};
