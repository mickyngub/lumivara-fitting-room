import type { DrawnMount } from "../mounts";
import { bayer, put, rgb, TAU, type Pixels, type Rgb } from "../pixels";

const CELL = { w: 108, h: 120 };
const W = CELL.w;
const H = CELL.h;
const N = W * H;
const FRAMES = 6;
const DEG = Math.PI / 180;
// The game looks down at about 25 degrees: height shows at COS and depth at SIN.
const SIN = Math.sin(25 * DEG);
const COS = Math.cos(25 * DEG);
const SCALE = 1.18;
const FOOT_GAP = 2;

const INKS: Rgb[] = [];
const ink = (hex: string): number => INKS.push(rgb(hex)) - 1;
const ramp = (...hex: string[]): number[] => hex.map(ink);
const DORSAL = ramp("#ffc9bb", "#ff9d95", "#ee6f7f", "#c14a6c", "#8a345b");
const FLANK = ramp("#ffe5ad", "#ffc271", "#f9954f", "#da6a40", "#a74937");
const BELLY = ramp("#fff1d6", "#ffdfb2", "#fcc58a", "#e89c68", "#bf6f55");
const FIN = ramp("#e4fff8", "#96f2e3", "#44d1d3", "#209db8", "#186c8f");
const PEARL = ramp(
  "#ffffff",
  "#fef3f8",
  "#efe2f2",
  "#d3c2de",
  "#a595c2",
  "#ffdbea",
  "#d6f1ff",
);
const GOLD = ramp("#fff2b8", "#f1be56", "#b27d2e");
const FOAM = ramp("#ffffff", "#def9ff", "#aae7f6", "#6fc3e7", "#4294c8");
const PUPIL = ink("#2d1131");
const LINE = {
  body: ink("#5b2243"),
  fin: ink("#0e4459"),
  pearl: ink("#5c4b88"),
  foam: ink("#215b92"),
};

const LIGHT = (() => {
  const v = [-0.55, 0.62, 0.56];
  const l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
})();
const tone = (lit: number): number =>
  lit > 0.78 ? 0 : lit > 0.4 ? 1 : lit > 0.02 ? 2 : lit > -0.38 ? 3 : 4;
const lit = (a: number, b: number, c: number) =>
  a * LIGHT[0] + b * LIGHT[1] + c * LIGHT[2];
