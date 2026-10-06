import type { DrawnMount } from "../mounts";
import { bayer, put, rgb, type Pixels, type Rgb } from "../pixels";

const CELL = { w: 116, h: 92 };
const FRAMES = 6;
// The camera looks down at about 35 degrees: ground depth shows at LIFT on screen, height at FACE.
const LIFT = 0.58;
const FACE = Math.sqrt(1 - LIFT * LIFT);
const STEP = 0.5;
const SPAN = 53;
const ROOT = 0.22;
const SADDLE = { y: 2, a: 11.5, b: 9, round: 3 };
const TAIL = { y: -29, len: 30 };

type Xy = [number, number];
type Vec = [number, number, number];

const R2 = Math.SQRT1_2;
const HEADING: Record<string, Xy> = {
  south: [0, -1],
  "south-east": [R2, -R2],
  east: [1, 0],
  "north-east": [R2, R2],
  north: [0, 1],
};
const ORIGIN: Record<string, Xy> = {
  south: [58, 69],
  "south-east": [62, 69],
  east: [62, 53],
  "north-east": [62, 53],
  north: [58, 51],
};
// South sits off the tail's column and east ahead of the far wing, so the back ends a few pixels above each seat.
const NUDGE: Record<string, Xy> = {
  south: [2, -1],
  "south-east": [0, 0],
  east: [4, 0],
  "north-east": [0, 0],
  north: [0, 0],
};
const BOB = [0, 0, 1, 1, 1, 0];

const INKS: Rgb[] = [];
const ink = (hex: string): number => INKS.push(rgb(hex)) - 1;
const ramp = (...hex: string[]): number[] => hex.map(ink);
const BACK = ramp(
  "#8fe8d6",
  "#4fc6b8",
  "#2f9f9e",
  "#217d8a",
  "#1b5e7e",
  "#164569",
  "#113152",
);
const BELLY = ramp("#fff5df", "#f3dfbf", "#dcc19f", "#b49a86");
const GLOW = ramp("#e6fffb", "#7ff5ea", "#3fd3d6");
const CORAL = ramp("#ffb3a3", "#fb8579", "#e0606a", "#b4445a");
const PEARL = ramp("#fffaf3", "#efe4ee", "#cbbad3");
const LINE = ink("#0a1a36");
const SADDLE_LINE = ink("#6e2347");
const MOUTH = ink("#0c1b33");
const EYE = ink("#081428");
const GLINT = ink("#f4fffd");

const PART = {
  back: 1,
  belly: 2,
  saddle: 3,
  pearl: 4,
  lobe: 5,
  tail: 6,
  eye: 7,
};
const OUTLINE = [LINE, LINE, LINE, SADDLE_LINE, SADDLE_LINE, LINE, LINE, LINE];

const WING: Xy[] = [
  [0, 24],
  [6, 24],
  [8, 23],
  [9.5, 21],
  [10.5, 18.5],
  [12.5, 16],
  [17, 12],
  [24, 7],
  [31, 1.5],
  [38, -4],
  [44, -9.5],
  [49, -15],
  [53, -21],
  [51, -21],
  [47, -19.5],
  [41, -18],
  [34, -17],
  [27, -17],
  [21, -18],
  [16.5, -19.5],
  [13.5, -22],
  [11.5, -25],
  [8.5, -27.5],
  [5, -28.8],
  [2, -29.3],
  [0, -29.5],
];
const DISC: Xy[] = [
  ...WING,
  ...WING.slice(1, -1)
    .reverse()
    .map(([x, y]): Xy => [-x, y]),
];

const SPOTS: Vec[] = [
  [4, 17, 1.2],
  [14.5, 9.5, 1.2],
  [16, 3.5, 1.3],
  [15.5, -2.5, 1.2],
  [13.5, -8, 1.1],
  [9.5, -12.5, 1.2],
  [0, -11.5, 1.3],
  [0, -16, 1.2],
  [0, -20.5, 1],
  [0, -24.5, 0.9],
  [22, 4, 1.3],
  [28, -1, 1.2],
  [34, -6, 1.1],
  [40, -10.5, 1],
  [45, -14.5, 0.9],
].flatMap(([x, y, r]): Vec[] =>
  x
    ? [
        [x, y, r],
        [-x, y, r],
      ]
    : [[x, y, r]],
);

