import type { DrawnMount } from "../mounts";
import { put, rgb, type Pixels, type Rgb } from "../pixels";

const CELL = { w: 104, h: 92 };
const W = CELL.w;
const H = CELL.h;
const AREA = W * H;
const FRAMES = 6;
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
// The game looks down on its world at about 25 degrees.
const SIN = 0.42;
const COS = Math.sqrt(1 - SIN * SIN);
const STEP = 0.5;

type V3 = [number, number, number];
type Xy = [number, number];

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;
const smooth = (t: number) => {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};
const unit = (x: number, y: number, z: number): V3 => {
  const l = Math.sqrt(x * x + y * y + z * z) || 1;
  return [x / l, y / l, z / l];
};
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

const PALETTE: Rgb[] = [[0, 0, 0]];
const FAMILY: number[] = [0];
const tones = (...hex: string[]): number[] => {
  const family = FAMILY[FAMILY.length - 1] + 1;
  return hex.map((h) => {
    FAMILY.push(family);
    return PALETTE.push(rgb(h)) - 1;
  });
};
const BLUE = tones("#e2f5ff", "#b4e1fb", "#86c8f2", "#5fa6e3", "#4580c8");
const CREAM = tones("#fffdf3", "#faefd5", "#ebdab9", "#cdb598");
const CLOUD = tones("#ffffff", "#eaf1ff", "#c9d9fa", "#a3b8ec");
const GOLD = tones("#fff3b4", "#ffd763", "#e7a638", "#b06f22");
const PINK = tones("#ffc2d2", "#f68cac");
const EYE = tones("#1b2760", "#ffffff", "#5170c4");
const [LINE_BLUE, LINE_PAD, LINE_CLOUD] = tones(
  "#26498f",
  "#7a4a22",
  "#8da3dd",
);

// The key light from the upper left and the viewer's side, given in the camera's frame.
const LIGHT = ((): V3 => {
  const [x, up, toward] = [-0.5, 0.55, 0.67];
  return unit(x, up * SIN - toward * COS, up * COS + toward * SIN);
})();

const tone = (lit: number) =>
  lit > 0.86 ? 0 : lit > 0.52 ? 1 : lit > 0.1 ? 2 : lit > -0.3 ? 3 : 4;
const creamTone = (lit: number) =>
  lit > 0.6 ? 0 : lit > 0.15 ? 1 : lit > -0.35 ? 2 : 3;
const padTone = (lit: number) =>
  lit > 0.84 ? 0 : lit > 0.3 ? 1 : lit > -0.2 ? 2 : 3;
const goldTone = (lit: number) =>
  lit > 0.7 ? 0 : lit > 0.2 ? 1 : lit > -0.3 ? 2 : 3;
const cloudTone = (lit: number) =>
  lit > 0.62 ? 0 : lit > 0.25 ? 1 : lit > -0.1 ? 2 : 3;

const PART = { body: 1, pad: 2, fluke: 3, flipper: 4, cloud: 5 };
const LINE = [0, LINE_BLUE, LINE_PAD, LINE_BLUE, LINE_BLUE, LINE_CLOUD];
const GAP = [0, 1, 0, 1.5, 1.5, 1];
const SELF_GAP = 6;
const MAT = {
  skin: 0,
  belly: 1,
  eye: 2,
  eyeLow: 3,
  blush: 4,
  pad: 5,
  rim: 6,
};

const BODY = {
  len: 56,
  cap: 3,
  girth: 21,
  hold: 31,
  neck: 46,
  ry: 18,
  rt: 17.5,
  rb: 16.5,
  stalk: 5.4,
  tip: 3.2,
};
const END = BODY.len + BODY.cap;
const SEAT_S = 24;
const TAIL = BODY.len - SEAT_S;
const PAD = { a: 12, b: 14, rim: 1.1, top: 1.8, dome: 0.9 };

