import { put, rgb, ring, stamp, type Pixels, type Rgb } from "./pixels";

/** An accessory's texture, with the top centre of the head it sits on at (x, top). */
export const ACCESSORY_ART = { w: 40, h: 28, x: 20, top: 16 };

export type Accessory = {
  id: string;
  name: string;
  /** Its main material's shades, base first: a colour moves these and leaves gems, trims and outline as drawn. */
  body: string[];
  /** Game pixels it floats up and down over one card loop. */
  float?: number;
  /** Paints itself onto a head this wide; facing is 1 seen from front or back and 0 from the side. */
  paint: (px: Pixels, headW: number, facing: number) => void;
};

const OUTLINE = rgb("#2a1c24");
const { x: X, top: TOP } = ACCESSORY_ART;

// Pairs (ears, horns) sit this far either side of the head's centre, closer
// together seen from the side.
const pairSpread = (headW: number, facing: number) =>
  Math.max(2, Math.round((headW / 2 - 3) * (0.45 + 0.55 * facing)));

function pair(
  px: Pixels,
  pattern: string[],
  palette: Record<string, Rgb>,
  headW: number,
  facing: number,
  sink: number,
): void {
  const spread = pairSpread(headW, facing);
  const w = pattern[0].length;
  const y = TOP + sink - pattern.length;
  const left = X - spread - Math.floor(w / 2);
  stamp(px, pattern, left, y, palette);
  // The mirror image of the left one about column X.
  stamp(px, pattern, 2 * X - left - w + 1, y, palette, true);
}

const halo: Accessory = {
  id: "halo",
  name: "วงแหวนนางฟ้า",
  body: ["#f6c445", "#fff3b0", "#fff8d8"],
  float: 1,
  paint: (px, headW) => {
    const rx = Math.min(9, Math.max(5, Math.round(headW / 2) - 1));
    const centre = { x: X, y: TOP - 5 };
    ring(px, centre, rx + 1, 3, rgb("#fff3b0"), 0.35);
    ring(px, centre, rx, 2, rgb("#f6c445"), 1);
    for (let x = -rx + 2; x <= rx - 2; x++)
      put(px, centre.x + x, centre.y + 2, rgb("#fff8d8"));
  },
};

const crown: Accessory = {
  id: "crown",
  name: "มงกุฎ",
  body: ["#f6c445", "#fff0a0", "#b9791c"],
  paint: (px) =>
    stamp(
      px,
      [
        ".k...k...k.",
        "klk.klk.klk",
        "kyykyyykyyk",
        "kyyyyyyyyyk",
        "kdrdbdbdrdk",
        "kdddddddddk",
        ".kkkkkkkkk.",
      ],
      X - 5,
      TOP - 4,
      {
        k: OUTLINE,
        l: rgb("#fff0a0"),
        y: rgb("#f6c445"),
        d: rgb("#b9791c"),
        r: rgb("#e5484d"),
        b: rgb("#38b6f2"),
      },
    ),
};

const catEars: Accessory = {
  id: "cat-ears",
  name: "หูแมว",
  body: ["#3d3346"],
  paint: (px, headW, facing) =>
    pair(
      px,
      ["k.....", "kk....", "kpk...", "kppk..", "kpffk.", "kffffk"],
      { k: OUTLINE, f: rgb("#3d3346"), p: rgb("#f49ac1") },
      headW,
      facing,
      3,
    ),
};

const horns: Accessory = {
  id: "horns",
  name: "เขาปีศาจ",
  body: ["#d23a4a", "#8a1f2e"],
  paint: (px, headW, facing) =>
    pair(
      px,
      ["k....", "kk...", "krk..", ".krk.", ".krrk", "..kdk"],
      { k: rgb("#2a1018"), r: rgb("#d23a4a"), d: rgb("#8a1f2e") },
      headW,
      facing,
      2,
    ),
};

