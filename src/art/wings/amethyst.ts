import { put, rgb, type Pixels, type Rgb } from "../pixels";
import {
  layer,
  litSide,
  poly,
  type Hit,
  type Shader,
  type Shape,
  type Xy,
} from "../wing-shapes";
import type { DrawnWing } from "../wings";

const OUTLINE = rgb("#1f0a45");
const VIOLET = ["#f1e1ff", "#c391fa", "#8a4cdf", "#4f229c"].map(rgb);
const PINK = ["#ffe3f6", "#ff9ad8", "#e04fb0", "#9a2680"].map(rgb);
const ROCK = ["#5f5675", "#3b3452", "#241f38"].map(rgb);
const ROCK_RIM = rgb("#8a80a8");
const ROCK_GLOW = rgb("#6a46b0");
const ROCK_OUTLINE = rgb("#110d19");

/** A prism ending in a point; `side` runs across it so its edges stay at ±half all the way to the apex, and t passes 1 where the point starts. */
function crystal(
  from: Xy,
  to: Xy,
  width: number,
  point: number,
  lean = 0,
): Shape {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy);
  const body = 1 - point / len;
  const half = width / 2;
  return (x, y) => {
    const ax = x - from[0];
    const ay = y - from[1];
    const along = (ax * dx + ay * dy) / (len * len);
    if (along < 0 || along > 1) return undefined;
    const u = along < body ? 0 : (along - body) / (1 - body);
    const span = half * (1 - u);
    const off = (ax * dy - ay * dx) / len - lean * u;
    return Math.abs(off) < span
      ? {
          t: along < body ? along / body : 1 + u,
          side: (off / span) * half,
          half,
        }
      : undefined;
  };
}

const facets =
  (p: Rgb[]): Shader =>
  ({ t, side, half }) => {
    const tone = side > half * 0.2 ? 1 : side > -half * 0.4 ? 2 : 3;
    return p[t > 1 ? tone - 1 : t < 0.3 ? Math.min(3, tone + 1) : tone];
  };

type Crystal = [from: Xy, to: Xy, width: number, point: number, lean?: number];

function grow(px: Pixels, list: Crystal[], p: Rgb[]) {
  const shade = facets(p);
  for (const [from, to, width, point, lean] of list) {
    const lit = litSide(from, to);
    layer(
      px,
      crystal(from, to, width, point, lean),
      OUTLINE,
      (hit: Hit, x, y) => shade({ ...hit, side: hit.side * lit }, x, y),
    );
  }
}

const BEHIND: Crystal[] = [[[9, 31], [33, 9], 6, 5, 0.8]];

const BIG: Crystal[] = [
  [[4, 29], [8, 5], 7, 6, 0.6],
  [[10, 32], [34, 20], 9, 7, -0.9],
  [[8, 29], [27, 3], 10, 8, 0.4],
  [[10, 35], [33, 34], 8, 7, 0.7],
  [[9, 37], [25, 39], 6, 5, -0.5],
];

const SMALL_PINK: Crystal[] = [
  [[7, 31], [12, 22], 5, 4, 0.5],
  [[11, 33], [19, 27], 5, 4, -0.4],
  [[11, 37], [21, 34], 4, 4, 0.3],
];

const SMALL_VIOLET: Crystal[] = [[[4, 30], [2, 19], 4, 3.5, -0.3]];

const rockShade: Shader = ({ t, side }) => {
  if (t < 1.2 && side > 0.45) return ROCK_RIM;
  if (t < 1.1 && side < -0.3) return ROCK_GLOW;
  return ROCK[side > 0.3 ? 0 : side < -0.35 ? 2 : 1];
};

const SPARKS: [x: number, y: number, tone: number][] = [
  [1, 28, 2],
  [5, 33, 1],
  [3, 36, 0],
  [9, 36, 2],
  [11, 38, 1],
  [7, 39, 0],
];

const ROCKS: Xy[][] = [
  [
    [-2, 24],
    [2, 23],
    [4, 27],
    [6, 30],
    [7, 36],
    [-2, 38],
  ],
  [
    [-2, 31],
    [5, 29],
    [9, 31],
    [11, 35],
    [10, 39],
    [7, 41],
    [4, 40],
    [1, 41],
    [-2, 41],
  ],
  [
    [7, 35],
    [10, 33],
    [13, 35],
    [14, 38],
    [12, 40],
    [9, 41],
    [6, 40],
  ],
];

export const amethyst: DrawnWing = {
  id: "own-amethyst",
  name: "Amethyst Wings",
  description:
    "ปีกแร่อะเมทิสต์เป็นกลุ่มผลึกสีม่วงเหลี่ยมแหลมกางเป็นรูปพัดอยู่ด้านหลัง งอกจากหินจีโอดสีเข้มที่โคนปีก ผลึกแต่ละแท่งมีด้านสว่าง ด้านกลาง และด้านเงาเข้ม มีผลึกสีชมพูเล็ก ๆ แทรกอยู่ระหว่างแท่ง มีประกายไฟฟ้าแลบรอบปีก กระพือช้า ๆ ตอนยืน เร็วขึ้นตอนเดิน",
  aura: "storm",
  far: 0xb8a8c8,
  drop: 0,
  w: 36,
  h: 42,
  root: { x: 0, y: 30 },
  paint: (px) => {
    grow(px, BEHIND, VIOLET);
    grow(px, BIG, VIOLET);
    grow(px, SMALL_VIOLET, VIOLET);
    grow(px, SMALL_PINK, PINK);
    for (const rock of ROCKS) layer(px, poly(rock), ROCK_OUTLINE, rockShade);
    for (const [x, y, tone] of SPARKS) put(px, x, y, VIOLET[tone]);
  },
};
