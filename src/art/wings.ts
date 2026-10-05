import {
  bayer,
  hash,
  put,
  quantize,
  rgb,
  wrap,
  type Pixels,
  type Rgb,
} from "./pixels";

export type DrawnWing = {
  id: string;
  name: string;
  description: string;
  aura: "gold" | "demon" | "storm";
  /** Multiplies the far wing's colours (Phaser setTint), so like the game's own it stays a light, muted tone. */
  far: number;
  drop: number;
  w: number;
  h: number;
  root: { x: number; y: number };
  paint: (px: Pixels) => void;
};

type Art = Pick<DrawnWing, "w" | "h" | "paint">;

function grid(
  rows: string[],
  inks: Record<string, string>,
  alpha: Record<string, number> = {},
): Art {
  const palette = Object.fromEntries(
    Object.entries(inks).map(([k, hex]) => [k, rgb(hex)]),
  );
  return {
    w: Math.max(...rows.map((row) => row.length)),
    h: rows.length,
    paint: (px) =>
      rows.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          const c = palette[row[x]];
          if (c) put(px, x, y, c, alpha[row[x]] ?? 1);
        }
      }),
  };
}

type Hit = { t: number; side: number; half: number };
type Shape = (x: number, y: number) => Hit | undefined;
type Xy = [number, number];

type Shader = (hit: Hit, x: number, y: number) => Rgb;

function layer(
  px: Pixels,
  shape: Shape,
  outline: Rgb,
  shade: Shader,
  alpha: (hit: Hit, x: number, y: number) => number = () => 1,
): void {
  const hits: (Hit | undefined)[] = [];
  for (let y = 0; y < px.h; y++)
    for (let x = 0; x < px.w; x++) hits.push(shape(x + 0.5, y + 0.5));
  const filled = (x: number, y: number) =>
    x >= 0 &&
    y >= 0 &&
    x < px.w &&
    y < px.h &&
    hits[y * px.w + x] !== undefined;
  for (let y = 0; y < px.h; y++)
    for (let x = 0; x < px.w; x++) {
      const hit = hits[y * px.w + x];
      if (hit) put(px, x, y, shade(hit, x, y), alpha(hit, x, y));
      else if (
        filled(x - 1, y) ||
        filled(x + 1, y) ||
        filled(x, y - 1) ||
        filled(x, y + 1)
      )
        put(px, x, y, outline);
    }
}

function fill(px: Pixels, shape: Shape, shade: Shader): void {
  for (let y = 0; y < px.h; y++)
    for (let x = 0; x < px.w; x++) {
      const hit = shape(x + 0.5, y + 0.5);
      if (hit) put(px, x, y, shade(hit, x, y));
    }
}

function blade(
  from: Xy,
  to: Xy,
  width: number,
  base: number,
  widest: number,
): Shape {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy);
  return (x, y) => {
    const ax = x - from[0];
    const ay = y - from[1];
    const t = (ax * dx + ay * dy) / (len * len);
    const side = (ax * dy - ay * dx) / len;
    const half =
      t < widest
        ? (base + (width - base) * (t / widest)) / 2
        : (width / 2) * ((1 - t) / (1 - widest));
    return t >= 0 && t <= 1 && Math.abs(side) < half
      ? { t, side, half }
      : undefined;
  };
}

function plume(from: Xy, bend: Xy, to: Xy, width: number): Shape {
  const samples = Array.from({ length: 41 }, (_, i) => {
    const t = i / 40;
    const [a, b, c] = [(1 - t) * (1 - t), 2 * (1 - t) * t, t * t];
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
    let near = samples[0];
    let best = Infinity;
    for (const s of samples) {
      const d = (x - s.x) ** 2 + (y - s.y) ** 2;
      if (d < best) {
        best = d;
        near = s;
      }
    }
    const half =
      (width / 2) *
      (near.t < 0.35
        ? 0.6 + (0.4 * near.t) / 0.35
        : ((1 - near.t) / 0.65) ** 0.8);
    const side = (x - near.x) * near.uy - (y - near.y) * near.ux;
    return Math.sqrt(best) < half ? { t: near.t, side, half } : undefined;
  };
}

const blob =
  (cx: number, cy: number, r: number): Shape =>
  (x, y) =>
    Math.hypot(x - cx, y - cy) < r
      ? { t: 0, side: (cx - x + cy - y) * 0.7, half: r }
      : undefined;

const minus =
  (shape: Shape, ...cuts: Shape[]): Shape =>
  (x, y) =>
    cuts.some((cut) => cut(x, y)) ? undefined : shape(x, y);

function capsule(from: Xy, to: Xy, r: number): Shape {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy);
  return (x, y) => {
    const ax = x - from[0];
    const ay = y - from[1];
    const t = Math.max(0, Math.min(1, (ax * dx + ay * dy) / (len * len)));
    return Math.hypot(ax - t * dx, ay - t * dy) < r
      ? { t, side: (ax * dy - ay * dx) / len, half: r }
      : undefined;
  };
}

/** t is the distance to the nearest edge; side is how much that edge faces the light from the top left. */
function poly(points: Xy[]): Shape {
  return (x, y) => {
    let inside = false;
    let edge = Infinity;
    let side = 0;
    points.forEach(([x1, y1], i) => {
      const [x0, y0] = points[(i + points.length - 1) % points.length];
      if (y1 > y !== y0 > y && x < ((x0 - x1) * (y - y1)) / (y0 - y1) + x1)
        inside = !inside;
      const dx = x0 - x1;
      const dy = y0 - y1;
      const k = Math.max(
        0,
        Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)),
      );
      const ex = x - x1 - k * dx;
      const ey = y - y1 - k * dy;
      const d = Math.hypot(ex, ey);
      if (d < edge) {
        edge = d;
        side = d ? (ex * 0.6 + ey * 0.8) / d : 0;
      }
    });
    return inside ? { t: edge, side, half: 1 } : undefined;
  };
}