// Half the width of something worn across the head, narrower seen from the side.
const across = (headW: number, facing: number, min: number) =>
  Math.max(min, Math.round((headW / 2) * (0.45 + 0.55 * facing)));

function span(px: Pixels, y: number, half: number, colour: Rgb): void {
  for (let x = -half; x <= half; x++) put(px, X + x, y, colour);
}

const PETALS = ["#f472b6", "#ffd54a", "#7cc8ff"].map(rgb);

const flowerCrown: Accessory = {
  id: "flower-crown",
  name: "มงกุฎดอกไม้",
  body: ["#f472b6", "#ffd54a", "#7cc8ff"],
  paint: (px, headW, facing) => {
    const half = across(headW, facing, 4);
    const y = TOP + 4;
    for (let x = -half; x <= half; x++)
      put(px, X + x, y, rgb(x % 2 ? "#2f7a3a" : "#4fb35c"));
    for (let x = 0; x <= half; x += 4) {
      for (const side of x ? [-1, 1] : [1]) {
        const cx = X + side * x;
        const petal = PETALS[(x / 4) % PETALS.length];
        for (const [dx, dy] of [
          [0, -1],
          [-1, 0],
          [1, 0],
          [0, 1],
        ])
          put(px, cx + dx, y + dy, petal);
        put(px, cx, y, rgb("#ffb43a"));
      }
    }
  },
};

const witchHat: Accessory = {
  id: "witch-hat",
  name: "หมวกแม่มด",
  body: ["#4a2f86", "#6b48b8"],
  paint: (px, headW, facing) => {
    const brim = across(headW, facing, 6) + 2;
    const base = Math.max(3, brim - 4);
    const y = TOP + 2;
    const rise = 10;
    for (let k = 0; k < rise; k++) {
      const half = Math.round((k / (rise - 1)) * base);
      const row = y - rise + k;
      for (let x = -half; x <= half; x++)
        put(px, X + x, row, rgb(x < 0 ? "#6b48b8" : "#4a2f86"));
      put(px, X - half, row, OUTLINE);
      put(px, X + half, row, OUTLINE);
    }
    span(px, y - 2, base - 1, rgb("#f6c445"));
    span(px, y, brim, rgb("#4a2f86"));
    span(px, y + 1, brim - 1, OUTLINE);
    put(px, X - brim, y, OUTLINE);
    put(px, X + brim, y, OUTLINE);
  },
};

const topHat: Accessory = {
  id: "top-hat",
  name: "หมวกทรงสูง",
  body: ["#33333f", "#4d4d5e", "#2b2b36"],
  paint: (px, headW, facing) => {
    const brim = across(headW, facing, 5) + 1;
    const crown = Math.max(3, brim - 2);
    const y = TOP + 1;
    span(px, y - 9, crown, OUTLINE);
    for (let row = y - 8; row < y; row++) {
      span(px, row, crown, rgb(row >= y - 3 && row < y - 1 ? "#c0392b" : "#33333f"));
      put(px, X - crown + 1, row, rgb(row >= y - 3 && row < y - 1 ? "#e5655a" : "#4d4d5e"));
      put(px, X - crown, row, OUTLINE);
      put(px, X + crown, row, OUTLINE);
    }
    span(px, y, brim, rgb("#2b2b36"));
    span(px, y + 1, brim - 1, OUTLINE);
    put(px, X - brim, y, OUTLINE);
    put(px, X + brim, y, OUTLINE);
  },
};

const bunnyEars: Accessory = {
  id: "bunny-ears",
  name: "หูกระต่าย",
  body: ["#f4f1f6"],
  paint: (px, headW, facing) =>
    pair(
      px,
      [".kk.", "kwwk", "kwpk", "kwpk", "kwpk", "kwpk", "kwpk", "kwwk", "kwwk"],
      { k: OUTLINE, w: rgb("#f4f1f6"), p: rgb("#f49ac1") },
      headW,
      facing,
      3,
    ),
};