const LIGHT: Vec = (() => {
  const v: Vec = [-0.55, 0.2, 0.81];
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
})();
const SCREEN_LIGHT: Vec = [-0.55, 0.62, 0.56];

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;
const smooth = (t: number) => {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};

/** Distance from (x, y) to the polygon's edge, positive inside. */
function edge(points: Xy[], x: number, y: number): number {
  let inside = false;
  let best = Infinity;
  points.forEach(([x1, y1], i) => {
    const [x0, y0] = points[(i + points.length - 1) % points.length];
    if (y1 > y !== y0 > y && x < ((x0 - x1) * (y - y1)) / (y0 - y1) + x1)
      inside = !inside;
    const dx = x0 - x1;
    const dy = y0 - y1;
    const k = clamp(
      ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy),
      0,
      1,
    );
    best = Math.min(best, Math.hypot(x - x1 - k * dx, y - y1 - k * dy));
  });
  return inside ? best : -best;
}

const dome = (x: number, y: number) =>
  8 * Math.max(0, 1 - (x / 18.5) ** 2 - ((y - 1) / 25) ** 2) ** 0.9;
const keel = (x: number, y: number) =>
  4 * Math.max(0, 1 - (x / 12) ** 2 - ((y - 6) / 19) ** 2) ** 0.5;
const saddleR = (x: number, y: number) =>
  (Math.abs(x / SADDLE.a) ** SADDLE.round +
    Math.abs((y - SADDLE.y) / SADDLE.b) ** SADDLE.round) **
  (1 / SADDLE.round);
/** Roughly how many pixels (x, y) lies inside the saddle's rim, negative outside. */
function saddleInset(x: number, y: number): number {
  const r = saddleR(x, y);
  if (r < 0.3) return SADDLE.b;
  const p = SADDLE.round;
  const slope =
    Math.hypot(
      Math.abs(x / SADDLE.a) ** (p - 1) / SADDLE.a,
      Math.abs((y - SADDLE.y) / SADDLE.b) ** (p - 1) / SADDLE.b,
    ) *
    r ** (1 - p);
  return (1 - r) / slope;
}
const saddleLift = (inset: number) => 1.6 * clamp((inset + 0.4) / 1.3, 0, 1);
const STRAP = { half: 1.2, reach: SADDLE.a + 13, lift: 0.7 };
const onStrap = (x: number, y: number) =>
  Math.abs(y - SADDLE.y) < STRAP.half && Math.abs(x) < STRAP.reach;
const wingThickness = (x: number) => 1.1 - (0.8 * x) / SPAN;

const ZONE = {
  plain: 0,
  glow: 1,
  core: 2,
  pad: 3,
  side: 4,
  mouth: 5,
  piping: 6,
  panel: 7,
  stitch: 8,
  strap: 9,
};
const SADDLE_ZONES = [ZONE.pad, ZONE.side, ZONE.piping, ZONE.panel, ZONE.stitch, ZONE.strap];

const COLS = Math.ceil((SPAN + 1) / STEP) + 1;
const Y0 = -30;
const ROWS = Math.ceil((25 - Y0) / STEP) + 1;
const N = ROWS * COLS;

