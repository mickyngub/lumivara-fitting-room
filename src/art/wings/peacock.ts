import { rgb, type Pixels, type Rgb } from "../pixels";
import {
  blob,
  fill,
  layer,
  litSide,
  type Shader,
  type Shape,
  type Xy,
} from "../wing-shapes";
import type { DrawnWing } from "../wings";

const OUTLINE = rgb("#062b2e");
const TEAL = ["#7ff5de", "#2dcfbf", "#14948f"].map(rgb);
const EMERALD = ["#8cf5a4", "#35d070", "#1b9553"].map(rgb);
const DEEP = ["#3fbf94", "#1b8a6c", "#0f5f55"].map(rgb);
const SHAFT = ["#fff0b0", "#e2bb55"].map(rgb);
const GOLD = ["#fff3a8", "#f4c63e", "#bc8420"].map(rgb);
const IRIS = ["#7ff5de", "#1fb3b8"].map(rgb);
const VIOLET = ["#b3a8ff", "#5646d8", "#2c1f86"].map(rgb);
const COVERT_OUTLINE = rgb("#0f3027");
const COVERT_SEAM = rgb("#2a6a50");
const COVERT = ["#dcc866", "#82a043", "#2f8266"].map(rgb);

const APEX: Xy = [2, 32];
const at = (deg: number, r: number): Xy => [
  APEX[0] + Math.cos((deg * Math.PI) / 180) * r,
  APEX[1] + Math.sin((deg * Math.PI) / 180) * r,
];

/** A curved feather that swells from `base` to `head` wide, ending in a rounded tip. */
function quill(
  from: Xy,
  bend: Xy,
  to: Xy,
  base: number,
  head: number,
  swell: number,
): Shape {
  const spine = Array.from({ length: 161 }, (_, i) => {
    const t = i / 160;
    const [a, b, c] = [(1 - t) ** 2, 2 * (1 - t) * t, t * t];
    const tx = 2 * (1 - t) * (bend[0] - from[0]) + 2 * t * (to[0] - bend[0]);
    const ty = 2 * (1 - t) * (bend[1] - from[1]) + 2 * t * (to[1] - bend[1]);
    const tl = Math.hypot(tx, ty);
    return {
      t,
      x: a * from[0] + b * bend[0] + c * to[0],
      y: a * from[1] + b * bend[1] + c * to[1],
      ux: tx / tl,
      uy: ty / tl,
    };
  });
  return (x, y) => {
    let near = spine[0];
    let best = Infinity;
    for (const s of spine) {
      const d = (x - s.x) ** 2 + (y - s.y) ** 2;
      if (d < best) {
        best = d;
        near = s;
      }
    }
    const half = (base + (head - base) * near.t ** swell) / 2;
    const side = (x - near.x) * near.uy - (y - near.y) * near.ux;
    return Math.sqrt(best) < half ? { t: near.t, side, half } : undefined;
  };
}

/** t is 0 at the centre and 1 at the rim; side is how far toward the top left light the point lies. */
function oval(c: Xy, dir: Xy, across: number, along: number): Shape {
  const len = Math.hypot(dir[0], dir[1]);
  const [ux, uy] = [dir[0] / len, dir[1] / len];
  return (x, y) => {
    const dx = x - c[0];
    const dy = y - c[1];
    const t = Math.hypot(
      (dx * uy - dy * ux) / across,
      (dx * ux + dy * uy) / along,
    );
    return t < 1
      ? {
          t,
          side: -(dx * 0.6 + dy * 0.8) / (Math.hypot(dx, dy) || 1),
          half: 1,
        }
      : undefined;
  };
}

const eyeShade: Shader = ({ t, side }) =>
  t > 0.66
    ? GOLD[side > 0.35 ? 0 : side < -0.35 ? 2 : 1]
    : t > 0.46
      ? IRIS[side > 0.1 ? 0 : 1]
      : VIOLET[t < 0.3 && side > 0.2 ? 0 : side < -0.4 ? 2 : 1];

