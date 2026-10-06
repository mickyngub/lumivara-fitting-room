import type { DrawnMount } from "../mounts";
import { put, rgb, type Pixels, type Rgb } from "../pixels";

const CELL = { w: 112, h: 90 };
const W = CELL.w;
const H = CELL.h;
const N_PX = W * H;
const FRAMES = 6;
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
// Looks down at 30 degrees, a little steeper than the game, the way koi are best seen.
const SIN = 0.5;
const COS = Math.sqrt(1 - SIN * SIN);
const STEP = 0.42;

const PALETTE: Rgb[] = [[0, 0, 0]];
const FAMILY: number[] = [0];
const tones = (...hex: string[]): number[] => {
  const family = FAMILY[FAMILY.length - 1] + 1;
  return hex.map((h) => {
    FAMILY.push(family);
    return PALETTE.push(rgb(h)) - 1;
  });
};
const SKIN = tones(
  "#ffffff",
  "#fdf8f6",
  "#f3e9ec",
  "#dfd0dc",
  "#bba9c2",
  "#8a7894",
);
const PINK = tones(
  "#ffd6e2",
  "#ff9fbb",
  "#f7739a",
  "#de5283",
  "#b13a69",
  "#7d2850",
);
const FIN = tones("#ffffff", "#fff0f4", "#fbdbe5", "#efbfd0", "#d39db5");
const TIP = tones("#ffd9e4", "#ffaac2", "#f784a4", "#df6890", "#b04c75");
const CLOTH = tones("#7083d8", "#4a5bb8", "#35428f", "#262f6b", "#1a1f4a");
const GOLD = tones("#fff7c4", "#ffd867", "#eaa934", "#b37221");
const EYE = tones("#ffffff", "#c45a50", "#7c2533", "#230d19");
const LIP = tones("#f5a0b7", "#c9567a");
const [INK_BODY, INK_FIN, INK_CLOTH, INK_GOLD] = tones(
  "#3a1830",
  "#4c1d3c",
  "#151739",
  "#5c3611",
);

const LIGHT = (() => {
  const x = -0.55;
  const y = 0.72 * SIN - 0.42 * COS;
  const z = 0.72 * COS + 0.42 * SIN;
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
})();
const HALF = (() => {
  const x = LIGHT[0];
  const y = LIGHT[1] - COS;
  const z = LIGHT[2] + SIN;
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
})();

const level = (lit: number): number =>
  lit > 0.6 ? 1 : lit > 0.28 ? 2 : lit > -0.06 ? 3 : lit > -0.42 ? 4 : 5;
const toneOf = (ramp: number[], lit: number, glint: number, shift = 0) =>
  ramp[
    Math.max(
      0,
      Math.min(ramp.length - 1, glint > 0.965 ? 0 : level(lit) + shift),
    )
  ];

const PART = {
  body: 1,
  cloth: 2,
  cushion: 3,
  gold: 4,
  tail: 5,
  finL: 6,
  finR: 7,
  dorsal: 8,
  pelvicL: 9,
  pelvicR: 10,
  eye: 11,
  whisker: 12,
};
const PART_INK = [
  0,
  INK_BODY,
  INK_CLOTH,
  INK_CLOTH,
  INK_GOLD,
  INK_FIN,
  INK_FIN,
  INK_FIN,
  INK_FIN,
  INK_FIN,
  INK_FIN,
  0,
  0,
];
const PART_GAP = [0, 1, 0, 0, 0, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 99, 99];
const SELF_GAP = 6;

const B = {
  len: 58,
  cap: 3,
  seat: 25,
  girth: 19,
  ry: 15,
  rt: 15.5,
  rb: 13.5,
  tipRy: 3,
  tipRt: 4.4,
  tipRb: 3.8,
};
const SWIM = {
  k: TAU / 62,
  sway: 5,
  head: 0.5,
  bias: -12,
  droop: 2,
};

function radius(s: number, r: number, tip: number): number {
  if (s >= B.len) {
    const t = Math.min(1, (s - B.len) / B.cap);
    return tip * Math.sqrt(1 - t * t);
  }
  if (s <= B.girth) {
    const u = (B.girth - s) / B.girth;
    return r * Math.sqrt(Math.max(0, 1 - u ** 1.9));
  }
  const t = (s - B.girth) / (B.len - B.girth);
  return tip + (r - tip) * (0.5 + 0.5 * Math.cos(Math.PI * t)) ** 0.85;
}
const radii = (s: number): [number, number, number] => [
  radius(s, B.ry, B.tipRy),
  radius(s, B.rt, B.tipRt),
  radius(s, B.rb, B.tipRb),
];

