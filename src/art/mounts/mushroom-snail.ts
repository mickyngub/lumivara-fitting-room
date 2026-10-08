import type { DrawnMount } from "../mounts";
import { rgb, type Pixels, type Rgb } from "../pixels";

const CELL = { w: 112, h: 96 };
const FRAMES = 6;
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
// The game looks down on its world at about 25 degrees.
const SIN = Math.sin(25 * DEG);
const COS = Math.cos(25 * DEG);
const FAR = 200;
const EDGE = 2.5;

type V = [number, number, number];

const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: V): V => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / l, a[1] / l, a[2] / l];
};

const DIR: V = [0, COS, -SIN];
const LIGHT = unit([-0.55, -0.45, 0.75]);
const HALF = unit([LIGHT[0] - DIR[0], LIGHT[1] - DIR[1], LIGHT[2] - DIR[2]]);

/** The snail's own axes are x forward, y to its right and z up; a camera holds the view vectors in them. */
type Cam = { dir: V; right: V; up: V; light: V; half: V };

const camera = (yaw: number): Cam => {
  const c = Math.cos(yaw * DEG);
  const s = Math.sin(yaw * DEG);
  const local = ([x, y, z]: V): V => [c * x + s * y, s * x - c * y, z];
  return {
    dir: local(DIR),
    right: local([1, 0, 0]),
    up: local([0, SIN, COS]),
    light: local(LIGHT),
    half: local(HALF),
  };
};

const ramp = (...hex: string[]): Rgb[] => hex.map(rgb);

const SKIN = ramp("#e0f5a8", "#b4dd72", "#86c158", "#5f9a45", "#44763a");
const SKIN_INK = rgb("#35502e");
const SKIN_SHINE = rgb("#f9ffe3");
const FOOT = ramp("#f6f2c4", "#e1e0a2", "#bcc37e", "#929f64");
const CAP = ramp("#ff7b68", "#e84a40", "#c3303c", "#97213d", "#6a1838");
const CAP_INK = rgb("#3b0f26");
const SPOT = ramp("#fffdf2", "#f5ead2", "#d8c6a8", "#b09d86");
const GOLD = ramp("#fff1a8", "#f8d85c", "#e0a93a", "#b3772a", "#86521f");
const GOLD_INK = rgb("#5b3216");
const MOSS = ramp("#8fcb55", "#5f9e3b", "#437a2f", "#2e5a26");
const MOSS_INK = rgb("#1c3518");
const CAPLET = ramp("#ffc470", "#f59a45", "#d36d30", "#a64a28");
const CAPLET_INK = rgb("#5a2812");
const WHITE = ramp("#ffffff", "#eef0ee", "#cdd2d6", "#a6adbb");
const EYE_INK = rgb("#1c1a2a");
const BLUSH = ramp("#ffb3bd", "#f58397");

const band = (v: number, cuts: number[]): number => {
  let n = 0;
  for (const c of cuts) if (v < c) n++;
  return n;
};

type Surf = {
  n: V;
  q: V;
  p: V;
  lit: number;
  glint: number;
  dither: number;
  dark: number;
};
type Look = (s: Surf) => Rgb;
type Part = {
  group: number;
  ink: Rgb;
  look: Look;
  shadowed: boolean;
  at: V;
  halfW: number;
  halfH: number;
  depth: (o0: number, o1: number, o2: number, limit: number) => number;
  hit: (o0: number, o1: number, o2: number, t: number, s: Surf) => void;
};

