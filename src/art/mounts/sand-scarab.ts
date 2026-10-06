import type { DrawnMount } from "../mounts";
import { put, rgb, type Pixels, type Rgb } from "../pixels";

const CELL = { w: 112, h: 90 };

type V = [number, number, number];
type M = [V, V, V];

const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V, k: number): V => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V, b: V): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a: V): V => mul(a, 1 / Math.hypot(a[0], a[1], a[2]));
const deg = Math.PI / 180;
const frac = (v: number): number => v - Math.floor(v);

/** Rows are the local x, y, z axes: x along `along`, z as near `toward` as stays square to it. */
function axes(along: V, toward: V): M {
  const x = unit(along);
  const z = unit(sub(toward, mul(x, dot(toward, x))));
  return [x, cross(z, x), z];
}
const STILL: M = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const pitched = (a: number): M => [
  [Math.cos(a), 0, -Math.sin(a)],
  [0, 1, 0],
  [Math.sin(a), 0, Math.cos(a)],
];

/** p is the model-space point, q the shape's own coordinates; inner is true on a shell's concave side. */
type Surface = { t: number; n: V; p: V; q: V; inner: boolean };
/** Aims a shape along one view direction; the ray it returns skips hits at or beyond `limit`. */
type Shape = (d: V) => (o: V, limit: number) => Surface | undefined;
/** over is true when something is already painted behind this pixel. */
type Light = { lit: number; glint: number; facing: number; over: boolean };
type Look = (s: Surface, light: Light) => Rgb;
type Part = { centre: V; reach: number; shape: Shape; look: Look; ink: Rgb };

function ellipsoid(
  c: V,
  s: V,
  m: M = STILL,
  keep?: (q: V, p: V) => boolean,
): Shape {
  const [mx, my, mz] = m;
  return (d) => {
    const dx = dot(mx, d) / s[0];
    const dy = dot(my, d) / s[1];
    const dz = dot(mz, d) / s[2];
    const a = dx * dx + dy * dy + dz * dz;
    return (o, limit) => {
      const ex = o[0] - c[0];
      const ey = o[1] - c[1];
      const ez = o[2] - c[2];
      const qx = (mx[0] * ex + mx[1] * ey + mx[2] * ez) / s[0];
      const qy = (my[0] * ex + my[1] * ey + my[2] * ez) / s[1];
      const qz = (mz[0] * ex + mz[1] * ey + mz[2] * ez) / s[2];
      const b = qx * dx + qy * dy + qz * dz;
      const h = b * b - a * (qx * qx + qy * qy + qz * qz - 1);
      if (h < 0) return undefined;
      const root = Math.sqrt(h);
      for (const t of [(-b - root) / a, (-b + root) / a]) {
        if (t >= limit) return undefined;
        const q: V = [qx + dx * t, qy + dy * t, qz + dz * t];
        const p: V = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
        if (keep && !keep(q, p)) continue;
        const n = unit(
          add(
            add(mul(mx, q[0] / s[0]), mul(my, q[1] / s[1])),
            mul(mz, q[2] / s[2]),
          ),
        );
        const inner = dot(n, d) > 0;
        return { t, n: inner ? mul(n, -1) : n, p, q, inner };
      }
      return undefined;
    };
  };
}

function capsule(a: V, b: V, r: number): Shape {
  const ba = sub(b, a);
  const baba = dot(ba, ba);
  return (d) => {
    const bard = dot(ba, d);
    const k2 = baba - bard * bard;
    return (o, limit) => {
      const oa = sub(o, a);
      const baoa = dot(ba, oa);
      const k1 = baba * dot(oa, d) - baoa * bard;
      const k0 = baba * dot(oa, oa) - baoa * baoa - r * r * baba;
      let h = k1 * k1 - k2 * k0;
      if (h < 0) return undefined;
      let t = (-k1 - Math.sqrt(h)) / k2;
      const y = baoa + t * bard;
      if (y <= 0 || y >= baba) {
        const oc = y <= 0 ? oa : sub(o, b);
        const bb = dot(d, oc);
        h = bb * bb - (dot(oc, oc) - r * r);
        if (h < 0) return undefined;
        t = -bb - Math.sqrt(h);
      }
      if (t >= limit) return undefined;
      const p = add(o, mul(d, t));
      const k = Math.max(0, Math.min(1, dot(sub(p, a), ba) / baba));
      const n = unit(sub(p, add(a, mul(ba, k))));
      return { t, n, p, q: [k, 0, 0], inner: false };
    };
  };
}

