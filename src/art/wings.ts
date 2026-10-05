import { bayer, put, rgb, type Pixels, type Rgb } from "./pixels";

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

function layer(
  px: Pixels,
  shape: Shape,
  outline: Rgb,
  shade: (hit: Hit, x: number, y: number) => Rgb,
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
      if (hit) put(px, x, y, shade(hit, x, y));
      else if (
        filled(x - 1, y) ||
        filled(x + 1, y) ||
        filled(x, y - 1) ||
        filled(x, y + 1)
      )
        put(px, x, y, outline);
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

export const DRAWN_WINGS: DrawnWing[] = [
  butterfly,
  fairy,
  dragon,
  frost,
  phoenix,
];
