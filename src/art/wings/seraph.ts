import { mix, rgb, type Pixels, type Rgb } from "../pixels";
import {
  blob,
  layer,
  litSide,
  tones,
  type Shape,
  type Xy,
} from "../wing-shapes";
import type { DrawnWing } from "../wings";

const EDGE = rgb("#5a3a1e");
const SEAM = rgb("#b08448");
const TUCK = rgb("#a8743a");
const WHITE = ["#ffffff", "#f6e8cb", "#e4c990", "#c19c60"].map(rgb);
const CREAM = ["#fffbee", "#f9ebc8", "#e8cf9c", "#c4a066"].map(rgb);
const PALE = ["#fff7cc", "#f8e08e", "#e6bf62", "#bb8f3e"].map(rgb);
const GILT = ["#fff3a8", "#ffd84e", "#eba922", "#b8761a"].map(rgb);

const SHOULDER: Xy = [1.5, 31];
const WRIST: Xy = [24, 8];
const BOW = 2.4;
const LENGTH = Math.hypot(WRIST[0] - SHOULDER[0], WRIST[1] - SHOULDER[1]);
const ALONG: Xy = [
  (WRIST[0] - SHOULDER[0]) / LENGTH,
  (WRIST[1] - SHOULDER[1]) / LENGTH,
];
const ACROSS: Xy = [-ALONG[1], ALONG[0]];
const bow = (u: number) => BOW * 4 * u * (1 - u);

const arm = (s: number): Xy => [
  SHOULDER[0] + (WRIST[0] - SHOULDER[0]) * s - ACROSS[0] * bow(s),
  SHOULDER[1] + (WRIST[1] - SHOULDER[1]) * s - ACROSS[1] * bow(s),
];

/** u runs along the bowed arm from shoulder to wrist; d is how far a point lies below it, toward the feathers. */
function frame(x: number, y: number): { u: number; d: number } {
  const dx = x - SHOULDER[0];
  const dy = y - SHOULDER[1];
  const u = (dx * ALONG[0] + dy * ALONG[1]) / LENGTH;
  const d = dx * ACROSS[0] + dy * ACROSS[1] + bow(Math.max(0, Math.min(1, u)));
  return { u, d };
}