function gear(
  c: Xy,
  body: number,
  tooth: number,
  teeth: number,
  hole: number,
): Shape {
  return (x, y) => {
    const dx = x - c[0];
    const dy = y - c[1];
    const r = Math.hypot(dx, dy);
    const rim = Math.cos(Math.atan2(dy, dx) * teeth) > 0.1 ? tooth : body;
    return r < rim && r >= hole
      ? { t: r / body, side: -(dx * 0.6 + dy * 0.8) / (r || 1), half: body }
      : undefined;
  };
}

type Feather = [from: Xy, to: Xy, width: number, base: number, widest: number];

/** 1 when a shape's positive side, running from `from` to `to`, faces the light from the top left; else -1. */
const litSide = (from: Xy, to: Xy): number =>
  Math.sign((to[0] - from[0]) * 0.8 - (to[1] - from[1]) * 0.6) || 1;

function feathers(
  px: Pixels,
  list: Feather[],
  outline: Rgb,
  shade: Shader,
): void {
  for (const [from, to, width, base, widest] of list) {
    const lit = litSide(from, to);
    layer(px, blade(from, to, width, base, widest), outline, (hit, x, y) =>
      shade({ ...hit, side: hit.side * lit }, x, y),
    );
  }
}

const tones =
  (palette: Rgb[], lit = 0.25, shadow = 0.4): Shader =>
  ({ side, half }) =>
    palette[side > half * lit ? 0 : side < -half * shadow ? 2 : 1];

const butterfly: DrawnWing = {
  id: "own-butterfly",
  name: "Butterfly Wings",
  description:
    "ปีกผีเสื้อสีชมพูกางอยู่ด้านหลัง ลายจุดตาสีฟ้าอมเขียว ขอบปีกสีม่วงเข้มแต้มจุดขาว กระพือช้า ๆ ตอนยืน เร็วขึ้นตอนเดิน มีประกายแสงสีทองร่วงจากปีก",
  aura: "gold",
  far: 0xc898b8,
  drop: 0,
  root: { x: 0, y: 26 },
  ...grid(
    [
      "...................kkkkkkk......",
      "................kkkuuvvvvvkkk...",
      "..............kkuvvvvvwvvvvvvkk.",
      "............kkulllllllllvvvvvvvk",
      "...........kulllppppppppppvvvvvk",
      "..........kullpppppppppppppvwvvk",
      ".........kullpppppppppppppppvvvk",
      "........klppppppppppppppppppvvvk",
      "........klppppppppppeetpppppvvvk",
      ".......klppppppppppewkktppppvwvk",
      ".......klppppppppppekkktpppvvvk.",
      "......klppppppppppptkkktpppvvvk.",
      "......klpppppppppppptttpppvvvk..",
      ".....klppppppppppppppppppvwvk...",
      ".....klpppppppppppppppppvvvk....",
      "....klpppppppppppppppppvvvk.....",
      "....klppppppppppppppppvvvk......",
      "...klppppppppepppppppvwvk.......",
      "...klpppppppektpppppvvvk........",
      "..klppppppppptpppppvvvk.........",
      "..klppppppppppppppvvvk..........",
      ".klppppppppppppppvwvk...........",
      ".kvvppppppppppppdvvk............",
      "kvvvpppppppppppdvvk.............",
      "kvvvppppppppddddvkkk............",
      "kvvvdddddddddddkkpppk...........",
      "kkkkkkkkkkkkkkkppppvvk..........",
      "kvvddddddddddddpppvvvk..........",
      "kvvpppppppeetppppppvvvk.........",
      "kvpppppppewkktpppppvwvk.........",
      "kvpppppppekkktpppppvvvk.........",
      "kvppppppptkkktppppvvvk..........",
      "kvpppppppptttpppppvvvk..........",
      ".kppppppppppppppvvwvk...........",
      "..kppppppppppvvwvvkk............",
      "...kkvvppppvvvvvkk..............",
      ".....kkvvwvvvkkk................",
      ".......kkkkkk...................",
    ],
    {
      k: "#2a1433",
      v: "#5a2d91",
      u: "#9a72d8",
      l: "#ffb6dd",
      p: "#ff6fb5",
      d: "#d2468f",
      t: "#1fb3a6",
      e: "#86f0de",
      w: "#fff4fb",
    },
  ),
};

