import { put, rgb, type Rgb } from "../pixels";
import {
  blob,
  layer,
  litSide,
  poly,
  type Shader,
  type Shape,
  type Xy,
} from "../wing-shapes";
import type { DrawnWing } from "../wings";

const HUB: Xy = [4.5, 32];
const RAD = Math.PI / 180;

const curve = (a: Xy, b: Xy, c: Xy, n = 36): Xy[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const [p, q, r] = [(1 - t) ** 2, 2 * (1 - t) * t, t * t];
    return [p * a[0] + q * b[0] + r * c[0], p * a[1] + q * b[1] + r * c[1]];
  });

const length = (pts: Xy[]): number =>
  pts.reduce(
    (sum, p, i) =>
      i ? sum + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0,
    0,
  );

function nearest(pts: Xy[], x: number, y: number) {
  let best = { d: Infinity, along: 0, side: 0 };
  let run = 0;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const dx = pts[i][0] - x0;
    const dy = pts[i][1] - y0;
    const len = Math.hypot(dx, dy);
    const k = Math.max(
      0,
      Math.min(1, ((x - x0) * dx + (y - y0) * dy) / (len * len)),
    );
    const d = Math.hypot(x - x0 - k * dx, y - y0 - k * dy);
    if (d < best.d)
      best = {
        d,
        along: run + k * len,
        side:
          (((x - x0) * dy - (y - y0) * dx) / len) * litSide([x0, y0], pts[i]),
      };
    run += len;
  }
  return best;
}

/** A constant-width stick along a polyline; t runs along it and side is positive toward the light. */
const stick =
  (pts: Xy[], r: number): Shape =>
  (x, y) => {
    const n = nearest(pts, x, y);
    return n.d < r
      ? { t: n.along / length(pts), side: n.side, half: r }
      : undefined;
  };

function rib(deg: number, len: number, bow: number): Xy[] {
  const [ux, uy] = [Math.cos(deg * RAD), Math.sin(deg * RAD)];
  const tip: Xy = [HUB[0] + ux * len, HUB[1] + uy * len];
  const mid: Xy = [(HUB[0] + tip[0]) / 2, (HUB[1] + tip[1]) / 2];
  return curve(HUB, [mid[0] + uy * bow * 2, mid[1] - ux * bow * 2], tip);
}

/** The cane's crook: the rib keeps turning clockwise past its tip. */
function crook(pts: Xy[], r: number, deg: number): Xy[] {
  const [x0, y0] = pts[pts.length - 2];
  const [x1, y1] = pts[pts.length - 1];
  const d = Math.hypot(x1 - x0, y1 - y0);
  const [ux, uy] = [(x1 - x0) / d, (y1 - y0) / d];
  const [cx, cy] = [x1 - uy * r, y1 + ux * r];
  const steps = Math.ceil(deg / 15);
  return Array.from({ length: steps }, (_, i): Xy => {
    const a = ((i + 1) / steps) * deg * RAD;
    return [
      cx + uy * r * Math.cos(a) + ux * r * Math.sin(a),
      cy - ux * r * Math.cos(a) + uy * r * Math.sin(a),
    ];
  });
}

const RIBS = [
  rib(-58, 33, 3),
  rib(-34, 33, 1.5),
  rib(-12, 31, 1),
  rib(20, 19, 0.5),
];
const RIB_R = [1.2, 1, 1, 1];
const CANES = RIBS.map((r, i) => (i ? r : [...r, ...crook(r, 2.4, 150)]));

const CANE_OUTLINE = rgb("#5e1638");
const RED = ["#ff8f98", "#ec2f45", "#a8163a"].map(rgb);
const CREAM = ["#ffffff", "#fdeff4", "#dfb4c8"].map(rgb);
const PEARL = ["#ffffff", "#fff0f6", "#f2c4d8"].map(rgb);
const WHITE = rgb("#ffffff");

const caneShade =
  (len: number): Shader =>
  ({ t, side, half }) => {
    const band = Math.floor((t * len + side * 1.1) / 2.2);
    return (((band % 2) + 2) % 2 ? CREAM : RED)[
      side > half * 0.3 ? 0 : side < -half * 0.35 ? 2 : 1
    ];
  };

const GLASS: { outline: Rgb; tones: Rgb[] }[] = [
  {
    outline: rgb("#a23a68"),
    tones: ["#ffe6f1", "#ffc2dc", "#ff9bc4", "#e96a9f"].map(rgb),
  },
  {
    outline: rgb("#1f8062"),
    tones: ["#e6fff4", "#bdf5db", "#8ee6c2", "#4fbf98"].map(rgb),
  },
  {
    outline: rgb("#b0801a"),
    tones: ["#fffbd9", "#fff1a2", "#ffe274", "#e8b83a"].map(rgb),
  },
];

function panel(a: Xy[], b: Xy[], bulge: number): Shape {
  const ta = a[a.length - 1];
  const tb = b[b.length - 1];
  const mx = (ta[0] + tb[0]) / 2;
  const my = (ta[1] + tb[1]) / 2;
  const out = Math.hypot(mx - HUB[0], my - HUB[1]);
  const bend: Xy = [
    mx + ((mx - HUB[0]) / out) * bulge * 2,
    my + ((my - HUB[1]) / out) * bulge * 2,
  ];
  return poly([
    ...a,
    ...curve(ta, bend, tb, 14).slice(1, -1),
    ...[...b].reverse(),
  ]);
}