function sheet(
  origin: V,
  m: M,
  inside: (u: number, v: number) => boolean,
): Shape {
  return (d) => {
    const dn = dot(d, m[2]);
    const inner = dn > 0;
    const n = inner ? mul(m[2], -1) : m[2];
    return (o, limit) => {
      if (Math.abs(dn) < 1e-6) return undefined;
      const t = dot(sub(origin, o), m[2]) / dn;
      if (t >= limit) return undefined;
      const p = add(o, mul(d, t));
      const local = sub(p, origin);
      const u = dot(local, m[0]);
      const v = dot(local, m[1]);
      if (!inside(u, v)) return undefined;
      return { t, n, p, q: [u, v, 0], inner };
    };
  };
}

const ramp = (...hex: string[]): Rgb[] => hex.map(rgb);
const SHELL = ramp(
  "#fff4b0",
  "#e4d257",
  "#8ec94f",
  "#33a867",
  "#1d7b74",
  "#1f4e71",
  "#2a2f63",
);
const SHELL_INK = rgb("#0d1a2c");
const BRONZE = ramp("#f4c47c", "#d39245", "#a4642f", "#6f3d23", "#46251a");
const BRONZE_INK = rgb("#25120c");
const GOLD = ramp("#fff6b8", "#ffd34a", "#e49c25", "#a5621b");
const RUG = ramp("#ea5a4c", "#c52f36", "#8b1b2d", "#5a1328");
const RUG_INK = rgb("#3a0c1c");
const WING = ramp("#fff1c4", "#ffd88a", "#f6ae4a", "#d6802a");
const WING_INK = rgb("#86441a");
const EYE = ramp("#fffbe2", "#ffc43e", "#ee8a1c", "#9c4a12");

function band(lit: number, cuts: number[]): number {
  let n = 0;
  for (const c of cuts) if (lit < c) n++;
  return n;
}

const shellIndex = ({ lit, glint, facing }: Light): number =>
  glint > 0.965
    ? 0
    : Math.min(
        6,
        1 + band(lit, [0.86, 0.56, 0.18, -0.22]) + (facing < 0.28 ? 1 : 0),
      );

const bronzeTone = (lit: number, shift = 0): Rgb =>
  BRONZE[
    Math.max(0, Math.min(4, band(lit, [0.75, 0.35, -0.05, -0.45]) + shift))
  ];

const goldTone = ({ lit, glint }: Light): Rgb =>
  glint > 0.93 ? GOLD[0] : GOLD[1 + band(lit, [0.3, -0.25])];

const BODY: { c: V; s: V } = { c: [-9, 0, 0], s: [27, 19, 13] };
const PRONOTUM: { c: V; s: V } = { c: [13, 0, 0.5], s: [13, 17.5, 11] };
const RUG_AT = { x: -3, long: 9, wide: 14.5 };
const SUN: V = unit([0.42, 0, 0.9]);
const SUN_UP: V = unit(sub([0, 0, 1], mul(SUN, SUN[2])));
const SUN_SIDE: V = cross(SUN, SUN_UP);

function sunDisc(q: V): number {
  const along = dot(unit(q), SUN);
  if (along > 0.9) return along > 0.92 ? 0 : 1;
  if (along < 0.8) return -1;
  const a = Math.atan2(dot(q, SUN_SIDE), dot(q, SUN_UP));
  return frac((a / (2 * Math.PI)) * 10 + 0.25) < 0.42 ? 2 : -1;
}

const pronotumLook: Look = ({ q }, light) => {
  const sun = sunDisc(q);
  if (sun === 0) return goldTone(light);
  if (sun === 1) return GOLD[3];
  if (sun === 2) return goldTone({ ...light, lit: light.lit - 0.3 });
  return SHELL[shellIndex(light)];
};

const bodyLook: Look = ({ q }, { lit }) => {
  const plate = frac((q[0] + 1) * 4.2 + 0.5);
  return bronzeTone(lit, plate < 0.16 ? 1 : plate < 0.3 ? -1 : 0);
};