const fairy: DrawnWing = {
  id: "own-fairy",
  name: "Fairy Wings",
  description:
    "ปีกนางฟ้าใสบางสองคู่สีฟ้าอมม่วงอ่อน เส้นปีกสีขาว ขอบปีกเรืองแสงจาง ๆ กางอยู่ด้านหลัง กระพือช้า ๆ ตอนยืน เร็วขึ้นตอนเดิน มีประกายแสงร่วงจากปีก",
  aura: "gold",
  far: 0xb0b0d8,
  drop: 0,
  root: { x: 0, y: 28 },
  ...grid(
    [
      "......................kkkkk...",
      "....................kkeeeeekk.",
      "...................kecccwqqqrk",
      "..................kecccwqqqqrk",
      ".................kecccwqqqqqrk",
      "................keccccwqqqqrk.",
      "...............keccccwqqqqrk..",
      "..............keccccwqwqqrk...",
      ".............keccccwqqqwrk....",
      "............keccccwqqqrkk.....",
      "...........keccccwqqqrk.......",
      "..........keccccwqqqrk........",
      "..........kecccwqqqrk.........",
      ".........kecccwqwqrk..........",
      "........kecccwqqqwk...........",
      ".......kecccwqqqrk............",
      ".......kecccwqqrk.............",
      "......kecccwqqrk..............",
      ".....kecccwqqrk...............",
      ".....keccwqwrk................",
      "....keccwqqrk.................",
      "...keccwqqrk..................",
      "...kecwqqrk...................",
      "..kecwqqrk....................",
      "..kecwqrk.....................",
      ".kecwqrk......................",
      ".kewqrk.......................",
      "kewqrk........................",
      "kkkkkkkkkk....................",
      "kkkeeeeeeekkkk................",
      "kcwwwwcccceeeekkk.............",
      "kcccccwwwwqqqqeeekk...........",
      ".krrccccccwwwwqqqeekk.........",
      "..kkrrccccqqqqwwwwqeek........",
      "....kkrrccqqqqqqqqwwrk........",
      "......kkrrqqqqqqqqqqrk........",
      "........kkrrrqqqqqrrk.........",
      "..........kkkrrrrrkk..........",
      ".............kkkkk............",
    ],
    {
      k: "#423e86",
      e: "#f5f1ff",
      w: "#ffffff",
      c: "#b9effa",
      q: "#d7c9fb",
      r: "#ac98e8",
    },
    { c: 0.82, q: 0.82, r: 0.86 },
  ),
};

const dragon: DrawnWing = {
  id: "own-dragon",
  name: "Dragon Wings",
  description:
    "ปีกมังกรสีเขียวมรกตกางอยู่ด้านหลัง พังผืดปีกขึงระหว่างกระดูกนิ้วสีเข้ม มีกรงเล็บที่ข้อปีก มีควันสีม่วงและแดงหมุนวนรอบตัวและประกายไฟลอยขึ้น กระพือช้า ๆ ตอนยืน เร็วขึ้นตอนเดิน",
  aura: "demon",
  far: 0x98b8a0,
  drop: 0,
  root: { x: 0, y: 30 },
  ...grid(
    [
      "..........kk...................kkkk.",
      "..........kikk..........kkkkkkkhhhbk",
      "...........kijkkkkkkkkkkhhhhhhhbbbk.",
      "............kijhhhhhhhhhbbbbbbbnnnk.",
      "............kbbbbbbbbbbbnnnnnnnmmmk.",
      "............kbbbbnnnnnnnmmmmmmmook..",
      "............khbhbbhmmmmmmmmmmmmook..",
      "...........khbnhbnbhmmmmmmmmmmook...",
      "...........khbnhbmnbhmmmmmmmmmook...",
      "..........khbnmhbmmnbhmmmmmmmook....",
      "..........khbnmmhbmmnbhmmmmmmook....",
      ".........khbnmmmhbmmmnbhmmmmmook....",
      ".........khbnmmmhbmmmmnbhmmmmook....",
      "........khbnmmmmhbmmmmmnbhmmmook....",
      "........khbnmmmmhbmmmmmmnbhmmook....",
      ".......khbnmmmmmhbmmmmmmmnbhmook....",
      ".......khbnmmmmmmhbmmmmmmmnbhmook...",
      "......khbnmmmmmmmhbmmmmmmmmnbhook...",
      "......khbnmmmmmmmhbmmmmmmmmmnbhok...",
      ".....khbnmmmmmmmmhbmmmmmmmmmmnbhok..",
      ".....khbnmmmmmmmmhbmmmmmmmmmmmnbhk..",
      "....khbnmmmmmmmmmhbmmmmmmmmmmmmnbhk.",
      "....khbnmmmmmmmmmmhbmmmmmmmmmmmmnbbk",
      "...khbnmmmmmmmmmmmhbmmmmmmmmmmmookk.",
      "...khbnmmmmmmmmmmmhbmmmmmmmmmookk...",
      "..khbnmmmmmmmmmmmmhbmmmmmmmmook.....",
      "..khbnmmmmmmmmmmmmhbmmmmmmookk......",
      ".khbnmmmmmmmmmmmmmhbmmmmmook........",
      ".khbnmmmmmmmmmmmmmhbmmmmook.........",
      "khbnmmmmmmmmmmmmmmmhbmmook..........",
      "kmmmmmmmmmmmmmmmmmmhbmook...........",
      "kmmmmooooooommmmmmmhbook............",
      "kmooooooooooooommmmhbook............",
      "kooookkkkkkkooooommhbok.............",
      "kokkk.......kkkoooohbk..............",
      "kk.............kkooohbk.............",
      ".................kkkhbk.............",
      "...................kbk..............",
      "....................k...............",
    ],
    {
      k: "#0e2a1c",
      b: "#285a40",
      h: "#468563",
      i: "#f1ead2",
      j: "#b7ab86",
      n: "#6be39b",
      m: "#26b464",
      o: "#167f4a",
    },
  ),
};

const ICE_OUTLINE = rgb("#1b3a8a");
const ICE = ["#ffffff", "#cfeaff", "#92c6f0", "#4c80d0"].map(rgb);
const frostShade = ({ t, side, half }: Hit): Rgb =>
  side >= 0
    ? ICE[side < 1.1 && t > 0.3 && t < 0.88 ? 0 : 1]
    : ICE[half + side < 1.4 ? 3 : 2];

