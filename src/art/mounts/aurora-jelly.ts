import type { DrawnMount } from "../mounts";
import { hash, put, rgb, TAU, type Pixels, type Rgb } from "../pixels";

const CELL = { w: 112, h: 120 };
const BOTTOM = CELL.h - 3;
const FRAMES = 6;
const DEG = Math.PI / 180;
// The game looks down on its world at about 25 degrees, so a level circle shows 0.42 times as tall as wide.
const SIN = 0.42;
const COS = Math.sqrt(1 - SIN * SIN);
const CROWN = 39;
const R0 = 33;
const H0 = 27;
const SADDLE = { r: 15, top: 2.2, sink: 5 };
const TRAIL = 14;
const LAPPETS = 12;

type V3 = [number, number, number];
type Xy = [number, number];

const unit = (x: number, y: number, z: number): V3 => {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
};
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const LIGHT = unit(-0.6, 0.45, 0.66);
const EYE_RAY: V3 = [0, COS, SIN];
const GLOSS = unit(LIGHT[0], LIGHT[1] + COS, LIGHT[2] + SIN);
const checker = (x: number, y: number) => ((x + y) & 1 ? 1 : -1);

const tones = (...hex: string[]) => hex.map(rgb);
const FRILL = tones("#eafffc", "#aaf5ef", "#6ad8de", "#36a8b9");
const TEAL = tones("#94f4e8", "#45d3cf", "#20a3b3", "#14708a");
const INDIGO = tones("#8494f6", "#5462e2", "#3a3db9", "#272a88");
const VIOLET = tones("#a97ef0", "#7f4cd8", "#5c2cb0", "#3e1a82");
const BANDS = [FRILL, TEAL, INDIGO, VIOLET];
const BAND_EDGE = tones("#0b3446", "#0b3446", "#191a58", "#24104a");
const GLOW = rgb("#fbf2ff");
const SHINE = rgb("#ffffff");
const PEARL = tones("#ffffff", "#f1eafb", "#d8cbee", "#ab98cf");
const SHEEN = tones("#ffe2f3", "#dbf4ff");
const GOLD = tones("#fff0b0", "#e8b850", "#a8742a");
const PEARL_EDGE = rgb("#3e2f66");
const EYE = rgb("#1c0f38");
const BLUSH = tones("#ffa6d8", "#ff6fb8");
const AURORA = [
  tones("#b4fdff", "#4bd8f0", "#1e8fc0"),
  tones("#b8ffc8", "#52e08e", "#1f9a66"),
  tones("#ffbdf2", "#e866d6", "#a8329f"),
];
const AURORA_EDGE = tones("#0c375a", "#0c3d2c", "#561356");
const ARM = tones("#ffd3f5", "#f58fe0", "#c94fbd");
const ARM_EDGE = rgb("#4b0f52");

type View = { az: number; cx: number };
const VIEWS: Record<string, View> = {
  south: { az: 0, cx: 56 },
  "south-east": { az: 45, cx: 58 },
  east: { az: 90, cx: 60 },
  "north-east": { az: 135, cx: 58 },
  north: { az: 180, cx: 56 },
};
const SEAT_Y = Math.round(CROWN - SADDLE.top * COS);

type Bell = {
  cx: number;
  cy: number;
  r: number;
  h: number;
  lap: number;
  az: number;
};

const PULSE = Array.from({ length: FRAMES }, (_, f) =>
  Math.cos((f / FRAMES) * TAU),
);
const BOB = [0, 0, 1, 1, 1, 0];

function bellOf(view: View, f: number): Bell {
  const p = PULSE[f];
  const h = H0 - 2.2 * p;
  return {
    cx: view.cx,
    cy: CROWN - BOB[f] + h * COS,
    r: R0 + 1.8 * p,
    h,
    lap: 4 - 0.8 * p,
    az: view.az * DEG,
  };
}

/** A point on the bell's skin at a latitude u (0 at the rim, 1 at the crown) and an angle from its front. */
function onBell(b: Bell, alpha: number, u: number): V3 {
  const r = b.r * Math.sqrt(1 - u * u);
  const a = b.az + alpha * DEG;
  return [r * Math.sin(a), r * Math.cos(a), u * b.h];
}