/** An ellipsoid along the snail's axes. q is the hit on the unit sphere it stretches, and floor and ceil cut off what lies below and above those heights of that sphere. */
function ellipsoid(
  cam: Cam,
  at: V,
  r: V,
  group: number,
  ink: Rgb,
  look: Look,
  opts: { floor?: number; ceil?: number; shadowed?: boolean } = {},
): Part {
  const d = cam.dir;
  const floor = opts.floor ?? -1;
  const ceil = opts.ceil ?? 1;
  const e0 = d[0] / r[0];
  const e1 = d[1] / r[1];
  const e2 = d[2] / r[2];
  const a = e0 * e0 + e1 * e1 + e2 * e2;
  return {
    group,
    ink,
    look,
    shadowed: opts.shadowed ?? true,
    at,
    halfW: Math.hypot(
      cam.right[0] * r[0],
      cam.right[1] * r[1],
      cam.right[2] * r[2],
    ),
    halfH: Math.hypot(cam.up[0] * r[0], cam.up[1] * r[1], cam.up[2] * r[2]),
    depth(o0, o1, o2, limit) {
      const q0 = (o0 - at[0]) / r[0];
      const q1 = (o1 - at[1]) / r[1];
      const q2 = (o2 - at[2]) / r[2];
      const b = q0 * e0 + q1 * e1 + q2 * e2;
      const disc = b * b - a * (q0 * q0 + q1 * q1 + q2 * q2 - 1);
      if (disc < 0) return Infinity;
      const t = (-b - Math.sqrt(disc)) / a;
      const z = q2 + e2 * t;
      return t < limit && z >= floor && z <= ceil ? t : Infinity;
    },
    hit(o0, o1, o2, t, s) {
      const q0 = (o0 - at[0]) / r[0] + e0 * t;
      const q1 = (o1 - at[1]) / r[1] + e1 * t;
      const q2 = (o2 - at[2]) / r[2] + e2 * t;
      const n0 = q0 / r[0];
      const n1 = q1 / r[1];
      const n2 = q2 / r[2];
      const l = Math.hypot(n0, n1, n2);
      s.q[0] = q0;
      s.q[1] = q1;
      s.q[2] = q2;
      s.n[0] = n0 / l;
      s.n[1] = n1 / l;
      s.n[2] = n2 / l;
      s.p[0] = o0 + d[0] * t;
      s.p[1] = o1 + d[1] * t;
      s.p[2] = o2 + d[2] * t;
    },
  };
}

const CAP_AT: V = [-6, 0, 11];
const CAP_R: V = [28, 28, 21];
const CUSHION_AT: V = [-6, 0, 29.5];
const CUSHION_R: V = [16, 16, 5.5];
const GROUND = 3.2;

/** Whether the cap, a half ellipsoid standing on its flat base, is between a point and the light. */
function inCapShadow(p: V, l: V): boolean {
  const e0 = (p[0] - CAP_AT[0]) / CAP_R[0];
  const e1 = (p[1] - CAP_AT[1]) / CAP_R[1];
  const e2 = (p[2] - CAP_AT[2]) / CAP_R[2];
  const d0 = l[0] / CAP_R[0];
  const d1 = l[1] / CAP_R[1];
  const d2 = l[2] / CAP_R[2];
  const a = d0 * d0 + d1 * d1 + d2 * d2;
  const b = e0 * d0 + e1 * d1 + e2 * d2;
  const disc = b * b - a * (e0 * e0 + e1 * e1 + e2 * e2 - 1);
  if (disc <= 0) return false;
  const root = Math.sqrt(disc);
  const enter = Math.max((-b - root) / a, (CAP_AT[2] - p[2]) / l[2], 0);
  return (-b + root) / a > enter;
}

const SPOTS = (
  [
    [10, 40, 11],
    [100, 40, 9],
    [190, 40, 12],
    [280, 40, 9.5],
    [55, 19, 8],
    [145, 19, 9.5],
    [235, 19, 7.5],
    [325, 19, 8.5],
    [50, 52, 5.5],
    [140, 52, 5.5],
    [235, 52, 5.5],
    [325, 52, 5.5],
    [165, 28, 4.5],
    [350, 29, 4.5],
  ] as V[]
).map(([az, el, r]): [number, number, number, number] => [
  Math.cos(el * DEG) * Math.cos(az * DEG),
  Math.cos(el * DEG) * Math.sin(az * DEG),
  Math.sin(el * DEG),
  Math.cos(r * DEG),
]);

