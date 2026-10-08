import { bayer, hash, put, rgb, type Pixels } from "../pixels";
import { layer, type Shader, type Shape, type Xy } from "../wing-shapes";
import type { DrawnWing } from "../wings";

const OUTLINE = rgb("#131830");
const CLOUD = [
  "#d5deef",
  "#a9b8d2",
  "#7f90b3",
  "#5d6c93",
  "#43507a",
  "#2f3a5e",
  "#1f2744",
].map(rgb);
const BOLT = ["#fffbe0", "#ffe23a"].map(rgb);
const BOLT_OUTLINE = rgb("#7a3b06");
const GLOW = rgb("#cfe6ff");

type Puff = [x: number, y: number, r: number];

/** Puffs strung along a curve and spaced wide enough that every bump keeps its cusp; the root end is listed last so it billows over the tip. */
function streak(
  from: Xy,
  bend: Xy,
  to: Xy,
  rmax: number,
  seed: number,
): Puff[] {
  const puffs: Puff[] = [];
  let last: Xy | undefined;
  for (let i = 0; i <= 120; i++) {
    const t = i / 120;
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const c = t * t;
    const x = a * from[0] + b * bend[0] + c * to[0];
    const y = a * from[1] + b * bend[1] + c * to[1];
    const r =
      rmax *
      (t < 0.3 ? 0.85 + (0.15 * t) / 0.3 : 1 - (0.55 * (t - 0.3)) / 0.7) *
      (0.9 + 0.2 * hash(seed + puffs.length * 3.7));
    if (!last || Math.hypot(x - last[0], y - last[1]) >= r * 1.75) {
      puffs.push([x, y, r]);
      last = [x, y];
    }
  }
  return puffs.reverse();
}

/** The last puff to reach a pixel owns it; t carries how dark its height makes it. */
const billow =
  (puffs: Puff[]): Shape =>
  (x, y) => {
    for (let i = puffs.length - 1; i >= 0; i--) {
      const [cx, cy, r] = puffs[i];
      if (Math.hypot(x - cx, y - cy) < r)
        return {
          t: Math.max(1, Math.min(3.6, 1 + (cy - 2) / 12)),
          side: (cx - x + cy - y) * 0.7,
          half: r,
        };
    }
    return undefined;
  };

const cloudShade: Shader = ({ t, side, half }, x, y) => {
  const k = side / half;
  const lit = k > 0.55 ? -0.9 : k > 0 ? -0.35 : k > -0.5 ? 0.25 : 0.9;
  const v = t + lit + (y - 20) * 0.02;
  return CLOUD[Math.max(0, Math.min(6, Math.floor(v + bayer(x, y))))];
};

const BANDS: Puff[][] = [
  streak([1, 36], [17, 37], [29, 39], 5.5, 15),
  streak([1, 34], [21, 31], [33, 28], 6, 14),
  streak([1, 32], [19, 22], [34, 17], 6.5, 13),
  streak([1, 31], [13, 16], [34, 8], 6.5, 12),
  streak([1, 29], [8, 12], [29, 3], 7, 11),
];

const BOLTS: Xy[][] = [
  [
    [3, 28],
    [10, 24],
    [9, 19],
    [17, 15],
    [16, 10],
    [25, 7],
    [24, 3],
  ],
  [
    [7, 36],
    [14, 33],
    [13, 28],
    [22, 26],
    [21, 21],
    [31, 20],
  ],
];

function strike(px: Pixels, path: Xy[], r0: number, r1: number) {
  const reach = [0];
  for (let i = 1; i < path.length; i++)
    reach.push(
      reach[i - 1] +
        Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]),
    );
  for (let y = 0; y < px.h; y++)
    for (let x = 0; x < px.w; x++) {
      let d = Infinity;
      let along = 0;
      for (let i = 1; i < path.length; i++) {
        const [x0, y0] = path[i - 1];
        const [x1, y1] = path[i];
        const dx = x1 - x0;
        const dy = y1 - y0;
        const k = Math.max(
          0,
          Math.min(
            1,
            ((x + 0.5 - x0) * dx + (y + 0.5 - y0) * dy) / (dx * dx + dy * dy),
          ),
        );
        const near = Math.hypot(x + 0.5 - x0 - k * dx, y + 0.5 - y0 - k * dy);
        if (near < d) {
          d = near;
          along =
            (reach[i - 1] + k * (reach[i] - reach[i - 1])) /
            reach[reach.length - 1];
        }
      }
      const r = r0 + (r1 - r0) * along;
      const solid = px.data[(y * px.w + x) * 4 + 3] > 0;
      if (d < r) put(px, x, y, BOLT[d < r * 0.5 ? 0 : 1]);
      else if (d < r + 1) {
        if (solid) put(px, x, y, GLOW, 0.4);
        else put(px, x, y, BOLT_OUTLINE);
      } else if (d < r + 2.2 && solid) put(px, x, y, GLOW, 0.18);
    }
}

export const thundercloud: DrawnWing = {
  id: "own-thundercloud",
  name: "Thundercloud Wings",
  description:
    "ปีกเมฆฝนฟ้าคะนองสีเทาอมน้ำเงินเข้มเป็นก้อนเมฆพองฟูซ้อนกันห้าชั้นกางเป็นรูปพัดอยู่ด้านหลัง ยอดเมฆสีอ่อนกว่าท้องเมฆ มีสายฟ้าสีเหลืองขาวสว่างแลบซิกแซกผ่านปีก มีประกายไฟฟ้าแลบรอบปีก กระพือช้า ๆ ตอนยืน เร็วขึ้นตอนเดิน",
  aura: "storm",
  far: 0xb8c0d8,
  drop: 0,
  w: 38,
  h: 44,
  root: { x: 0, y: 30 },
  paint: (px) => {
    for (const band of BANDS) layer(px, billow(band), OUTLINE, cloudShade);
    for (const path of BOLTS) strike(px, path, 1.2, 0.8);
  },
};