const toScreen = (b: Bell, [x, y, z]: V3): Xy => [
  b.cx + x,
  b.cy - z * COS + y * SIN,
];

const normalAt = (b: Bell, [x, y, z]: V3): V3 =>
  unit(x / (b.r * b.r), y / (b.r * b.r), z / (b.h * b.h));

const lobe = (alpha: number) => {
  const p = (((((alpha / TAU) * LAPPETS) % 1) + 1) % 1) - 0.5;
  return Math.sqrt(Math.max(0, 1 - 4 * p * p));
};

type Box = [number, number, number, number];

function layer<T>(
  px: Pixels,
  [bx0, by0, bx1, by1]: Box,
  hit: (x: number, y: number) => T | undefined,
  shade: (h: T, x: number, y: number) => Rgb,
  edge: (h: T) => Rgb,
): void {
  const x0 = Math.max(0, Math.floor(bx0) - 1);
  const y0 = Math.max(0, Math.floor(by0) - 1);
  const x1 = Math.min(CELL.w, Math.ceil(bx1) + 2);
  const y1 = Math.min(BOTTOM + 1, Math.ceil(by1) + 2);
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0) return;
  const hits: (T | undefined)[] = new Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      hits[y * w + x] = hit(x0 + x + 0.5, y0 + y + 0.5);
  const at = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h ? hits[y * w + x] : undefined;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const own = hits[y * w + x];
      if (own) {
        put(px, x0 + x, y0 + y, shade(own, x0 + x, y0 + y));
        continue;
      }
      const near = at(x - 1, y) ?? at(x + 1, y) ?? at(x, y - 1) ?? at(x, y + 1);
      if (near) put(px, x0 + x, y0 + y, edge(near));
    }
}

type BellHit = { p: V3; n: V3; s: number; band: number; lobe: number };

/** Casts the pixel's view ray at the bell, a half ellipsoid whose rim hangs in rounded lappets. */
function bellHit(b: Bell, x: number, y: number): BellHit | undefined {
  const sx = x - b.cx;
  const sy = y - b.cy;
  const ir = 1 / (b.r * b.r);
  const ih = 1 / (b.h * b.h);
  const qa = COS * COS * ir + SIN * SIN * ih;
  const qb = 2 * sy * SIN * COS * (ir - ih);
  const qc = sy * sy * (SIN * SIN * ir + COS * COS * ih) - (1 - sx * sx * ir);
  const disc = qb * qb - 4 * qa * qc;
  if (disc < 0) return undefined;
  const s = (-qb + Math.sqrt(disc)) / (2 * qa);
  const p: V3 = [sx, sy * SIN + s * COS, -sy * COS + s * SIN];
  const l = lobe(Math.atan2(p[0], p[1]) - b.az);
  if (p[2] < -b.lap * l) return undefined;
  const u = p[2] / b.h + checker(x - 0.5, y - 0.5) * 0.025;
  const band = p[2] < 2 ? 0 : u < 0.42 ? 1 : u < 0.7 ? 2 : 3;
  return { p, n: normalAt(b, p), s, band, lobe: l };
}

const SPOTS: [alpha: number, u: number, size: number][] = [
  ...[0, 60, 120, 180, 240, 300].map((a): [number, number, number] => [
    a,
    0.84,
    1.5,
  ]),
  ...[52, 112, 180, 248, 308].map((a): [number, number, number] => [
    a,
    0.58,
    2.2,
  ]),
  ...[84, 140, 220, 276].map((a): [number, number, number] => [a, 0.24, 1.6]),
];