function radius(s: number, r: number): number {
  const { len, cap, girth, hold, neck, stalk, tip } = BODY;
  if (s >= len) {
    const t = Math.min(1, (s - len) / cap);
    return tip * Math.sqrt(1 - t * t);
  }
  if (s <= girth) {
    const u = (girth - s) / girth;
    return r * Math.sqrt(Math.max(0, 1 - u * u));
  }
  if (s <= hold) return r;
  if (s <= neck)
    return (
      stalk +
      (r - stalk) *
        (0.5 + 0.5 * Math.cos((Math.PI * (s - hold)) / (neck - hold)))
    );
  return stalk + (tip - stalk) * smooth((s - neck) / (len - neck));
}

/** How far toward the edge of the saddle (1 at its rim) a point of the back is, or Infinity off it. */
function padRho(s: number, th: number): number {
  if (Math.sin(th) < 0.35 || Math.abs(s - SEAT_S) > PAD.a) return Infinity;
  const lat = radius(s, BODY.ry) * Math.cos(th);
  return Math.hypot((s - SEAT_S) / PAD.a, lat / PAD.b);
}
/** How far the saddle's bevelled, gently domed cushion stands off the back at rho. */
const padLift = (rho: number) =>
  rho >= 1
    ? 0
    : PAD.top * smooth(((1 - rho) * 8) / 0.9) + PAD.dome * (1 - rho * rho);
const AXIS_Z = -(radius(SEAT_S, BODY.rt) + padLift(0));

/** A cross-section's sideways and upward offset from the spine at s and angle th (0 is the left, a quarter turn up), and the saddle's rho there. */
function shape(s: number, th: number): V3 {
  const rho = padRho(s, th);
  const l = padLift(rho);
  const sn = Math.sin(th);
  return [
    (radius(s, BODY.ry) + l) * Math.cos(th),
    (radius(s, sn > 0 ? BODY.rt : BODY.rb) + l) * sn,
    rho,
  ];
}
const rest = (s: number, th: number): V3 => {
  const [v, w] = shape(s, th);
  return [-s, v, w];
};

function normalAt(s: number, th: number): V3 {
  const r = Math.max(
    1,
    radius(s, BODY.ry),
    radius(s, BODY.rt),
    radius(s, BODY.rb),
  );
  const dt = 0.3 / r;
  const n = cross(
    sub(rest(Math.min(END, s + 0.04), th), rest(Math.max(0, s - 0.04), th)),
    sub(rest(s, th + dt), rest(s, th - dt)),
  );
  return dot(n, n) < 1e-9 ? [s < END / 2 ? 1 : -1, 0, 0] : unit(...n);
}

/** An oval laid on the skin: its centre, the way across and the way up the skin, and its two radii. */
type Spot = { c: V3; across: V3; up: V3; n: V3; rx: number; ry: number };
function spot(s: number, th: number, rx: number, ry: number): Spot {
  const n = normalAt(s, th);
  const across = unit(...cross([0, 0, 1], n));
  return { c: rest(s, th), across, up: cross(n, across), n, rx, ry };
}
/** How far from the middle of the spot a point of the skin is, 1 at its edge, and how far up from it (in its radii). */
function inSpot(p: V3, k: Spot): [number, number] {
  const d = sub(p, k.c);
  if (Math.abs(dot(d, k.n)) > 2.5) return [Infinity, 0];
  const x = dot(d, k.across) / k.rx;
  const y = dot(d, k.up) / k.ry;
  return [Math.hypot(x, y), y];
}
const EYE_S = 5;
const EYES = [28, 152].map((d) => spot(EYE_S, d * DEG, 2.6, 3.4));
const CHEEKS = [4, 176].map((d) => spot(9, d * DEG, 3.2, 2));

const MOUTH_END = 12.5;
const smile = (s: number) => (-6 + 20 * smooth((s - 5) / 7)) * DEG;
function bellyEdge(s: number): number {
  const from = smile(MOUTH_END);
  const a =
    s < MOUTH_END
      ? smile(s)
      : from + (-20 * DEG - from) * smooth((s - MOUTH_END) / 10);
  return Math.sin(a) - 1.4 * smooth((s - 40) / 10);
}
// The belly's pleats: the angle each runs at and how far back it reaches.
const GROOVES: [number, number][] = [
  [-90, 40],
  [-66, 36],
  [-114, 36],
  [-42, 32],
  [-138, 32],
  [-24, 26],
  [-156, 26],
];

