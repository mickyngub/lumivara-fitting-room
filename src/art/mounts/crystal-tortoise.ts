import type { DrawnMount } from "../mounts";
import { hash, rgb, type Pixels, type Rgb } from "../pixels";

const CELL = { w: 112, h: 104 };
const FRAMES = 6;
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

type V = [number, number, number];

const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const plus = (a: V, b: V, k = 1): V => [
  a[0] + b[0] * k,
  a[1] + b[1] * k,
  a[2] + b[2] * k,
];
const times = (a: V, k: number): V => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a: V, b: V): V => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a: V): V => times(a, 1 / Math.hypot(a[0], a[1], a[2]));

function turn(v: V, axis: V, angle: number): V {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return plus(
    plus(times(v, c), cross(axis, v), s),
    axis,
    dot(axis, v) * (1 - c),
  );
}

// The game looks down on its world at a shallow angle, so a flat top shrinks to about a third of its depth.
const PITCH = 22 * DEG;
const VIEW: V = [0, Math.cos(PITCH), -Math.sin(PITCH)];
const SCREEN_X: V = [1, 0, 0];
const SCREEN_Y: V = [0, -Math.sin(PITCH), -Math.cos(PITCH)];
const LIGHT = unit([-0.55, -0.4, 0.75]);
const FAR = -300;

const screenOf = (p: V): [number, number] => [
  p[0],
  -(p[2] * Math.cos(PITCH) + p[1] * Math.sin(PITCH)),
];
const depthOf = (p: V) => dot(p, VIEW) - FAR;
const rayAt = (sx: number, sy: number, t: number): V =>
  plus(plus(plus(times(VIEW, FAR), SCREEN_X, sx), SCREEN_Y, sy), VIEW, t);

type Frame = { o: V; x: V; y: V; z: V };
type Plane = [V, number];
type Look =
  | "shell"
  | "point"
  | "shard"
  | "skin"
  | "flipper"
  | "head"
  | "belly"
  | "cushion";

type Solid = {
  look: Look;
  frame: Frame;
  /** Semi-axes of a quadric; Infinity on an axis makes it a cylinder along it. */
  r?: V;
  planes: Plane[];
  reach: number;
  centre: V;
  size: number;
};

type Pal = { ink: Rgb; ramp: Rgb[] };

const pal = (ink: string, ...ramp: string[]): Pal => ({
  ink: rgb(ink),
  ramp: ramp.map(rgb),
});

const AMETHYST = pal(
  "#24123d",
  "#3d2266",
  "#583392",
  "#7a4cbd",
  "#a477e0",
  "#d3b6f6",
);
const TEAL = pal(
  "#0c2b33",
  "#164a55",
  "#1f777d",
  "#2fa9a3",
  "#62d8c6",
  "#b6f5e8",
);
const SAGE = pal("#24331e", "#4a613c", "#68844f", "#8aa66a", "#adc78a");
const BELLY = pal("#24331e", "#8d9668", "#b2bb88", "#d3d9aa");
const MOSS = pal("#1d3016", "#34521f", "#4b7428", "#659634", "#82b544");
const GLINT = rgb("#ffffff");
const EYE = rgb("#161a26");

const SHELL = { f: 33, s: 29, u: 29, top: 23, base: -1 };
const CUSHION = { f: 14, s: 13, u: 3.5, at: -1 };
const SEAT_LOCAL: V = [CUSHION.at, 0, SHELL.top + CUSHION.u];
const HEAD = { at: [36, 0, 5] as V, r: [8.4, 7.4, 8.6] as V };
const RINGS: [elevation: number, count: number, offset: number][] = [
  [-10, 14, 0],
  [20, 12, 0.5],
  [46, 9, 0],
];