function quill(
  from: Xy,
  bend: Xy,
  to: Xy,
  width: number,
  round: number,
): Shape {
  const spine = Array.from({ length: 49 }, (_, i) => {
    const t = i / 48;
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
    const t = near.t;
    const fat =
      t < 0.5
        ? 0.4 + 0.6 * (t / 0.5) ** 0.8
        : (1 - ((t - 0.5) / 0.5) ** round) ** 0.5;
    const half = (width / 2) * fat;
    const side = (x - near.x) * near.uy - (y - near.y) * near.ux;
    return Math.sqrt(best) < half ? { t, side, half } : undefined;
  };
}

const rotate = ([x, y]: Xy, deg: number): Xy => {
  const a = (deg * Math.PI) / 180;
  return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
};

/** Darkens what lies under a shape's lower right so each layer casts a shadow onto the one beneath. */
function tuck(px: Pixels, shape: Shape): void {
  for (let y = 0; y < px.h; y++)
    for (let x = 0; x < px.w; x++) {
      const i = (y * px.w + x) * 4;
      if (!px.data[i + 3]) continue;
      if (
        px.data[i] === SEAM[0] &&
        px.data[i + 1] === SEAM[1] &&
        px.data[i + 2] === SEAM[2]
      )
        continue;
      if (shape(x + 0.5, y + 0.5) || !shape(x + 0.5 - 1.5, y + 0.5 - 1.5))
        continue;
      const c = mix([px.data[i], px.data[i + 1], px.data[i + 2]], TUCK, 0.4);
      px.data[i] = c[0];
      px.data[i + 1] = c[1];
      px.data[i + 2] = c[2];
    }
}

/** Seams stay soft between feathers; only where they meet the open air do they darken into the outline. */
function crisp(px: Pixels): void {
  const open = (x: number, y: number) =>
    x < 0 ||
    y < 0 ||
    x >= px.w ||
    y >= px.h ||
    !px.data[(y * px.w + x) * 4 + 3];
  const edge: Xy[] = [];
  for (let y = 0; y < px.h; y++)
    for (let x = 0; x < px.w; x++) {
      const i = (y * px.w + x) * 4;
      if (
        px.data[i + 3] &&
        px.data[i] === SEAM[0] &&
        px.data[i + 1] === SEAM[1] &&
        px.data[i + 2] === SEAM[2] &&
        (open(x - 1, y) || open(x + 1, y) || open(x, y - 1) || open(x, y + 1))
      )
        edge.push([x, y]);
    }
  for (const [x, y] of edge) {
    const i = (y * px.w + x) * 4;
    [px.data[i], px.data[i + 1], px.data[i + 2]] = EDGE;
  }
}

type Plume = {
  len: number;
  width: number;
  round: number;
  ramp: Rgb[];
  gilt: number;
  curl: number;
};

function feather(
  px: Pixels,
  from: Xy,
  aim: Xy,
  { len, width, round, ramp, gilt, curl }: Plume,
): void {
  const dx = aim[0] - from[0];
  const dy = aim[1] - from[1];
  const norm = Math.hypot(dx, dy);
  const reach: Xy = [(dx / norm) * len, (dy / norm) * len];
  const bend = rotate([reach[0] * 0.55, reach[1] * 0.55], -curl * 0.5);
  const tip = rotate(reach, -curl);
  const end: Xy = [from[0] + tip[0], from[1] + tip[1]];
  const whole = quill(
    from,
    [from[0] + bend[0], from[1] + bend[1]],
    end,
    width,
    round,
  );
  const shape: Shape = (x, y) =>
    frame(x, y).d >= 0.4 ? whole(x, y) : undefined;
  const lit = litSide(from, end);
  const total = Math.hypot(tip[0], tip[1]);
  tuck(px, shape);
  layer(px, shape, SEAM, ({ t, side, half }, x, y) => {
    const body = t * total > total - gilt ? GILT : ramp;
    if (!shape(x + 1.5, y + 1.5)) return body[2];
    const lean = side * lit;
    return body[lean > half * 0.1 ? 0 : lean < -half * 0.55 ? 2 : 1];
  });
}

const TIPS: Xy[] = [
  [34, 1.8],
  [38.5, 9.5],
  [38.5, 18.5],
  [35.5, 26.5],
  [30.5, 34],
  [24, 39.5],
  [17.5, 42.5],
  [10.5, 42.5],
  [4.5, 40],
];
const STEMS = [1, 0.92, 0.83, 0.74, 0.64, 0.53, 0.41, 0.28, 0.14];

type Row = {
  count: number;
  phase: number;
  base: number;
  amp: number;
  ramp: Rgb[];
  rim?: [Rgb, number];
  trim?: Rgb;
};

const wave = (row: Row, u: number) =>
  (((u * row.count + row.phase) % 1) + 1) % 1;
const reachOf = (row: Row, u: number) =>
  (row.base + row.amp * Math.sqrt(1 - (2 * wave(row, u) - 1) ** 2)) *
  (1.12 - 0.3 * Math.max(0, Math.min(1, u)));

function covering(px: Pixels, row: Row): void {
  const shape: Shape = (x, y) => {
    const { u, d } = frame(x, y);
    return u >= -0.02 && u <= 1 && d >= 0 && d <= reachOf(row, u)
      ? { t: 0, side: 0, half: 1 }
      : undefined;
  };
  tuck(px, shape);
  layer(px, shape, SEAM, (_, x, y) => {
    const { u, d } = frame(x + 0.5, y + 0.5);
    const rim = reachOf(row, u) - d;
    const f = wave(row, u);
    if (row.rim && rim < row.rim[1]) return row.rim[0];
    if ((f < 0.05 || f > 0.95) && rim < 3.4) return SEAM;
    if (row.trim && d < 1) return row.trim;
    if (d < 1.6) return row.ramp[0];
    return row.ramp[rim < 2.2 ? 2 : 1];
  });
}

export const seraph: DrawnWing = {
  id: "own-seraph",
  name: "Seraph Wings",
  description:
    "ปีกเทวทูตสีขาวนวลกางอยู่ด้านหลัง ขนปีกสามชั้น ชั้นบนเป็นขนสั้นสีทองอ่อนขอบทอง ชั้นกลางเป็นขนสีครีมขอบทอง ชั้นล่างเป็นขนยาวสีขาวปลายแต้มสีทอง มีประกายแสงสีทองร่วงจากปีก กระพือช้า ๆ ตอนยืน เร็วขึ้นตอนเดิน",
  aura: "gold",
  far: 0xd8ccc0,
  drop: 0,
  w: 40,
  h: 44,
  root: { x: 0, y: 30 },
  paint: (px) => {
    TIPS.forEach((tip, i) => {
      const from = arm(STEMS[i]);
      feather(px, from, tip, {
        len: Math.hypot(tip[0] - from[0], tip[1] - from[1]),
        width: 8.5,
        round: 1.1,
        ramp: WHITE,
        gilt: 3.5,
        curl: 5,
      });
    });
    covering(px, {
      count: 5,
      phase: 0.3,
      base: 6,
      amp: 5,
      ramp: CREAM,
      rim: [GILT[1], 1.5],
    });
    covering(px, {
      count: 7,
      phase: 0,
      base: 2.5,
      amp: 3,
      ramp: PALE,
      rim: [GILT[2], 1],
      trim: GILT[1],
    });
    layer(px, blob(2.5, 30.5, 2.8), SEAM, tones(PALE, 0.3, 0.5));
    crisp(px);
  },
};