function material(s: number, th: number, p: V3, rho: number): number {
  if (rho < 1) return rho > 1 - PAD.rim / 8 ? MAT.rim : MAT.pad;
  for (const e of EYES) {
    const [d, y] = inSpot(p, e);
    if (d < 1) return y < -0.3 ? MAT.eyeLow : MAT.eye;
  }
  for (const c of CHEEKS) if (inSpot(p, c)[0] < 1) return MAT.blush;
  return Math.sin(th) >= bellyEdge(s) ? MAT.skin : MAT.belly;
}

const body = (() => {
  const S: number[] = [];
  const start: number[] = [];
  const A: number[] = [];
  const B: number[] = [];
  const NU: number[] = [];
  const NV: number[] = [];
  const NW: number[] = [];
  const M: number[] = [];
  let s = 0;
  for (;;) {
    S.push(s);
    start.push(A.length);
    const r = Math.max(
      radius(s, BODY.ry),
      radius(s, BODY.rt),
      radius(s, BODY.rb),
    );
    const pad = Math.abs(s - SEAT_S) < PAD.a ? PAD.top + PAD.dome : 0;
    const n = Math.max(8, Math.ceil((TAU * (r + pad + 0.5)) / STEP));
    for (let k = 0; k < n; k++) {
      const th = (k / n) * TAU;
      const [v, w, rho] = shape(s, th);
      const [ux, uy, uz] = normalAt(s, th);
      A.push(v);
      B.push(w);
      NU.push(ux);
      NV.push(uy);
      NW.push(uz);
      M.push(material(s, th, [-s, v, w], rho));
    }
    if (s >= END) break;
    const h = 0.01;
    const lo = Math.max(0, s - h);
    const hi = Math.min(END, s + h);
    const slope =
      Math.max(
        Math.abs(radius(hi, BODY.ry) - radius(lo, BODY.ry)),
        Math.abs(radius(hi, BODY.rt) - radius(lo, BODY.rt)),
      ) /
      (hi - lo);
    s = Math.min(END, s + Math.max(0.03, STEP / Math.sqrt(1 + slope * slope)));
  }
  start.push(A.length);
  return {
    rings: S.length,
    s: Float32Array.from(S),
    start: Int32Array.from(start),
    a: Float32Array.from(A),
    b: Float32Array.from(B),
    nu: Float32Array.from(NU),
    nv: Float32Array.from(NV),
    nw: Float32Array.from(NW),
    mat: Uint8Array.from(M),
  };
})();

const HEAD_UP = 2.5;
const CURL_FROM = 32;
const RISE = 3.2;
const SWAY = 1.6;
const WAVE = TAU / 90;

// How far the tail swings aside, rises and rolls in each view: tucked behind the body from the front, whole from behind.
type TailPose = { swing: number; lift: number; roll: number; pitch: number };
const TAIL_POSES: Record<string, TailPose> = {
  south: { swing: 2, lift: -14, roll: 0, pitch: -8 },
  "south-east": { swing: 12, lift: 5, roll: 10, pitch: 25 },
  east: { swing: 10, lift: 7, roll: 28, pitch: 10 },
  "north-east": { swing: 10, lift: 5, roll: 30, pitch: -30 },
  north: { swing: 0, lift: 8, roll: 3, pitch: 58 },
};
let POSE = TAIL_POSES.south;

/** How far the spine at s lies sideways and up from its rest line at the loop's phase ph. */
function bend(s: number, ph: number): Xy {
  const head = Math.max(0, (SEAT_S - s) / SEAT_S);
  const tail = Math.max(0, (s - SEAT_S) / TAIL);
  const curl = Math.max(0, (s - CURL_FROM) / (BODY.len - CURL_FROM));
  const w = ph - WAVE * (s - SEAT_S);
  return [
    POSE.swing * tail * tail + SWAY * tail ** 1.5 * Math.sin(w - 1.4),
    HEAD_UP * head ** 1.6 +
      POSE.lift * curl ** 1.8 +
      (1.6 * head * head + RISE * tail ** 1.7) * Math.sin(w),
  ];
}