const MAT = {
  skin: 0,
  pink: 1,
  gill: 2,
  lip: 3,
  mouth: 4,
  cloth: 5,
  trim: 6,
  petal: 7,
  heart: 8,
};

const PATCHES: [number, number, number, number, number, number][] = [
  [6, 0, 11.5, 5.4, 5.8, 5.5],
  [40, -3, 9.5, 8, 11.5, 9.5],
  [15, -11, 4, 4.5, 5.5, 6],
  [50, 2.5, 4, 4.2, 4.5, 4.5],
];
const BLANKET = { half: 7, lift: 1.1, trim: 1.1 };

function bodyMaterial(s: number, theta: number, ry: number, rz: number) {
  const c = Math.cos(theta);
  const sn = Math.sin(theta);
  const y = ry * c;
  const z = rz * sn;
  const phi = Math.acos(Math.max(-1, Math.min(1, sn)));
  const ds = s - B.seat;
  const hem = (86 + 14 * Math.cos((Math.PI * ds) / (2 * BLANKET.half))) * DEG;
  if (Math.abs(ds) < BLANKET.half && phi < hem) {
    const r = Math.max(ry, rz);
    const edge = Math.min(BLANKET.half - Math.abs(ds), (hem - phi) * r);
    if (edge < BLANKET.trim) return [MAT.trim, BLANKET.lift + 0.25];
    const ex = ds - 1;
    const ey = (phi - 60 * DEG) * r;
    const rho = Math.hypot(ex, ey);
    const a = Math.atan2(ey, ex);
    if (rho < 1) return [MAT.heart, BLANKET.lift];
    if (rho < 3.3 * (0.6 + 0.4 * Math.abs(Math.cos(2.5 * a + 0.3))))
      return [MAT.petal, BLANKET.lift];
    return [MAT.cloth, BLANKET.lift];
  }
  if (s < 1.1 && sn < 0.2) return [MAT.mouth, 0];
  if (s < 2 && sn < 0.3) return [MAT.lip, 0];
  const gill = 12 + 1.6 * sn * sn;
  if (Math.abs(s - gill) < 0.38 && Math.abs(sn) < 0.75) return [MAT.gill, 0];
  for (const [ps, py, pz, rs, ryy, rzz] of PATCHES) {
    const d =
      ((s - ps) / rs) ** 2 + ((y - py) / ryy) ** 2 + ((z - pz) / rzz) ** 2;
    if (d < 1 + 0.15 * Math.sin(s * 0.55 + theta * 2)) return [MAT.pink, 0];
  }
  return [MAT.skin, 0];
}

const body = (() => {
  const rings: number[] = [];
  const ringS: number[] = [];
  const samples: { c: number; s: number; lift: number; mat: number }[] = [];
  const end = B.len + B.cap;
  let s = 0;
  for (;;) {
    const [ry, rt, rb] = radii(s);
    const h = 0.01;
    const [ry2, rt2, rb2] = radii(Math.min(end, s + h));
    const [ry1, rt1, rb1] = radii(Math.max(0, s - h));
    const span = Math.min(end, s + h) - Math.max(0, s - h);
    const slope =
      Math.max(Math.abs(ry2 - ry1), Math.abs(rt2 - rt1), Math.abs(rb2 - rb1)) /
      span;
    ringS.push(
      s,
      ry,
      rt,
      rb,
      (ry2 - ry1) / span,
      (rt2 - rt1) / span,
      (rb2 - rb1) / span,
    );
    rings.push(samples.length);
    const n = Math.max(
      6,
      Math.ceil((TAU * (Math.max(ry, rt, rb) + 1.4)) / STEP),
    );
    for (let k = 0; k < n; k++) {
      const theta = (k / n) * TAU;
      const [mat, lift] = bodyMaterial(
        s,
        theta,
        ry,
        Math.sin(theta) > 0 ? rt : rb,
      );
      samples.push({ c: Math.cos(theta), s: Math.sin(theta), lift, mat });
    }
    if (s >= end) break;
    s = Math.min(end, s + Math.max(0.03, STEP / Math.sqrt(1 + slope * slope)));
  }
  rings.push(samples.length);
  return {
    rings: Int32Array.from(rings),
    ring: Float32Array.from(ringS),
    cos: Float32Array.from(samples, (p) => p.c),
    sin: Float32Array.from(samples, (p) => p.s),
    lift: Float32Array.from(samples, (p) => p.lift),
    mat: Uint8Array.from(samples, (p) => p.mat),
  };
})();