const foxEars: Accessory = {
  id: "fox-ears",
  name: "หูจิ้งจอก",
  body: ["#f08a2c"],
  paint: (px, headW, facing) =>
    pair(
      px,
      ["k......", "kk.....", "kdk....", "kcok...", "kccok..", "kccook.", "koooook"],
      { k: OUTLINE, d: rgb("#3a2016"), c: rgb("#ffe6c7"), o: rgb("#f08a2c") },
      headW,
      facing,
      3,
    ),
};

const bow: Accessory = {
  id: "bow",
  name: "โบว์",
  body: ["#e5484d", "#ff8f94", "#9e2a33"],
  paint: (px) =>
    stamp(
      px,
      [
        ".kkk...kkk.",
        "krrrk.krrrk",
        "krlrrkrrlrk",
        "krrrkdkrrrk",
        "krrkkkkkrrk",
        ".kk.krk.kk.",
        "....k.k....",
      ],
      X - 5,
      TOP - 5,
      {
        k: OUTLINE,
        r: rgb("#e5484d"),
        l: rgb("#ff8f94"),
        d: rgb("#9e2a33"),
      },
    ),
};

const headphones: Accessory = {
  id: "headphones",
  name: "หูฟัง",
  body: ["#f472b6", "#ffd1e6"],
  paint: (px, headW, facing) => {
    const spread = across(headW, facing, 4);
    for (let x = -spread; x <= spread; x++) {
      const y = TOP - 2 + Math.round((x / spread) ** 2 * 3);
      put(px, X + x, y, OUTLINE);
      put(px, X + x, y + 1, rgb("#4d4d5e"));
    }
    for (const side of [-1, 1]) {
      const cx = X + side * spread;
      for (let y = TOP + 1; y <= TOP + 6; y++)
        for (let dx = -1; dx <= 1; dx++)
          put(px, cx + dx, y, y === TOP + 1 || y === TOP + 6 || dx * side < 0 ? OUTLINE : rgb("#f472b6"));
      put(px, cx + side, TOP + 3, rgb("#ffd1e6"));
    }
  },
};

const sprout: Accessory = {
  id: "sprout",
  name: "ต้นอ่อน",
  body: ["#4fb35c", "#a8e07a"],
  paint: (px) =>
    stamp(
      px,
      [".kk.kk.", "klgkglk", "kggkggk", ".kkgkk.", "...g...", "...k..."],
      X - 3,
      TOP - 5,
      { k: OUTLINE, g: rgb("#4fb35c"), l: rgb("#a8e07a") },
    ),
};

const tiara: Accessory = {
  id: "tiara",
  name: "มงกุฎเจ้าหญิง",
  body: ["#c8d2e0", "#ffffff"],
  paint: (px) =>
    stamp(
      px,
      [
        ".....k.....",
        "....kpk....",
        ".k.kpppk.k.",
        "kwkkssskkwk",
        "ksssssssssk",
        ".kkkkkkkkk.",
      ],
      X - 5,
      TOP - 3,
      {
        k: OUTLINE,
        s: rgb("#c8d2e0"),
        w: rgb("#ffffff"),
        p: rgb("#f472b6"),
      },
    ),
};

const antlers: Accessory = {
  id: "antlers",
  name: "เขากวาง",
  body: ["#a0662e"],
  paint: (px, headW, facing) =>
    pair(
      px,
      ["k..k...", "kb.kb..", ".kbkbk.", "..kbbbk", "...kbk.", "...kbk."],
      { k: rgb("#3a2016"), b: rgb("#a0662e") },
      headW,
      facing,
      3,
    ),
};

export const ACCESSORIES: Accessory[] = [
  halo,
  crown,
  catEars,
  horns,
  flowerCrown,
  witchHat,
  topHat,
  bunnyEars,
  foxEars,
  bow,
  headphones,
  sprout,
  tiara,
  antlers,
];