const glass =
  (
    [hi, light, base, deep]: Rgb[],
    upper: Xy[],
    lower: Xy[],
    gap: number,
  ): Shader =>
  ({ t, side }, x, y) => {
    if (t < 1.4) return side > 0.3 ? hi : side < -0.3 ? deep : light;
    const u = nearest(upper, x, y);
    const streak = u.d > 4.1 && u.d < 5.1;
    const along = u.along / length(upper);
    if (
      streak &&
      ((along > 0.3 && along < 0.6) || (along > 0.68 && along < 0.72))
    )
      return WHITE;
    if (u.d < gap) return base;
    return u.d < nearest(lower, x, y).d ? light : base;
  };

const pearl = ({ side, half }: { side: number; half: number }) =>
  PEARL[side > half * 0.3 ? 0 : side < -half * 0.3 ? 2 : 1];

const SPRINKLES: [number, number, number, number, string][] = [
  [22, 11, 1, 0, "#3f86ff"],
  [28, 12, 1, 1, "#8a56f0"],
  [25, 15, 0, 1, "#ffffff"],
  [20, 17, 1, 0, "#ff9a2e"],
  [28, 19, 1, 0, "#ff3f7f"],
  [24, 23, 1, 1, "#8a56f0"],
  [33, 21, 0, 1, "#3f86ff"],
  [22, 32, 1, 0, "#ff3f7f"],
  [29, 31, 1, 1, "#3f86ff"],
];

const SWEET: Xy = [5.5, 32];
const FOIL = ["#f4fcff", "#cdeeff", "#9fd6f2", "#66add6"].map(rgb);
const FOIL_OUTLINE = rgb("#3a7aa8");

function flare(deg: number): [Shape, Shader] {
  const [ux, uy] = [Math.cos(deg * RAD), Math.sin(deg * RAD)];
  const at = (r: number, s: number): Xy => [
    SWEET[0] + ux * r - uy * s,
    SWEET[1] + uy * r + ux * s,
  ];
  const shape = poly([
    at(2, -1.4),
    at(5.5, -2.2),
    at(8, -3.4),
    at(7, -2),
    at(8, -0.8),
    at(7, 0.6),
    at(8, 1.8),
    at(7, 2.6),
    at(8, 3.4),
    at(5.5, 2.2),
    at(2, 1.4),
  ]);
  return [
    shape,
    (_, x, y) => {
      const dx = x + 0.5 - SWEET[0];
      const dy = y + 0.5 - SWEET[1];
      if (dx * ux + dy * uy > 7.2) return FOIL[2];
      return FOIL[Math.floor((-dx * uy + dy * ux + 4) / 1.5) % 2 ? 0 : 1];
    },
  ];
}

export const candy: DrawnWing = {
  id: "own-candy",
  name: "Candy Wings",
  description:
    "ปีกลูกกวาดที่มีซี่ปีกเป็นไม้เท้าลูกอมลายขาวแดง ขึงด้วยแผ่นแก้วลูกกวาดสีชมพู มิ้นต์ และเหลืองเลมอน ปลายซี่ประดับไข่มุกน้ำตาลสีขาว มีลูกอมกลมห่อกระดาษที่โคนปีกและน้ำตาลเม็ดโรยหลากสีประปราย มีประกายแสงสีทองร่วงจากปีก กระพือช้า ๆ ตอนยืน เร็วขึ้นตอนเดิน",
  aura: "gold",
  far: 0xd8b8c8,
  drop: 0,
  w: 40,
  h: 42,
  root: { x: 0, y: 32 },
  paint: (px) => {
    GLASS.forEach(({ outline, tones }, i) =>
      layer(
        px,
        panel(RIBS[i], RIBS[i + 1], 2.5),
        outline,
        glass(tones, RIBS[i], RIBS[i + 1], RIB_R[i] + 1.8),
      ),
    );
    for (let i = CANES.length - 1; i >= 0; i--)
      layer(
        px,
        stick(CANES[i], RIB_R[i]),
        CANE_OUTLINE,
        caneShade(length(CANES[i])),
      );
    for (const r of RIBS.slice(1)) {
      const [x, y] = r[r.length - 1];
      layer(px, blob(x, y, 1.7), CANE_OUTLINE, pearl);
    }
    for (const [x, y, dx, dy, hex] of SPRINKLES) {
      put(px, x, y, rgb(hex));
      put(px, x + dx, y + dy, rgb(hex));
    }
    for (const deg of [-118, 62]) {
      const [shape, shade] = flare(deg);
      layer(px, shape, FOIL_OUTLINE, shade);
    }
    layer(px, blob(SWEET[0], SWEET[1], 4.4), CANE_OUTLINE, (hit, x, y) => {
      const dx = x + 0.5 - SWEET[0];
      const dy = y + 0.5 - SWEET[1];
      const turn =
        (Math.atan2(dy, dx) / (2 * Math.PI)) * 3 + Math.hypot(dx, dy) * 0.14;
      return (turn - Math.floor(turn) < 0.5 ? RED : CREAM)[
        hit.side > hit.half * 0.3 ? 0 : hit.side < -hit.half * 0.35 ? 2 : 1
      ];
    });
  },
};