const DEPTH = new Float32Array(AREA);
const OWNER = new Uint8Array(AREA);
const INK = new Uint8Array(AREA);
const OUT = new Uint8Array(AREA);

let HX = 1;
let HY = 0;
let OX = 52;
let OY = 40;

/** Claims the pixel a point of the whale's own frame (forward, left, up) lands on, if nothing nearer is there. */
function claim(u: number, v: number, w: number, part: number): number {
  const X = u * HX - v * HY;
  const Y = u * HY + v * HX;
  const sx = Math.round(OX + X);
  const sy = Math.round(OY - (Y * SIN + w * COS));
  if (sx < 0 || sy < 0 || sx >= W || sy >= H) return -1;
  const k = sy * W + sx;
  const d = Y * COS - w * SIN;
  if (d >= DEPTH[k]) return -1;
  DEPTH[k] = d;
  OWNER[k] = part;
  return k;
}

let LIT = 0;
/** Turns a normal of the whale's frame into the light on it; false when it faces away from the camera. */
function shade(nu: number, nv: number, nw: number, twoSided: boolean): boolean {
  let X = nu * HX - nv * HY;
  let Y = nu * HY + nv * HX;
  let Z = nw;
  const l = Math.sqrt(X * X + Y * Y + Z * Z) || 1;
  if ((Y * COS - Z * SIN) / l > 0.2) {
    if (!twoSided) return false;
    X = -X;
    Y = -Y;
    Z = -Z;
  }
  LIT = (X * LIGHT[0] + Y * LIGHT[1] + Z * LIGHT[2]) / l;
  return true;
}

const BOB = [1, 1, 0, -1, -1, 0];

function inkOf(mat: number): number {
  switch (mat) {
    case MAT.belly:
      return CREAM[creamTone(LIT)];
    case MAT.eye:
      return EYE[0];
    case MAT.eyeLow:
      return EYE[2];
    case MAT.blush:
      return PINK[LIT > 0.3 ? 0 : 1];
    case MAT.pad:
      return CREAM[padTone(LIT)];
    case MAT.rim:
      return GOLD[goldTone(LIT)];
    default:
      return BLUE[tone(LIT)];
  }
}

function paintBody(ph: number, bob: number): void {
  const { rings, s: S, start, a: A, b: B, nu: NU, nv: NV, nw: NW, mat } = body;
  for (let r = 0; r < rings; r++) {
    const s = S[r];
    const [y, z] = bend(s, ph);
    const [y0, z0] = bend(s - 0.5, ph);
    const [y1, z1] = bend(s + 0.5, ph);
    const py = y1 - y0;
    const pz = z1 - z0;
    const u = SEAT_S - s;
    for (let k = start[r]; k < start[r + 1]; k++) {
      const nv = NV[k];
      const nw = NW[k];
      if (!shade(NU[k] + py * nv + pz * nw, nv, nw, false)) continue;
      const m = mat[k];
      const q = claim(
        u,
        A[k] + y,
        AXIS_Z + z + B[k] + bob,
        m === MAT.pad || m === MAT.rim ? PART.pad : PART.body,
      );
      if (q >= 0) INK[q] = inkOf(m);
    }
  }
}

const FLUKE = { lobe: 6.4, long: 8.6, short: 4.5, tilt: 28 * DEG, cup: 0.026 };
function inFluke(a: number, b: number): boolean {
  const x = a - 5;
  const y = Math.abs(b) - FLUKE.lobe;
  const p = x * Math.sin(FLUKE.tilt) + y * Math.cos(FLUKE.tilt);
  const q = -x * Math.cos(FLUKE.tilt) + y * Math.sin(FLUKE.tilt);
  if ((p / FLUKE.long) ** 2 + (q / FLUKE.short) ** 2 < 1) return true;
  return ((a - 1) / 4.2) ** 2 + (b / 5.2) ** 2 < 1;
}
const fluke = (() => {
  const a: number[] = [];
  const b: number[] = [];
  for (let i = -4; i <= 13; i += 0.4)
    for (let j = -18; j <= 18; j += 0.4)
      if (inFluke(i, j)) {
        a.push(i);
        b.push(j);
      }
  return { n: a.length, a: Float32Array.from(a), b: Float32Array.from(b) };
})();