const frac = (v: number) => v - Math.floor(v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;
const smooth = (t: number) => {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};
const norm3 = (x: number, y: number, z: number) =>
  Math.sqrt(x * x + y * y + z * z);

const PART = {
  trunk: 1,
  head: 2,
  snout: 3,
  tail: 4,
  crown: 5,
  dorsal: 6,
  finL: 7,
  finR: 8,
  pad: 9,
  buckle: 10,
  eye: 11,
  foam: 12,
  bubble: 13,
};
const PART_INK = [
  -1,
  LINE.body,
  LINE.body,
  LINE.body,
  LINE.body,
  LINE.body,
  LINE.fin,
  LINE.fin,
  LINE.fin,
  LINE.pearl,
  LINE.pearl,
  -1,
  LINE.foam,
  -1,
];
const PART_GAP = [0, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1, 1, 99, 1, 99];
const SELF_GAP = 5.4;

const DEPTH = new Float32Array(N);
const OWNER = new Uint8Array(N);
const SRC = new Int32Array(N);
const SX = new Float32Array(N);
const SY = new Float32Array(N);
const SZ = new Float32Array(N);
const INK = new Int16Array(N);
const OUT = new Int16Array(N);

let HX = 1;
let HY = 0;
let OX = 0;
let OY = 0;

/** What a pixel's shading needs besides its normal, saved when the surface is cast so it can be shaded once, at the end. */
const C = {
  s: 0,
  r: 0,
  pitch: 0,
  tf: 0,
  tl: 0,
  tu: -1,
  bf: 1,
  bl: 0,
  bu: 0,
  bump: 0,
  strap: -99,
};
type Look = (a: number, b: number, c: number, k: number) => number;
const CTX_SIZE = 11;
const LOOKS: Look[] = [];
const CTX = new Float64Array(4096 * CTX_SIZE);
let casters = 0;

function cast(look: Look): number {
  const id = casters++;
  const o = id * CTX_SIZE;
  LOOKS[id] = look;
  CTX[o] = C.s;
  CTX[o + 1] = C.r;
  CTX[o + 2] = C.pitch;
  CTX[o + 3] = C.tf;
  CTX[o + 4] = C.tl;
  CTX[o + 5] = C.tu;
  CTX[o + 6] = C.bf;
  CTX[o + 7] = C.bl;
  CTX[o + 8] = C.bu;
  CTX[o + 9] = C.bump;
  CTX[o + 10] = C.strap;
  return id;
}

function shade(): void {
  let last = -1;
  for (let k = 0; k < N; k++) {
    const id = SRC[k];
    if (id < 0) continue;
    if (id !== last) {
      last = id;
      const o = id * CTX_SIZE;
      C.s = CTX[o];
      C.r = CTX[o + 1];
      C.pitch = CTX[o + 2];
      C.tf = CTX[o + 3];
      C.tl = CTX[o + 4];
      C.tu = CTX[o + 5];
      C.bf = CTX[o + 6];
      C.bl = CTX[o + 7];
      C.bu = CTX[o + 8];
      C.bump = CTX[o + 9];
      C.strap = CTX[o + 10];
    }
    INK[k] = LOOKS[id](SX[k], SY[k], SZ[k], k);
  }
}

/** Body coordinates are forward, left and up from the ground under the chest; the heading turns them to the screen. */
function claim(f: number, l: number, u: number, part: number): number {
  const wy = (f * HY + l * HX) * SCALE;
  const sx = Math.round(OX + (f * HX - l * HY) * SCALE);
  const sy = Math.round(OY - (wy * SIN + u * SCALE * COS));
  if (sx < 0 || sy < 0 || sx >= W || sy >= H) return -1;
  const k = sy * W + sx;
  const d = wy * COS - u * SCALE * SIN;
  if (d >= DEPTH[k]) return -1;
  DEPTH[k] = d;
  OWNER[k] = part;
  return k;
}

let NF = 0;
let NL = 0;
let NU = 0;
/** A normal given on the screen (right, up, towards the viewer) in body coordinates. */
function toBody(a: number, b: number, c: number): void {
  const wy = b * SIN - c * COS;
  NU = b * COS + c * SIN;
  NF = a * HX + wy * HY;
  NL = -a * HY + wy * HX;
}

let CA = 0;
let CB = 0;
let CC = 0;
/** A normal given in body coordinates on the screen. */
function toScreen(nf: number, nl: number, nu: number): void {
  const wx = nf * HX - nl * HY;
  const wy = nf * HY + nl * HX;
  CA = wx;
  CB = wy * SIN + nu * COS;
  CC = -wy * COS + nu * SIN;
}

function ball(
  f: number,
  l: number,
  u: number,
  radius: number,
  part: number,
  look: Look,
): void {
  const r = radius * SCALE;
  const wy = (f * HY + l * HX) * SCALE;
  const cx = OX + (f * HX - l * HY) * SCALE;
  const cy = OY - (wy * SIN + u * SCALE * COS);
  const depth = wy * COS - u * SCALE * SIN;
  const reach = Math.ceil(r);
  const x0 = Math.round(cx);
  const y0 = Math.round(cy);
  const id = cast(look);
  for (
    let py = Math.max(0, y0 - reach);
    py <= Math.min(H - 1, y0 + reach);
    py++
  )
    for (
      let px = Math.max(0, x0 - reach);
      px <= Math.min(W - 1, x0 + reach);
      px++
    ) {
      const dx = px - cx;
      const dy = py - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > r * r && !(r < 0.8 && px === x0 && py === y0)) continue;
      const k = py * W + px;
      const dz = Math.sqrt(Math.max(0, r * r - d2));
      if (depth - dz >= DEPTH[k]) continue;
      DEPTH[k] = depth - dz;
      OWNER[k] = part;
      SRC[k] = id;
      SX[k] = dx / r;
      SY[k] = -dy / r;
      SZ[k] = dz / r;
    }
}

type Pt = [number, number, number];
const MAX_GRID = 4000;
const GF = new Float32Array(MAX_GRID);
const GL = new Float32Array(MAX_GRID);
const GU = new Float32Array(MAX_GRID);