function bellShade(b: Bell, f: number) {
  const spots = SPOTS.map(([alpha, u, size]) => ({
    at: onBell(b, alpha, u),
    size: size + (PULSE[f] < 0 ? 0.4 : 0),
  }));
  return ({ p, n, band, lobe }: BellHit, x: number, y: number): Rgb => {
    const palette = BANDS[band];
    const soft = checker(x, y) * 0.025;
    const light = dot(n, LIGHT) + soft;
    const facing = dot(n, EYE_RAY);
    const gloss = dot(n, GLOSS);
    if (gloss > 0.998) return SHINE;
    if (band > 0)
      for (const { at, size } of spots) {
        const d = Math.hypot(p[0] - at[0], p[1] - at[1], p[2] - at[2]);
        if (d < size * 0.45) return GLOW;
        if (d < size) return palette[0];
      }
    if (band === 0) {
      if (p[2] < 0 && lobe < 0.45) return palette[3];
      return palette[light > 0.45 ? 0 : light > -0.1 ? 1 : 2];
    }
    if (gloss > 0.99 + soft) return palette[0];
    let k = light > 0.82 ? 0 : light > 0.42 ? 1 : light > -0.05 ? 2 : 3;
    if (facing < 0.22 + soft) k = Math.min(3, k + 1);
    return palette[k];
  };
}

type SaddleHit = { cap: boolean; x: number; y: number; z: number; s: number };

function saddleHit(b: Bell, x: number, y: number): SaddleHit | undefined {
  const sx = x - b.cx;
  const sy = y - b.cy;
  if (Math.abs(sx) >= SADDLE.r) return undefined;
  const half = Math.sqrt(SADDLE.r * SADDLE.r - sx * sx);
  const top = b.h + SADDLE.top;
  const sTop = (top + sy * COS) / SIN;
  const yTop = sy * SIN + sTop * COS;
  if (Math.abs(yTop) <= half)
    return { cap: true, x: sx, y: yTop, z: top, s: sTop };
  const sSide = (half - sy * SIN) / COS;
  const z = -sy * COS + sSide * SIN;
  return z <= top && z >= b.h - SADDLE.sink
    ? { cap: false, x: sx, y: half, z: top - z, s: sSide }
    : undefined;
}

function saddleShade({ cap, x, y, z }: SaddleHit, px: number, py: number): Rgb {
  const lit = (-x * 0.75 - y * 0.35) / SADDLE.r;
  if (!cap) {
    if (z < 1.1) return PEARL[lit > -0.2 ? 1 : 2];
    return PEARL[lit > 0.1 ? 2 : 3];
  }
  const r = Math.hypot(x, y);
  if (r > SADDLE.r - 1.1) return PEARL[lit > -0.1 ? 1 : 2];
  if (r > SADDLE.r - 2.3) return GOLD[lit > 0 ? 0 : 1];
  const q = (-x * 0.6 - y * 0.8) / SADDLE.r + checker(px, py) * 0.05;
  return q > 0.32
    ? PEARL[0]
    : q < -0.42
      ? SHEEN[0]
      : q < -0.18
        ? SHEEN[1]
        : PEARL[1];
}

type Strand = {
  alpha: number;
  r: number;
  len: number;
  phase: number;
  arm: boolean;
};

const STRANDS: Strand[] = [
  ...Array.from({ length: 12 }, (_, i) => ({
    alpha: i * 30 + 15 + (hash(i * 5.1) - 0.5) * 12,
    r: 0.78,
    len: 52 - hash(i * 2.3) * 14,
    phase: hash(i * 9.7) * TAU,
    arm: false,
  })),
  ...[45, 135, 225, 315].map((alpha, i) => ({
    alpha,
    r: 0.2,
    len: 38 - (i % 2) * 4,
    phase: i * 1.9,
    arm: true,
  })),
];

const STEPS = 16;

function strandPoints(
  b: Bell,
  f: number,
  st: Strand,
  stretch: number,
): { pts: Xy[]; depth: number } {
  const a = b.az + st.alpha * DEG;
  const [rx, ry] = [Math.sin(a), Math.cos(a)];
  const [fx, fy] = [Math.sin(b.az), Math.cos(b.az)];
  const wave = (f / FRAMES) * TAU;
  const drag = 1 - 0.25 * Math.cos(((f - 1) / FRAMES) * TAU);
  const swing = st.arm ? 2.4 : 3.6;
  const pts: Xy[] = [];
  for (let i = 0; i <= STEPS; i++) {
    const s = i / STEPS;
    const k = wave - s * 2.6 * Math.PI + st.phase;
    const sway = swing * s ** 1.2 * Math.sin(k);
    const surge = swing * 0.6 * s ** 1.2 * Math.cos(k);
    const trail = TRAIL * s ** 1.6 * drag * (st.arm ? 0.7 : 1) + surge;
    const r = st.r * b.r + (st.arm ? 2 : 3) * s;
    const p: V3 = [
      rx * r - fx * trail + fy * sway,
      ry * r - fy * trail - fx * sway,
      1 - st.len * stretch * s,
    ];
    pts.push(toScreen(b, p));
  }
  return { pts, depth: ry * st.r };
}