const MOSSES: [az: number, r: number, z: number, size: number][] = [
  [48, 27, 9.5, 3.8],
  [62, 28, 9.2, 4.6],
  [76, 27, 10.5, 3.6],
  [68, 26, 12.5, 2.8],
  [138, 27, 9.5, 3.6],
  [152, 28, 9, 4.4],
  [166, 27, 10, 3.4],
  [-128, 27, 9.5, 3.8],
  [-114, 28, 9, 4.6],
  [-100, 27, 10, 3.4],
  [-48, 27, 9.8, 3.2],
  [-36, 27, 9.5, 3.6],
];

const SHROOMS: [az: number, r: number, z: number, stem: number, cap: number][] =
  [
    [66, 29, 12, 6.5, 4.4],
    [152, 28.5, 11.5, 6, 3.8],
    [-114, 29, 11.5, 6.2, 4.2],
    [-38, 28, 11.5, 5, 3.2],
    [72, 26.5, 13, 4, 2.7],
  ];

/** The foot's outline from the tail to the neck: where, how long, how wide and how high a dome of it is. */
const SPINE: [x: number, rx: number, ry: number, rz: number][] = [
  [-41, 5, 6, 4.4],
  [-36, 6, 9.4, 5.8],
  [-30, 7.5, 13, 7.4],
  [-23, 8.5, 16.5, 9],
  [-15, 9.5, 20, 10.2],
  [-6, 10, 22, 11],
  [3, 10, 22.5, 11.3],
  [11, 9.5, 20.5, 11.8],
  [18, 9, 16, 12.3],
  [25, 8.5, 12.8, 12.8],
  [32, 8.5, 11, 10.5],
];

function spine(x: number): [number, number, number] {
  let k = 0;
  while (k < SPINE.length - 2 && SPINE[k + 1][0] <= x) k++;
  const [x0, ...a] = SPINE[k];
  const [x1, ...b] = SPINE[k + 1];
  const t = Math.max(0, Math.min(1, (x - x0) / (x1 - x0)));
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

/** The waves run forward along the foot, 4 px further each frame. */
const crest = (x: number, frame: number) =>
  Math.sin(TAU * ((x + 50) / 24 - frame / FRAMES));

const swell = (x: number, frame: number) =>
  Math.sin(TAU * ((x + 50) / 96 - frame / FRAMES));

const smooth = (t: number) => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};

const skinTone = (v: number) => SKIN[band(v, [0.78, 0.4, 0.05, -0.35])];

const plainLook: Look = (s) => skinTone(s.lit + s.dither - 0.55 * s.dark);

/** The foot is shaded as the one smooth surface its domes outline, so no seams show between them. */
const bodyLook =
  (frame: number, light: V): Look =>
  (s) => {
    const [x, y, z] = s.p;
    const h = z - GROUND;
    const [, ry, rz] = spine(x);
    const [, ryAfter, rzAfter] = spine(x + 3);
    const [, ryBefore, rzBefore] = spine(x - 3);
    const gx =
      (-(y * y) / ry ** 3) * ((ryAfter - ryBefore) / 6) -
      ((h * h) / rz ** 3) * ((rzAfter - rzBefore) / 6);
    const gy = y / (ry * ry);
    const gz = h / (rz * rz);
    const lit =
      (gx * light[0] + gy * light[1] + gz * light[2]) /
      (Math.hypot(gx, gy, gz) || 1);
    const fold = Math.sin(TAU * ((x + 0.5 * h + 50) / 12 - frame / FRAMES));
    return skinTone(
      lit + s.dither - 0.55 * s.dark - (fold < -0.9 && x > 6 ? 0.3 : 0),
    );
  };

const footLook: Look = (s) =>
  FOOT[band(s.lit + s.dither - 0.55 * s.dark, [0.6, 0.2, -0.2])];