/** A parametric sheet, rows i along a ray and columns j across the rays, claimed point by point and shaded two-sided. */
function sheet(
  part: number,
  nj: number,
  ni: number,
  at: (j: number, a: number, out: Pt) => void,
  paintAt: (j: number, a: number, l: number, k: number) => number,
): void {
  const p: Pt = [0, 0, 0];
  for (let i = 0; i < ni; i++)
    for (let j = 0; j < nj; j++) {
      at(j / (nj - 1), i / (ni - 1), p);
      const o = i * nj + j;
      GF[o] = p[0];
      GL[o] = p[1];
      GU[o] = p[2];
    }
  const id = cast((l, j, a, k) => paintAt(j, a, l, k));
  for (let i = 0; i < ni; i++)
    for (let j = 0; j < nj; j++) {
      const o = i * nj + j;
      const k = claim(GF[o], GL[o], GU[o], part);
      if (k < 0) continue;
      const i0 = i > 0 ? o - nj : o;
      const i1 = i < ni - 1 ? o + nj : o;
      const j0 = j > 0 ? o - 1 : o;
      const j1 = j < nj - 1 ? o + 1 : o;
      const af = GF[i1] - GF[i0];
      const al = GL[i1] - GL[i0];
      const au = GU[i1] - GU[i0];
      const bf = GF[j1] - GF[j0];
      const bl = GL[j1] - GL[j0];
      const bu = GU[j1] - GU[j0];
      const nf = al * bu - au * bl;
      const nl = au * bf - af * bu;
      const nu = af * bl - al * bf;
      const nn = norm3(nf, nl, nu) || 1;
      toScreen(nf / nn, nl / nn, nu / nn);
      const flip = CC < 0 ? -1 : 1;
      SRC[k] = id;
      SX[k] = lit(CA * flip, CB * flip, CC * flip);
      SY[k] = j / (nj - 1);
      SZ[k] = i / (ni - 1);
    }
}

function skinLook(a: number, b: number, c: number, k: number): number {
  toBody(a, b, c);
  const x = k % W;
  const y = (k - x) / W;
  const belly = NF * C.bf + NL * C.bl + NU * C.bu;
  let l = lit(a, b, c);
  let u = 0.5;
  if (C.pitch > 0) {
    const along = NF * C.tf + NL * C.tl + NU * C.tu;
    const q = (C.s + C.r * along) / C.pitch;
    u = q - Math.floor(q);
    l += C.bump * Math.cos(Math.PI * u);
    if (Math.abs(C.s + C.r * along - C.strap) < 1.3)
      return GOLD[clamp(tone(l), 0, 2)];
  }
  const m = belly + (bayer(x, y) - 0.5) * 0.3;
  const ramp = m > 0.4 ? BELLY : m < -0.5 ? DORSAL : FLANK;
  let t = tone(l);
  if (C.pitch > 0 && u < 0.14)
    t = m > -0.45 ? Math.max(t, 3) : Math.min(4, t + 1);
  return ramp[t];
}

type Sample = {
  f: number;
  l: number;
  u: number;
  r: number;
  s: number;
  tf: number;
  tl: number;
  tu: number;
  bf: number;
  bl: number;
  bu: number;
};

type Knot = [f: number, u: number, r: number];
const KNOTS: Knot[] = [
  [17, 63, 7.2],
  [9.5, 64.2, 7.8],
  [4.5, 62, 11.2],
  [6.2, 51.5, 12.6],
  [2.5, 43, 7.8],
  [-1, 37, 5.8],
];

function catmull(t: number): Knot {
  const n = KNOTS.length;
  const i = Math.min(n - 2, Math.floor(t));
  const x = t - i;
  const p0 = KNOTS[Math.max(0, i - 1)];
  const p1 = KNOTS[i];
  const p2 = KNOTS[i + 1];
  const p3 = KNOTS[Math.min(n - 1, i + 2)];
  const x2 = x * x;
  const x3 = x2 * x;
  const at = (a: number, b: number, c: number, d: number) =>
    0.5 *
    (2 * b +
      (c - a) * x +
      (2 * a - 5 * b + 4 * c - d) * x2 +
      (3 * b - a - 3 * c + d) * x3);
  return [
    at(p0[0], p1[0], p2[0], p3[0]),
    at(p0[1], p1[1], p2[1], p3[1]),
    at(p0[2], p1[2], p2[2], p3[2]),
  ];
}

const TAIL = {
  len: 58,
  r0: 5.6,
  tip: 1.1,
  k0: 0.03,
  k1: 0.27,
  p: 2,
  tilt: 34 * DEG,
  wag: 2.8,
};

type Spine = { all: Sample[]; tailAt: number };