function rugCover(p: V): boolean {
  const dx = Math.abs(p[0] - RUG_AT.x);
  const dy = Math.abs(p[1]);
  if (dy > RUG_AT.wide) return false;
  if (dx < RUG_AT.long) return true;
  return dx < RUG_AT.long + 2 && frac(dy / 3) < 0.5 && p[2] > 0;
}

const rugLook: Look = ({ p }, { lit }) => {
  const dx = Math.abs(p[0] - RUG_AT.x);
  const dy = Math.abs(p[1]);
  const shade = lit < -0.25 ? 1 : 0;
  if (dx > RUG_AT.long) return GOLD[2 + shade];
  if (dx > RUG_AT.long - 1.6 || dy > RUG_AT.wide - 1.6) return GOLD[1 + shade];
  if (dx > RUG_AT.long - 2.6 || dy > RUG_AT.wide - 2.6) return RUG[2 + shade];
  const ring = dx / (RUG_AT.long - 2.6) + dy / (RUG_AT.wide - 2.6);
  if (ring < 0.22 || (ring > 0.5 && ring < 0.64)) return GOLD[1 + shade];
  if (ring > 0.64 && ring < 0.74) return RUG[2 + shade];
  return RUG[(lit > 0.55 ? 0 : 1) + shade];
};

const elytronLook: Look = ({ q, inner }, light) => {
  if (q[2] < 0.24) return goldTone(light);
  const index = shellIndex(light);
  if (inner) return SHELL[Math.min(6, index + 1)];
  const stria = index > 0 && frac((q[1] + 1) * 2) < 0.14;
  return SHELL[Math.min(6, index + (stria ? 1 : 0))];
};

const headLook: Look = (_, light) => SHELL[Math.min(6, shellIndex(light) + 2)];

const shovelLook: Look = ({ q }, light) =>
  q[0] > 0.62 ? goldTone(light) : SHELL[Math.min(6, shellIndex(light) + 2)];

const eyeLook: Look = (_, { lit, glint }) =>
  glint > 0.9 ? EYE[0] : EYE[1 + band(lit, [0.2, -0.35])];

const legLook: Look = (_, { lit, glint }) =>
  glint > 0.97 ? BRONZE[0] : bronzeTone(lit, 1);

const goldLook: Look = (_, light) => goldTone(light);

const hornLook: Look = (_, light) =>
  light.glint > 0.9 ? GOLD[0] : bronzeTone(light.lit, 0);

const WING_LONG = 42;
const WING_CHORD = 15;

function wingShape(u: number, v: number): boolean {
  if (u < 0 || u > WING_LONG) return false;
  const t = u / WING_LONG;
  const trail =
    WING_CHORD *
    Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.06)), 0.5) *
    (0.5 + 0.5 * t);
  return v >= -1.5 * Math.sin(Math.PI * t) && v <= trail + 1.2;
}

const wingLook: Look = ({ q }, { over }) => {
  const [u, v] = q;
  if (v < 0.9) return WING[3];
  for (const k of [0.12, 0.27, 0.42])
    if (u > 6 && Math.abs(v - k * u * (1 - u / (WING_LONG * 1.6))) < 0.5)
      return WING[3];
  if (over) return WING[2];
  if (v < 3 && u > WING_LONG * 0.3) return WING[0];
  return u < WING_LONG * 0.45 ? WING[2] : WING[1];
};

const VIEW_PITCH = 30 * deg;

/**
 * Each drawn direction lifts and spreads the wing cases its own way, as the
 * game's artists turn wings per row: the elevated camera would otherwise
 * flatten them seen from behind and stand them up like ears seen from the front.
 */
type View = { yaw: number; x: number; y: number; lift: number; spread: number };
const VIEWS: Record<string, View> = {
  south: { yaw: 90, x: 56, y: 55, lift: 34, spread: 82 },
  "south-east": { yaw: 45, x: 54, y: 58, lift: 32, spread: 72 },
  east: { yaw: 0, x: 54, y: 58, lift: 34, spread: 55 },
  "north-east": { yaw: -45, x: 56, y: 54, lift: 55, spread: 60 },
  north: { yaw: -90, x: 56, y: 59, lift: 44, spread: 80 },
};