const stretches = new Map<string, number>();

/** Scales the strands' hanging length so their lowest tip over the loop ends just above the cell's two empty rows. */
function stretchFor(direction: string): number {
  const known = stretches.get(direction);
  if (known !== undefined) return known;
  const view = VIEWS[direction];
  let best = Infinity;
  for (let f = 0; f < FRAMES; f++) {
    const b = bellOf(view, f);
    for (const st of STRANDS) {
      if (st.arm) continue;
      const [, tip] = strandPoints(b, f, st, 0).pts[STEPS];
      best = Math.min(best, (BOTTOM - 0.6 - tip) / (st.len * COS));
    }
  }
  stretches.set(direction, best);
  return best;
}

type StrandHit = { t: number; side: number; lit: number };

/** A strand along a polyline; `half(t, side)` gives the reach of its left (side 1) and right (side -1) edge. */
function ribbon(
  pts: Xy[],
  half: (t: number, side: number) => number,
): { box: Box; hit: (x: number, y: number) => StrandHit | undefined } {
  const segs = pts.slice(1).map((q, i) => {
    const a = pts[i];
    const dx = q[0] - a[0];
    const dy = q[1] - a[1];
    const l2 = dx * dx + dy * dy || 1e-6;
    return { a, dx, dy, l2, len: Math.sqrt(l2) };
  });
  let widest = 0;
  for (let i = 0; i <= 20; i++)
    widest = Math.max(widest, half(i / 20, 1), half(i / 20, -1));
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const box: Box = [
    Math.min(...xs) - widest,
    Math.min(...ys) - widest,
    Math.max(...xs) + widest,
    Math.max(...ys) + widest,
  ];
  return {
    box,
    hit: (x, y) => {
      let best = Infinity;
      let t = 0;
      let side = 0;
      let lit = 1;
      for (let i = 0; i < segs.length; i++) {
        const { a, dx, dy, l2, len } = segs[i];
        const ax = x - a[0];
        const ay = y - a[1];
        const k = Math.max(0, Math.min(1, (ax * dx + ay * dy) / l2));
        const ex = ax - k * dx;
        const ey = ay - k * dy;
        const d = ex * ex + ey * ey;
        if (d < best) {
          best = d;
          t = (i + k) / segs.length;
          side = (ay * dx - ax * dy) / len;
          lit = Math.sign(0.6 * dy - 0.8 * dx) || 1;
        }
      }
      const reach = half(t, side >= 0 ? 1 : -1);
      return Math.sqrt(best) < reach ? { t, side, lit } : undefined;
    },
  };
}

const auroraIndex = (t: number, x: number, y: number) =>
  Math.max(0, Math.min(2, Math.floor(t * 3 + checker(x, y) * 0.06)));

function paintStrand(px: Pixels, f: number, st: Strand, pts: Xy[]) {
  const wave = (f / FRAMES) * TAU;
  const length = st.len;
  if (!st.arm) {
    const { box, hit } = ribbon(pts, (t) => 1.25 - 0.7 * t);
    layer(
      px,
      box,
      hit,
      ({ t, side, lit }, x, y) => {
        const palette = AURORA[auroraIndex(t, x, y)];
        const glint =
          ((((t * length) / 10 - f / FRAMES + st.phase) % 1) + 1) % 1;
        if (glint < 0.1) return palette[0];
        return palette[side * lit > -0.3 ? 1 : 2];
      },
      ({ t }) => AURORA_EDGE[Math.min(2, Math.floor(t * 3))],
    );
    return;
  }
  const ruffle = (t: number, side: number) =>
    (3.6 - 1.9 * t) *
    (1 +
      0.36 *
        Math.sin(
          t * length * 1.3 - wave + st.phase + (side > 0 ? 0 : Math.PI),
        ));
  const { box, hit } = ribbon(pts, ruffle);
  layer(
    px,
    box,
    hit,
    ({ t, side, lit }) => {
      const edge = ruffle(t, side >= 0 ? 1 : -1) - Math.abs(side);
      if (edge < 1) return ARM[side * lit > 0 ? 0 : 2];
      const crease =
        ((((t * length + side * 1.3) / 5 - f / FRAMES) % 1) + 1) % 1;
      if (crease < 0.2) return ARM[2];
      return ARM[side * lit > -0.8 ? 1 : 2];
    },
    () => ARM_EDGE,
  );
}