function spine(ph: number, bob: number): Spine {
  const pts: { f: number; l: number; u: number; r: number; psi: number }[] = [];
  for (let t = 0; t <= KNOTS.length - 1; t += 0.02) {
    const [f, u, r] = catmull(t);
    pts.push({ f, l: 0, u, r, psi: 0 });
  }
  const trunkEnd = pts.length;
  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 6];
  let theta = Math.atan2(last.u - prev.u, last.f - prev.f);
  let f = last.f;
  let u = last.u;
  const curl = 1 + 0.14 * Math.sin(ph - 1.6);
  const step = 0.45;
  for (let t = step; t <= TAIL.len; t += step) {
    const q = t / TAIL.len;
    const kappa = (TAIL.k0 + (TAIL.k1 - TAIL.k0) * q ** TAIL.p) * curl;
    theta += kappa * step;
    f += Math.cos(theta) * step;
    u += Math.sin(theta) * step;
    const g = smooth(q / 0.4);
    const reach = f - last.f;
    pts.push({
      f: last.f + reach * Math.cos(TAIL.tilt * g),
      l:
        reach * Math.sin(TAIL.tilt * g) +
        TAIL.wag * q * q * Math.sin(ph - 2.6 * q),
      u,
      r: TAIL.tip + (TAIL.r0 - TAIL.tip) * (1 - q) ** 0.85,
      psi: TAIL.tilt * g,
    });
  }
  const out: Sample[] = [];
  let s = 0;
  let tailAt = 0;
  pts.forEach((p, i) => {
    if (i > 0) {
      const q = pts[i - 1];
      s += norm3(p.f - q.f, p.l - q.l, p.u - q.u);
    }
    if (i === trunkEnd) tailAt = s;
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    let tf = b.f - a.f;
    let tl = b.l - a.l;
    let tu = b.u - a.u;
    const tn = norm3(tf, tl, tu);
    tf /= tn;
    tl /= tn;
    tu /= tn;
    const nf = -Math.sin(p.psi);
    const nl = Math.cos(p.psi);
    let bf = -tu * nl;
    let bl = tu * nf;
    let bu = tf * nl - tl * nf;
    const bn = norm3(bf, bl, bu);
    bf /= bn;
    bl /= bn;
    bu /= bn;
    out.push({
      f: p.f,
      l: p.l,
      u: p.u + bob,
      r: p.r,
      s,
      tf,
      tl,
      tu,
      bf,
      bl,
      bu,
    });
  });
  return { all: out, tailAt };
}

const STRAP_AT = 53;
const STRAP_S = (() => {
  const { all } = spine(0, 0);
  return all.reduce((best, p) =>
    Math.abs(p.u - STRAP_AT) < Math.abs(best.u - STRAP_AT) ? p : best,
  ).s;
})();

const PITCH = { trunk: 4.6, tail: 3.4 };

function paintSpine({ all, tailAt }: Spine): void {
  let lastS = -9;
  all.forEach((p, i) => {
    const step = Math.max(0.45, p.r * 0.1);
    if (p.s - lastS < step && i < all.length - 1) return;
    lastS = p.s;
    C.s = p.s;
    C.r = p.r;
    C.tf = p.tf;
    C.tl = p.tl;
    C.tu = p.tu;
    C.bf = p.bf;
    C.bl = p.bl;
    C.bu = p.bu;
    C.pitch = p.s < tailAt ? PITCH.trunk : PITCH.tail;
    C.bump = 0.3;
    C.strap = STRAP_S;
    ball(p.f, p.l, p.u, p.r, p.s < tailAt ? PART.trunk : PART.tail, skinLook);
  });
  C.strap = -99;
}

const knobLook: Look = (a, b, c) => DORSAL[clamp(tone(lit(a, b, c)) - 1, 0, 3)];

function paintKnobs({ all, tailAt }: Spine): void {
  let last = -1;
  for (const p of all) {
    const pitch = p.s < tailAt ? PITCH.trunk : PITCH.tail;
    const n = Math.floor((p.s + pitch * 0.3) / pitch);
    if (n === last || p.s < 2) continue;
    last = n;
    const k = clamp(p.r * 0.2, 0.8, 2);
    ball(
      p.f - p.bf * (p.r + k * 0.2),
      p.l - p.bl * (p.r + k * 0.2),
      p.u - p.bu * (p.r + k * 0.2),
      k,
      PART.trunk,
      knobLook,
    );
  }
}

function paintBuckle({ all }: Spine): void {
  const p = all.reduce((best, q) =>
    Math.abs(q.s - STRAP_S) < Math.abs(best.s - STRAP_S) ? q : best,
  );
  ball(
    p.f + p.bf * p.r,
    p.l + p.bl * p.r,
    p.u + p.bu * p.r,
    2,
    PART.buckle,
    (a, b, c) => {
      const l = lit(a, b, c);
      return c > 0.8 ? GOLD[clamp(tone(l) + 1, 0, 2)] : PEARL[tone(l)];
    },
  );
}

const HEAD = { f: 21, u: 62.5, r: 7.6, tilt: -26 * DEG };

type HeadPose = { f: number; u: number; sf: number; su: number };