const LEGS: [V, V, V, V][] = [
  [
    [15, 8, -6],
    [22, 16, -9],
    [16, 15, -15],
    [19, 12, -18],
  ],
  [
    [0, 9, -9],
    [3, 18, -11],
    [-6, 16, -17],
    [-3, 12, -20],
  ],
  [
    [-12, 9, -9],
    [-10, 18, -11],
    [-20, 15, -16],
    [-18, 11, -19],
  ],
];

const ELYTRON: V = [16.5, 9.5, 6.5];

function scarab(frame: number, view: View, toCamera: V): Part[] {
  const beat = (frame / 6) * 2 * Math.PI;
  const parts: Part[] = [];
  const part = (shape: Shape, look: Look, ink: Rgb, centre: V, reach: number) =>
    parts.push({ shape, look, ink, centre, reach });

  part(ellipsoid(BODY.c, BODY.s), bodyLook, BRONZE_INK, BODY.c, 28);
  part(
    ellipsoid(PRONOTUM.c, PRONOTUM.s),
    pronotumLook,
    SHELL_INK,
    PRONOTUM.c,
    18,
  );
  part(
    ellipsoid(BODY.c, add(BODY.s, [1.6, 1.6, 1.6]), STILL, (_, p) =>
      rugCover(p),
    ),
    rugLook,
    RUG_INK,
    [RUG_AT.x, 0, 10],
    20,
  );
  const head: V = [26, 0, -3.5];
  part(
    ellipsoid(head, [7.5, 11, 5], pitched(12 * deg)),
    headLook,
    SHELL_INK,
    head,
    12,
  );
  const shovel: V = [32.5, 0, -6.5];
  part(
    ellipsoid(shovel, [9.5, 15.5, 1.9], pitched(20 * deg)),
    shovelLook,
    SHELL_INK,
    shovel,
    15,
  );
  const hornBase: V = [31.5, 0, -3];
  const hornMid: V = [34, 0, 1];
  const hornTip: V = [33, 0, 4.5];
  part(capsule(hornBase, hornMid, 2), hornLook, BRONZE_INK, hornMid, 6);
  part(capsule(hornMid, hornTip, 1.3), goldLook, BRONZE_INK, hornTip, 4);
  for (const side of [1, -1]) {
    part(
      capsule([39.5, side * 2.5, -9.5], [42, side * 3, -10.5], 1.3),
      goldLook,
      BRONZE_INK,
      [41, side * 3, -10],
      4,
    );
    const eye: V = [23.5, side * 11.8, -2.5];
    part(ellipsoid(eye, [3.3, 3.3, 3.3]), eyeLook, BRONZE_INK, eye, 4);
    for (const leg of LEGS) {
      const [hip, knee, ankle, toe] = leg.map(([x, y, z]): V => [
        x,
        side * y,
        z,
      ]);
      part(capsule(hip, knee, 2.6), legLook, BRONZE_INK, knee, 10);
      part(capsule(knee, ankle, 2.1), legLook, BRONZE_INK, ankle, 10);
      part(capsule(ankle, toe, 1.3), legLook, BRONZE_INK, toe, 5);
    }

    const lift = (view.lift + 2 * Math.cos(beat)) * deg;
    const spread = view.spread * deg;
    const along: V = [
      -Math.cos(lift) * Math.cos(spread),
      side * Math.cos(lift) * Math.sin(spread),
      Math.sin(lift),
    ];
    const m = axes(along, add([0, side * 0.25, 1], mul(toCamera, 1.5)));
    const centre = add([-6, side * 10, 10], mul(m[0], ELYTRON[0]));
    part(
      ellipsoid(centre, ELYTRON, m, (q) => q[2] > 0),
      elytronLook,
      SHELL_INK,
      centre,
      ELYTRON[0] + 1,
    );
  }
  for (const side of [1, -1]) {
    const rise = (15 + 40 * Math.cos(beat)) * deg;
    const sweep = (30 + 8 * Math.sin(beat)) * deg;
    const span: V = [
      -Math.sin(sweep),
      side * Math.cos(sweep) * Math.cos(rise),
      Math.cos(sweep) * Math.sin(rise),
    ];
    const twist = (12 * Math.sin(beat) - 4) * deg;
    const wm = axes(span, [-Math.cos(twist), 0, -Math.sin(twist)]);
    const root: V = [-6, side * 10, 7];
    part(
      sheet(root, [wm[0], wm[2], cross(wm[0], wm[2])], wingShape),
      wingLook,
      WING_INK,
      add(add(root, mul(span, WING_LONG / 2)), mul(wm[2], WING_CHORD / 3)),
      Math.hypot(WING_LONG / 2, WING_CHORD * 0.7) + 1,
    );
  }
  return parts;
}