const grid = (() => {
  const inside = new Uint8Array(N);
  const last = new Int16Array(ROWS);
  const top = new Float32Array(N);
  const bottom = new Float32Array(N);
  const fade = new Float32Array(N);
  const zone = new Uint8Array(N);
  const spot = new Uint8Array(N);
  for (let j = 0; j < ROWS; j++)
    for (let i = 0; i < COLS; i++) {
      const k = j * COLS + i;
      const x = i * STEP;
      const y = Y0 + j * STEP;
      const d = edge(DISC, x, y);
      if (d <= 0) continue;
      inside[k] = 1;
      last[j] = i;
      const rim = Math.sqrt(clamp(d / 2.5, 0, 1));
      const inset = saddleInset(x, y);
      const strap = inset <= -0.4 && onStrap(x, y);
      top[k] =
        rim * (wingThickness(x) + dome(x, y)) +
        saddleLift(inset) +
        (strap ? STRAP.lift : 0);
      bottom[k] = rim * (0.8 * wingThickness(x) + keel(x, y));
      fade[k] =
        smooth((x / SPAN - 0.28) / 0.62) + 0.3 * (1 - clamp(d / 3, 0, 1));
      const r = saddleR(x, y);
      const stitchOn =
        Math.floor(
          ((Math.atan2((y - SADDLE.y) / SADDLE.b, x / SADDLE.a) + Math.PI) *
            11) /
            Math.PI,
        ) % 2;
      if (inset > -0.4)
        zone[k] =
          inset < 0.9
            ? ZONE.side
            : inset < 2.4
              ? ZONE.piping
              : r < 0.58
                ? ZONE.panel
                : r < 0.66 && stitchOn
                  ? ZONE.stitch
                  : r < 0.66
                    ? ZONE.panel
                    : ZONE.pad;
      else if (strap) zone[k] = ZONE.strap;
      else if (y > 21.5 && x < 6.5 && d < 1.1) zone[k] = ZONE.mouth;
      else
        SPOTS.forEach(([sx, sy, sr], n) => {
          const dd = Math.hypot(x - sx, y - sy);
          if (dd < sr && zone[k] !== ZONE.core) {
            zone[k] = dd < sr * 0.55 ? ZONE.core : ZONE.glow;
            spot[k] = n;
          }
        });
    }
  return { inside, last, top, bottom, fade, zone, spot };
})();

/** The local slope of the wing along its span: a wave that runs from the head back to the tail and curls the tips on the upstroke. */
function bend(s: number, y: number, phase: number): number {
  if (s <= ROOT) return 0;
  const g = smooth((s - ROOT) / (1 - ROOT));
  const lift = Math.sin(phase - 0.075 * (24 - y) - 1.1 * s);
  const curl = s > 0.78 ? ((s - 0.78) / 0.22) ** 2 * Math.max(0, lift) : 0;
  return g * (0.62 * lift + 0.12) + curl;
}

type View = {
  fx: number;
  fy: number;
  rx: number;
  ry: number;
  ox: number;
  oy: number;
};

function viewOf(direction: string, bob: number): View {
  const [fx, fy] = HEADING[direction];
  const [ox, oy] = ORIGIN[direction];
  return { fx, fy, rx: fy, ry: -fx, ox, oy: oy - bob };
}

const AREA = CELL.w * CELL.h;
const depth = new Float32Array(AREA);
const part = new Uint8Array(AREA);
const inks = new Int16Array(AREA);
const lined = new Int16Array(AREA);

function claim(v: View, x: number, y: number, z: number, what: number): number {
  const wy = x * v.ry + y * v.fy;
  const sx = Math.round(v.ox + x * v.rx + y * v.fx);
  const sy = Math.round(v.oy - (wy * LIFT + z * FACE));
  if (sx < 0 || sy < 0 || sx >= CELL.w || sy >= CELL.h) return -1;
  const k = sy * CELL.w + sx;
  const d = wy * FACE - z * LIFT;
  if (d >= depth[k]) return -1;
  depth[k] = d;
  part[k] = what;
  return k;
}

const pick = (palette: number[], v: number, k: number) =>
  palette[
    clamp(
      Math.floor(
        v + (bayer(k % CELL.w, Math.floor(k / CELL.w)) - 0.5) * 0.6 + 0.5,
      ),
      0,
      palette.length - 1,
    )
  ];

const tu = new Float32Array(N);
const tz = new Float32Array(N);
const bu = new Float32Array(N);
const bz = new Float32Array(N);

function bendDisc(phase: number): void {
  const g = grid;
  for (let j = 0; j < ROWS; j++) {
    const y = Y0 + j * STEP;
    const end = Math.min(COLS - 1, g.last[j] + 1);
    let u = 0;
    let z = 0;
    for (let i = 0; i <= end; i++) {
      const k = j * COLS + i;
      const th = bend((i * STEP) / SPAN, y, phase);
      const sn = Math.sin(th);
      const cs = Math.cos(th);
      if (i > 0) {
        u += cs * STEP;
        z += sn * STEP;
      }
      tu[k] = u - g.top[k] * sn;
      tz[k] = z + g.top[k] * cs;
      bu[k] = u + g.bottom[k] * sn;
      bz[k] = z - g.bottom[k] * cs;
    }
  }
}