function headAt(ph: number, bob: number): HeadPose {
  const nod = 4.5 * DEG * Math.sin(ph - 1);
  const jf = 8;
  const ju = 63;
  const dx = HEAD.f - jf;
  const du = HEAD.u - ju;
  const beta = HEAD.tilt + nod;
  return {
    f: jf + dx * Math.cos(nod) - du * Math.sin(nod),
    u: ju + dx * Math.sin(nod) + du * Math.cos(nod) + bob,
    sf: Math.cos(beta),
    su: Math.sin(beta),
  };
}

/** A point in the head's frame: along the snout, up the crown, and out to the left. */
function onHead(h: HeadPose, a: number, b: number, c: number): Pt {
  return [h.f + h.sf * a - h.su * b, c, h.u + h.su * a + h.sf * b];
}

const SNOUT = { from: 4, to: 20.5 };
const CROWN: { at: Pt; dir: Pt; len: number; r: number }[] = [
  { at: [1, 6.6, 0], dir: [-0.15, 0.99, 0], len: 3.6, r: 1.5 },
  { at: [-2.4, 6.3, 0], dir: [-0.45, 0.89, 0], len: 4.8, r: 1.8 },
  { at: [-5.2, 5.1, 0], dir: [-0.8, 0.6, 0], len: 4, r: 1.5 },
  { at: [-2, 5.5, 3], dir: [-0.3, 0.8, 0.52], len: 3.8, r: 1.4 },
  { at: [-2, 5.5, -3], dir: [-0.3, 0.8, -0.52], len: 3.8, r: 1.4 },
];
const EYE = { a: 3.8, b: 2.6, c: 6.1, r: 2.9 };

function paintHead(h: HeadPose): void {
  C.pitch = 0;
  C.bump = 0;
  C.bf = h.su;
  C.bl = 0;
  C.bu = -h.sf;
  let p = onHead(h, -1.4, 1.8, 0);
  ball(p[0], p[1], p[2], 6.9, PART.head, skinLook);
  p = onHead(h, 2, -2, 0);
  ball(p[0], p[1], p[2], 6.2, PART.head, skinLook);
  ball(h.f, 0, h.u, HEAD.r, PART.head, skinLook);
  const axis = [h.sf, 0, h.su];
  for (let d = SNOUT.from; d <= SNOUT.to; d += 0.45) {
    const t = (d - SNOUT.from) / (SNOUT.to - SNOUT.from);
    const r =
      d < 12
        ? 1.9 + 3.7 * (1 - (d - SNOUT.from) / 8) ** 2
        : 1.85 - 0.1 * t + 0.3 * smooth((t - 0.8) / 0.2);
    p = onHead(h, d, -2.4, 0);
    ball(p[0], p[1], p[2], r, PART.snout, (a, b, c, k) => {
      toBody(a, b, c);
      if (d > SNOUT.to - 1 && NF * axis[0] + NU * axis[2] > 0.82) return PUPIL;
      return skinLook(a, b, c, k);
    });
  }
  for (const spike of CROWN) {
    const [a0, b0, c0] = spike.at;
    for (let t = 0; t <= 1; t += 0.1) {
      p = onHead(
        h,
        a0 + spike.dir[0] * spike.len * t,
        b0 + spike.dir[1] * spike.len * t,
        c0 + spike.dir[2] * spike.len * t,
      );
      ball(
        p[0],
        p[1],
        p[2],
        spike.r * (1 - t) ** 0.8 + 0.35,
        PART.crown,
        (a, b, c) => FLANK[clamp(tone(lit(a, b, c)), 0, 3)],
      );
    }
  }
  for (const side of [1, -1]) {
    p = onHead(h, EYE.a, EYE.b, side * EYE.c);
    const dir = [p[0] - h.f, p[1], p[2] - h.u];
    const dl = norm3(dir[0], dir[1], dir[2]);
    ball(p[0], p[1], p[2], EYE.r, PART.eye, (a, b, c) => {
      toBody(a, b, c);
      const d = (NF * dir[0] + NL * dir[1] + NU * dir[2]) / dl;
      const l = lit(a, b, c);
      if (d > 0.3 && a * -0.35 + b * 0.5 + c * 0.79 > 0.9) return PEARL[0];
      if (d > 0.5) return PUPIL;
      if (d > 0.22) return GOLD[l > 0 ? 1 : 2];
      return DORSAL[clamp(tone(l), 1, 4)];
    });
  }
}

const PAD = { f: 3.5, top: 77, a: 9, b: 9.8, c: 3.3, p: 2.5 };
const PAD_PEARL = 0;
const PAD_RIM = 1;
const PAD_SEAM = 2;

type PadPoint = {
  f: number;
  l: number;
  u: number;
  nf: number;
  nl: number;
  nu: number;
  kind: number;
};