const CUSHION = { a: 8, b: 9.5, c: 2.4, p: 2.8, sink: 1 };
const CUSHION_Z =
  radius(B.seat, B.rt, B.tipRt) + BLANKET.lift + CUSHION.c - CUSHION.sink;

const cushion = (() => {
  const { a, b, c, p } = CUSHION;
  const k = (z: number) => Math.max(0, 1 - Math.abs(z / c) ** p) ** (1 / p);
  const rings: number[] = [];
  const ringZ: number[] = [];
  const cs: number[] = [];
  const sn: number[] = [];
  let z = -c * 0.4;
  for (;;) {
    const kz = k(z);
    const h = 0.005;
    const dk =
      (k(Math.min(c, z + h)) - k(Math.max(-c, z - h))) /
      (Math.min(c, z + h) - Math.max(-c, z - h));
    ringZ.push(z, kz, dk);
    rings.push(cs.length);
    const n = Math.max(6, Math.ceil((Math.PI * (a + b) * kz) / STEP));
    for (let i = 0; i < n; i++) {
      cs.push(Math.cos((i / n) * TAU));
      sn.push(Math.sin((i / n) * TAU));
    }
    if (z >= c) break;
    z = Math.min(
      c,
      z + Math.max(0.02, STEP / Math.sqrt(1 + (Math.max(a, b) * dk) ** 2)),
    );
  }
  rings.push(cs.length);
  return {
    rings: Int32Array.from(rings),
    ring: Float32Array.from(ringZ),
    cos: Float32Array.from(cs),
    sin: Float32Array.from(sn),
  };
})();

type Fin = { na: number; nb: number; mask: Uint8Array; mat: Uint8Array };
const FIN_MAT = { base: 0, tip: 1, ray: 2 };

function inside(poly: [number, number][], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      hit = !hit;
  }
  return hit;
}

const TAIL = {
  len: 29,
  half: 19,
  droop: 5 * DEG,
  sway: 6,
  twist: 50 * DEG,
  flex: 12 * DEG,
};
const TAIL_SHAPE: [number, number][] = [
  [-1, 3.4],
  [4, 5.4],
  [9, 8.4],
  [14, 11.4],
  [19, 14.2],
  [23.5, 16.2],
  [27, 16.8],
  [28.6, 15.2],
  [28, 12.6],
  [26, 10.2],
  [23.5, 7.2],
  [21, 3.8],
  [19.6, 0.6],
  [19.4, -1.4],
  [20.6, -4.6],
  [23, -8.2],
  [26, -11.6],
  [28.4, -14.8],
  [29, -17.4],
  [27.6, -18.6],
  [24, -18],
  [19.5, -15.8],
  [14.5, -12.6],
  [9.5, -9.2],
  [4.5, -5.8],
  [-1, -3.4],
];

const tailFin: Fin = (() => {
  const na = Math.ceil(TAIL.len / STEP) + 1;
  const nb = Math.ceil((2 * TAIL.half) / STEP) + 1;
  const mask = new Uint8Array(na * nb);
  const mat = new Uint8Array(na * nb);
  for (let i = 0; i < na; i++)
    for (let j = 0; j < nb; j++) {
      const a = i * STEP;
      const b = -TAIL.half + j * STEP;
      const k = i * nb + j;
      if (!inside(TAIL_SHAPE, a, b)) continue;
      mask[k] = 1;
      const t = a / TAIL.len;
      const r = Math.atan2(b, a + 5) / 0.2;
      const ray = t > 0.18 && Math.abs(r - Math.round(r)) < 0.17;
      mat[k] =
        (t > 0.52 + 0.1 * Math.sin(b * 0.45) ? FIN_MAT.tip : FIN_MAT.base) +
        (ray ? FIN_MAT.ray : 0);
    }
  return { na, nb, mask, mat };
})();