function paintSurface(
  v: View,
  side: number,
  under: boolean,
  pulse: boolean[],
): void {
  const g = grid;
  const U = under ? bu : tu;
  const Z = under ? bz : tz;
  const flip = under ? -1 : 1;
  for (let j = 1; j < ROWS - 1; j++) {
    const y = Y0 + j * STEP;
    const end = g.last[j];
    for (let i = side > 0 ? 0 : 1; i <= end; i++) {
      const k = j * COLS + i;
      if (!g.inside[k]) continue;
      const kl = i > 0 ? k - 1 : k;
      const au = U[k + 1] - U[kl];
      const az = Z[k + 1] - Z[kl];
      const bu2 = U[k + COLS] - U[k - COLS];
      const bz2 = Z[k + COLS] - Z[k - COLS];
      const nu = -az * 2 * STEP * flip * side;
      const ny = (az * bu2 - au * bz2) * flip * side;
      const nz = au * 2 * STEP * flip;
      const wx = nu * v.rx + ny * v.fx;
      const wy = nu * v.ry + ny * v.fy;
      const l = Math.hypot(wx, wy, nz) || 1;
      if (-wy * FACE + nz * LIFT < -0.08 * l) continue;
      const zone = g.zone[k];
      const q = claim(
        v,
        side * U[k],
        y,
        Z[k],
        under
          ? PART.belly
          : SADDLE_ZONES.includes(zone)
            ? PART.saddle
            : PART.back,
      );
      if (q < 0) continue;
      const light = (wx * LIGHT[0] + wy * LIGHT[1] + nz * LIGHT[2]) / l;
      if (under)
        inks[q] =
          zone === ZONE.mouth
            ? MOUTH
            : pick(BELLY, 0.6 + g.fade[k] * 1.4 + (0.3 - light) * 1.6, q);
      else if (zone === ZONE.pad)
        inks[q] = pick(CORAL, 0.9 + (0.85 - light) * 4, q);
      else if (zone === ZONE.panel)
        inks[q] = pick(CORAL, 1.7 + (0.85 - light) * 4, q);
      else if (zone === ZONE.stitch || zone === ZONE.side) inks[q] = CORAL[3];
      else if (zone === ZONE.piping)
        inks[q] = PEARL[light > 0.95 ? 0 : light > 0.7 ? 1 : 2];
      else if (zone === ZONE.strap)
        inks[q] = pick(CORAL, 1.5 + (0.85 - light) * 3, q);
      else if (zone === ZONE.mouth) inks[q] = MOUTH;
      else if (zone === ZONE.core)
        inks[q] = pulse[g.spot[k]] ? GLOW[0] : GLOW[1];
      else if (zone === ZONE.glow)
        inks[q] = pulse[g.spot[k]] ? GLOW[1] : GLOW[2];
      else
        inks[q] = pick(BACK, 1.6 + g.fade[k] * 3.4 + (0.85 - light) * 4.2, q);
    }
  }
}

/** Paints a sphere as a disc of pixels with a shaded normal, for tubes and beads drawn from many of them. */
function ball(
  v: View,
  [x, y, z]: Vec,
  r: number,
  what: number,
  shade: (nx: number, ny: number, nz: number, k: number) => number,
): void {
  const wy = x * v.ry + y * v.fy;
  const cx = v.ox + x * v.rx + y * v.fx;
  const cy = v.oy - (wy * LIFT + z * FACE);
  const d = wy * FACE - z * LIFT;
  const reach = Math.ceil(r);
  const x0 = Math.round(cx);
  const y0 = Math.round(cy);
  for (let py = y0 - reach; py <= y0 + reach; py++)
    for (let px = x0 - reach; px <= x0 + reach; px++) {
      const dx = px - cx;
      const dy = py - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > r * r && !(px === x0 && py === y0)) continue;
      if (px < 0 || py < 0 || px >= CELL.w || py >= CELL.h) continue;
      const k = py * CELL.w + px;
      const dz = Math.sqrt(Math.max(0, r * r - d2));
      if (d - dz >= depth[k]) continue;
      depth[k] = d - dz;
      part[k] = what;
      inks[k] = shade(dx / r, -dy / r, dz / r, k);
    }
}