const PAD_POINTS: PadPoint[] = (() => {
  const pts: PadPoint[] = [];
  const { a, b, c, p } = PAD;
  const e = 2 / p;
  const steps = 44;
  for (let i = 0; i <= steps; i++) {
    const phi = (-0.14 + (1.14 * i) / steps) * (Math.PI / 2);
    const co = Math.cos(phi);
    const si = Math.sin(phi);
    const rho = Math.abs(co) ** e;
    const z = c * Math.sign(si) * Math.abs(si) ** e;
    const n = Math.max(
      1,
      Math.ceil((TAU * Math.max(a, b) * rho * SCALE) / 0.68),
    );
    for (let j = 0; j < n; j++) {
      const th = (j / n) * TAU;
      const x = a * rho * Math.cos(th);
      const y = b * rho * Math.sin(th);
      const q = rho ** (p - 2);
      const nf = q * (x / (a * a));
      const nl = q * (y / (b * b));
      const nu = (Math.abs(z / c) ** (p - 1) * Math.sign(z)) / c;
      const nn = norm3(nf, nl, nu) || 1;
      const ring = Math.sqrt((x / a) ** 2 + (y / b) ** 2);
      pts.push({
        f: x,
        l: y,
        u: z,
        nf: nf / nn,
        nl: nl / nn,
        nu: nu / nn,
        kind:
          Math.abs(z) < 0.55
            ? PAD_RIM
            : z > c * 0.6 && ring > 0.7 && ring < 0.76 && j % 5 < 3
              ? PAD_SEAM
              : PAD_PEARL,
      });
    }
  }
  return pts;
})();

function paintPad(bob: number): void {
  const id = cast((l, kind, _, k) => {
    if (kind === PAD_RIM) return GOLD[clamp(tone(l), 0, 2)];
    if (kind === PAD_SEAM) return PEARL[3];
    const t = tone(l - 0.1);
    return t === 3
      ? PEARL[(((k % W) + ((k / W) | 0)) & 1) === 0 ? 5 : 6]
      : PEARL[t === 4 ? 4 : t];
  });
  for (const p of PAD_POINTS) {
    toScreen(p.nf, p.nl, p.nu);
    if (CC < -0.05) continue;
    const k = claim(PAD.f + p.f, p.l, PAD.top - PAD.c + bob + p.u, PART.pad);
    if (k < 0) continue;
    SRC[k] = id;
    SX[k] = lit(CA, CB, CC);
    SY[k] = p.kind;
    SZ[k] = 0;
  }
}

function finInk(rays: number) {
  return (j: number, a: number, l: number): number => {
    let t = tone(l) + 1;
    if (frac(j * rays) < 0.3) t -= 1;
    if (a > 0.86) t -= 1;
    return FIN[clamp(t, 0, 4)];
  };
}

const DORSAL_FIN = { from: 49, to: 36, nj: 48, ni: 34, rays: 6 };

function paintDorsalFin(sp: Spine, ph: number): void {
  const { nj, ni, rays } = DORSAL_FIN;
  const anchors = Array.from({ length: nj }, (_, j) => {
    const target = lerp(DORSAL_FIN.from, DORSAL_FIN.to, j / (nj - 1));
    let best = sp.all[0];
    for (const p of sp.all) {
      if (p.s >= sp.tailAt) break;
      if (Math.abs(p.u - target) < Math.abs(best.u - target)) best = p;
    }
    return best;
  });
  sheet(
    PART.dorsal,
    nj,
    ni,
    (j, a, out) => {
      const p = anchors[Math.round(j * (nj - 1))];
      const alpha = lerp(-46, 28, j) * DEG + 0.14 * Math.sin(ph - 3 * j);
      const scallop = 0.8 + 0.2 * Math.sin(Math.PI * frac(j * rays)) ** 0.6;
      const reach =
        (6 + 8 * Math.sin(Math.PI * (0.1 + 0.8 * j)) ** 0.8) * scallop * a;
      const ca = Math.cos(alpha);
      const sa = Math.sin(alpha);
      const wave =
        3.6 * a ** 1.3 * Math.sin(ph - 3.2 * j - 1.5 * a) + 0.4 * reach;
      const k = p.r * 0.85;
      out[0] = p.f - p.bf * k + (-p.bf * ca + p.tf * sa) * reach;
      out[1] = p.l - p.bl * k + (-p.bl * ca + p.tl * sa) * reach + wave;
      out[2] = p.u - p.bu * k + (-p.bu * ca + p.tu * sa) * reach;
    },
    finInk(rays),
  );
}