type Paddle = {
  s0: number;
  s1: number;
  theta: number;
  len: number;
  chord: number;
  root: number;
  el: number;
  flap: number;
  sweep: number;
  lead: number;
};
const PECTORAL: Paddle = {
  s0: 12,
  s1: 17,
  theta: -28 * DEG,
  len: 24,
  chord: 16,
  root: 5,
  el: 16,
  flap: 18,
  sweep: 38,
  lead: 2,
};
const PELVIC: Paddle = {
  s0: 32,
  s1: 35,
  theta: -72 * DEG,
  len: 9,
  chord: 5,
  root: 3,
  el: 55,
  flap: 8,
  sweep: 55,
  lead: 2,
};

function paddleFin(f: Paddle): Fin {
  const na = Math.ceil(f.len / STEP) + 1;
  const nb = Math.ceil(f.chord / STEP) + 1;
  const mask = new Uint8Array(na * nb).fill(1);
  const mat = new Uint8Array(na * nb);
  for (let i = 0; i < na; i++)
    for (let j = 0; j < nb; j++) {
      const a = i / (na - 1);
      const c = j / (nb - 1);
      mat[i * nb + j] =
        a > 0.34 + 0.08 * Math.sin(c * 6) ? FIN_MAT.tip : FIN_MAT.base;
    }
  return { na, nb, mask, mat };
}
const pectoralFin = paddleFin(PECTORAL);
const pelvicFin = paddleFin(PELVIC);
const chordAt = (f: Paddle, a: number) =>
  a < 0.65
    ? f.root + (f.chord - f.root) * Math.sin((a / 0.65) * (Math.PI / 2))
    : f.chord * Math.sqrt(Math.max(0, 1 - ((a - 0.65) / 0.35) ** 2));

const DORSAL = { s0: 33, s1: 46, height: 8.5 };
const dorsalFin: Fin = (() => {
  const na = Math.ceil((DORSAL.height * 1.5) / STEP) + 1;
  const nb = Math.ceil((DORSAL.s1 - DORSAL.s0) / STEP) + 1;
  const mask = new Uint8Array(na * nb).fill(1);
  const mat = new Uint8Array(na * nb);
  for (let i = 0; i < na; i++)
    for (let j = 0; j < nb; j++) {
      const a = i / (na - 1);
      const c = j / (nb - 1);
      mat[i * nb + j] =
        a > 0.5 + 0.12 * Math.sin(c * 9) ? FIN_MAT.tip : FIN_MAT.base;
    }
  return { na, nb, mask, mat };
})();

const MAX_GRID = Math.max(
  tailFin.na * tailFin.nb,
  pectoralFin.na * pectoralFin.nb,
  dorsalFin.na * dorsalFin.nb,
);
const GX = new Float32Array(MAX_GRID);
const GY = new Float32Array(MAX_GRID);
const GZ = new Float32Array(MAX_GRID);

const DEPTH = new Float32Array(N_PX);
const OWNER = new Uint8Array(N_PX);
const INK = new Uint8Array(N_PX);
const OUT = new Uint8Array(N_PX);

let HX = 1;
let HY = 0;
let OX = 56;
let OY = 50;

function claim(x: number, y: number, z: number, part: number): number {
  const wy = x * HY + y * HX;
  const sx = OX + x * HX - y * HY;
  const sy = OY - (wy * SIN + z * COS);
  if (sx < -0.5 || sy < -0.5 || sx >= W - 0.5 || sy >= H - 0.5) return -1;
  const k = ((sy + 0.5) | 0) * W + ((sx + 0.5) | 0);
  const depth = wy * COS - z * SIN;
  if (depth >= DEPTH[k]) return -1;
  DEPTH[k] = depth;
  OWNER[k] = part;
  return k;
}

let LIT = 0;
let GLINT = 0;
function shade(nx: number, ny: number, nz: number, twoSided: boolean): boolean {
  let wx = nx * HX - ny * HY;
  let wy = nx * HY + ny * HX;
  let wz = nz;
  const l = Math.sqrt(wx * wx + wy * wy + wz * wz) || 1;
  const facing = (wy * COS - wz * SIN) / l;
  if (facing > 0.2) {
    if (!twoSided) return false;
    wx = -wx;
    wy = -wy;
    wz = -wz;
  }
  LIT = (wx * LIGHT[0] + wy * LIGHT[1] + wz * LIGHT[2]) / l;
  GLINT = (wx * HALF[0] + wy * HALF[1] + wz * HALF[2]) / l;
  return true;
}