function paintFluke(ph: number, bob: number): void {
  const [y, z] = bend(BODY.len, ph);
  const [y0, z0] = bend(BODY.len - 0.5, ph);
  const [y1, z1] = bend(BODY.len + 0.5, ph);
  const yp = y1 - y0;
  const zp = z1 - z0;
  const lag = ph - WAVE * TAIL - 1;
  const g =
    0.5 * Math.atan2(zp, Math.sqrt(1 + yp * yp)) +
    POSE.pitch * DEG +
    16 * DEG * Math.sin(lag);
  const t = Math.atan(yp);
  const r = POSE.roll * (1 + 0.45 * Math.sin(lag - 0.8)) * DEG;
  const [cg, sg, ct, st, cr, sr] = [
    Math.cos(g),
    Math.sin(g),
    Math.cos(t),
    Math.sin(t),
    Math.cos(r),
    Math.sin(r),
  ];
  const au = -cg * ct;
  const av = cg * st;
  const aw = sg;
  const bu = st * cr + ct * sg * sr;
  const bv = ct * cr - st * sg * sr;
  const bw = cg * sr;
  const nu = -st * sr + ct * sg * cr;
  const nv = -ct * sr - st * sg * cr;
  const nw = cg * cr;
  const eu = SEAT_S - BODY.len;
  const ew = AXIS_Z + z + bob;
  for (let k = 0; k < fluke.n; k++) {
    const a = fluke.a[k];
    const b = fluke.b[k];
    const c = FLUKE.cup * b * b;
    const slope = 2 * FLUKE.cup * b;
    if (!shade(nu - slope * bu, nv - slope * bv, nw - slope * bw, true))
      continue;
    const q = claim(
      eu + a * au + b * bu + c * nu,
      y + a * av + b * bv + c * nv,
      ew + a * aw + b * bw + c * nw,
      PART.fluke,
    );
    if (q >= 0) INK[q] = BLUE[tone(LIT + 0.05)];
  }
}

const FLIPPER = { s: 22, th: -30 * DEG, len: 11, wide: 3.7 };
function paintFlippers(ph: number, bob: number): void {
  for (const side of [1, -1]) {
    const th = side > 0 ? FLIPPER.th : Math.PI - FLIPPER.th;
    const [v, w] = shape(FLIPPER.s, th);
    const [y, z] = bend(FLIPPER.s, ph);
    let u = SEAT_S - FLIPPER.s;
    let pv = v + y;
    let pw = AXIS_Z + z + w + bob;
    const n = Math.round(FLIPPER.len / 0.4);
    for (let i = 0; i <= n; i++) {
      const x = i / n;
      const el = (25 + 22 * Math.sin(ph + 0.8 - 1.2 * x)) * DEG;
      const sw = 42 * DEG;
      const du = -Math.sin(sw) * Math.cos(el);
      const dv = side * Math.cos(sw) * Math.cos(el);
      const dw = -Math.sin(el);
      if (i > 0) {
        u += du * 0.4;
        pv += dv * 0.4;
        pw += dw * 0.4;
      }
      const hw =
        FLIPPER.wide *
        (x < 0.35
          ? 0.45 + 0.55 * Math.sin((x / 0.35) * (Math.PI / 2))
          : Math.sqrt(Math.max(0, 1 - ((x - 0.35) / 0.65) ** 2)));
      const [cu, cv] = unit(dv, -du, 0);
      const [nu, nv, nw] = unit(-dw * cv, dw * cu, du * cv - dv * cu);
      for (let c = -hw; c <= hw + 1e-6; c += 0.4) {
        if (!shade(nu, nv, nw, true)) continue;
        const q = claim(u + c * cu, pv + c * cv, pw, PART.flipper);
        if (q >= 0) INK[q] = BLUE[clamp(tone(LIT) + 1, 0, 4)];
      }
    }
  }
}