function paintCheekFins(h: HeadPose, ph: number): void {
  const nj = 34;
  const ni = 26;
  const rays = 5;
  for (const side of [1, -1]) {
    sheet(
      side > 0 ? PART.finL : PART.finR,
      nj,
      ni,
      (j, a, out) => {
        const alpha =
          lerp(-62, 20, j) * DEG +
          0.22 * Math.sin(ph - 1.2 - 2.4 * j) +
          0.12 * Math.sin(ph);
        const scallop = 0.8 + 0.2 * Math.sin(Math.PI * frac(j * rays)) ** 0.6;
        const reach =
          (5 + 8 * Math.sin(Math.PI * (0.1 + 0.8 * j)) ** 0.7) * scallop * a;
        const flare = 0.85 + 0.2 * Math.sin(ph - 1.4 - 2 * a);
        const x = -Math.cos(alpha);
        const y = Math.sin(alpha);
        const n = norm3(x, y, flare);
        const q = onHead(
          h,
          -2.6 + (reach * x) / n,
          -1 + (reach * y) / n,
          side * (5 + (reach * flare) / n),
        );
        out[0] = q[0];
        out[1] = q[1];
        out[2] = q[2];
      },
      finInk(rays),
    );
  }
}

const FOAM_AT = { f: 8, l: 3, slots: 18, turns: 1.6, inner: 2.5, outer: 17 };

function foamBlobs(
  frame: number,
  each: (f: number, l: number, u: number, r: number) => void,
): void {
  const { slots, turns, inner, outer } = FOAM_AT;
  for (let j = 0; j < slots; j++) {
    const slot = j + frame / FRAMES;
    const t = slot / slots;
    const r =
      2.7 * Math.sin(Math.PI * t) ** 0.6 * (1 + 0.18 * Math.sin(slot * 2.1));
    if (r < 0.9) continue;
    const ang = 0.6 + t * turns * TAU;
    const rho = lerp(inner, outer, t ** 0.85);
    each(
      FOAM_AT.f + rho * Math.cos(ang),
      FOAM_AT.l + rho * Math.sin(ang),
      r * 0.55,
      r,
    );
  }
}

const foamLook: Look = (a, b, c) => FOAM[tone(lit(a, b, c) * 1.05)];

function paintFoam(frame: number): void {
  foamBlobs(frame, (f, l, u, r) => ball(f, l, u, r, PART.foam, foamLook));
}

function paintBubbles(frame: number): void {
  const n = 4;
  for (let k = 0; k < n; k++) {
    const t = (k + frame / FRAMES) / n;
    const r = 3.1 * Math.sin(Math.PI * t) ** 0.9;
    if (r < 1.1) continue;
    const ang = 0.9 + t * TAU;
    const rho = 22 + 2.5 * Math.sin(t * TAU * 2);
    const f = 3 + rho * Math.cos(ang);
    const l = rho * Math.sin(ang);
    const u = 22 + 56 * t;
    const rr = r * SCALE;
    const wy = (f * HY + l * HX) * SCALE;
    const cx = OX + (f * HX - l * HY) * SCALE;
    const cy = OY - (wy * SIN + u * SCALE * COS);
    const depth = wy * COS - u * SCALE * SIN;
    const x0 = Math.round(cx);
    const y0 = Math.round(cy);
    const reach = Math.ceil(rr);
    for (let py = y0 - reach; py <= y0 + reach; py++)
      for (let px = x0 - reach; px <= x0 + reach; px++) {
        if (px < 0 || py < 0 || px >= W || py >= H) continue;
        const dx = px - cx;
        const dy = py - cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        const glint =
          Math.abs(dx + rr * 0.42) < 0.6 && Math.abs(dy + rr * 0.42) < 0.6;
        if (!glint && (d > rr || d < rr - 1.15)) continue;
        const i = py * W + px;
        if (depth - rr >= DEPTH[i]) continue;
        DEPTH[i] = depth - rr;
        OWNER[i] = PART.bubble;
        SRC[i] = -1;
        INK[i] =
          glint || dx + dy < -rr * 0.5
            ? FOAM[0]
            : dx + dy > rr * 0.5
              ? FOAM[3]
              : FOAM[2];
      }
  }
}

function seahorse(frame: number): void {
  const ph = (frame / FRAMES) * TAU;
  const bob = 0.9 * Math.sin(ph);
  const sp = spine(ph, bob);
  const head = headAt(ph, bob);
  paintSpine(sp);
  paintKnobs(sp);
  paintBuckle(sp);
  paintHead(head);
  paintDorsalFin(sp, ph);
  paintCheekFins(head, ph);
  paintPad(bob);
  paintFoam(frame);
  paintBubbles(frame);
}

