import type { DrawnWing } from "../wings";
import { layer, poly, type Shader, type Xy } from "../wing-shapes";
import { put, rgb, type Rgb } from "../pixels";

const W = 38;
const H = 44;
const DEG = Math.PI / 180;
const APEX: Xy = [-4, 30.5];
const TOP = -64 * DEG;
const SPAN = 115 * DEG;
const bend = (r: number) => 32 * DEG * (r / 48.5) ** 2.3;

const polar = (deg: number, r: number): Xy => [
  APEX[0] + r * Math.cos(deg * DEG),
  APEX[1] + r * Math.sin(deg * DEG),
];

function fan(x: number, y: number) {
  const dx = x - APEX[0];
  const dy = y - APEX[1];
  const r = Math.hypot(dx, dy);
  return { r, u: (Math.atan2(dy, dx) - bend(r) - TOP) / SPAN };
}

function spline(points: Xy[], steps = 6): Xy[] {
  const out: Xy[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const cr = (a: number, b: number, c: number, d: number) =>
        0.5 *
        (2 * b +
          (c - a) * t +
          (2 * a - 5 * b + 4 * c - d) * t * t +
          (3 * b - a - 3 * c + d) * t * t * t);
      out.push([
        cr(p0[0], p1[0], p2[0], p3[0]),
        cr(p0[1], p1[1], p2[1], p3[1]),
      ]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

const NOTCHES: Xy[] = [
  polar(-24, 33),
  polar(-6, 33.5),
  polar(11, 30),
  polar(26, 21.5),
  polar(40, 12),
];
const LOBE_HEIGHT = [6, 5.5, 5, 4];

function lobes(): Xy[] {
  const out: Xy[] = [];
  for (let i = 0; i + 1 < NOTCHES.length; i++) {
    const a = NOTCHES[i];
    const b = NOTCHES[i + 1];
    const mx = (a[0] + b[0]) / 2 - APEX[0];
    const my = (a[1] + b[1]) / 2 - APEX[1];
    const ml = Math.hypot(mx, my);
    for (let k = 0; k < 14; k++) {
      const f = k / 14;
      const g = f ** 1.4;
      const bump = 0.5 - 0.5 * Math.cos(Math.PI * 2 * g);
      out.push([
        a[0] + (b[0] - a[0]) * f + (mx / ml) * LOBE_HEIGHT[i] * bump,
        a[1] + (b[1] - a[1]) * f + (my / ml) * LOBE_HEIGHT[i] * bump,
      ]);
    }
  }
  out.push(NOTCHES[NOTCHES.length - 1]);
  return out;
}

const LEAD: Xy[] = spline([
  [-8, 26],
  [0, 23.8],
  [2, 18.5],
  [6, 12.5],
  [11, 8],
  [17, 5],
  [24, 3.2],
  [30, 3.3],
  [34, 4.8],
  [37.2, 7.5],
]);
const HORN: Xy[] = [
  [37.2, 7.5],
  [34, 9.5],
  [31, 12],
  [28.5, 14.8],
  NOTCHES[0],
];
const OUTLINE: Xy[] = [
  [-8, 20],
  ...LEAD.slice(0, -1),
  ...spline(HORN).slice(0, -1),
  ...lobes(),
  [0, 35.5],
  [-8, 33],
];
const fin = poly(OUTLINE);

const NOTCH_U = NOTCHES.map(([x, y]) => fan(x, y).u);

const RAY = new Map<number, number>();
function trace(u: number, from: number, crease = 99) {
  for (let r = from; r < 60; r += 0.4) {
    const [x, y] = polar((TOP + u * SPAN + bend(r)) / DEG, r);
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const key = Math.floor(y) * W + Math.floor(x);
    RAY.set(key, Math.max(r >= crease ? 2 : 1, RAY.get(key) ?? 0));
  }
}
[0.06, 0.15].forEach((u) => trace(u, 14));
NOTCHES.forEach(([x, y], i) => {
  const { u, r } = fan(x, y);
  const next = NOTCH_U[i + 1] ?? 0.97;
  trace(u, 9, r - 7);
  trace(u + (next - u) * 0.5, 14);
  trace(u + (next - u) * 0.25, 30);
  trace(u + (next - u) * 0.75, 30);
});

const INK = rgb("#4a1d3f");
const INK_RED = rgb("#6b1c2c");
const WHITE = ["#ffffff", "#eef2fb", "#b9c8e8", "#8a9dcd"].map(rgb);
const PEACH = rgb("#fbe3d5");
const KOI = ["#ff9a55", "#f4592f", "#cf3a2c", "#8f2434"].map(rgb);

const PATCHES: [u: number, r0: number, r1: number, w: number, lean: number][] = [
  [0.1, 17, 47, 0.075, 0],
  [0.5, 6, 41, 0.1, 0.04],
];
const koiAt = (x: number, y: number): boolean => {
  const { u, r } = fan(x + 0.5, y + 0.5);
  return PATCHES.some(([pu, r0, r1, w, lean]) => {
    if (r < r0 || r > r1) return false;
    const k = (r - r0) / (r1 - r0);
    const half =
      w * Math.sin(Math.PI * k) ** 0.8 * (1 + 0.15 * Math.sin(r * 0.9 + pu * 30));
    return half * SPAN * r > 0.9 && Math.abs(u - pu - lean * (k - 0.5)) < half;
  });
};

const shade: Shader = ({ t }, x, y): Rgb => {
  const { u, r } = fan(x + 0.5, y + 0.5);
  const lobe = NOTCH_U.findIndex((n, i) => u >= n && u < NOTCH_U[i + 1]);
  const f =
    lobe < 0 ? 0.5 : (u - NOTCH_U[lobe]) / (NOTCH_U[lobe + 1] - NOTCH_U[lobe]);
  const patch = koiAt(x, y);
  const ray = RAY.get(y * W + x) ?? 0;
  let tone = 1;
  if (patch) {
    if (!koiAt(x - 1, y) || !koiAt(x, y - 1)) tone = 0;
    else if (!koiAt(x + 1, y) || !koiAt(x, y + 1)) tone = 2;
  } else if (t < 1.5 && r > 26 && !ray) tone = f > 0.6 ? 2 : 0;
  if (ray) tone = patch ? Math.max(tone, 2) : ray === 1 ? 2 : 3;
  if (!patch && !ray && tone === 1) {
    const bleed = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].some(([dx, dy]) => koiAt(x + dx, y + dy));
    if (bleed) return PEACH;
  }
  return (patch ? KOI : WHITE)[Math.min(3, tone)];
};

export const koiFin: DrawnWing = {
  id: "own-koi-fin",
  name: "Koi Fin Wings",
  description:
    "ปีกครีบปลาคาร์ปโคอิสีขาวใสยาวพลิ้ว มีลายปื้นสีส้มแดงกระจายอยู่ เส้นก้านครีบละเอียดแผ่ออกจากโคนปีก ขอบท้ายครีบเป็นคลื่นระบายพลิ้ว มีประกายไฟฟ้าแลบรอบปีก กระพือช้า ๆ ตอนยืน เร็วขึ้นตอนเดิน",
  aura: "storm",
  far: 0xd0c0c8,
  drop: 0,
  w: W,
  h: H,
  root: { x: 0, y: 30 },
  paint: (px) => {
    layer(px, fin, INK, shade, (_h, x, y) => {
      if (koiAt(x, y) || RAY.has(y * W + x)) return 1;
      const { r } = fan(x + 0.5, y + 0.5);
      return r < 24 ? 0.92 : r < 34 ? 0.84 : 0.76;
    });
    const inside = (x: number, y: number) =>
      x >= 0 && y >= 0 && x < W && y < H && fin(x + 0.5, y + 0.5) !== undefined;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (inside(x, y)) continue;
        const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(
          ([dx, dy]) => inside(x + dx, y + dy) && koiAt(x + dx, y + dy),
        );
        if (near) put(px, x, y, INK_RED);
      }
  },
};
