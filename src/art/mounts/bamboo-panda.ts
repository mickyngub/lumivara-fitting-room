import { RIDING } from "../../game/riding";
import type { DrawnMount } from "../mounts";
import { bayer, put, rgb, type Pixels, type Rgb } from "../pixels";

type V3 = [number, number, number];
type Mat = [V3, V3, V3];
type Frame = { o: V3; m: Mat };
type Tone = { c: Rgb; ink: Rgb };

const CELL = { w: 108, h: 96 };
const W = CELL.w;
const H = CELL.h;
const FRAMES = RIDING.framesPerDirection;
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const PITCH = 26 * DEG;
const SIN = Math.sin(PITCH);
const COS = Math.cos(PITCH);

const add = (a: V3, b: V3, k = 1): V3 => [
  a[0] + b[0] * k,
  a[1] + b[1] * k,
  a[2] + b[2] * k,
];
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a: V3): V3 => scale(a, 1 / (Math.hypot(...a) || 1));

/** View space: x right, y down, z away from the viewer; the light comes from the top left, in front. */
const LIGHT = unit([-0.5, -0.62, -0.6]);

const IDENTITY: Mat = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const turn = (m: Mat, v: V3): V3 =>
  add(add(scale(m[0], v[0]), m[1], v[1]), m[2], v[2]);
const compose = (a: Mat, b: Mat): Mat => [
  turn(a, b[0]),
  turn(a, b[1]),
  turn(a, b[2]),
];
const place = (fr: Frame, p: V3): V3 => add(fr.o, turn(fr.m, p));
const rollBy = (a: number): Mat => [
  [1, 0, 0],
  [0, Math.cos(a), Math.sin(a)],
  [0, -Math.sin(a), Math.cos(a)],
];
const pitchBy = (a: number): Mat => [
  [Math.cos(a), 0, -Math.sin(a)],
  [0, 1, 0],
  [Math.sin(a), 0, Math.cos(a)],
];
const yawBy = (a: number): Mat => [
  [Math.cos(a), Math.sin(a), 0],
  [-Math.sin(a), Math.cos(a), 0],
  [0, 0, 1],
];

const ramp = (ink: string, ...hex: string[]): Tone[] => {
  const line = rgb(ink);
  return hex.map((h) => ({ c: rgb(h), ink: line }));
};
const WHITE = ramp(
  "#353c5e",
  "#fbfcff",
  "#e7ecf7",
  "#c5cee3",
  "#9ca7c6",
  "#737fa2",
);
const BLACK = ramp("#10122a", "#5a6285", "#41466a", "#2d3151", "#1d2039");
const DEEP: Tone = { c: rgb("#10122a"), ink: rgb("#10122a") };
const BLUSH = ramp("#353c5e", "#f6b0c4", "#ea8aa8");
const BAMBOO = ramp(
  "#213f26",
  "#d3e68a",
  "#aacd5e",
  "#7fb04a",
  "#5b8c3c",
  "#3d6631",
  "#2b4d26",
);
const BINDING = ramp("#213f26", "#e6e79c", "#c9cd72", "#9ea851", "#727f3f");
const LEAF = ramp("#1b4a2c", "#d6f28c", "#9ee05c", "#5fc04c", "#349a46");
const STALK = ramp("#2a4a1f", "#e3efa0", "#b8d56a", "#8aab4a", "#5e7e36");

const WHITE_CUTS = [0.72, 0.36, 0.02, -0.36];
const BLACK_CUTS = [0.74, 0.3, -0.18];
const GREEN_CUTS = [0.72, 0.4, 0.05, -0.3];

const pick = (tones: Tone[], k: number): Tone =>
  tones[Math.max(0, Math.min(tones.length - 1, k))];

const band = (lam: number, x: number, y: number, cuts: number[]): number => {
  const v = lam + (bayer(x, y) - 0.5) * 0.12;
  let i = 0;
  while (i < cuts.length && v < cuts[i]) i++;
  return i;
};