function fillHoles(): void {
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const k = y * W + x;
      if (OWNER[k]) continue;
      const a = OWNER[k - 1] ? 1 : 0;
      const b = OWNER[k + 1] ? 1 : 0;
      const c = OWNER[k - W] ? 1 : 0;
      const d = OWNER[k + W] ? 1 : 0;
      if (a + b + c + d < 3) continue;
      let near = -1;
      if (a) near = k - 1;
      if (b && (near < 0 || DEPTH[k + 1] < DEPTH[near])) near = k + 1;
      if (c && (near < 0 || DEPTH[k - W] < DEPTH[near])) near = k - W;
      if (d && (near < 0 || DEPTH[k + W] < DEPTH[near])) near = k + W;
      OWNER[k] = OWNER[near];
      INK[k] = INK[near];
      DEPTH[k] = DEPTH[near];
    }
}

function outline(): void {
  OUT.set(INK);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const k = y * W + x;
      const p = OWNER[k];
      if (p === PART.eye || p === PART.bubble) continue;
      if (
        !p &&
        !(x > 0 && OWNER[k - 1]) &&
        !(x < W - 1 && OWNER[k + 1]) &&
        !(y > 0 && OWNER[k - W]) &&
        !(y < H - 1 && OWNER[k + W])
      )
        continue;
      let best = -1;
      for (let n = 0; n < 4; n++) {
        const nx = n === 0 ? x - 1 : n === 1 ? x + 1 : x;
        const ny = n === 2 ? y - 1 : n === 3 ? y + 1 : y;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        const q = OWNER[j];
        if (!q || PART_INK[q] < 0) continue;
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
const COLUMN: Record<string, number> = {
  south: 54,
  "south-east": 50,
  east: 42,
  "north-east": 48,
  north: 54,
};

function clear(): void {
  DEPTH.fill(Infinity);
  OWNER.fill(0);
  SRC.fill(-1);
  INK.fill(-1);
  casters = 0;
}

/** The row of the ground under the chest that puts the foam's lowest pixel just above the cell's bottom edge. */
function groundRow(direction: string): number {
  [HX, HY] = HEADING[direction];
  OX = COLUMN[direction];
  OY = 80;
  clear();
  for (let frame = 0; frame < FRAMES; frame++) paintFoam(frame);
  let low = 0;
  OWNER.forEach((o, k) => {
    if (o) low = Math.max(low, (k / W) | 0);
  });
  return 80 + (H - 2 - FOOT_GAP) - low;
}

const ROW: Record<string, number> = Object.fromEntries(
  Object.keys(HEADING).map((d) => [d, groundRow(d)]),
);

function view(direction: string): void {
  [HX, HY] = HEADING[direction];
  OX = COLUMN[direction];
  OY = ROW[direction];
}

function paint(px: Pixels, direction: string, frame: number): void {
  view(direction);
  clear();
  seahorse(frame);
  shade();
  fillHoles();
  outline();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = OUT[y * W + x];
      if (c >= 0) put(px, x, y, INKS[c]);
    }
}

const NUDGE: Record<string, number> = {
  south: 2,
  "south-east": 1,
  east: 1,
  "north-east": 2,
  north: 0,
};

function seatOf(direction: string): [number, number] {
  view(direction);
  const wy = PAD.f * HY * SCALE;
  return [
    Math.round(OX + PAD.f * HX * SCALE),
    Math.round(OY - (wy * SIN + PAD.top * SCALE * COS)) + NUDGE[direction],
  ];
}

export const CORAL_SEAHORSE: DrawnMount = {
  id: "own-coral-seahorse",
  name: "Coral Seahorse",
  description:
    "ม้าน้ำตัวใหญ่ลอยตัวตรงอยู่กลางอากาศ ลำตัวสีชมพูปะการังไล่เป็นสีส้ม ท้องเป็นข้อเกล็ดเรียงซ้อนกัน ปากยื่นยาวและมีหนามเป็นมงกุฎบนหัว หางม้วนเป็นวงแล้วคลายออกเบาๆ ครีบหลังกับครีบข้างหัวสีเขียวอมฟ้าพลิ้วไหว ตัวโยกขึ้นลงช้าๆ มีฟองอากาศลอยรอบตัวและฟองคลื่นสีขาวหมุนวนอยู่ใต้หาง บนหลังมีเบาะนั่งสีขาวมุกขอบทอง มีสายรัดสีทองคาดรอบลำตัว",
  cell: CELL,
  seat: Object.fromEntries(
    Object.keys(HEADING).map((d) => [d, seatOf(d)]),
  ) as Record<string, [number, number]>,
  paint,
};