/** The face turns a little toward the viewer, as the eyes do, so its smile shows from the side. */
const headLook =
  (face: V): Look =>
  (s) => {
    const [q0, q1, q2] = s.q;
    const a =
      Math.atan2(q1 * face[0] - q0 * face[1], q0 * face[0] + q1 * face[1]) /
      DEG;
    if (Math.abs(a) < 52 && Math.abs(q2 - (0.28 * (a / 52) ** 2 - 0.36)) < 0.08)
      return SKIN_INK;
    if (((Math.abs(a) - 46) / 12) ** 2 + ((q2 - 0.02) / 0.15) ** 2 < 1)
      return BLUSH[s.lit - 0.55 * s.dark > 0.2 ? 0 : 1];
    return s.glint > 0.975 && !s.dark ? SKIN_SHINE : plainLook(s);
  };

const eyeLook =
  (gaze: V): Look =>
  (s) => {
    if (s.glint > 0.95) return WHITE[0];
    if (dot(s.n, gaze) > 0.8) return EYE_INK;
    return WHITE[band(s.lit + s.dither, [0.5, 0.0, -0.45])];
  };

function capLook(s: Surf): Rgb {
  const [q0, q1, q2] = s.q;
  const v = s.lit + s.dither;
  for (const [u0, u1, u2, c] of SPOTS)
    if (q0 * u0 + q1 * u1 + q2 * u2 > c)
      return SPOT[band(v, [0.55, 0.1, -0.35])];
  if (q2 < 0.15) {
    const gill = Math.sin(Math.atan2(q1, q0) * 24) > 0.5 ? 1 : 0;
    return SPOT[Math.min(3, band(v, [0.55, 0.1, -0.35]) + gill)];
  }
  return CAP[band(v, [0.93, 0.66, 0.3, -0.05])];
}

function cushionLook(s: Surf): Rgb {
  if (s.q[2] < -0.1) return GOLD[4];
  if (s.q[2] < 0.22) return GOLD[s.lit > 0.3 ? 2 : 3];
  return GOLD[band(s.lit + s.dither, [0.85, 0.5, 0.05, -0.35])];
}

const mossLook: Look = (s) =>
  MOSS[band(s.lit + s.dither - 0.45 * s.dark, [0.62, 0.2, -0.2])];

const stemLook: Look = (s) =>
  SPOT[band(s.lit + s.dither - 0.5 * s.dark, [0.5, 0.05, -0.4])];

function capletLook(s: Surf): Rgb {
  if (s.q[0] * -0.5 + s.q[1] * -0.3 + s.q[2] * 0.8 > 0.93) return SPOT[0];
  return CAPLET[band(s.lit + s.dither - 0.4 * s.dark, [0.7, 0.3, -0.1])];
}

const BODY = 0;
const CAP_G = 1;
const CUSHION_G = 2;
const MOSS_G = 3;
const STALK_G = 4;
const EYE_G = 6;
const SHROOM_G = 8;