/** What the ray cast hands a look: the hit in the blob's frame (p) and on its own unit sphere (q). */
type Surface = {
  x: number;
  y: number;
  p: V3;
  q: V3;
  lam: number;
  flat: boolean;
};
type Look = (s: Surface) => Tone | undefined;
type Blob = {
  c: V3;
  r: V3;
  axes?: Mat;
  id: number;
  look: Look;
  /** Cuts the blob flat at this height in its frame: the pad's flat seat, a paw's flat sole. */
  top?: number;
  bottom?: number;
};

const ID = {
  torso: 1,
  head: 2,
  muzzle: 3,
  ear: 4,
  pad: 6,
  stalk: 7,
  leaf: 8,
  leg: 10,
};

const depth = new Float32Array(W * H);
const tone: (Tone | undefined)[] = new Array(W * H).fill(undefined);
const part = new Uint8Array(W * H);
const SURFACE: Surface = {
  x: 0,
  y: 0,
  p: [0, 0, 0],
  q: [0, 0, 0],
  lam: 0,
  flat: false,
};

function cast(fr: Frame, b: Blob): void {
  const ax = b.axes ?? IDENTITY;
  const C = place(fr, b.c);
  const A0 = turn(fr.m, ax[0]);
  const A1 = turn(fr.m, ax[1]);
  const A2 = turn(fr.m, ax[2]);
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
  const flatLam = dot(fr.m[2], LIGHT);
  const s = SURFACE;
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
      const root = Math.sqrt(disc);
      const t = (-qb - root) / qa;
      const i = y * W + x;
      let z = C[2] + t;
      if (z >= depth[i]) continue;
      const h0 = q0 + t * d0;
      const h1 = q1 + t * d1;
      const h2 = q2 + t * d2;
      const k0 = h0 * r0;
      const k1 = h1 * r1;
      const k2 = h2 * r2;
      let p0 = b.c[0] + ax[0][0] * k0 + ax[1][0] * k1 + ax[2][0] * k2;
      let p1 = b.c[1] + ax[0][1] * k0 + ax[1][1] * k1 + ax[2][1] * k2;
      let p2 = b.c[2] + ax[0][2] * k0 + ax[1][2] * k1 + ax[2][2] * k2;
      if (b.bottom !== undefined && p2 < b.bottom) continue;
      let flat = false;
      if (b.top !== undefined && p2 > b.top) {
        const dz = (b.top - p2) / fr.m[2][2];
        if (t + dz > (-qb + root) / qa) continue;
        z += dz;
        if (z >= depth[i]) continue;
        p0 += dz * fr.m[0][2];
        p1 += dz * fr.m[1][2];
        p2 = b.top;
        flat = true;
      }
      const g = Math.hypot(h0 / r0, h1 / r1, h2 / r2);
      s.x = x;
      s.y = y;
      s.p[0] = p0;
      s.p[1] = p1;
      s.p[2] = p2;
      s.q[0] = h0;
      s.q[1] = h1;
      s.q[2] = h2;
      s.lam = flat ? flatLam : (h0 * L0 + h1 * L1 + h2 * L2) / g;
      s.flat = flat;
      const shade = b.look(s);
      if (!shade) continue;
      depth[i] = z;
      tone[i] = shade;
      part[i] = b.id;
    }
  }
}

function tube(
  fr: Frame,
  from: V3,
  to: V3,
  r0: number,
  r1: number,
  id: number,
  look: Look,
): void {
  const run = add(to, from, -1);
  const n = Math.max(
    2,
    Math.ceil(Math.hypot(...run) / Math.max(0.5, 0.3 * Math.min(r0, r1))),
  );
  for (let k = 0; k <= n; k++) {
    const r = r0 + ((r1 - r0) * k) / n;
    cast(fr, { c: add(from, run, k / n), r: [r, r, r], id, look });
  }
}

const OUTLINE_STEPS = [-1, 1, -W, W];

// A part's outline is drawn on the pixels behind it: a pixel takes the ink of a neighbour that is nearer
// (by 2.5 px, when it is painted itself).
function outline(px: Pixels): void {
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const own = tone[i];
      let colour = own?.c;
      let nearest = own ? depth[i] - 2.5 : Infinity;
      for (const step of OUTLINE_STEPS) {
        const j = i + step;
        if (
          j < 0 ||
          j >= W * H ||
          (step === -1 && x === 0) ||
          (step === 1 && x === W - 1)
        )
          continue;
        const other = tone[j];
        if (!other || (own && part[j] === part[i]) || depth[j] >= nearest)
          continue;
        nearest = depth[j];
        colour = other.ink;
      }
      if (colour) put(px, x, y, colour);
    }
}