const BARS = 4;
const BANK = { span: 76, centre: -4 };
const GROUND = AXIS_Z - 27;
// One bar of cloud across the whale's path: [along, across, radius along, radius across, height, lift].
const CLOUDS: [number, number, number, number, number, number][] = [
  [0, 0, 13, 17, 5.4, 0],
  [3, -9, 8, 8, 5.4, 2.6],
  [-3, 9, 8.5, 8.5, 5.8, 2.4],
  [0, 0, 10, 10, 6.4, 3.2],
];

function eachPuff(
  f: number,
  visit: (
    u: number,
    v: number,
    w: number,
    ru: number,
    rv: number,
    rz: number,
  ) => void,
): void {
  for (let i = 0; i < BARS; i++) {
    const tau = (((i / BARS + f / (FRAMES * BARS)) % 1) + 1) % 1;
    const grow = Math.sin(Math.PI * tau) ** 0.6;
    if (grow < 0.3) continue;
    const u = BANK.centre + BANK.span / 2 - BANK.span * tau;
    CLOUDS.forEach(([along, across, ru, rv, rz, lift], j) => {
      const drift = 0.7 * Math.sin(TAU * BARS * tau + 1.3 * j);
      visit(
        u + along * grow,
        across * grow,
        GROUND + drift + (rz + lift) * grow,
        ru * grow,
        rv * grow,
        rz * grow,
      );
    });
  }
}

/** Casts the view ray of each pixel near an ellipsoid of cloud that lies along the whale's frame. */
function puff(
  cu: number,
  cv: number,
  cw: number,
  ru: number,
  rv: number,
  rz: number,
): void {
  const sx = OX + cu * HX - cv * HY;
  const sy = OY - ((cu * HY + cv * HX) * SIN + cw * COS);
  const reach = Math.ceil(Math.max(ru, rv) + rz);
  const x0 = Math.round(sx);
  const y0 = Math.round(sy);
  const a =
    (COS * HY) ** 2 / (ru * ru) +
    (COS * HX) ** 2 / (rv * rv) +
    SIN ** 2 / (rz * rz);
  for (let py = y0 - reach; py <= y0 + reach; py++)
    for (let px = x0 - reach; px <= x0 + reach; px++) {
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      const X = px - OX;
      const m = OY - py;
      const du = X * HX + m * SIN * HY - cu;
      const dv = -X * HY + m * SIN * HX - cv;
      const dw = m * COS - cw;
      const b =
        (COS * HY * du) / (ru * ru) +
        (COS * HX * dv) / (rv * rv) -
        (SIN * dw) / (rz * rz);
      const c =
        (du * du) / (ru * ru) +
        (dv * dv) / (rv * rv) +
        (dw * dw) / (rz * rz) -
        1;
      const disc = b * b - a * c;
      if (disc < 0) continue;
      const t = (-b - Math.sqrt(disc)) / a;
      const k = py * W + px;
      if (t >= DEPTH[k]) continue;
      DEPTH[k] = t;
      OWNER[k] = PART.cloud;
      shade(
        (du + t * COS * HY) / (ru * ru),
        (dv + t * COS * HX) / (rv * rv),
        (dw - t * SIN) / (rz * rz),
        true,
      );
      INK[k] = CLOUD[cloudTone(LIT)];
    }
}

/** Marks a one-pixel line along the skin, from s0 to s1 at the angle th(s), wherever that skin is in view. */
function crease(
  th: (s: number) => number,
  s0: number,
  s1: number,
  ph: number,
  bob: number,
  mark: (k: number) => void,
): void {
  let prev: V3 | undefined;
  for (let s = s0; s <= s1; s += 0.25) {
    const [v, w] = shape(s, th(s));
    const [y, z] = bend(s, ph);
    const u = SEAT_S - s;
    const wy = v + y;
    const wz = AXIS_Z + z + w + bob;
    const Y = u * HY + wy * HX;
    const cur: V3 = [
      OX + u * HX - wy * HY,
      OY - (Y * SIN + wz * COS),
      Y * COS - wz * SIN,
    ];
    if (prev) {
      const n =
        Math.ceil(
          Math.max(Math.abs(cur[0] - prev[0]), Math.abs(cur[1] - prev[1])) * 2,
        ) || 1;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const px = Math.round(prev[0] + (cur[0] - prev[0]) * t);
        const py = Math.round(prev[1] + (cur[1] - prev[1]) * t);
        if (px < 0 || py < 0 || px >= W || py >= H) continue;
        const k = py * W + px;
        if (
          OWNER[k] === PART.body &&
          Math.abs(DEPTH[k] - (prev[2] + (cur[2] - prev[2]) * t)) < 2.5
        )
          mark(k);
      }
    }
    prev = cur;
  }
}