function paint(px: Pixels, direction: string, frame: number): void {
  const view = VIEWS[direction];
  const yaw = view.yaw * deg;
  const toView = (w: V): V => [
    w[0] * Math.cos(yaw) + w[1] * Math.sin(yaw),
    -w[0] * Math.sin(yaw) + w[1] * Math.cos(yaw),
    w[2],
  ];
  const d = toView([0, -Math.cos(VIEW_PITCH), -Math.sin(VIEW_PITCH)]);
  const r = toView([1, 0, 0]);
  const u = toView([0, -Math.sin(VIEW_PITCH), Math.cos(VIEW_PITCH)]);
  const toLight = unit(add(add(mul(r, -0.5), mul(u, 0.7)), mul(d, -0.5)));
  const half = unit(sub(toLight, d));
  const bob = Math.cos((frame / 6) * 2 * Math.PI) < -0.1 ? 1 : 0;
  const ox = view.x;
  const oy = view.y + bob;
  const { w, h } = CELL;
  const depth = new Float64Array(w * h).fill(Infinity);
  const who = new Int32Array(w * h).fill(-1);
  const colour: Rgb[] = new Array(w * h);
  const ink: Rgb[] = new Array(w * h);
  const o: V = [0, 0, 0];
  scarab(frame, view, mul(d, -1)).forEach((part, id) => {
    const ray = part.shape(d);
    const cx = ox + dot(part.centre, r);
    const cy = oy - dot(part.centre, u);
    const x0 = Math.max(0, Math.floor(cx - part.reach));
    const x1 = Math.min(w - 1, Math.ceil(cx + part.reach));
    const y0 = Math.max(0, Math.floor(cy - part.reach));
    const y1 = Math.min(h - 1, Math.ceil(cy + part.reach));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const sx = x + 0.5 - ox;
        const sy = oy - y - 0.5;
        o[0] = r[0] * sx + u[0] * sy - d[0] * 200;
        o[1] = r[1] * sx + u[1] * sy - d[1] * 200;
        o[2] = r[2] * sx + u[2] * sy - d[2] * 200;
        const i = y * w + x;
        const s = ray(o, depth[i]);
        if (!s) continue;
        colour[i] = part.look(s, {
          lit: dot(s.n, toLight),
          glint: dot(s.n, half),
          facing: -dot(s.n, d),
          over: who[i] >= 0,
        });
        depth[i] = s.t;
        who[i] = id * 2 + (s.inner ? 1 : 0);
        ink[i] = part.ink;
      }
  });
  const nearer = (i: number, j: number, best: number): number => {
    if (who[j] < 0 || who[j] === who[i]) return best;
    if (who[i] >= 0 && depth[j] > depth[i] - 2.5) return best;
    return best < 0 || depth[j] < depth[best] ? j : best;
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let front = -1;
      if (x > 0) front = nearer(i, i - 1, front);
      if (x < w - 1) front = nearer(i, i + 1, front);
      if (y > 0) front = nearer(i, i - w, front);
      if (y < h - 1) front = nearer(i, i + w, front);
      if (front >= 0) put(px, x, y, ink[front]);
      else if (who[i] >= 0) put(px, x, y, colour[i]);
    }
}

export const SAND_SCARAB: DrawnMount = {
  id: "own-sand-scarab",
  name: "Sand Scarab",
  description:
    "ด้วงสการับทะเลทรายตัวใหญ่ ลำตัวเป็นเกราะปล้องสีทองแดง ปีกแข็งสีเขียวเหลือบทองยกกางออก ใต้ปีกแข็งมีปีกบางสีอำพันกระพือถี่ หัวแบนเหมือนพลั่ว มีเขาเล็กและตาสีอำพัน กระดองหน้ามีตราจานสุริยะสีทอง มีเบาะนั่งแบนเป็นพรมทอลายสีแดงสลับทอง",
  cell: CELL,
  seat: {
    south: [56, 39],
    "south-east": [46, 44],
    east: [53, 47],
    "north-east": [54, 44],
    north: [56, 42],
  },
  paint,
};