const EYE_FULL = [".k.", "wkk", "kkk", ".k."];
const EYE_SIDE = ["k", "k", "k"];
const CHEEK = ["lbbl", ".ll."];
const CHEEK_SIDE = ["lb", ".l"];

function paintFace(px: Pixels, b: Bell) {
  const palette: Record<string, Rgb> = {
    k: EYE,
    w: SHINE,
    b: BLUSH[1],
    l: BLUSH[0],
  };
  const sprite = (alpha: number, u: number, art: string[], side: string[]) => {
    const p = onBell(b, alpha, u);
    const n = normalAt(b, p);
    if (dot(n, EYE_RAY) < 0.22) return;
    const rows = Math.abs(n[0]) > 0.8 ? side : art;
    const [x, y] = toScreen(b, p);
    const left = Math.round(x - rows[0].length / 2);
    const top = Math.round(y - rows.length / 2);
    rows.forEach((row, r) => {
      for (let c = 0; c < row.length; c++)
        if (palette[row[c]]) put(px, left + c, top + r, palette[row[c]]);
    });
  };
  for (const side of [-1, 1]) {
    sprite(side * 21, 0.23, CHEEK, CHEEK_SIDE);
    sprite(side * 13, 0.33, EYE_FULL, EYE_SIDE);
  }
}

function paint(px: Pixels, direction: string, frame: number): void {
  const known = direction in VIEWS ? direction : "south";
  const view = VIEWS[known];
  const f = ((frame % FRAMES) + FRAMES) % FRAMES;
  const b = bellOf(view, f);
  const stretch = stretchFor(known);
  STRANDS.map((st) => ({ st, ...strandPoints(b, f, st, stretch) }))
    .sort((p, q) => p.depth - q.depth)
    .forEach(({ st, pts }) => paintStrand(px, f, st, pts));
  const reach = b.r + 1;
  layer(
    px,
    [
      b.cx - reach,
      b.cy - b.h * COS - reach * SIN - 1,
      b.cx + reach,
      b.cy + reach * SIN + b.lap + 1,
    ],
    (x, y) => bellHit(b, x, y),
    bellShade(b, f),
    (h) => BAND_EDGE[h.band],
  );
  paintFace(px, b);
  layer(
    px,
    [
      b.cx - SADDLE.r,
      b.cy - (b.h + SADDLE.top) * COS - SADDLE.r * SIN - 1,
      b.cx + SADDLE.r,
      b.cy - (b.h - SADDLE.sink) * COS + SADDLE.r * SIN + 1,
    ],
    (x, y) => {
      const seat = saddleHit(b, x, y);
      if (!seat) return undefined;
      const skin = bellHit(b, x, y);
      return skin && skin.s > seat.s ? undefined : seat;
    },
    saddleShade,
    () => PEARL_EDGE,
  );
}

export const AURORA_JELLY: DrawnMount = {
  id: "own-aurora-jelly",
  name: "Aurora Jelly",
  description:
    "แมงกะพรุนยักษ์ลอยกลางอากาศ ร่มทรงโดมไล่สีจากม่วงเข้มเป็นครามและฟ้าอมเขียว ขอบร่มหยักเป็นระบาย มีจุดเรืองแสงนวล ๆ ตาจุดกลมกับแก้มสีชมพู แขนระบายสีชมพูและหนวดยาวสีแสงเหนือเขียว ฟ้า ชมพู มีเบาะนั่งแบนสีขาวมุกขอบทอง",
  cell: CELL,
  seat: Object.fromEntries(
    Object.entries(VIEWS).map(([d, v]) => [d, [v.cx, SEAT_Y]]),
  ) as Record<string, [number, number]>,
  paint,
};
