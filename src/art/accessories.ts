import { put, rgb, ring, stamp, type Pixels, type Rgb } from "./pixels";

/** An accessory's texture, with the top centre of the head it sits on at (x, top). */
export const ACCESSORY_ART = { w: 40, h: 28, x: 20, top: 16 };

export type Accessory = {
  id: string;
  name: string;
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

const PETALS = ["#f472b6", "#ffd54a", "#7cc8ff"].map(rgb);

const flowerCrown: Accessory = {
  id: "flower-crown",
  name: "มงกุฎดอกไม้",
  paint: (px, headW, facing) => {
    const half = Math.max(
      4,
      Math.round((headW / 2) * (0.45 + 0.55 * facing)),
    );
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

export const ACCESSORIES: Accessory[] = [
  halo,
  crown,
  catEars,
  horns,
  flowerCrown,
];
