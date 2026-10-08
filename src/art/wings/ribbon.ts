import { put, rgb, type Pixels, type Rgb } from "../pixels";
import { blob, capsule, layer, type Xy } from "../wing-shapes";
import type { DrawnWing } from "../wings";

const STEP = 0.3;

type Spot = { x: number; y: number; tx: number; ty: number; s: number };

/** A Catmull-Rom curve through the points, resampled every STEP pixels with its heading at each. */
function trace(pts: Xy[]): Spot[] {
  const p = [pts[0], ...pts, pts[pts.length - 1]];
  const dense: Xy[] = [];
  for (let i = 1; i < p.length - 2; i++)
    for (let k = 0; k < 30; k++) {
      const t = k / 30;
      const at = (a: number) =>
        0.5 *
        (2 * p[i][a] +
          (p[i + 1][a] - p[i - 1][a]) * t +
          (2 * p[i - 1][a] - 5 * p[i][a] + 4 * p[i + 1][a] - p[i + 2][a]) *
            t ** 2 +
          (3 * p[i][a] - p[i - 1][a] - 3 * p[i + 1][a] + p[i + 2][a]) * t ** 3);
      dense.push([at(0), at(1)]);
    }
  dense.push(pts[pts.length - 1]);
  const out: Spot[] = [];
  let s = 0;
  let next = 0;
  dense.forEach(([x, y], i) => {
    if (i) s += Math.hypot(x - dense[i - 1][0], y - dense[i - 1][1]);
    if (s >= next || i === dense.length - 1) {
      out.push({ x, y, tx: 0, ty: 0, s });
      next = s + STEP;
    }
  });
  out.forEach((o, i) => {
    const a = out[Math.max(0, i - 2)];
    const b = out[Math.min(out.length - 1, i + 2)];
    const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    o.tx = (b.x - a.x) / d;
    o.ty = (b.y - a.y) / d;
  });
  return out;
}

type Tone = { sheen: Rgb[]; back: Rgb[]; edge: Rgb };

const tone = (sheen: string[], back: string[], edge: string): Tone => ({
  sheen: sheen.map(rgb),
  back: back.map(rgb),
  edge: rgb(edge),
});

const ROSE = tone(
  ["#ffe3ec", "#ffb3c9", "#f7739b", "#c93f73"],
  ["#f58aab", "#d8527f", "#a93a64", "#7d2447"],
  "#6b1d3f",
);
const LILAC = tone(
  ["#f1e6ff", "#d3b8ff", "#a784ea", "#7a55c0"],
  ["#b894f0", "#8f68d0", "#6a47a8", "#4a2f80"],
  "#3f2a78",
);
const SKY = tone(
  ["#e6f7ff", "#b0e0ff", "#6dbbf2", "#3f8fd0"],
  ["#7cc2f4", "#4b9ae0", "#3a74b8", "#27528c"],
  "#1c3f7a",
);

const GOLD = ["#fff3a0", "#ffd34a", "#8a5a10"].map(rgb);

type Ribbon = {
  path: Xy[];
  half: number;
  twists: number;
  phase: number;
  tone: Tone;
  notch: number;
};

function draw(px: Pixels, r: Ribbon): void {
  const spots = trace(r.path);
  const total = spots[spots.length - 1].s;
  const turn = (s: number) => {
    const k = r.twists * (s / total) + r.phase;
    const n = Math.floor(k);
    const u = k - n;
    return Math.PI * (n + u - Math.sin(2 * Math.PI * u) / (2 * Math.PI));
  };
  const half = (s: number) =>
    r.half *
    (0.3 + 0.7 * Math.abs(Math.cos(turn(s)))) *
    Math.min(1, 0.5 + s / 22);
  const owner = new Int32Array(px.w * px.h).fill(-1);
  const across = new Float32Array(px.w * px.h);
  for (let y = 0; y < px.h; y++)
    for (let x = 0; x < px.w; x++) {
      const [cx, cy] = [x + 0.5, y + 0.5];
      for (let i = spots.length - 1; i >= 0; i--) {
        const q = spots[i];
        const hw = half(q.s);
        const dx = cx - q.x;
        const dy = cy - q.y;
        if (Math.abs(dx) > hw + STEP || Math.abs(dy) > hw + STEP) continue;
        const along = dx * q.tx + dy * q.ty;
        const lat = dx * q.ty - dy * q.tx;
        if (Math.abs(along) > STEP || Math.abs(lat) >= hw) continue;
        if (total - (q.s + along) < r.notch * (1 - Math.abs(lat) / hw))
          continue;
        owner[y * px.w + x] = i;
        across[y * px.w + x] = lat;
        break;
      }
    }
  const own = (x: number, y: number) =>
    x < 0 || y < 0 || x >= px.w || y >= px.h ? -1 : owner[y * px.w + x];
  for (let y = 0; y < px.h; y++)
    for (let x = 0; x < px.w; x++) {
      const i = owner[y * px.w + x];
      const near = [own(x - 1, y), own(x + 1, y), own(x, y - 1), own(x, y + 1)];
      if (i < 0) {
        if (near.some((o) => o >= 0)) put(px, x, y, r.tone.edge);
        continue;
      }
      if (near.some((o) => o >= 0 && spots[o].s - spots[i].s > 6)) {
        put(px, x, y, r.tone.edge);
        continue;
      }
      const q = spots[i];
      const lit = Math.sign(q.tx * 0.8 - q.ty * 0.6) || 1;
      const hw = half(q.s);
      const v = (across[y * px.w + x] * lit) / hw;
      const front = Math.cos(turn(q.s)) >= 0;
      const ramp = front ? r.tone.sheen : r.tone.back;
      let c: Rgb;
      if (hw < 1.5) c = ramp[2];
      else if (front)
        c =
          v > 0.2 && v < 0.55
            ? ramp[0]
            : v > 0.55
              ? ramp[1]
              : v > -0.45
                ? ramp[1]
                : v > -0.8
                  ? ramp[2]
                  : ramp[3];
      else
        c =
          v > 0.6 ? ramp[0] : v > 0.1 ? ramp[1] : v > -0.5 ? ramp[2] : ramp[3];
      put(px, x, y, c);
    }
}