const fur = (black: boolean, s: Surface, bias = 0): Tone =>
  black
    ? BLACK[band(s.lam + bias, s.x, s.y, BLACK_CUTS)]
    : WHITE[band(s.lam + bias, s.x, s.y, WHITE_CUTS)];

const TORSO = { c: [-3, 0, 27.5] as V3, r: [21.5, 18.5, 16] as V3 };
const CHEST = { c: [6.5, 0, 28] as V3, r: [13, 17.8, 16.5] as V3 };
const PAD = { f: -3, a: 13.4, b: 12.6, c: 8, top: 46.8 };
const STRAP = { f: -2, half: 2.4 };
const PIVOT: V3 = [PAD.f, 0, PAD.top];

const torsoLook: Look = (s) => {
  const [f, r, u] = s.p;
  const along = Math.abs(f - STRAP.f);
  if (along < STRAP.half && u < PAD.top - 3) {
    const ring = Math.hypot(f - STRAP.f, u - 21);
    if (r > 0 && ring < 2.9)
      return ring < 1.2 ? BAMBOO[5] : BINDING[s.lam > 0.2 ? 0 : 1];
    const dim = s.lam < 0.15 ? 1 : 0;
    if (along > STRAP.half - 0.9) return BAMBOO[3 + dim];
    return BAMBOO[1 + (Math.floor(u / 2.2) & 1) + dim];
  }
  const cut =
    1.5 +
    0.2 * (u - 27.5) +
    1.3 * Math.sin(u * 0.45) +
    (bayer(s.x, s.y) - 0.5) * 1.6;
  const thigh = ((f + 14) / 7.6) ** 2 + ((u - 18.5) / 8.5) ** 2 < 1;
  return fur(f > cut || thigh, s);
};

const SKULL = { r: [14.2, 16.4, 14.2] as V3 };
const HEAD_AT: V3 = [29, 0, 27];
const PATCH = { az: 0.62, el: -0.02, tilt: 0.6, a: 0.42, b: 0.285 };

const faceLook: Look = (s) => {
  const [f, r, u] = s.p;
  const nf = f / SKULL.r[0];
  const nr = r / SKULL.r[1];
  const nu = u / SKULL.r[2];
  const len = Math.hypot(nf, nr, nu) || 1;
  const da = Math.abs(Math.atan2(nr, nf)) - PATCH.az;
  const de = Math.asin(Math.max(-1, Math.min(1, nu / len))) - PATCH.el;
  if (nf > 0) {
    const m1 = da * Math.cos(PATCH.tilt) - de * Math.sin(PATCH.tilt);
    const m2 = da * Math.sin(PATCH.tilt) + de * Math.cos(PATCH.tilt);
    if ((m1 / PATCH.a) ** 2 + (m2 / PATCH.b) ** 2 < 1) {
      if (Math.hypot(da + 0.07, de - 0.03) < 0.115) return WHITE[0];
      if (Math.hypot(da - 0.1, de + 0.1) < 0.055) return WHITE[3];
      return BLACK[band(s.lam - 0.25, s.x, s.y, BLACK_CUTS)];
    }
    if (Math.hypot((da - 0.08) / 0.2, (de + 0.46) / 0.11) < 1)
      return BLUSH[s.lam > 0.1 ? 0 : 1];
  }
  return fur(false, s);
};

const muzzleLook: Look = (s) => {
  const [qf, qr, qu] = s.q;
  if (qf > 0.2) {
    if ((qr / 0.46) ** 2 + ((qu - 0.42) / 0.26) ** 2 < 1)
      return qr < -0.1 && qu > 0.5 ? BLACK[0] : DEEP;
    const a = Math.abs(qr);
    if (a < 0.1 && qu < 0.2 && qu > -0.2) return DEEP;
    if (a > 0.08 && a < 0.5 && Math.abs(qu + 0.22 - 0.9 * (a - 0.1)) < 0.08)
      return DEEP;
  }
  return fur(false, s);
};