const SP = new Float64Array(12);
/** The bent spine at s: centre, unit tangent towards the tail, side axis to the left, and up axis. */
function spine(s: number, ph: number): void {
  const span = B.len - B.seat;
  const q = Math.max(0, (s - B.seat) / span);
  const dq = s > B.seat ? 1 / span : 0;
  const h = Math.max(0, (B.seat - s) / B.seat);
  const dh = s < B.seat ? -1 / B.seat : 0;
  const amp = 0.15 + SWIM.sway * q * q + SWIM.head * h * h;
  const damp = 2 * SWIM.sway * q * dq + 2 * SWIM.head * h * dh;
  const w = ph - SWIM.k * s;
  const y = SWIM.bias * q * q + amp * Math.sin(w);
  const dy =
    2 * SWIM.bias * q * dq + damp * Math.sin(w) - amp * SWIM.k * Math.cos(w);
  const z = -SWIM.droop * q * q;
  const dz = -2 * SWIM.droop * q * dq;
  const tl = Math.sqrt(1 + dy * dy + dz * dz);
  const tx = -1 / tl;
  const ty = dy / tl;
  const tz = dz / tl;
  const nl = Math.sqrt(1 + dy * dy);
  const nx = dy / nl;
  const ny = 1 / nl;
  SP[0] = B.seat - s;
  SP[1] = y;
  SP[2] = z;
  SP[3] = tx;
  SP[4] = ty;
  SP[5] = tz;
  SP[6] = nx;
  SP[7] = ny;
  SP[8] = ny * tz;
  SP[9] = -nx * tz;
  SP[10] = nx * ty - ny * tx;
}

const PT = new Float64Array(6);
function skin(s: number, theta: number, ph: number, out = 0): void {
  spine(s, ph);
  const [ry, rt, rb] = radii(s);
  const c = Math.cos(theta);
  const sn = Math.sin(theta);
  const a = (ry + out) * c;
  const b = ((sn > 0 ? rt : rb) + out) * sn;
  PT[0] = SP[0] + a * SP[6] + b * SP[8];
  PT[1] = SP[1] + a * SP[7] + b * SP[9];
  PT[2] = SP[2] + b * SP[10];
  const nN = (sn > 0 ? rt : rb) * c;
  const nU = ry * sn;
  const l = Math.hypot(nN, nU) || 1;
  PT[3] = (nN * SP[6] + nU * SP[8]) / l;
  PT[4] = (nN * SP[7] + nU * SP[9]) / l;
  PT[5] = (nU * SP[10]) / l;
}

function paintBody(ph: number): void {
  const { rings, ring, cos, sin, lift, mat } = body;
  for (let r = 0; r < rings.length - 1; r++) {
    const o = r * 7;
    const s = ring[o];
    spine(s, ph);
    const cx = SP[0];
    const cy = SP[1];
    const cz = SP[2];
    const tx = SP[3];
    const ty = SP[4];
    const tz = SP[5];
    const nx = SP[6];
    const ny = SP[7];
    const ux = SP[8];
    const uy = SP[9];
    const uz = SP[10];
    const ry = ring[o + 1];
    const ryp = ring[o + 4];
    for (let k = rings[r]; k < rings[r + 1]; k++) {
      const c = cos[k];
      const sn = sin[k];
      const up = sn > 0;
      const rz = up ? ring[o + 2] : ring[o + 3];
      const rzp = up ? ring[o + 5] : ring[o + 6];
      const lf = lift[k];
      const a = (ry + lf) * c;
      const b = (rz + lf) * sn;
      const nT = -(ryp * rz * c * c + rzp * ry * sn * sn);
      const nN = rz * c;
      const nU = ry * sn;
      if (
        !shade(
          nT * tx + nN * nx + nU * ux,
          nT * ty + nN * ny + nU * uy,
          nT * tz + nU * uz,
          false,
        )
      )
        continue;
      const m = mat[k];
      const part = m >= MAT.cloth ? PART.cloth : PART.body;
      const q = claim(
        cx + a * nx + b * ux,
        cy + a * ny + b * uy,
        cz + b * uz,
        part,
      );
      if (q < 0) continue;
      INK[q] =
        m === MAT.skin
          ? toneOf(SKIN, LIT, GLINT)
          : m === MAT.pink
            ? toneOf(PINK, LIT, GLINT)
            : m === MAT.gill
              ? toneOf(SKIN, LIT, 0, 1)
              : m === MAT.lip
                ? LIP[0]
                : m === MAT.mouth
                  ? LIP[1]
                  : m === MAT.cloth
                    ? toneOf(CLOTH, LIT, GLINT, -1)
                    : m === MAT.trim
                      ? toneOf(GOLD, LIT + 0.3, GLINT, -1)
                      : m === MAT.petal
                        ? toneOf(PINK, LIT + 0.3, 0, -1)
                        : GOLD[1];
    }
  }
}