const KNOT: Xy = [3.5, 30];
const RAD = Math.PI / 180;

/** Leaves the knot at `heading` degrees, then turns by the given degrees over each stretch of the given length. */
function sweep(heading: number, legs: [length: number, turn: number][]): Xy[] {
  const pts: Xy[] = [[KNOT[0] + 1.5, KNOT[1]]];
  let [x, y] = pts[0];
  let a = heading;
  for (const [length, turn] of legs) {
    const n = Math.ceil(length / 0.5);
    for (let i = 0; i < n; i++) {
      a += turn / n;
      x += Math.cos(a * RAD) * (length / n);
      y += Math.sin(a * RAD) * (length / n);
      pts.push([x, y]);
    }
  }
  return pts;
}

const ribbonOf = (
  path: Xy[],
  tone: Tone,
  twists: number,
  half = 2.1,
  notch = 4.5,
): Ribbon => ({
  path,
  half,
  twists,
  phase: 2 * Math.ceil(twists / 2) - twists,
  tone,
  notch,
});

const RIBBONS: Ribbon[] = [
  ribbonOf(
    sweep(-74, [
      [11, 30],
      [11, -40],
      [32, 350],
      [5, -10],
    ]),
    ROSE,
    3.5,
  ),
  ribbonOf(
    sweep(18, [
      [9, 35],
      [10, -60],
      [5, 35],
    ]),
    LILAC,
    1.5,
    1.9,
    4,
  ),
  ribbonOf(
    sweep(-4, [
      [11, 40],
      [11, -70],
      [9, 45],
      [2, -20],
    ]),
    ROSE,
    2,
  ),
  ribbonOf(
    sweep(-24, [
      [10, 40],
      [12, -75],
      [9, 50],
      [5, -25],
    ]),
    SKY,
    2.5,
  ),
  ribbonOf(
    sweep(-44, [
      [14, 35],
      [12, -65],
      [10, 45],
      [5, -20],
    ]),
    LILAC,
    2.5,
  ),
];

export const ribbon: DrawnWing = {
  id: "own-ribbon",
  name: "Silk Ribbon Wings",
  description:
    "ปีกริบบิ้นไหมสีชมพูกุหลาบ ม่วงลาเวนเดอร์ และฟ้าสดใสหลายเส้น พลิ้วม้วนเป็นห่วงออกมาจากโบใหญ่ที่โคนปีก กลางโบรัดด้วยแถบสีม่วงและลูกปัดสีทอง แต่ละเส้นบิดตัวสลับด้านมันวาวกับด้านเงามืด ปลายริบบิ้นตัดเป็นรอยหางนกนางแอ่น มีประกายแสงสีทองร่วงจากปีก กระพือช้า ๆ ตอนยืน เร็วขึ้นตอนเดิน",
  aura: "gold",
  far: 0xc8b0d0,
  drop: 0,
  w: 40,
  h: 42,
  root: { x: 0, y: 30 },
  paint: (px) => {
    for (const r of RIBBONS) draw(px, r);
    layer(
      px,
      capsule([3.4, 27.6], [3.4, 32.4], 3.5),
      ROSE.edge,
      ({ side, half }, x, y) => {
        const lit = -side / half;
        const fold = (y < 28 || y >= 32) && (x === 2 || x === 5);
        return ROSE.sheen[
          fold ? 3 : lit > 0.45 ? 0 : lit > -0.1 ? 1 : lit > -0.65 ? 2 : 3
        ];
      },
    );
    layer(
      px,
      (x, y) =>
        Math.abs(y - 30) < 1.7 && Math.abs(x - 3.4) < 3.9
          ? { t: 0, side: 3.4 - x, half: 3.9 }
          : undefined,
      LILAC.edge,
      ({ side, half }) =>
        LILAC.sheen[side > half * 0.4 ? 0 : side > -half * 0.3 ? 1 : 2],
    );
    layer(
      px,
      blob(3.6, 30, 1.5),
      GOLD[2],
      ({ side }) => GOLD[side > 0.2 ? 0 : 1],
    );
  },
};