function paintFace(ph: number, bob: number): void {
  for (const side of [0, 1])
    crease(
      (s) => (side ? Math.PI - smile(s) : smile(s)),
      0.3,
      MOUTH_END,
      ph,
      bob,
      (k) => {
        INK[k] = LINE_BLUE;
      },
    );
  for (const [deg, to] of GROOVES)
    crease(
      () => deg * DEG,
      4,
      to,
      ph,
      bob,
      (k) => {
        const t = INK[k] - CREAM[0];
        if (t >= 0 && t < 3) INK[k] = CREAM[3];
      },
    );
}

/** A white glint on the upper left of each eye as it shows, found among its drawn pixels. */
function paintGlints(ph: number, bob: number): void {
  const [y, z] = bend(EYE_S, ph);
  for (const {
    c: [x, v, w],
  } of EYES) {
    const Y = (SEAT_S + x) * HY + (v + y) * HX;
    const cx = Math.round(OX + (SEAT_S + x) * HX - (v + y) * HY);
    const cy = Math.round(OY - (Y * SIN + (AXIS_Z + z + w + bob) * COS));
    const dark: number[] = [];
    for (let py = Math.max(0, cy - 5); py <= Math.min(H - 1, cy + 5); py++)
      for (let px = Math.max(0, cx - 5); px <= Math.min(W - 1, cx + 5); px++)
        if (INK[py * W + px] === EYE[0]) dark.push(py * W + px);
    if (dark.length < 4) continue;
    const mx = dark.reduce((sum, k) => sum + (k % W), 0) / dark.length - 0.8;
    const my =
      dark.reduce((sum, k) => sum + Math.floor(k / W), 0) / dark.length - 1.2;
    const near = (k: number) =>
      ((k % W) - mx) ** 2 + (Math.floor(k / W) - my) ** 2;
    INK[dark.reduce((a, k) => (near(k) < near(a) ? k : a))] = EYE[1];
  }
}

function fillHoles(): void {
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const k = y * W + x;
      if (OWNER[k]) continue;
      let count = 0;
      let near = -1;
      for (const n of [k - 1, k + 1, k - W, k + W]) {
        if (!OWNER[n]) continue;
        count++;
        if (near < 0 || DEPTH[n] < DEPTH[near]) near = n;
      }
      if (count < 3) continue;
      OWNER[k] = OWNER[near];
      INK[k] = INK[near];
      DEPTH[k] = DEPTH[near];
    }
}

const isDetail = (ink: number) =>
  ink === EYE[0] || ink === EYE[1] || ink === EYE[2] || ink === LINE_BLUE;

function despeckle(): void {
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const k = y * W + x;
      const p = OWNER[k];
      if (!p || isDetail(INK[k])) continue;
      const f = FAMILY[INK[k]];
      let same = 0;
      let alike = 0;
      let pick = -1;
      let best = 0;
      for (const n of [k - 1, k + 1, k - W, k + W]) {
        if (OWNER[n] !== p) continue;
        same++;
        const g = FAMILY[INK[n]];
        if (g === f) alike++;
        let votes = 0;
        for (const m of [k - 1, k + 1, k - W, k + W])
          if (OWNER[m] === p && FAMILY[INK[m]] === g) votes++;
        if (votes > best) {
          best = votes;
          pick = n;
        }
      }
      if (same >= 3 && !alike && pick >= 0) INK[k] = INK[pick];
    }
}