const PLUMES: [deg: number, len: number, ramp: Rgb[]][] = [
  [-80, 26.5, TEAL],
  [-60, 29.5, EMERALD],
  [-40, 31, TEAL],
  [-20, 32, EMERALD],
  [0, 30, TEAL],
  [16, 24, EMERALD],
];
const UNDERPLUMES: [deg: number, len: number][] = [
  [-70, 23],
  [-50, 25],
  [-30, 26],
  [-10, 26],
  [9, 22],
];

function paintPlume(
  px: Pixels,
  deg: number,
  len: number,
  ramp: Rgb[],
  head: number,
  eye: boolean,
): void {
  const from = at(deg, 4);
  const bend = at(deg + 6, len * 0.55);
  const to = at(deg, len);
  const lit = litSide(from, to);
  const span = Math.hypot(to[0] - from[0], to[1] - from[1]);
  layer(px, quill(from, bend, to, 2.4, head, 3.2), OUTLINE, (hit) => {
    const side = hit.side * lit;
    if (
      Math.abs(hit.side) < 0.5 &&
      hit.t > 0.1 &&
      hit.t * span < span - head * 0.6
    )
      return SHAFT[side > 0 ? 0 : 1];
    if (hit.half < 1.9) return ramp[side > 0 ? 1 : 2];
    return ramp[side > hit.half * 0.3 ? 0 : side < -hit.half * 0.4 ? 2 : 1];
  });
  if (eye)
    fill(
      px,
      oval(to, [to[0] - bend[0], to[1] - bend[1]], head * 0.38, head * 0.48),
      eyeShade,
    );
}

const COVERTS: [deg: number, r: number, size: number][] = [
  ...[-85, -45, -5, 35].map((deg): [number, number, number] => [deg, 8.2, 4.2]),
  ...[-65, -25, 15].map((deg): [number, number, number] => [deg, 4.4, 3.6]),
];

const colourAt = (px: Pixels, x: number, y: number): Rgb => {
  const i = (y * px.w + x) * 4;
  return [px.data[i], px.data[i + 1], px.data[i + 2]];
};

function paintCoverts(px: Pixels): void {
  const scales = [
    ...COVERTS.map(([deg, r, size]) => blob(...at(deg, r), size)),
    blob(...APEX, 3),
  ];
  for (const scale of scales)
    layer(
      px,
      scale,
      COVERT_SEAM,
      ({ side, half }) =>
        COVERT[side > half * 0.5 ? 0 : side < -half * 0.25 ? 2 : 1],
    );
  // Only the whole mass gets the dark outline, so the seams between scales stay soft.
  const mass: Shape = (x, y) =>
    scales.some((scale) => scale(x, y))
      ? { t: 0, side: 0, half: 1 }
      : undefined;
  layer(px, mass, COVERT_OUTLINE, (_, x, y) => colourAt(px, x, y));
}

export const peacock: DrawnWing = {
  id: "own-peacock",
  name: "Peacock Wings",
  description:
    "ปีกนกยูงขนยาวหกเส้นสีเขียวอมฟ้าสลับเขียวมรกตกางเป็นรูปพัดอยู่ด้านหลัง ปลายขนมีลายจุดตาวงแหวนสีทองกลางสีน้ำเงินม่วง ขนคลุมโคนปีกสีเขียวสัมฤทธิ์ มีประกายแสงสีทองร่วงจากปีก กระพือช้า ๆ ตอนยืน เร็วขึ้นตอนเดิน",
  aura: "gold",
  far: 0x98c8c0,
  drop: 0,
  w: 38,
  h: 44,
  root: { x: 0, y: 32 },
  paint: (px) => {
    for (const [deg, len] of UNDERPLUMES)
      paintPlume(px, deg, len, DEEP, 6.6, false);
    for (const [deg, len, ramp] of PLUMES)
      paintPlume(px, deg, len, ramp, 9, true);
    paintCoverts(px);
  },
};