const screenLit = (nx: number, ny: number, nz: number) =>
  nx * SCREEN_LIGHT[0] + ny * SCREEN_LIGHT[1] + nz * SCREEN_LIGHT[2];

const LOBE: Vec[] = [
  [7.5, 22.5, 3],
  [9.4, 25.6, 2.9],
  [10.6, 27.8, 1.2],
  [10.2, 28.6, -0.8],
  [8.8, 27.9, -1.9],
  [7.9, 26.6, -1.2],
];
const LOBE_CURL: Vec = [9.2, 27, 0.4];

function along(points: Vec[], t: number): Vec {
  const n = points.length - 1;
  const i = Math.min(n - 1, Math.floor(t * n));
  const f = t * n - i;
  const p0 = points[Math.max(0, i - 1)];
  const p1 = points[i];
  const p2 = points[i + 1];
  const p3 = points[Math.min(n, i + 2)];
  const out: Vec = [0, 0, 0];
  for (let a = 0; a < 3; a++)
    out[a] =
      0.5 *
      (2 * p1[a] +
        (p2[a] - p0[a]) * f +
        (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * f * f +
        (3 * p1[a] - p0[a] - 3 * p2[a] + p3[a]) * f * f * f);
  return out;
}

function paintLobes(v: View): void {
  for (const side of [1, -1])
    for (let t = 0; t <= 1; t += 0.02) {
      const [x, y, z] = along(LOBE, t);
      const toCurl: Vec = [
        side * (LOBE_CURL[0] - x),
        LOBE_CURL[1] - y,
        LOBE_CURL[2] - z,
      ];
      const across = toCurl[0] * v.rx + toCurl[1] * v.fx;
      const deep = toCurl[0] * v.ry + toCurl[1] * v.fy;
      const up = deep * LIFT + toCurl[2] * FACE;
      const toward = toCurl[2] * LIFT - deep * FACE;
      ball(v, [side * x, y, z], 2.1 - 1.1 * t, PART.lobe, (nx, ny, nz, k) => {
        const l = screenLit(nx, ny, nz);
        return nx * across + ny * up + nz * toward > 0.3
          ? pick(BELLY, 1.4 - l * 1.6, k)
          : pick(BACK, 3 - l * 2.6, k);
      });
    }
}

function paintEyes(v: View): void {
  for (const side of [1, -1])
    ball(v, [side * 9.6, 16, 3.9], 1.5, PART.eye, (nx, ny) =>
      nx < -0.2 && ny > 0.2 ? GLINT : EYE,
    );
}

function tailPoint(u: number, phase: number): Vec {
  return [
    4.5 * u * u * Math.sin(phase - 2.6 * u),
    TAIL.y - TAIL.len * u,
    0.4 - 3 * u + 2 * u ** 3 + 2.6 * u * u * Math.cos(phase - 2.6 * u),
  ];
}

function paintTail(v: View, phase: number): void {
  const steps = TAIL.len * 3;
  for (let n = 0; n <= steps; n++) {
    const u = n / steps;
    ball(v, tailPoint(u, phase), 0.95 - 0.5 * u, PART.tail, (nx, ny, nz, k) =>
      pick(BACK, 5 - screenLit(nx, ny, nz) * 2.5, k),
    );
  }
}

const saddleTop = (x: number, y: number) =>
  wingThickness(Math.abs(x)) + dome(x, y) + 1.6;

function paintPearls(v: View): void {
  for (const side of [1, -1]) {
    const x = side * (SADDLE.a + 0.6);
    const z = wingThickness(SADDLE.a) + dome(x, SADDLE.y) + STRAP.lift;
    ball(v, [x, SADDLE.y, z + 0.6], 1.3, PART.pearl, (nx, ny, nz) => {
      const l = screenLit(nx, ny, nz);
      return PEARL[l > 0.55 ? 0 : l > 0.1 ? 1 : 2];
    });
  }
}

function fillHoles(): void {
  const { w, h } = CELL;
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const k = y * w + x;
      if (part[k]) continue;
      let near = -1;
      let count = 0;
      for (const n of [k - 1, k + 1, k - w, k + w])
        if (part[n]) {
          count++;
          if (near < 0 || depth[n] < depth[near]) near = n;
        }
      if (count < 3) continue;
      part[k] = part[near];
      inks[k] = inks[near];
      depth[k] = depth[near];
    }
}