const SHARDS = [
  blade([7, 22], [14.5, 7.5], 5, 2, 0.6),
  blade([10, 27], [27.5, 19.5], 5, 2, 0.6),
  blade([3, 31], [17.5, 38.5], 7, 3, 0.55),
  blade([6, 29], [31.5, 25.5], 8, 3, 0.6),
  blade([3, 26], [7.5, 0.5], 8, 3, 0.6),
  blade([6, 27], [32.5, 10.5], 9, 3, 0.6),
  blade([5, 26], [22.5, 1.5], 9, 3, 0.6),
  blade([0, 31], [11, 22], 9, 7, 0.45),
];

const frost: DrawnWing = {
  id: "own-frost",
  name: "Frost Wings",
  description:
    "ปีกน้ำแข็งเป็นผลึกแหลมสีฟ้าซีดไล่ถึงขาวกางเป็นรูปพัดอยู่ด้านหลัง ขอบผลึกสีน้ำเงินเข้ม มีประกายไฟฟ้าแลบรอบปีก กระพือช้า ๆ ตอนยืน เร็วขึ้นตอนเดิน",
  aura: "storm",
  far: 0xa8bcd8,
  drop: 0,
  w: 34,
  h: 40,
  root: { x: 0, y: 28 },
  paint: (px) =>
    SHARDS.forEach((shard) => layer(px, shard, ICE_OUTLINE, frostShade)),
};

const FLAME_OUTLINE = rgb("#3d0c0b");
const FLAME = [
  ["#f0522e", "#cf2f25", "#94191c"],
  ["#ff9033", "#f26a1f", "#bd431b"],
  ["#ffc94a", "#ffa62b", "#dd7b1b"],
  ["#fff6b0", "#ffe25a", "#f5b52e"],
].map((band) => band.map(rgb));
const flameShade = ({ t, side, half }: Hit, x: number, y: number): Rgb => {
  const along = t + (bayer(x, y) - 0.5) * 0.12;
  const band = FLAME[along < 0.3 ? 0 : along < 0.56 ? 1 : along < 0.8 ? 2 : 3];
  return band[side > half * 0.35 ? 0 : side < -half * 0.4 ? 2 : 1];
};

const PLUMES = [
  plume([3, 30], [12, 38], [22, 35], 6),
  plume([5, 29], [18, 32], [31, 26], 7),
  plume([5, 27], [20, 25], [34, 15], 8),
  plume([5, 26], [17, 17], [30, 5], 8),
  plume([4, 25], [10, 12], [21, 1], 8),
  plume([4, 25], [4, 12], [11, 0.5], 7),
  blob(2.5, 29.5, 4.6),
];

const phoenix: DrawnWing = {
  id: "own-phoenix",
  name: "Phoenix Wings",
  description:
    "ปีกนกฟีนิกซ์ขนยาวเป็นเปลวไฟกวาดขึ้นด้านบน สีแดงที่โคนไล่เป็นสีส้มและสีเหลืองที่ปลาย มีควันสีม่วงและแดงหมุนวนรอบตัวและประกายไฟลอยขึ้น กระพือช้า ๆ ตอนยืน เร็วขึ้นตอนเดิน",
  aura: "demon",
  far: 0xd0a088,
  drop: 0,
  w: 36,
  h: 40,
  root: { x: 0, y: 29 },
  paint: (px) =>
    PLUMES.forEach((feather) => layer(px, feather, FLAME_OUTLINE, flameShade)),
};

const RAVEN_OUTLINE = rgb("#07060d");
const RAVEN = ["#8a7fe0", "#4a4482", "#2a2748", "#17152a"].map(rgb);
const ravenShade: Shader = ({ side, half }) =>
  RAVEN[
    side > half * 0.55
      ? 0
      : side > half * 0.15
        ? 1
        : side < -half * 0.45
          ? 3
          : 2
  ];
const ravenArm = (s: number): Xy => [1 + 21 * s, 30 - 21 * s];
const RAVEN_FEATHERS: [number, number, number][] = [
  [1, 33, 2],
  [0.97, 36, 10],
  [0.93, 36, 19],
  [0.88, 33, 27],
  [0.82, 28, 34],
  [0.7, 22, 38],
  [0.55, 16, 40],
  [0.4, 10, 41],
  [0.25, 5, 40],
  [0.1, 1, 38],
];

const raven: DrawnWing = {
  id: "own-raven",
  name: "Raven Wings",
  description:
    "ปีกอีกาสีดำสนิทกางเป็นรูปพัดอยู่ด้านหลัง ขนปีกยาวปลายแหลม ต้องแสงเป็นประกายสีม่วงน้ำเงิน มีควันสีม่วงและแดงหมุนวนรอบตัวและประกายไฟลอยขึ้น กระพือช้า ๆ ตอนยืน เร็วขึ้นตอนเดิน",
  aura: "demon",
  far: 0x8e88b0,
  drop: 0,
  w: 38,
  h: 43,
  root: { x: 0, y: 30 },
  paint: (px) => {
    feathers(
      px,
      RAVEN_FEATHERS.map(
        ([s, x, y]): Feather => [ravenArm(s), [x, y], 6, 4, 0.35],
      ),
      RAVEN_OUTLINE,
      ravenShade,
    );
    feathers(
      px,
      [0.1, 0.26, 0.42, 0.58, 0.74, 0.9].map((s): Feather => {
        const [x, y] = ravenArm(s);
        return [[x, y], [x + 4, y + 8], 6, 5, 0.4];
      }),
      RAVEN_OUTLINE,
      ravenShade,
    );
    feathers(px, [[[0, 31], [25, 6.5], 8, 8, 0.25]], RAVEN_OUTLINE, ravenShade);
  },
};