function outline(): void {
  OUT.set(INK);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const k = y * W + x;
      const p = OWNER[k];
      let best = -1;
      for (let n = 0; n < 4; n++) {
        const nx = n === 0 ? x - 1 : n === 1 ? x + 1 : x;
        const ny = n === 2 ? y - 1 : n === 3 ? y + 1 : y;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        const q = OWNER[j];
        if (!q) continue;
        let edge: boolean;
        if (!p) edge = true;
        else if (q === p)
          edge = p !== PART.cloud && DEPTH[j] < DEPTH[k] - SELF_GAP;
        else if (q === PART.pad && p === PART.body)
          edge = DEPTH[k] > DEPTH[j] - 8;
        else if (p === PART.pad && q === PART.body)
          edge = DEPTH[j] < DEPTH[k] - 8;
        else edge = DEPTH[j] < DEPTH[k] - Math.min(GAP[p], GAP[q]);
        if (edge && (best < 0 || DEPTH[j] < DEPTH[best])) best = j;
      }
      if (best >= 0) OUT[k] = LINE[OWNER[best]];
    }
}

const R2 = Math.SQRT1_2;
const HEADINGS: Record<string, Xy> = {
  south: [0, -1],
  "south-east": [R2, -R2],
  east: [1, 0],
  "north-east": [R2, R2],
  north: [0, 1],
};
const ORIGIN_X: Record<string, number> = {
  south: 52,
  "south-east": 55,
  east: 62,
  "north-east": 55,
  north: 52,
};

/** The row for the seat that stands the loop's lowest cloud on the row above the cell's two empty ones. */
function originY([hx, hy]: Xy): number {
  let low = 0;
  for (let f = 0; f < FRAMES; f++)
    eachPuff(f, (u, v, w, ru, rv, rz) => {
      const reach = Math.sqrt(
        (SIN * ru * hy) ** 2 + (SIN * rv * hx) ** 2 + (COS * rz) ** 2,
      );
      low = Math.max(low, -((u * hy + v * hx) * SIN + w * COS) + reach);
    });
  return H - 4 - Math.floor(low);
}

const VIEWS: Record<string, { heading: Xy; origin: Xy }> = Object.fromEntries(
  Object.entries(HEADINGS).map(([d, heading]) => [
    d,
    { heading, origin: [ORIGIN_X[d], originY(heading)] },
  ]),
);

function paint(px: Pixels, direction: string, frame: number): void {
  const view = VIEWS[direction] ?? VIEWS.south;
  [HX, HY] = view.heading;
  [OX, OY] = view.origin;
  POSE = TAIL_POSES[direction] ?? TAIL_POSES.south;
  const f = ((frame % FRAMES) + FRAMES) % FRAMES;
  const ph = (f / FRAMES) * TAU;
  DEPTH.fill(Infinity);
  OWNER.fill(0);
  INK.fill(0);
  eachPuff(f, puff);
  paintBody(ph, BOB[f]);
  paintFlippers(ph, BOB[f]);
  paintFluke(ph, BOB[f]);
  paintFace(ph, BOB[f]);
  paintGlints(ph, BOB[f]);
  fillHoles();
  despeckle();
  outline();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = OUT[y * W + x];
      if (c) put(px, x, y, PALETTE[c]);
    }
}

// A little under the saddle's middle, so the back rises above the seat in every frame.
const SEAT_DROP = 2;

export const CLOUD_WHALE: DrawnMount = {
  id: "own-cloud-whale",
  name: "Cloud Whale",
  description:
    "วาฬตัวกลมป้อมสีฟ้าอ่อนว่ายอยู่กลางอากาศ ท้องสีครีมมีร่องเป็นริ้ว ตากลมโตแก้มสีชมพู ครีบข้างเล็กจิ๋วพายไปมา หางบานกระพือขึ้นลงตามจังหวะว่าย มีก้อนเมฆสีขาวฟูลอยผ่านใต้ท้อง บนหลังมีเบาะสีครีมขลิบทอง",
  cell: CELL,
  seat: Object.fromEntries(
    Object.entries(VIEWS).map(([d, v]) => [
      d,
      [v.origin[0], v.origin[1] + SEAT_DROP],
    ]),
  ) as Record<string, [number, number]>,
  paint,
};