function paintCushion(): void {
  const { rings, ring, cos, sin } = cushion;
  const { a, b } = CUSHION;
  for (let r = 0; r < rings.length - 1; r++) {
    const z = ring[r * 3];
    const kz = ring[r * 3 + 1];
    const dk = ring[r * 3 + 2];
    const piping = Math.abs(z) < 0.45;
    for (let i = rings[r]; i < rings[r + 1]; i++) {
      const c = cos[i];
      const sn = sin[i];
      if (!shade(b * c, a * sn, -a * b * dk, false)) continue;
      const q = claim(
        a * kz * c,
        b * kz * sn,
        CUSHION_Z + z,
        piping ? PART.gold : PART.cushion,
      );
      if (q < 0) continue;
      INK[q] = piping
        ? toneOf(GOLD, LIT + 0.3, GLINT, -1)
        : toneOf(CLOTH, LIT, GLINT);
    }
  }
}

function paintGrid(fin: Fin, part: number, brighten: number): void {
  const { na, nb, mask, mat } = fin;
  for (let i = 0; i < na; i++)
    for (let j = 0; j < nb; j++) {
      const k = i * nb + j;
      if (!mask[k]) continue;
      const i0 = i > 0 ? k - nb : k;
      const i1 = i < na - 1 ? k + nb : k;
      const j0 = j > 0 ? k - 1 : k;
      const j1 = j < nb - 1 ? k + 1 : k;
      const ax = GX[i1] - GX[i0];
      const ay = GY[i1] - GY[i0];
      const az = GZ[i1] - GZ[i0];
      const bx = GX[j1] - GX[j0];
      const by = GY[j1] - GY[j0];
      const bz = GZ[j1] - GZ[j0];
      shade(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx, true);
      const q = claim(GX[k], GY[k], GZ[k], part);
      if (q < 0) continue;
      const m = mat[k];
      const ramp = m & FIN_MAT.tip ? TIP : FIN;
      INK[q] = toneOf(ramp, LIT + brighten, 0, m & FIN_MAT.ray ? 1 : -1);
    }
}

function paintTail(ph: number): void {
  spine(B.len - 1, ph);
  const [cx, cy, cz, tx, ty, tz, nx, ny, ux, uy, uz] = SP;
  const cd = Math.cos(TAIL.droop);
  const sd = Math.sin(TAIL.droop);
  const e1x = cd * tx - sd * ux;
  const e1y = cd * ty - sd * uy;
  const e1z = cd * tz - sd * uz;
  const e2x = sd * tx + cd * ux;
  const e2y = sd * ty + cd * uy;
  const e2z = sd * tz + cd * uz;
  const { na, nb } = tailFin;
  const w0 = ph - SWIM.k * B.len;
  for (let i = 0; i < na; i++) {
    const a = i * STEP;
    const t = a / TAIL.len;
    for (let j = 0; j < nb; j++) {
      const b = -TAIL.half + j * STEP;
      const lat =
        TAIL.sway * t ** 1.5 * Math.sin(w0 - 2.4 * t - (0.3 * b) / TAIL.half);
      const roll = t * (TAIL.twist + TAIL.flex * Math.sin(w0 - 1.2 - 2 * t));
      const cr = Math.cos(roll);
      const sr = Math.sin(roll);
      const up = b * cr - lat * sr;
      const side = b * sr + lat * cr;
      const k = i * nb + j;
      GX[k] = cx + a * e1x + up * e2x + side * nx;
      GY[k] = cy + a * e1y + up * e2y + side * ny;
      GZ[k] = cz + a * e1z + up * e2z;
    }
  }
  paintGrid(tailFin, PART.tail, 0.25);
}