const MECHA_OUTLINE = rgb("#0d1118");
const METAL = ["#e3e9f2", "#9aa6ba", "#5f6a80", "#3a4152"].map(rgb);
const CORE = ["#e6ffff", "#4df3ff", "#1c8fb0"].map(rgb);
const metalShade: Shader = ({ t, side }, x, y) =>
  METAL[
    t < 1.2
      ? side > 0.2
        ? 0
        : side < -0.3
          ? 3
          : 1
      : bayer(x, y) < 0.12
        ? 1
        : 2
  ];
const MECHA_HUB: Xy = [3, 29.5];

/** A swept plate out from the hub, its tip cut back on the trailing side like a jet's. */
function plate(deg: number, length: number, w0: number, w1: number) {
  const a = (deg * Math.PI) / 180;
  const at = (r: number, s: number): Xy => [
    MECHA_HUB[0] + Math.cos(a) * r - Math.sin(a) * s,
    MECHA_HUB[1] + Math.sin(a) * r + Math.cos(a) * s,
  ];
  return {
    shape: poly([
      at(2, -w0 / 2),
      at(length, -w1 / 2),
      at(length - 3.5, w1 / 2),
      at(2, w0 / 2),
    ]),
    light: capsule(at(5, 0), at(length - 3, 0), 0.5),
  };
}

const MECHA_PLATES = [
  plate(-70, 28, 6, 5),
  plate(18, 27, 6, 5),
  plate(-42, 35, 7, 6),
  plate(-12, 35, 7, 6),
];

const mecha: DrawnWing = {
  id: "own-mecha",
  name: "Mecha Wings",
  description:
    "ปีกจักรกลแผ่นโลหะสีเงินสี่แผ่นกางออกจากแกนกลาง มีไฟสีฟ้าเรืองแสงวิ่งกลางแผ่นปีกและที่แกน มีประกายไฟฟ้าแลบรอบปีก กระพือช้า ๆ ตอนยืน เร็วขึ้นตอนเดิน",
  aura: "storm",
  far: 0xa8b0c0,
  drop: 0,
  w: 39,
  h: 42,
  root: { x: 0, y: 29 },
  paint: (px) => {
    for (const { shape, light } of MECHA_PLATES) {
      layer(px, shape, MECHA_OUTLINE, metalShade);
      fill(px, light, () => CORE[1]);
    }
    layer(
      px,
      blob(MECHA_HUB[0], MECHA_HUB[1], 5),
      MECHA_OUTLINE,
      ({ side }) => METAL[side > 1.4 ? 0 : side < -1.6 ? 3 : 1],
    );
    layer(
      px,
      blob(MECHA_HUB[0], MECHA_HUB[1], 2.2),
      CORE[2],
      ({ side }) => CORE[side > 0.4 ? 0 : 1],
    );
  },
};

const BONE_OUTLINE = rgb("#24160f");
const BONE = ["#fff8e6", "#e2d2ae", "#a8916a"].map(rgb);
const VEIL = ["#7a3478", "#4d1d52", "#2c0f33"].map(rgb);
const WRIST: Xy = [21, 6];
const KNUCKLES: Xy[] = [
  [35, 11],
  [34, 23],
  [28, 34],
  [17, 40],
];
const VEIL_EDGE: Xy[] = [...KNUCKLES, [1, 31]];

function veil(): Shape {
  const scallops = VEIL_EDGE.slice(1).map((b, i) => {
    const a = VEIL_EDGE[i];
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const out = Math.hypot(mx - 16, my - 20);
    const r = Math.hypot(a[0] - b[0], a[1] - b[1]) * 0.6;
    return blob(
      mx + ((mx - 16) / out) * (r - 3),
      my + ((my - 20) / out) * (r - 3),
      r,
    );
  });
  const tears = [
    blob(14, 27, 1.6),
    blob(26, 21, 1.2),
    blob(22, 31, 1.4),
    blob(29, 15, 1.1),
  ];
  return minus(
    poly([[0, 27], [2, 24], WRIST, ...KNUCKLES, [6, 37], [0, 32]]),
    ...scallops,
    ...tears,
  );
}

const bone: DrawnWing = {
  id: "own-bone",
  name: "Bone Wings",
  description:
    "ปีกโครงกระดูกสีงาช้างกางนิ้วปีกยาวสี่นิ้ว มีกรงเล็บที่ข้อปีก พังผืดสีม่วงเข้มขาดวิ่นขึงอยู่ระหว่างกระดูก มีควันสีม่วงและแดงหมุนวนรอบตัวและประกายไฟลอยขึ้น กระพือช้า ๆ ตอนยืน เร็วขึ้นตอนเดิน",
  aura: "demon",
  far: 0xc0b0b8,
  drop: 0,
  w: 38,
  h: 43,
  root: { x: 0, y: 28 },
  paint: (px) => {
    layer(
      px,
      veil(),
      VEIL[2],
      ({ t, side }, x, y) =>
        VEIL[t < 1.2 ? 2 : side > 0.3 && bayer(x, y) < 0.5 ? 0 : 1],
      () => 0.86,
    );
    const bones: [Xy, Xy, number][] = [
      ...KNUCKLES.map((tip): [Xy, Xy, number] => [WRIST, tip, 1.1]),
      [[0.5, 27.5], WRIST, 1.7],
    ];
    for (const [from, to, r] of bones) {
      const lit = litSide(from, to);
      layer(
        px,
        capsule(from, to, r),
        BONE_OUTLINE,
        ({ side }) => BONE[side * lit > 0.35 ? 0 : side * lit < -0.45 ? 2 : 1],
      );
    }
    for (const [x, y] of KNUCKLES)
      layer(px, blob(x, y, 1.5), BONE_OUTLINE, tones(BONE, 0.3, 0.5));
    layer(px, blade(WRIST, [24, 1.5], 3, 2.5, 0.3), BONE_OUTLINE, tones(BONE));
    layer(
      px,
      blob(WRIST[0], WRIST[1], 2.3),
      BONE_OUTLINE,
      tones(BONE, 0.3, 0.6),
    );
  },
};