const earLook: Look = (s) => fur(true, s, 0.12);
const tailLook: Look = (s) => fur(false, s, -0.3);

const pawLook =
  (dim: number): Look =>
  (s) => {
    const [qf, qr, qu] = s.q;
    if (qf > 0.5 && qu > -0.1 && Math.abs(Math.abs(qr) - 0.36) < 0.07)
      return DEEP;
    return fur(true, s, dim);
  };

const padLook =
  (bob: number): Look =>
  (s) => {
    const [f, r, u] = s.p;
    if (!s.flat) {
      const down = PAD.top - u;
      if (down < 1.3) return BINDING[s.lam > 0.3 ? 1 : 2];
      if (down > 6) return BAMBOO[4];
      const slat = Math.floor((Math.atan2(r, f - PAD.f) * 11) / Math.PI) & 1;
      return pick(BAMBOO, 1 + band(s.lam, s.x, s.y, GREEN_CUTS) + slat);
    }
    const rho = Math.hypot((f - PAD.f) / (PAD.a * 0.9), r / (PAD.b * 0.9));
    if (rho > 0.87) return BINDING[0];
    if (rho > 0.78) return BAMBOO[3];
    // The lattice rides the pad's bob, or it would crawl across the seat.
    const y = s.y + bob;
    const lattice = ((s.x + y) & 3) === 0 || ((s.x - y) & 3) === 0;
    return BAMBOO[lattice ? 2 : 1];
  };

const stalkLook: Look = (s) => pick(STALK, band(s.lam, s.x, s.y, GREEN_CUTS));
const leafLook: Look = (s) => pick(LEAF, band(s.lam, s.x, s.y, GREEN_CUTS));

// turn: how far the head looks toward the viewer. drop: lowers the head seen from behind, which keeps
// the back within 12 px over the seat. sprig: the side it stands on, clear of where the rider sits.
const VIEWS: Record<
  string,
  {
    heading: [number, number];
    at: [number, number];
    turn: number;
    drop: number;
    sprig: number;
  }
> = {
  south: { heading: [0, 1], at: [54, 82], turn: 0, drop: 0, sprig: 1 },
  "south-east": {
    heading: [Math.SQRT1_2, Math.SQRT1_2],
    at: [54, 82],
    turn: 16,
    drop: 0,
    sprig: 1,
  },
  east: { heading: [1, 0], at: [54, 86], turn: 26, drop: 0, sprig: 1 },
  "north-east": {
    heading: [Math.SQRT1_2, -Math.SQRT1_2],
    at: [54, 82],
    turn: 20,
    drop: 0,
    sprig: -1,
  },
  north: { heading: [0, -1], at: [54, 82], turn: 0, drop: 2.5, sprig: -1 },
};

function groundOf(direction: string): Frame {
  const {
    heading: [fx, fy],
    at: [x, y],
  } = VIEWS[direction];
  return {
    o: [x, y, 0],
    m: [
      [fx, fy * SIN, -fy * COS],
      [-fy, fx * SIN, -fx * COS],
      [0, -COS, -SIN],
    ],
  };
}

const BOB = [0, 1, 1, 0, 1, 1];
const ROLL = 3.2 * DEG;

type Pose = {
  bob: number;
  sprig: number;
  drop: number;
  phase: number;
  ground: Frame;
  body: Frame;
  head: Frame;
  toGround: (p: V3) => V3;
};