function paintPaddle(
  f: Paddle,
  fin: Fin,
  side: number,
  part: number,
  ph: number,
): void {
  const theta = side > 0 ? f.theta : Math.PI - f.theta;
  skin(f.s0, theta, ph);
  const rx = PT[0];
  const ry = PT[1];
  const rz = PT[2];
  spine((f.s0 + f.s1) / 2, ph);
  const ox = side * SP[6];
  const oy = side * SP[7];
  const bx = SP[3];
  const by = SP[4];
  const bz = SP[5];
  const dx = -SP[8];
  const dy = -SP[9];
  const dz = -SP[10];
  const { na, nb } = fin;
  const sw = f.sweep * DEG;
  const ds = f.len / (na - 1);
  let px = 0;
  let py = 0;
  let pz = 0;
  for (let i = 0; i < na; i++) {
    const a = i / (na - 1);
    const el = (f.el + f.flap * Math.sin(ph - 1.6 * a)) * DEG;
    const ce = Math.cos(el) * Math.cos(sw);
    const se = Math.sin(el) * Math.cos(sw);
    const sb = Math.sin(sw);
    if (i > 0) {
      px += (ce * ox + se * dx + sb * bx) * ds;
      py += (ce * oy + se * dy + sb * by) * ds;
      pz += (se * dz + sb * bz) * ds;
    }
    const chord = chordAt(f, a);
    const lead = f.lead * a * a;
    for (let j = 0; j < nb; j++) {
      const w = lead + (j / (nb - 1)) * chord;
      const k = i * nb + j;
      GX[k] = rx + px + w * bx;
      GY[k] = ry + py + w * by;
      GZ[k] = rz + pz + w * bz;
    }
  }
  paintGrid(fin, part, 0.15);
}

function paintDorsal(ph: number): void {
  const { na, nb } = dorsalFin;
  for (let j = 0; j < nb; j++) {
    const c = j / (nb - 1);
    const s = DORSAL.s0 + (DORSAL.s1 - DORSAL.s0) * c;
    skin(s, Math.PI / 2, ph, -0.5);
    const rx = PT[0];
    const ry = PT[1];
    const rz = PT[2];
    const h = DORSAL.height * (1 - c ** 1.8) + 1;
    for (let i = 0; i < na; i++) {
      const a = i / (na - 1);
      const lean = (30 + 30 * a) * DEG;
      const up = a * h * Math.cos(lean);
      const back = a * h * Math.sin(lean) * 1.4;
      const flutter = 0.9 * a * Math.sin(ph - 3 * c - 1.5 * a);
      const k = i * nb + j;
      GX[k] = rx + up * SP[8] + back * SP[3] + flutter * SP[6];
      GY[k] = ry + up * SP[9] + back * SP[4] + flutter * SP[7];
      GZ[k] = rz + up * SP[10] + back * SP[5];
    }
  }
  paintGrid(dorsalFin, PART.dorsal, 0.2);
}

function ball(
  x: number,
  y: number,
  z: number,
  r: number,
  part: number,
  look: (sx: number, sy: number, sz: number) => number,
): void {
  const wy = x * HY + y * HX;
  const cx = OX + x * HX - y * HY;
  const cy = OY - (wy * SIN + z * COS);
  const depth = wy * COS - z * SIN;
  const reach = Math.ceil(r);
  const x0 = Math.round(cx);
  const y0 = Math.round(cy);
  for (let py = y0 - reach; py <= y0 + reach; py++)
    for (let px = x0 - reach; px <= x0 + reach; px++) {
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      const dx = px - cx;
      const dy = py - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > r * r && !(r < 0.75 && px === x0 && py === y0)) continue;
      const k = py * W + px;
      const dz = Math.sqrt(Math.max(0, r * r - d2));
      if (depth - dz >= DEPTH[k]) continue;
      DEPTH[k] = depth - dz;
      OWNER[k] = part;
      INK[k] = look(dx / r, -dy / r, dz / r);
    }
}

const eyeLook = (sx: number, sy: number) =>
  sx < -0.15 && sy > 0.2 && sx * sx + sy * sy < 0.75
    ? EYE[0]
    : sy < -0.35
      ? EYE[1]
      : sy < 0.05
        ? EYE[2]
        : EYE[3];
const whiskerLook = () => TIP[3];