function model(cam: Cam, frame: number): Part[] {
  const parts: Part[] = [];
  const add = (
    at: V,
    r: V,
    group: number,
    ink: Rgb,
    look: Look,
    opts?: { floor?: number; ceil?: number; shadowed?: boolean },
  ) => parts.push(ellipsoid(cam, at, r, group, ink, look, opts));

  const body = bodyLook(frame, cam.light);
  const reach = 1.8 * Math.sin((TAU * frame) / FRAMES + 0.8);
  const wag = 2.4 * Math.sin((TAU * frame) / FRAMES);
  for (let x = -41; x <= 32; x += 4.5) {
    const [rx, ry, rz] = spine(x);
    const s = swell(x, frame);
    const at = x + reach * smooth((x - 4) / 28);
    const sway = wag * smooth((-x - 20) / 20);
    add(
      [at, sway, GROUND],
      [rx, ry * (1 - 0.04 * s), rz + 1.5 * s],
      BODY,
      SKIN_INK,
      body,
      { floor: 0 },
    );
    add(
      [at, sway, GROUND],
      [Math.max(4.5, rx * 0.9), ry + 0.9 + 0.9 * crest(x, frame), GROUND],
      BODY,
      SKIN_INK,
      footLook,
      { ceil: 0.3 },
    );
  }
  const headX = 36 + reach;
  const headZ = 15.5 + 0.9 * swell(36, frame);
  const face = unit([1 - 0.9 * cam.dir[0], -0.9 * cam.dir[1], 0]);
  add([headX, 0, headZ], [13, 12, 10], BODY, SKIN_INK, headLook(face));

  const eye = eyeLook(unit([1 - 0.5 * cam.dir[0], -0.5 * cam.dir[1], 0.1]));
  [1, -1].forEach((side, k) => {
    const a = (TAU * frame) / FRAMES + (side > 0 ? 0 : Math.PI);
    const base: V = [headX - 2, side * 5, headZ + 9];
    const tip: V = [
      headX + side * 4.5 + 1.2 * Math.cos(a),
      side * (12 + 1.5 * Math.sin(a)),
      headZ + 26 + 2.6 * Math.sin(a),
    ];
    const ctrl: V = [
      (base[0] + tip[0]) / 2,
      tip[1] * 0.9,
      base[2] + (tip[2] - base[2]) * 0.55,
    ];
    const steps = 9;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const u = 1 - t;
      const r = 2.6 - 0.6 * t;
      add(
        [
          u * u * base[0] + 2 * u * t * ctrl[0] + t * t * tip[0],
          u * u * base[1] + 2 * u * t * ctrl[1] + t * t * tip[1],
          u * u * base[2] + 2 * u * t * ctrl[2] + t * t * tip[2],
        ],
        [r, r, r],
        STALK_G + k,
        SKIN_INK,
        (s) =>
          skinTone(s.lit + s.dither - 0.55 * s.dark - (i % 3 === 0 ? 0.18 : 0)),
      );
    }
    add([tip[0], tip[1], tip[2] + 1], [4.2, 4.2, 4.2], EYE_G + k, EYE_INK, eye);
  });

  add(CAP_AT, CAP_R, CAP_G, CAP_INK, capLook, { floor: 0, shadowed: false });
  add(CUSHION_AT, CUSHION_R, CUSHION_G, GOLD_INK, cushionLook, {
    shadowed: false,
  });

  for (const [az, r, z, size] of MOSSES)
    add(
      [CAP_AT[0] + r * Math.cos(az * DEG), r * Math.sin(az * DEG), z],
      [size, size, size * 0.85],
      MOSS_G,
      MOSS_INK,
      mossLook,
    );
  SHROOMS.forEach(([az, r, z, stem, cap], k) => {
    const x = CAP_AT[0] + r * Math.cos(az * DEG);
    const y = r * Math.sin(az * DEG);
    add(
      [x, y, z + stem / 2],
      [1.2, 1.2, stem / 2 + 0.6],
      SHROOM_G + k,
      CAPLET_INK,
      stemLook,
    );
    add(
      [x, y, z + stem],
      [cap, cap, cap * 0.8],
      SHROOM_G + k,
      CAPLET_INK,
      capletLook,
      { floor: -0.15 },
    );
  });
  return parts;
}

const SIZE = CELL.w * CELL.h;
const depthAt = new Float64Array(SIZE);
const partAt = new Int16Array(SIZE);
const colourAt: Rgb[] = new Array(SIZE);
const inkAt: Rgb[] = new Array(SIZE);
const groupAt = new Int8Array(SIZE);

type View = { yaw: number; x: number; y: number };
const VIEWS: Record<string, View> = {
  south: { yaw: -90, x: 56, y: 78 },
  "south-east": { yaw: -45, x: 55, y: 81 },
  east: { yaw: 0, x: 54, y: 85 },
  "north-east": { yaw: 45, x: 52, y: 79 },
  north: { yaw: 90, x: 56, y: 75 },
};