function posed(direction: string, frame: number): Pose {
  const step = ((frame % FRAMES) + FRAMES) % FRAMES;
  const phase = step / FRAMES;
  const ground = groundOf(direction);
  const view = VIEWS[direction];
  const sway = rollBy(ROLL * Math.sin(TAU * phase));
  const lift: V3 = [0, 0, BOB[step] / COS];
  const toGround = (p: V3): V3 =>
    add(add(PIVOT, lift), turn(sway, add(p, PIVOT, -1)));
  const body: Frame = {
    o: place(ground, toGround([0, 0, 0])),
    m: compose(ground.m, sway),
  };
  const nod = Math.cos(2 * TAU * phase);
  const head: Frame = {
    o: place(body, add(HEAD_AT, [0, 0, -1.2 * nod - view.drop])),
    m: compose(
      body.m,
      compose(
        yawBy((view.turn + 4 * Math.sin(TAU * phase + 1)) * DEG),
        pitchBy((3.5 + 6 * nod) * DEG),
      ),
    ),
  };
  return {
    bob: BOB[step],
    sprig: view.sprig,
    drop: view.drop,
    phase,
    ground,
    body,
    head,
    toGround,
  };
}

const HIPS = [
  { f: 12.5, r: -10.4, front: true, step: 0 },
  { f: 12.5, r: 10.4, front: true, step: 0.5 },
  { f: -14, r: -10.8, front: false, step: 0.5 },
  { f: -14, r: 10.8, front: false, step: 0 },
];
const LIFT = 4.8;

// Stance for half the loop, a lifted swing for the other half; the diagonal pairs go half a loop apart.
function gait(phase: number, stride: number): { go: number; lift: number } {
  const p = phase - Math.floor(phase);
  if (p < 0.5) return { go: stride - 4 * stride * p, lift: 0 };
  const s = (p - 0.5) * 2;
  return {
    go: -stride + 2 * stride * s * s * (3 - 2 * s),
    lift: LIFT * Math.sin(Math.PI * s),
  };
}

function bend(h: V3, a: V3, l1: number, l2: number, pole: V3): V3 {
  const d = add(a, h, -1);
  const reach = Math.min(Math.hypot(...d), l1 + l2 - 0.05);
  const e = unit(d);
  const x = (l1 * l1 - l2 * l2 + reach * reach) / (2 * reach);
  const y = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  return add(add(h, e, x), unit(add(pole, e, -dot(pole, e))), y);
}

function legs(pose: Pose): void {
  const { ground } = pose;
  const middle = place(ground, pose.toGround([0, 0, 19]))[2];
  HIPS.forEach(({ f, r, front, step }, k) => {
    const hip = pose.toGround([f, r, 19]);
    const { go, lift } = gait(pose.phase + step, front ? 6.6 : 5.8);
    const pawF = f + (front ? 1.2 : -0.4) + go;
    const pawR = r + Math.sign(r);
    const ankle: V3 = [pawF - 1.6, pawR, 8 + lift];
    const knee = bend(hip, ankle, 8, 8, [front ? -1 : 1, 0, 0]);
    const dim = place(ground, hip)[2] > middle + 3 ? -0.4 : 0;
    const look: Look = (s) => fur(true, s, dim);
    const id = ID.leg + k;
    tube(ground, hip, knee, 7.4, 6.6, id, look);
    tube(ground, knee, ankle, 6, 5.2, id, look);
    cast(ground, {
      c: [pawF, pawR, 4.2 + lift],
      r: [6.8, 5.8, 4],
      id,
      look: pawLook(dim),
      bottom: lift + 0.4,
    });
  });
}

function bodyParts(pose: Pose): void {
  const { body, head } = pose;
  const wag = 2 * Math.sin(TAU * pose.phase + 1.7);
  cast(body, { ...TORSO, id: ID.torso, look: torsoLook });
  cast(body, { ...CHEST, id: ID.torso, look: torsoLook });
  cast(body, {
    c: [-26.5, wag, 28.5],
    r: [4.4, 4.2, 4.6],
    id: ID.torso,
    look: tailLook,
  });
  cast(head, { c: [0, 0, 0], r: SKULL.r, id: ID.head, look: faceLook });
  cast(head, {
    c: [1.8, 0, -5],
    r: [12.6, 15.2, 9.8],
    id: ID.head,
    look: faceLook,
  });
  cast(head, {
    c: [11.6, 0, -4.8],
    r: [7.4, 7.4, 6],
    id: ID.muzzle,
    look: muzzleLook,
  });
  for (const side of [-1, 1])
    cast(head, {
      c: [1.5, side * 14.6, -6],
      r: [6.2, 4.4, 4.6],
      axes: yawBy(side * -0.5),
      id: ID.head,
      look: faceLook,
    });
  const lag = 0.9 * Math.sin(2 * TAU * pose.phase);
  for (const side of [-1, 1])
    cast(head, {
      c: [-3, side * 9.4, 12 + lag + pose.drop * 1.5],
      r: [4.4, 5.8, 6],
      axes: compose(yawBy(side * 0.45), rollBy(-side * 0.35)),
      id: ID.ear,
      look: earLook,
    });
}