function paintFace(ph: number): void {
  for (const side of [1, -1]) {
    skin(6.8, side > 0 ? 20 * DEG : Math.PI - 20 * DEG, ph, -1.2);
    ball(PT[0], PT[1], PT[2], 3.2, PART.eye, eyeLook);
    skin(1.2, side > 0 ? -38 * DEG : Math.PI + 38 * DEG, ph);
    const [x0, y0, z0] = PT;
    spine(1.2, ph);
    const swing = 0.6 * Math.sin(ph - 0.8 * side);
    for (let t = 0; t <= 1; t += 0.08) {
      const back = 1.2 * t * t;
      const out = (2.6 + swing) * t;
      const down = 1.2 * t + 1.0 * t * t;
      ball(
        x0 + back * SP[3] + side * out * SP[6] - down * SP[8],
        y0 + back * SP[4] + side * out * SP[7] - down * SP[9],
        z0 + back * SP[5] - down * SP[10],
        0.5,
        PART.whisker,
        whiskerLook,
      );
    }
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

function despeckle(): void {
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const k = y * W + x;
      const p = OWNER[k];
      if (!p || p === PART.eye || p === PART.whisker) continue;
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
      if (p === PART.eye || p === PART.whisker) continue;
      let best = -1;
      for (let n = 0; n < 4; n++) {
        const nx = n === 0 ? x - 1 : n === 1 ? x + 1 : x;
        const ny = n === 2 ? y - 1 : n === 3 ? y + 1 : y;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        const q = OWNER[j];
        if (!q || !PART_INK[q]) continue;
        const edge = !p
          ? true
          : q === p
            ? DEPTH[j] < DEPTH[k] - SELF_GAP
            : DEPTH[j] < DEPTH[k] - Math.min(PART_GAP[p], PART_GAP[q]);
        if (edge && (best < 0 || DEPTH[j] < DEPTH[best])) best = j;
      }
      if (best >= 0) OUT[k] = PART_INK[OWNER[best]];
    }
}

const R2 = Math.SQRT1_2;
const HEADING: Record<string, [number, number]> = {
  south: [0, -1],
  "south-east": [R2, -R2],
  east: [1, 0],
  "north-east": [R2, R2],
  north: [0, 1],
};
// The body's axis on the cell's centre seen from the front or back, and its long
// tail given room behind it from the side, as the game centres its mounts.
const ORIGIN: Record<string, [number, number]> = {
  south: [56, 68],
  "south-east": [70, 63],
  east: [69, 48],
  "north-east": [62, 37],
  north: [56, 39],
};

function view(direction: string): void {
  [HX, HY] = HEADING[direction];
  [OX, OY] = ORIGIN[direction];
}

function paint(px: Pixels, direction: string, frame: number): void {
  const ph = (frame / FRAMES) * TAU;
  view(direction);
  DEPTH.fill(Infinity);
  OWNER.fill(0);
  INK.fill(0);
  paintBody(ph);
  paintCushion();
  paintFace(ph);
  paintDorsal(ph);
  paintTail(ph);
  for (const side of [1, -1]) {
    paintPaddle(
      PECTORAL,
      pectoralFin,
      side,
      side > 0 ? PART.finL : PART.finR,
      ph,
    );
    paintPaddle(
      PELVIC,
      pelvicFin,
      side,
      side > 0 ? PART.pelvicL : PART.pelvicR,
      ph,
    );
  }
  fillHoles();
  despeckle();
  outline();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = OUT[y * W + x];
      if (c) put(px, x, y, PALETTE[c]);
    }
}

const SEAT_DROP = 2;
function seatOf(direction: string): [number, number] {
  view(direction);
  const z = CUSHION_Z + CUSHION.c;
  return [Math.round(OX), Math.round(OY - z * COS) + SEAT_DROP];
}

export const SAKURA_KOI: DrawnMount = {
  id: "own-sakura-koi",
  name: "Sakura Koi",
  description:
    "ปลาคาร์ปตัวอ้วนกลมว่ายอยู่กลางอากาศ ลำตัวสีขาวมุกมีลายสีชมพูซากุระ กลางหัวมีวงกลมสีชมพูแบบปลาคาร์ปทันโจ ครีบยาวพลิ้วแบบปลาคาร์ปผีเสื้อ ปลายครีบไล่เป็นสีชมพู หางแฉกใหญ่ลายเส้นครีบบิดพลิ้วเหมือนผ้าไหมตอนว่าย ลำตัวโค้งส่ายไปมา มีหนวดเล็ก ๆ ข้างปาก บนหลังปูผ้าสีครามขลิบทองปักดอกซากุระ และมีเบาะนั่งสีครามขลิบทอง",
  cell: CELL,
  seat: Object.fromEntries(
    Object.keys(HEADING).map((d) => [d, seatOf(d)]),
  ) as Record<string, [number, number]>,
  paint,
};