function paint(px: Pixels, direction: string, frame: number): void {
  const { w, h } = CELL;
  const view = VIEWS[direction];
  const cam = camera(view.yaw);
  const parts = model(cam, frame);
  depthAt.fill(Infinity);
  partAt.fill(-1);
  const origin = (x: number, y: number, o: V) => {
    const sx = x + 0.5 - view.x;
    const su = view.y - (y + 0.5);
    o[0] = cam.right[0] * sx + cam.up[0] * su - cam.dir[0] * FAR;
    o[1] = cam.right[1] * sx + cam.up[1] * su - cam.dir[1] * FAR;
    o[2] = cam.right[2] * sx + cam.up[2] * su - cam.dir[2] * FAR;
  };
  const o: V = [0, 0, 0];
  parts.forEach((part, id) => {
    const cx = view.x + dot(cam.right, part.at);
    const cy = view.y - dot(cam.up, part.at);
    const x0 = Math.max(0, Math.floor(cx - part.halfW));
    const x1 = Math.min(w - 1, Math.ceil(cx + part.halfW));
    const y0 = Math.max(0, Math.floor(cy - part.halfH));
    const y1 = Math.min(h - 1, Math.ceil(cy + part.halfH));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        origin(x, y, o);
        const i = y * w + x;
        const t = part.depth(o[0], o[1], o[2], depthAt[i]);
        if (t < depthAt[i]) {
          depthAt[i] = t;
          partAt[i] = id;
        }
      }
  });
  const s: Surf = {
    n: [0, 0, 0],
    q: [0, 0, 0],
    p: [0, 0, 0],
    lit: 0,
    glint: 0,
    dither: 0,
    dark: 0,
  };
  groupAt.fill(-1);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (partAt[i] < 0) continue;
      const part = parts[partAt[i]];
      origin(x, y, o);
      part.hit(o[0], o[1], o[2], depthAt[i], s);
      s.lit = dot(s.n, cam.light);
      s.glint = dot(s.n, cam.half);
      s.dither = ((x + y) & 1 ? 1 : -1) * 0.03;
      s.dark = part.shadowed && inCapShadow(s.p, cam.light) ? 1 : 0;
      colourAt[i] = part.look(s);
      inkAt[i] = part.ink;
      groupAt[i] = part.group;
    }
  const front = (i: number, j: number, best: number): number => {
    if (groupAt[j] < 0 || groupAt[j] === groupAt[i]) return best;
    if (groupAt[i] >= 0 && depthAt[j] > depthAt[i] - EDGE) return best;
    return best < 0 || depthAt[j] < depthAt[best] ? j : best;
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let edge = -1;
      if (x > 0) edge = front(i, i - 1, edge);
      if (x < w - 1) edge = front(i, i + 1, edge);
      if (y > 0) edge = front(i, i - w, edge);
      if (y < h - 1) edge = front(i, i + w, edge);
      const c = edge >= 0 ? inkAt[edge] : groupAt[i] >= 0 ? colourAt[i] : null;
      if (!c) continue;
      const at = (y * px.w + x) * 4;
      px.data[at] = c[0];
      px.data[at + 1] = c[1];
      px.data[at + 2] = c[2];
      px.data[at + 3] = 255;
    }
}

const SEAT_LOCAL: V = [CUSHION_AT[0], 0, CUSHION_AT[2] + CUSHION_R[2]];

function seatOf(direction: string): [number, number] {
  const view = VIEWS[direction];
  const cam = camera(view.yaw);
  return [
    Math.floor(view.x + dot(cam.right, SEAT_LOCAL)),
    Math.floor(view.y - dot(cam.up, SEAT_LOCAL)),
  ];
}

export const MUSHROOM_SNAIL: DrawnMount = {
  id: "own-mushroom-snail",
  name: "Mushroom Snail",
  description:
    "หอยทากตัวใหญ่ใจดีสีเขียวอ่อน เปลือกเป็นหมวกเห็ดสีแดงจุดขาว มีมอสและเห็ดจิ๋วขึ้นรอบโคนหมวก ตากลมโตสองข้างบนก้านยาวโยกขึ้นลงสลับกัน ไม่มีขา ลำตัวไหวเป็นระลอกไถลไปข้างหน้าอย่างนุ่มนวล มีเบาะนั่งสีเหลืองทองบนยอดหมวกเห็ด",
  cell: CELL,
  seat: Object.fromEntries(
    Object.keys(VIEWS).map((d) => [d, seatOf(d)]),
  ) as Record<string, [number, number]>,
  paint,
};