const SPRIG = {
  base: [-11.5, 6.8, PAD.top - 0.5] as V3,
  dir: unit([-0.1, 0.28, 0.95]),
  len: 13,
};
const mirrored = (v: V3, side: number): V3 => [v[0], v[1] * side, v[2]];
const spray = (az: number, el: number): V3 => [
  Math.cos(el * DEG) * Math.cos(az * DEG),
  Math.cos(el * DEG) * Math.sin(az * DEG),
  Math.sin(el * DEG),
];
const LEAVES: [t: number, dir: V3, len: number][] = [
  [1, spray(20, 48), 9],
  [1, spray(140, 48), 9],
  [1, spray(260, 48), 9],
  [0.55, spray(80, 26), 7.5],
  [0.55, spray(200, 26), 7.5],
  [0.55, spray(320, 26), 7.5],
];

function saddle(pose: Pose): void {
  const { body } = pose;
  cast(body, {
    c: [PAD.f, 0, PAD.top - PAD.c * 0.44],
    r: [PAD.a, PAD.b, PAD.c],
    id: ID.pad,
    look: padLook(pose.bob),
    top: PAD.top,
  });
  const base = mirrored(SPRIG.base, pose.sprig);
  const dir = mirrored(SPRIG.dir, pose.sprig);
  const len = SPRIG.len;
  tube(body, base, add(base, dir, len), 1.4, 1.1, ID.stalk, stalkLook);
  for (const t of [0.3, 0.55, 0.8])
    cast(body, {
      c: add(base, dir, len * t),
      r: [2, 2, 1.7],
      id: ID.stalk,
      look: stalkLook,
    });
  LEAVES.forEach(([t, d, length], k) => {
    const flutter = yawBy(7 * DEG * Math.sin(2 * TAU * pose.phase + k));
    const along = unit(turn(flutter, mirrored(d, pose.sprig)));
    const across = unit(cross([0, 0, 1], along));
    cast(body, {
      c: add(add(base, dir, len * t), along, length / 2),
      r: [length / 2, 2.1, 0.7],
      axes: [along, across, cross(along, across)],
      id: ID.leaf,
      look: leafLook,
    });
  });
}

function paint(px: Pixels, direction: string, frame: number): void {
  const pose = posed(direction, frame);
  depth.fill(Infinity);
  tone.fill(undefined);
  part.fill(0);
  legs(pose);
  bodyParts(pose);
  saddle(pose);
  outline(px);
}

const seatOf = (direction: string): [number, number] => {
  const v = place(groundOf(direction), [PAD.f, 0, PAD.top]);
  return [Math.floor(v[0]), Math.floor(v[1])];
};

export const BAMBOO_PANDA: DrawnMount = {
  id: "own-bamboo-panda",
  name: "Bamboo Panda",
  description:
    "แพนด้ายักษ์ตัวอ้วนกลมเดินสี่ขา ขนสีขาวมีเงาเทาอมฟ้า หูกลม วงตา ขาทั้งสี่ และแถบพาดไหล่เป็นสีดำ ตาเป็นประกาย แก้มชมพูระเรื่อ ก้าวเดินเนิบ ๆ ตัวโยกไปมาเบา ๆ พร้อมพยักหน้าเป็นจังหวะ บนหลังมีเบาะนั่งสานไม้ไผ่สีเขียวรัดด้วยสายสานรอบท้อง และเสียบกิ่งไผ่เล็ก ๆ ไว้",
  cell: CELL,
  seat: Object.fromEntries(
    RIDING.directions.map((d): [string, [number, number]] => [d, seatOf(d)]),
  ),
  paint,
};