const isSkin = (p: number) => p === PART.back || p === PART.belly;

/** True when the pixel k should be drawn as the outline of its neighbour n. */
function edgeOf(k: number, n: number): boolean {
  const p = part[k];
  const q = part[n];
  if (!q || q === PART.eye) return false;
  if (!p) return true;
  if (p === PART.eye) return false;
  if (q === p) return depth[n] < depth[k] - 3;
  if (isSkin(p) && isSkin(q)) return p === PART.belly;
  return depth[n] < depth[k] - 0.3;
}

function outline(): void {
  const { w, h } = CELL;
  lined.set(inks);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = y * w + x;
      let best = -1;
      if (x > 0 && edgeOf(k, k - 1)) best = k - 1;
      if (
        x < w - 1 &&
        edgeOf(k, k + 1) &&
        (best < 0 || depth[k + 1] < depth[best])
      )
        best = k + 1;
      if (y > 0 && edgeOf(k, k - w) && (best < 0 || depth[k - w] < depth[best]))
        best = k - w;
      if (
        y < h - 1 &&
        edgeOf(k, k + w) &&
        (best < 0 || depth[k + w] < depth[best])
      )
        best = k + w;
      if (best >= 0) lined[k] = OUTLINE[part[best]];
    }
}

function paint(px: Pixels, direction: string, frame: number): void {
  const phase = (frame / FRAMES) * Math.PI * 2;
  const v = viewOf(direction, BOB[frame % FRAMES]);
  depth.fill(Infinity);
  part.fill(0);
  inks.fill(-1);
  bendDisc(phase);
  const pulse = SPOTS.map(([, sy]) => Math.sin(phase - 0.16 * (24 - sy)) > 0.1);
  for (const side of [1, -1]) {
    paintSurface(v, side, false, pulse);
    paintSurface(v, side, true, pulse);
  }
  paintLobes(v);
  paintEyes(v);
  paintTail(v, phase);
  paintPearls(v);
  fillHoles();
  outline();
  for (let y = 0; y < CELL.h; y++)
    for (let x = 0; x < CELL.w; x++) {
      const i = lined[y * CELL.w + x];
      if (i >= 0) put(px, x, y, INKS[i]);
    }
}

function seatOf(direction: string): [number, number] {
  const v = viewOf(direction, 0);
  const [dx, dy] = NUDGE[direction];
  return [
    Math.round(v.ox + SADDLE.y * v.fx) + dx,
    Math.round(
      v.oy - (SADDLE.y * v.fy * LIFT + saddleTop(0, SADDLE.y) * FACE),
    ) + dy,
  ];
}

export const TIDE_MANTA: DrawnMount = {
  id: "own-tide-manta",
  name: "Tide Manta",
  description:
    "กระเบนราหูตัวใหญ่ร่อนอยู่กลางอากาศ หลังสีเขียวน้ำทะเลเข้มไล่เป็นสีกรมท่าที่ปลายครีบ ใต้ท้องสีครีมอ่อนเห็นได้ตอนปลายครีบม้วนขึ้น มีจุดเรืองแสงสีฟ้าน้ำทะเลเรียงเป็นแถวบนหลัง ครีบหัวม้วนเป็นเขาสองข้างปากกว้าง หางยาวเรียวเหมือนแส้ ครีบพลิ้วเป็นคลื่นตอนบิน บนหลังมีเบาะนั่งแบนสีชมพูปะการังขอบขลิบสีมุก มีสายรัดคาดผ่านหลังติดหมุดไข่มุก",
  cell: CELL,
  seat: Object.fromEntries(
    Object.keys(HEADING).map((d) => [d, seatOf(d)]),
  ) as Record<string, [number, number]>,
  paint,
};