const LEAF_OUTLINE = rgb("#123d1a");
const LEAVES = [
  ["#b6f27a", "#5cc24a", "#2f8a3a", "#e6ffb8"],
  ["#d8f27a", "#94c63a", "#5a8a24", "#f6ffc8"],
].map((p) => p.map(rgb));
const STEM = ["#a87a3a", "#7a5226", "#4e3214"].map(rgb);
const LEAF_PARTS: [Feather, number][] = [
  [[[2, 27], [12, 1.5], 8, 1.5, 0.45], 1],
  [[[2, 31], [19, 40], 7, 1.5, 0.45], 1],
  [[[3, 27], [24, 3], 9, 1.5, 0.45], 0],
  [[[3, 30], [30, 35], 8, 1.5, 0.45], 0],
  [[[3, 28], [33, 12], 9, 1.5, 0.45], 1],
  [[[3, 29], [35, 24], 8, 1.5, 0.45], 0],
];

const leaf: DrawnWing = {
  id: "own-leaf",
  name: "Leaf Wings",
  description:
    "ปีกใบไม้สีเขียวสดหกใบกางเป็นรูปพัดอยู่ด้านหลัง มีเส้นใบสีเขียวอ่อนทั้งเส้นกลางใบและเส้นแขนง มีประกายแสงสีทองร่วงจากปีก กระพือช้า ๆ ตอนยืน เร็วขึ้นตอนเดิน",
  aura: "gold",
  far: 0x98c090,
  drop: 0,
  w: 37,
  h: 42,
  root: { x: 0, y: 29 },
  paint: (px) => {
    for (const [part, tone] of LEAF_PARTS) {
      const palette = LEAVES[tone];
      const [[x0, y0], [x1, y1]] = part;
      const len = Math.hypot(x1 - x0, y1 - y0);
      feathers(px, [part], LEAF_OUTLINE, ({ t, side, half }) => {
        const across = Math.abs(side);
        const vein = wrap((t * len - across * 1.3) / 4) < 0.22;
        if (across < 0.5 || (vein && across < half - 1 && t > 0.1))
          return palette[3];
        return palette[side > 0 ? 0 : side < -half * 0.45 ? 2 : 1];
      });
    }
    layer(px, blob(2, 29, 2.4), LEAF_OUTLINE, tones(STEM));
  },
};

const COSMOS = ["#0a0a2a", "#18155a", "#33208a", "#6a2aa8", "#c04cc0"].map(rgb);
const STARS = ["#ffffff", "#a8dcff"].map(rgb);
const COSMIC_RIM = rgb("#8ff6ff");
const cosmicShade: Shader = ({ t, side, half }, x, y) => {
  if (half - Math.abs(side) < 1) return COSMIC_RIM;
  const star = hash(x * 37 + y * 101);
  if (star > 0.94) return STARS[star > 0.975 ? 0 : 1];
  const nebula = Math.sin(x * 0.3 + y * 0.18) + Math.sin(y * 0.41 - x * 0.12);
  const v = Math.max(0, Math.min(1, 0.05 + t * 0.8 + nebula * 0.12));
  return COSMOS[Math.round(quantize(v, 4, x, y) * 4)];
};
const COSMIC_PLUMES = [
  plume([2, 29], [14, 38], [25, 36], 9),
  plume([3, 27], [20, 27], [35, 19], 11),
  plume([3, 26], [18, 14], [32, 4], 11),
  plume([2, 26], [5, 11], [15, 1.5], 9),
];

const cosmic: DrawnWing = {
  id: "own-cosmic",
  name: "Cosmic Wings",
  description:
    "ปีกจักรวาลขนยาวสี่เส้นกวาดขึ้นด้านบน สีน้ำเงินเข้มที่โคนไล่เป็นสีม่วงและชมพูที่ปลาย มีดาวสีขาวกระจายทั่วปีก ขอบขนเรืองแสงสีฟ้า มีประกายไฟฟ้าแลบรอบปีก กระพือช้า ๆ ตอนยืน เร็วขึ้นตอนเดิน",
  aura: "storm",
  far: 0x9890c8,
  drop: 0,
  w: 37,
  h: 41,
  root: { x: 0, y: 27 },
  paint: (px) =>
    COSMIC_PLUMES.forEach((feather) =>
      layer(px, feather, rgb("#05041a"), cosmicShade),
    ),
};