function shellPlanes(): Plane[] {
  const planes: Plane[] = [];
  for (const [elevation, count, offset] of RINGS)
    for (let i = 0; i < count; i++) {
      const a = ((i + offset) / count) * TAU;
      const e = elevation * DEG;
      const n: V = [
        Math.cos(e) * Math.cos(a),
        Math.cos(e) * Math.sin(a),
        Math.sin(e),
      ];
      planes.push([
        n,
        Math.hypot(SHELL.f * n[0], SHELL.s * n[1], SHELL.u * n[2]),
      ]);
    }
  planes.push([[0, 0, 1], SHELL.top]);
  planes.push([[0, 0, -1], -SHELL.base]);
  return planes;
}

const SHELL_PLANES = shellPlanes();
const RIM_FACETS = RINGS[0][1];

function hexPoint(width: number, length: number, slope: number): Plane[] {
  const planes: Plane[] = [];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU;
    planes.push([[Math.cos(a), Math.sin(a), 0], width]);
    const n: V = [
      Math.cos(a) * Math.cos(slope),
      Math.sin(a) * Math.cos(slope),
      Math.sin(slope),
    ];
    planes.push([n, n[2] * length]);
  }
  planes.push([[0, 0, -1], 4]);
  return planes;
}

function bipyramid(width: number, height: number): Plane[] {
  const planes: Plane[] = [];
  for (let k = 0; k < 6; k++) {
    const a = ((k + 0.5) / 6) * TAU;
    for (const up of [1, -1]) {
      const n = unit([Math.cos(a) * height, Math.sin(a) * height, up * width]);
      planes.push([n, n[2] * up * height]);
    }
  }
  return planes;
}

/** The creature's forward, right and up axes in the world, for one drawn direction. */
type Body = { f: V; s: V; u: V };

const toWorld = (b: Body, v: V): V =>
  plus(plus(times(b.f, v[0]), b.s, v[1]), b.u, v[2]);

const place = (b: Body, o: V, x: V, y: V, z: V): Frame => ({
  o: toWorld(b, o),
  x: toWorld(b, x),
  y: toWorld(b, y),
  z: toWorld(b, z),
});