const PAPER = ["#ffffff", "#ece6dc", "#cfc6b8"].map(rgb);
const WASHI = ["#ff6b6b", "#e0384a", "#a8213a"].map(rgb);
const FOLDS: [Xy[], Rgb][] = [
  [[[1, 30], [13, 40], [3, 40]], PAPER[2]],
  [[[1, 29], [28, 24], [20, 33]], WASHI[0]],
  [[[1, 29.5], [20, 33], [13, 40]], WASHI[2]],
  [[[1, 27], [33, 2], [29, 11]], PAPER[0]],
  [[[1, 28], [29, 11], [36, 18]], PAPER[1]],
  [[[33, 2], [36, 18], [29, 11]], WASHI[1]],
  [[[-1, 25], [5, 28.5], [-1, 32]], PAPER[1]],
];

const origami: DrawnWing = {
  id: "own-origami",
  name: "Origami Wings",
  description:
    "ปีกนกกระเรียนกระดาษพับเป็นแผ่นสามเหลี่ยม ด้านบนเป็นกระดาษสีขาว ปลายปีกและแผ่นล่างพับเห็นด้านหลังกระดาษสีแดง มีรอยพับคมชัด มีประกายแสงสีทองร่วงจากปีก กระพือช้า ๆ ตอนยืน เร็วขึ้นตอนเดิน",
  aura: "gold",
  far: 0xd8c8c0,
  drop: 0,
  w: 38,
  h: 42,
  root: { x: 0, y: 28 },
  paint: (px) =>
    FOLDS.forEach(([fold, tone]) =>
      layer(px, poly(fold), rgb("#3a2228"), () => tone),
    ),
};

const STEEL = ["#ffffff", "#c7d3ea", "#7e8db0"].map(rgb);
const GILT = ["#fff1a0", "#f2bd3a", "#a86a14"].map(rgb);
const HILT = ["#9a6a3a", "#6a3c1c", "#3e200c"].map(rgb);
const GEM = ["#e6fbff", "#7fe3ff"].map(rgb);
const SWORD_OUTLINE = rgb("#1e1a2e");
const SWORD_ROOT: Xy = [1, 32];

const swords: DrawnWing = {
  id: "own-swords",
  name: "Blade Wings",
  description:
    "ปีกดาบเงินห้าเล่มกางเป็นรูปพัดจากอัญมณีสีฟ้าในวงทองด้านหลัง ด้ามดาบสีน้ำตาล กระบังดาบสีทอง มีประกายแสงสีทองร่วงจากปีก กระพือช้า ๆ ตอนยืน เร็วขึ้นตอนเดิน",
  aura: "gold",
  far: 0xc0c8d8,
  drop: 0,
  w: 38,
  h: 46,
  root: { x: 0, y: 32 },
  paint: (px) => {
    for (const [deg, length] of [
      [-76, 31],
      [34, 22],
      [-48, 36],
      [8, 33],
      [-20, 37],
    ]) {
      const a = (deg * Math.PI) / 180;
      const at = (r: number): Xy => [
        SWORD_ROOT[0] + Math.cos(a) * r,
        SWORD_ROOT[1] + Math.sin(a) * r,
      ];
      const [gx, gy] = at(7.5);
      const [nx, ny] = [-Math.sin(a) * 2.8, Math.cos(a) * 2.8];
      feathers(
        px,
        [[at(8), at(length), 3.4, 3.4, 0.8]],
        SWORD_OUTLINE,
        tones(STEEL, 0.3, 0.3),
      );
      feathers(
        px,
        [[at(3), at(7), 1.8, 1.8, 0.95]],
        SWORD_OUTLINE,
        tones(HILT),
      );
      feathers(
        px,
        [[[gx - nx, gy - ny], [gx + nx, gy + ny], 2, 2, 0.9]],
        SWORD_OUTLINE,
        tones(GILT),
      );
    }
    layer(px, blob(2.5, 32, 3.8), SWORD_OUTLINE, tones(GILT, 0.3, 0.5));
    layer(
      px,
      blob(2.5, 32, 1.8),
      rgb("#1a4f94"),
      ({ side }) => GEM[side > 0.3 ? 0 : 1],
    );
  },
};

const ROCK = ["#6b3a2a", "#4a2720", "#2e1814"].map(rgb);
const LAVA = ["#ffe066", "#ff9a1f", "#e8401a"].map(rgb);
const MAGMA_CELLS: Xy[] = Array.from({ length: 48 }, (_, i) => [
  (i % 6) * 7 + hash(i * 3.1) * 7,
  Math.floor(i / 6) * 6.5 + hash(i * 7.7 + 1) * 6.5,
]);

/** How far a point is from the seam between its two nearest rock cells. */
function crack(x: number, y: number): number {
  let d1 = Infinity;
  let d2 = Infinity;
  for (const [cx, cy] of MAGMA_CELLS) {
    const d = Math.hypot(x - cx, y - cy);
    if (d < d1) [d1, d2] = [d, d1];
    else if (d < d2) d2 = d;
  }
  return d2 - d1;
}

const magmaShade: Shader = ({ t, side, half }, x, y) => {
  const gap = crack(x + 0.5, y + 0.5);
  if (gap < 0.5) return LAVA[t < 0.55 ? 0 : 1];
  if (gap < 1.15) return LAVA[t < 0.55 ? 1 : 2];
  return ROCK[side > half * 0.3 ? 0 : side < -half * 0.3 ? 2 : 1];
};