/** A frame whose z axis runs along `axis`, spun by `spin` around it. */
function along(b: Body, o: V, axis: V, spin = 0): Frame {
  const z = unit(axis);
  const helper: V = Math.abs(z[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
  const x = turn(unit(cross(helper, z)), z, spin);
  return place(b, o, x, cross(z, x), z);
}

const solid = (
  look: Look,
  frame: Frame,
  planes: Plane[],
  reach: number,
  r?: V,
  centre: V = [0, 0, 0],
  size = 0,
): Solid => ({ look, frame, r, planes, reach, centre, size });

const ellipsoid = (
  b: Body,
  look: Look,
  o: V,
  axis: V,
  r: V,
  planes: Plane[] = [],
): Solid => solid(look, along(b, o, axis), planes, Math.max(...r) + 1, r);

const VIEWS: Record<string, { yaw: number; anchor: [number, number] }> = {
  south: { yaw: -90, anchor: [56, 79] },
  "south-east": { yaw: -45, anchor: [55, 73] },
  east: { yaw: 0, anchor: [54, 75] },
  "north-east": { yaw: 45, anchor: [55, 76] },
  north: { yaw: 90, anchor: [56, 80] },
};

function bodyOf(direction: string): Body {
  const yaw = VIEWS[direction].yaw * DEG;
  const f: V = [Math.cos(yaw), Math.sin(yaw), 0];
  return { f, s: cross(f, [0, 0, 1]), u: [0, 0, 1] };
}

function flipper(
  b: Body,
  root: V,
  side: number,
  front: boolean,
  phase: number,
): Solid {
  const rest = unit([front ? 0.4 : -0.55, side, front ? -0.42 : -0.45]);
  const sweep = (front ? 24 : 18) * DEG * Math.sin(phase);
  const lift = (front ? 14 : 10) * DEG * Math.cos(phase);
  const dir = turn(
    turn(rest, [0, 0, 1], -side * sweep),
    [1, 0, 0],
    side * lift,
  );
  const len = front ? 19 : 16;
  const flat = unit(cross(cross(dir, [0, 0, 1]), dir));
  return solid(
    "flipper",
    place(b, plus(root, dir, len * 0.4), unit(cross(flat, dir)), flat, dir),
    [],
    len / 2 + 1,
    [front ? 6 : 5.4, 3.4, len / 2],
  );
}

const POINTS: [azimuth: number, length: number, lean: number][] = [
  [70, 15, 0.45],
  [112, 19, 0.65],
  [156, 12, 0.4],
  [-70, 15, 0.45],
  [-112, 19, 0.65],
  [-156, 12, 0.4],
];

const onShell = (azimuth: number, elevation: number, k = 1): V => [
  SHELL.f * Math.cos(elevation * DEG) * Math.cos(azimuth * DEG) * k,
  SHELL.s * Math.cos(elevation * DEG) * Math.sin(azimuth * DEG) * k,
  SHELL.u * Math.sin(elevation * DEG) * k,
];

function points(b: Body): Solid[] {
  return POINTS.map(([deg, length, lean], k) =>
    solid(
      "point",
      along(
        b,
        onShell(deg, 36, 0.9),
        [Math.cos(deg * DEG) * lean, Math.sin(deg * DEG) * lean, 1],
        k * 0.9 + 0.3,
      ),
      hexPoint(3.6, length, 28 * DEG),
      // The ball through the hexagon's corners at the point's base, 4 below its root, and at its tip.
      Math.hypot((length + 4) / 2, 3.6 / Math.cos(30 * DEG)),
      undefined,
      [0, 0, (length - 4) / 2],
      length,
    ),
  );
}

function shards(b: Body, frame: number): Solid[] {
  return [0, 1, 2].map((i) => {
    const a = ((frame / FRAMES + i) / 3) * TAU + 20 * DEG;
    return solid(
      "shard",
      along(
        b,
        [46 * Math.cos(a), 41 * Math.sin(a), 10 + 1.5 * Math.sin(3 * a)],
        [0, 0, 1],
        (frame / FRAMES) * (TAU / 6),
      ),
      bipyramid(3, 6),
      7,
    );
  });
}

const headAt = (frame: number): V => {
  const ph = (frame / FRAMES) * TAU;
  return plus(HEAD.at, [0.6 * Math.cos(ph), 0, 0.8 * Math.sin(ph)]);
};

const HEAD_SOLID = 4;

function build(direction: string, frame: number): Solid[] {
  const b = bodyOf(direction);
  const ph = (frame / FRAMES) * TAU;
  return [
    solid(
      "shell",
      place(b, [0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]),
      SHELL_PLANES,
      36,
      undefined,
      [0, 0, 11],
    ),
    ellipsoid(
      b,
      "belly",
      [0, 0, -2],
      [0, 0, 1],
      [26, 30, 8.5],
      [[[0, 0, 1], 1.5]],
    ),
    solid(
      "cushion",
      place(b, [CUSHION.at, 0, SHELL.top], [1, 0, 0], [0, 1, 0], [0, 0, 1]),
      [
        [[0, 0, 1], CUSHION.u],
        [[0, 0, -1], 1],
      ],
      16,
      [CUSHION.f, CUSHION.s, Infinity],
    ),
    ellipsoid(b, "skin", [28, 0, 2], [1, 0, 0.25], [6, 5.8, 7]),
    ellipsoid(b, "head", headAt(frame), [1, 0, 0.05], HEAD.r),
    ellipsoid(
      b,
      "skin",
      [-34, 1.6 * Math.sin(ph), -2],
      [-1, 0, -0.3],
      [2.6, 2.6, 5.5],
    ),
    flipper(b, [18, 21, -3], 1, true, ph),
    flipper(b, [18, -21, -3], -1, true, ph + Math.PI),
    flipper(b, [-19, 20, -3], 1, false, ph + Math.PI),
    flipper(b, [-19, -20, -3], -1, false, ph),
    ...points(b),
    ...shards(b, frame),
  ];
}

const bobOf = (frame: number) => (Math.cos((frame / FRAMES) * TAU) < 0 ? 1 : 0);

const PALS = [AMETHYST, TEAL, SAGE, BELLY, MOSS];
const [ON_AMETHYST, ON_TEAL, ON_SAGE, ON_BELLY, ON_MOSS] = [0, 1, 2, 3, 4];

/** An ink is packed as palette * 8 + shade, so a frame's inks fit one byte per pixel. */
const step = (pal: number, v: number): number => {
  const n = PALS[pal].ramp.length;
  return pal * 8 + Math.max(0, Math.min(n - 1, Math.floor(v * n)));
};

const lift = (ink: number, by: number): number => {
  const n = PALS[ink >> 3].ramp.length;
  return (ink & ~7) + Math.max(0, Math.min(n - 1, (ink & 7) + by));
};

const CRYSTAL: Look[] = ["shell", "point", "shard"];

const SIZE = CELL.w * CELL.h;
const hitSolid = new Int8Array(SIZE);
const hitFacet = new Int8Array(SIZE);
const hitT = new Float64Array(SIZE);
const inkAt = new Uint8Array(SIZE);

function trace(solids: Solid[], ax: number, ay: number): void {
  const { w, h } = CELL;
  hitSolid.fill(-1);
  for (let index = 0; index < solids.length; index++) {
    const sd = solids[index];
    const { o, x, y, z } = sd.frame;
    const local = (p: V): V => [dot(p, x), dot(p, y), dot(p, z)];
    const [o0x, o0y, o0z] = local(plus(times(VIEW, FAR), o, -1));
    const ex = local(SCREEN_X);
    const ey = local(SCREEN_Y);
    const d = local(VIEW);
    const r = sd.r;
    const [ix, iy, iz] = r ? [1 / r[0], 1 / r[1], 1 / r[2]] : [0, 0, 0];
    const [qx, qy, qz] = [d[0] * ix, d[1] * iy, d[2] * iz];
    const qa = qx * qx + qy * qy + qz * qz;
    const count = sd.planes.length;
    const pl = new Float64Array(count * 5);
    sd.planes.forEach(([n, k], i) =>
      pl.set(
        [dot(n, d), dot(n, [o0x, o0y, o0z]), dot(n, ex), dot(n, ey), k],
        i * 5,
      ),
    );
    const [csx, csy] = screenOf(
      plus(plus(plus(o, x, sd.centre[0]), y, sd.centre[1]), z, sd.centre[2]),
    );
    const x0 = Math.max(0, Math.floor(ax + csx - sd.reach - 1));
    const x1 = Math.min(w - 1, Math.ceil(ax + csx + sd.reach + 1));
    const y0 = Math.max(0, Math.floor(ay + csy - sd.reach - 1));
    const y1 = Math.min(h - 1, Math.ceil(ay + csy + sd.reach + 1));
    // Every solid is convex, so the pixels it covers on a row run unbroken.
    for (let py = y0; py <= y1; py++) {
      let inside = false;
      for (let px = x0; px <= x1; px++) {
        const sx = px + 0.5 - ax;
        const sy = py + 0.5 - ay;
        let tin = -Infinity;
        let tout = Infinity;
        let facet = -1;
        let miss = false;
        if (r) {
          const ox = (o0x + sx * ex[0] + sy * ey[0]) * ix;
          const oy = (o0y + sx * ex[1] + sy * ey[1]) * iy;
          const oz = (o0z + sx * ex[2] + sy * ey[2]) * iz;
          const qb = 2 * (ox * qx + oy * qy + oz * qz);
          const qc = ox * ox + oy * oy + oz * oz - 1;
          const disc = qb * qb - 4 * qa * qc;
          if (disc < 0) miss = true;
          else {
            const root = Math.sqrt(disc);
            tin = (-qb - root) / (2 * qa);
            tout = (-qb + root) / (2 * qa);
          }
        }
        for (let i = 0; i < count && !miss; i++) {
          const nd = pl[i * 5];
          const no = pl[i * 5 + 1] + sx * pl[i * 5 + 2] + sy * pl[i * 5 + 3];
          if (Math.abs(nd) < 1e-9) {
            if ((miss = no > pl[i * 5 + 4])) break;
            continue;
          }
          const t = (pl[i * 5 + 4] - no) / nd;
          if (nd < 0) {
            if (t > tin) {
              tin = t;
              facet = i;
            }
          } else if (t < tout) tout = t;
          if ((miss = tin > tout)) break;
        }
        if (miss || tin === -Infinity) {
          if (inside) break;
          continue;
        }
        inside = true;
        const at = py * w + px;
        if (hitSolid[at] < 0 || tin < hitT[at]) {
          hitSolid[at] = index;
          hitT[at] = tin;
          hitFacet[at] = facet;
        }
      }
    }
  }
}

/** Scales sit on a staggered grid over the limb's flat face. */
function scaly(a: number, b: number, spacing: number): boolean {
  const row = Math.round(b / spacing);
  const col = Math.round(a / spacing - (row % 2) * 0.5);
  return (
    Math.hypot(a - (col + (row % 2) * 0.5) * spacing, b - row * spacing) <
    spacing * 0.28
  );
}

const lightOf = (sd: Solid, n: V): number => {
  const { x, y, z } = sd.frame;
  return dot(plus(plus(times(x, n[0]), y, n[1]), z, n[2]), LIGHT);
};

const RAY_FROM = times(VIEW, FAR);

function shade(solids: Solid[], ax: number, ay: number): void {
  const { w, h } = CELL;
  const shaders = solids.map((sd) => ({
    sd,
    crystal: CRYSTAL.includes(sd.look),
    facetLight: sd.planes.map(([n]) => lightOf(sd, n)),
    // A shard turns one face round per loop, so its faces only vary top from bottom, or the loop would jump.
    jitter: sd.planes.map(
      (_, facet) =>
        (hash((sd.look === "shard" ? facet % 2 : facet) * 7.3 + sd.size * 3.1) -
          0.5) *
        0.2,
    ),
  }));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (hitSolid[i] < 0) continue;
      const { sd, crystal, facetLight, jitter } = shaders[hitSolid[i]];
      const facet = hitFacet[i];
      if (sd.look === "shell" || sd.look === "shard") {
        const v = (facetLight[facet] + 0.25) / 1.5 + jitter[facet];
        inkAt[i] = step(
          sd.look === "shard" || facet < RIM_FACETS ? ON_TEAL : ON_AMETHYST,
          v,
        );
        continue;
      }
      const sx = x + 0.5 - ax;
      const sy = y + 0.5 - ay;
      const t = hitT[i];
      const { o, x: fx, y: fy, z: fz } = sd.frame;
      const q0 =
        RAY_FROM[0] + SCREEN_X[0] * sx + SCREEN_Y[0] * sy + VIEW[0] * t - o[0];
      const q1 =
        RAY_FROM[1] + SCREEN_X[1] * sx + SCREEN_Y[1] * sy + VIEW[1] * t - o[1];
      const q2 =
        RAY_FROM[2] + SCREEN_X[2] * sx + SCREEN_Y[2] * sy + VIEW[2] * t - o[2];
      const l0 = q0 * fx[0] + q1 * fx[1] + q2 * fx[2];
      const l1 = q0 * fy[0] + q1 * fy[1] + q2 * fy[2];
      const l2 = q0 * fz[0] + q1 * fz[1] + q2 * fz[2];
      let light: number;
      if (facet >= 0) light = facetLight[facet];
      else {
        const r = sd.r!;
        light = lightOf(
          sd,
          unit([
            l0 / r[0] ** 2,
            l1 / r[1] ** 2,
            r[2] === Infinity ? 0 : l2 / r[2] ** 2,
          ]),
        );
      }
      if (crystal) {
        inkAt[i] = step(
          l2 > sd.size * 0.4 ? ON_TEAL : ON_AMETHYST,
          (light + 0.25) / 1.5 + jitter[facet],
        );
        continue;
      }
      const v = (light + 0.25) / 1.3;
      let ink: number;
      switch (sd.look) {
        case "belly":
          ink = step(ON_BELLY, v);
          break;
        case "cushion":
          ink = step(ON_MOSS, facet === 0 ? v - 0.12 : v - 0.3);
          if (facet !== 0) break;
          if (Math.hypot(l0 / CUSHION.f, l1 / CUSHION.s) > 0.84) {
            ink = lift(ink, 1);
            break;
          }
          {
            const fuzz = hash(x * 13.7 + y * 71.3);
            if (fuzz < 0.16) ink = lift(ink, -1);
            else if (fuzz > 0.93) ink = lift(ink, 1);
          }
          break;
        case "flipper":
          ink = step(ON_SAGE, v);
          if (scaly(l0, l2, 3.3)) ink = lift(ink, -1);
          break;
        default:
          ink = step(ON_SAGE, v);
      }
      inkAt[i] = ink;
    }
}
type Stamp = { at: [number, number]; rows: string[] };

// Hand-placed per view, around the projected head centre, since a sleepy face is only a few pixels wide.
const FACES: Record<string, Stamp> = {
  south: {
    at: [-7, -3],
    rows: [
      "..ddd.....ddd..",
      ".kkkkk...kkkkk.",
      "..eee.....eee..",
      "...............",
      "......k.k......",
      "...............",
      "....k.....k....",
      ".....kkkkk.....",
    ],
  },
  "south-east": {
    at: [-4, -3],
    rows: [
      "..ddd.....dd",
      ".kkkkk...kkk",
      "..eee.....ee",
      "............",
      "..........k.",
      "............",
      "......k.....",
      ".......kkkkk",
    ],
  },
  east: {
    at: [0, -3],
    rows: [
      "..ddd....",
      ".kkkkk...",
      "..eee....",
      "........k",
      "........",
      "....kkkkk",
    ],
  },
  "north-east": {
    at: [3, -3],
    rows: [".dd", "kkk", ".ee"],
  },
};

const FACE_INKS: Record<string, Rgb> = {
  k: SAGE.ink,
  e: EYE,
  d: SAGE.ramp[0],
};

const SPARKLES: [azimuth: number, elevation: number, phase: number][] = [
  [-150, 22, 0],
  [-35, 26, 2],
  [140, 18, 4],
  [40, 24, 3],
  [-95, 8, 1],
  [95, 12, 5],
];

/** Whether pixel j outlines a pixel of solid `me` beside it: art next to empty space, or a solid at least 3 deep in front of another. */
const outlines = (j: number, me: number, front: number) =>
  hitSolid[j] >= 0 && hitSolid[j] !== me && hitT[j] < front;

function paint(px: Pixels, direction: string, frame: number): void {
  const { w, h } = CELL;
  const [ax, ay0] = VIEWS[direction].anchor;
  const ay = ay0 + bobOf(frame);
  const b = bodyOf(direction);
  const solids = build(direction, frame);
  const crystal = solids.map((sd) => CRYSTAL.includes(sd.look));
  trace(solids, ax, ay);
  shade(solids, ax, ay);
  const solidAt = (x: number, y: number) =>
    x < 0 || y < 0 || x >= w || y >= h ? -1 : hitSolid[y * w + x];
  const set = (x: number, y: number, c: Rgb) => {
    const at = (y * px.w + x) * 4;
    px.data[at] = c[0];
    px.data[at + 1] = c[1];
    px.data[at + 2] = c[2];
    px.data[at + 3] = 255;
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const me = hitSolid[i];
      const front = me < 0 ? Infinity : hitT[i] - 3;
      const edge =
        x > 0 && outlines(i - 1, me, front)
          ? i - 1
          : x < w - 1 && outlines(i + 1, me, front)
            ? i + 1
            : y > 0 && outlines(i - w, me, front)
              ? i - w
              : y < h - 1 && outlines(i + w, me, front)
                ? i + w
                : -1;
      if (edge >= 0) {
        set(x, y, PALS[inkAt[edge] >> 3].ink);
        continue;
      }
      if (me < 0) continue;
      let ink = inkAt[i];
      if (crystal[me] && (ink & 7) >= 1) {
        const f = hitFacet[i];
        const bevel =
          (x > 0 && hitSolid[i - 1] === me && hitFacet[i - 1] !== f) ||
          (y > 0 && hitSolid[i - w] === me && hitFacet[i - w] !== f);
        if (bevel) ink = lift(ink, 1);
      }
      set(x, y, PALS[ink >> 3].ramp[ink & 7]);
    }
  const face = FACES[direction];
  if (face) {
    const [hx, hy] = screenOf(toWorld(b, headAt(frame)));
    const left = Math.floor(ax + hx) + face.at[0];
    const top = Math.floor(ay + hy) + face.at[1];
    face.rows.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        const ink = FACE_INKS[row[c]];
        if (ink && solidAt(left + c, top + r) === HEAD_SOLID)
          set(left + c, top + r, ink);
      }
    });
  }
  for (const [azimuth, elevation, phase] of SPARKLES) {
    const p = (frame + phase) % FRAMES;
    if (p > 3) continue;
    const world = toWorld(b, onShell(azimuth, elevation));
    const [sx, sy] = screenOf(world);
    const x = Math.floor(ax + sx);
    const y = Math.floor(ay + sy);
    if (solidAt(x, y) !== 0 || Math.abs(hitT[y * w + x] - depthOf(world)) > 4)
      continue;
    const arm = p === 2 ? 2 : p === 1 ? 1 : 0;
    set(x, y, GLINT);
    for (let k = 1; k <= arm; k++)
      for (const [dx, dy] of [
        [k, 0],
        [-k, 0],
        [0, k],
        [0, -k],
      ])
        if (solidAt(x + dx, y + dy) === 0)
          set(x + dx, y + dy, k === 1 ? TEAL.ramp[4] : AMETHYST.ramp[4]);
  }
}

function seatOf(direction: string): [number, number] {
  const [sx, sy] = screenOf(toWorld(bodyOf(direction), SEAT_LOCAL));
  const [ax, ay] = VIEWS[direction].anchor;
  return [Math.floor(ax + sx), Math.floor(ay + sy) + 1];
}

export const CRYSTAL_TORTOISE: DrawnMount = {
  id: "own-crystal-tortoise",
  name: "Crystal Tortoise",
  description:
    "เต่าตัวกลมลอยอยู่กลางอากาศ กระดองสูงเป็นผลึกเหลี่ยมสีม่วงอเมทิสต์และสีเขียวน้ำทะเลประกายขาว ผิวเกล็ดสีเขียวเสจ ตาง่วง ๆ ดูใจดี ตีขาสั้น ๆ ทั้งสี่ช้า ๆ กลางอากาศ มีเศษผลึกเล็กสามชิ้นลอยวนรอบกระดอง มีเบาะนั่งแบนสีเขียวมอสบนยอดกระดองที่แบนราบ",
  cell: CELL,
  seat: Object.fromEntries(
    Object.keys(VIEWS).map((d) => [d, seatOf(d)]),
  ) as Record<string, [number, number]>,
  paint,
};