const magma: DrawnWing = {
  id: "own-magma",
  name: "Magma Wings",
  description:
    "ปีกหินลาวาสีดำแตกเป็นแผ่นแหลมกางเป็นรูปพัด มีลาวาสีส้มและเหลืองเรืองแสงไหลตามรอยแตก ร้อนจัดที่โคนปีก มีควันสีม่วงและแดงหมุนวนรอบตัวและประกายไฟลอยขึ้น กระพือช้า ๆ ตอนยืน เร็วขึ้นตอนเดิน",
  aura: "demon",
  far: 0xc09080,
  drop: 0,
  w: 37,
  h: 42,
  root: { x: 0, y: 29 },
  paint: (px) =>
    feathers(
      px,
      [
        [[1, 32], [17, 40], 8, 5, 0.45],
        [[1, 29], [14, 2], 11, 6, 0.4],
        [[2, 31], [31, 33], 9, 5, 0.45],
        [[2, 29], [28, 6], 11, 6, 0.45],
        [[2, 30], [35, 19], 10, 6, 0.45],
      ],
      rgb("#120806"),
      magmaShade,
    ),
};

const NEON_EDGE = rgb("#ff4df0");
const NEON = ["#e6ffff", "#3df5ff"].map(rgb);
const NEON_PARTS: Feather[] = [
  [[3, 26], [3, 38], 5, 4, 0.4],
  [[8, 21], [13, 39], 6, 4, 0.4],
  [[15, 15], [24, 37], 6, 4, 0.4],
  [[21, 10], [32, 29], 6, 4, 0.4],
  [[26, 6], [35, 17], 5, 4, 0.4],
  [[0, 29], [30, 3], 7, 6, 0.3],
];
const neonRim = ({ side, half }: Hit) => half - Math.abs(side) < 1.1;

const neon: DrawnWing = {
  id: "own-neon",
  name: "Neon Wings",
  description:
    "ปีกโฮโลแกรมนีออนรูปขนนก เส้นขอบสีชมพูบานเย็นเรืองแสง ตัวปีกสีฟ้าโปร่งแสงเป็นเส้นสแกน ฉายออกจากจุดแสงที่โคนปีก มีประกายไฟฟ้าแลบรอบปีก กระพือช้า ๆ ตอนยืน เร็วขึ้นตอนเดิน",
  aura: "storm",
  far: 0xc0a0d0,
  drop: 0,
  w: 37,
  h: 41,
  root: { x: 0, y: 29 },
  paint: (px) => {
    for (const [from, to, width, base, widest] of NEON_PARTS)
      layer(
        px,
        blade(from, to, width, base, widest),
        NEON_EDGE,
        (hit) => NEON[neonRim(hit) ? 0 : 1],
        (hit, _x, y) => (neonRim(hit) ? 1 : y % 2 ? 0.55 : 0.3),
      );
    layer(
      px,
      blob(1.5, 29.5, 2.6),
      NEON_EDGE,
      ({ side }) => NEON[side > 0.5 ? 0 : 1],
    );
  },
};

const COG_OUTLINE = rgb("#3a2208");
const BRASS = ["#fff0a8", "#e2b04a", "#9a6a1e"].map(rgb);
const COPPER = ["#ffc8a0", "#e07a45", "#9a4422"].map(rgb);
const cogArm = (s: number): Xy => [3 + 22 * s, 29 - 22 * s];
const plateShade =
  (metal: Rgb[]): Shader =>
  ({ t, side, half }) =>
    (t > 0.16 && t < 0.24 && Math.abs(side) < 0.7) || (t > 0.5 && t < 0.56)
      ? metal[2]
      : metal[side > half * 0.25 ? 0 : side < -half * 0.4 ? 2 : 1];
const cogShade: Shader = ({ t, side }) =>
  t > 0.5 && t < 0.72
    ? BRASS[2]
    : BRASS[side > 0.35 ? 0 : side < -0.35 ? 2 : 1];

const clockwork: DrawnWing = {
  id: "own-clockwork",
  name: "Clockwork Wings",
  description:
    "ปีกกลไกทองเหลือง แผ่นขนโลหะสีทองแดงสลับทองเหลืองตอกหมุด แขวนจากแกนทองเหลือง มีฟันเฟืองที่โคน กลางแขน และข้อปีก มีประกายแสงสีทองร่วงจากปีก กระพือช้า ๆ ตอนยืน เร็วขึ้นตอนเดิน",
  aura: "gold",
  far: 0xd0b088,
  drop: 0,
  w: 38,
  h: 44,
  root: { x: 0, y: 29 },
  paint: (px) => {
    (
      [
        [0.15, 6, 41],
        [0.32, 13, 42],
        [0.5, 20, 40],
        [0.68, 27, 36],
        [0.84, 33, 29],
        [1, 36, 19],
        [1, 35, 9],
      ] as const
    ).forEach(([s, x, y], i) =>
      feathers(
        px,
        [[cogArm(s), [x, y], 6, 5, 0.6]],
        COG_OUTLINE,
        plateShade(i % 2 ? BRASS : COPPER),
      ),
    );
    layer(
      px,
      capsule(cogArm(0), cogArm(1), 1.8),
      COG_OUTLINE,
      tones(BRASS, 0.3, 0.5),
    );
    layer(px, gear([14, 18], 2.6, 3.6, 5, 0.9), COG_OUTLINE, cogShade);
    layer(px, gear([25, 7], 3.5, 4.8, 6, 1.2), COG_OUTLINE, cogShade);
    layer(px, gear([3.5, 29.5], 5, 6.5, 8, 1.5), COG_OUTLINE, cogShade);
  },
};

export const DRAWN_WINGS: DrawnWing[] = [
  butterfly,
  fairy,
  dragon,
  frost,
  phoenix,
  raven,
  mecha,
  bone,
  leaf,
  cosmic,
  origami,
  swords,
  magma,
  neon,
  clockwork,
];
