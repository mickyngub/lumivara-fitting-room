import { pixels, put, rgb, stamp, type Pixels, type Rgb } from "./pixels";

export type FrameStyle = {
  id: string;
  name: string;
  colours: {
    outline: string;
    dark: string;
    mid: string;
    light: string;
    inner: string;
  };
  band: number;
  corner: "stud" | "gem" | "crystal" | "plate" | "rune";
  crest: "none" | "diamond" | "crown" | "wings" | "horns";
  gem: string;
  gemLight: string;
  sideGems?: boolean;
  bottomGem?: boolean;
  runes?: string;
};

/** The card on a 4x grid, the same pixel size as the characters in its frames. */
export const FRAME_GRID = {
  w: 106,
  h: 120,
  scale: 4,
  picture: { x: 6, y: 6, w: 94, h: 108 },
};
const RADIUS = 4;

export const FRAME_STYLES: FrameStyle[] = [
  {
    id: "classic",
    name: "คลาสสิก",
    colours: {
      outline: "#3b2a10",
      dark: "#7d6636",
      mid: "#c9a45c",
      light: "#ffe9a6",
      inner: "#7d6636",
    },
    band: 3,
    corner: "stud",
    crest: "none",
    gem: "#ffe9a6",
    gemLight: "#ffffff",
  },
  {
    id: "silver",
    name: "เงินยวง",
    colours: {
      outline: "#22262f",
      dark: "#5c6576",
      mid: "#aab4c8",
      light: "#f2f6ff",
      inner: "#8a94a8",
    },
    band: 3,
    corner: "gem",
    crest: "none",
    gem: "#7fd6ff",
    gemLight: "#e6fbff",
  },
  {
    id: "crystal",
    name: "คริสตัล",
    colours: {
      outline: "#08183a",
      dark: "#1a4f94",
      mid: "#3f8be0",
      light: "#bfe6ff",
      inner: "#6fb8ff",
    },
    band: 4,
    corner: "crystal",
    crest: "diamond",
    gem: "#7fe3ff",
    gemLight: "#ffffff",
    sideGems: true,
  },
  {
    id: "amethyst",
    name: "อเมทิสต์",
    colours: {
      outline: "#1a0830",
      dark: "#4b237f",
      mid: "#8e55e0",
      light: "#e6d1ff",
      inner: "#b48aff",
    },
    band: 4,
    corner: "gem",
    crest: "crown",
    gem: "#ff6ad5",
    gemLight: "#ffd1f2",
    sideGems: true,
  },
  {
    id: "legendary",
    name: "ตำนาน",
    colours: {
      outline: "#3a2306",
      dark: "#8a5a12",
      mid: "#e0a630",
      light: "#fff0b3",
      inner: "#ffd166",
    },
    band: 5,
    corner: "plate",
    crest: "wings",
    gem: "#ff4d6d",
    gemLight: "#ffd1da",
    sideGems: true,
    bottomGem: true,
  },
  {
    id: "obsidian",
    name: "ออบซิเดียน",
    colours: {
      outline: "#000000",
      dark: "#121218",
      mid: "#2a2a36",
      light: "#5a5a70",
      inner: "#ff3b3b",
    },
    band: 5,
    corner: "rune",
    crest: "horns",
    gem: "#ff3b3b",
    gemLight: "#ffb3b3",
    runes: "#ff3b3b",
    bottomGem: true,
  },
];

export const frameById = (id: string | undefined): FrameStyle =>
  FRAME_STYLES.find((f) => f.id === id) ?? FRAME_STYLES[0];

const mirrored = (half: string[]) =>
  half.map((row) => row + [...row.slice(0, -1)].reverse().join(""));

const PATTERNS = {
  stud: [".o.", "olo", ".o."],
  gem: ["..o..", ".oho.", "ohggo", ".ogo.", "..o.."],
  crystal: ["oo....", "oho...", ".ogho.", "..oggo", "...ogo", "....oo"],
  plate: [
    "ooooooo",
    "ollllmo",
    "olmgmdo",
    "olghgdo",
    "olmgmdo",
    "omddddo",
    "ooooooo",
  ],
  rune: ["..r..", ".r.r.", "r.r.r", ".r.r.", "..r.."],
  diamond: [
    "...o...",
    "..oho..",
    ".ohggo.",
    "oghggdo",
    ".oggdo.",
    "..odo..",
    "...o...",
  ],
  wings: mirrored([
    "oo.......",
    "llloo...o",
    ".ommlloog",
    "..oommloh",
    "....ooodg",
    ".......od",
  ]),
  crown: mirrored(["g....g", "l...ol", "lo.olm", "llolmm", "mmmmmm", "oooooo"]),
  horns: mirrored([
    "..o......",
    "..lo.....",
    "...lo....",
    "...mlo...",
    "....mmo.r",
    ".....oooo",
  ]),
};

function paletteOf(s: FrameStyle): Record<string, Rgb> {
  return {
    o: rgb(s.colours.outline),
    d: rgb(s.colours.dark),
    m: rgb(s.colours.mid),
    l: rgb(s.colours.light),
    g: rgb(s.gem),
    h: rgb(s.gemLight),
    r: rgb(s.runes ?? s.gem),
  };
}

/** Distance in grid pixels from the card's rounded outer edge, or -1 outside it. */
function edgeDistance(x: number, y: number, w: number, h: number): number {
  const cx = x < RADIUS ? RADIUS : x > w - 1 - RADIUS ? w - 1 - RADIUS : x;
  const cy = y < RADIUS ? RADIUS : y > h - 1 - RADIUS ? h - 1 - RADIUS : y;
  if (cx !== x && cy !== y) {
    const e = RADIUS - Math.hypot(x - cx, y - cy);
    return e < -0.35 ? -1 : Math.max(0, Math.round(e));
  }
  return Math.min(x, y, w - 1 - x, h - 1 - y);
}

/** The card's border as pixel art: transparent inside, so the plate, picture and labels show through. */
export function paintFrame(style: FrameStyle, grid = FRAME_GRID): Pixels {
  const { w, h, picture } = grid;
  const px = pixels(w, h);
  const pal = paletteOf(style);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const e = edgeDistance(x, y, w, h);
      if (e < 0 || e >= style.band) continue;
      const nearTopLeft = Math.min(x, y) <= Math.min(w - 1 - x, h - 1 - y);
      const c =
        e === 0
          ? pal.o
          : e === style.band - 1
            ? pal.d
            : e === 1
              ? nearTopLeft
                ? pal.l
                : pal.m
              : pal.m;
      put(px, x, y, c);
    }
  }
  const inner = rgb(style.colours.inner);
  const left = picture.x - 1;
  const right = picture.x + picture.w;
  const top = picture.y - 1;
  const bottom = picture.y + picture.h;
  for (let x = left; x <= right; x++) {
    put(px, x, top, inner);
    put(px, x, bottom, inner);
  }
  for (let y = top; y <= bottom; y++) {
    put(px, left, y, inner);
    put(px, right, y, inner);
  }
  if (style.runes) {
    const mid = Math.floor(style.band / 2);
    for (let x = 8; x < w - 8; x += 7) {
      put(px, x, mid, pal.r);
      put(px, x, h - 1 - mid, pal.r);
    }
    for (let y = 9; y < h - 9; y += 7) {
      put(px, mid, y, pal.r);
      put(px, w - 1 - mid, y, pal.r);
    }
  }
  const corner = PATTERNS[style.corner];
  const size = corner.length;
  const origin = (c: number) => Math.round(c - (size - 1) / 2);
  for (const [cx, cy, flip] of [
    [3, 3, false],
    [w - 4, 3, true],
    [3, h - 4, false],
    [w - 4, h - 4, true],
  ] as [number, number, boolean][]) {
    const pattern = cy > h / 2 ? [...corner].reverse() : corner;
    stamp(px, pattern, origin(cx), origin(cy), pal, flip);
  }
  if (style.sideGems) {
    const y = Math.round(picture.y + picture.h / 2) - 2;
    stamp(px, PATTERNS.gem, Math.round(style.band / 2) - 2, y, pal);
    stamp(px, PATTERNS.gem, w - 1 - Math.round(style.band / 2) - 2, y, pal);
  }
  if (style.bottomGem)
    stamp(px, PATTERNS.gem, Math.round(w / 2) - 2, h - 5, pal);
  const cx = Math.round((w - 1) / 2);
  if (style.crest !== "none") {
    const pattern = PATTERNS[style.crest];
    stamp(px, pattern, cx - Math.floor(pattern[0].length / 2), 0, pal);
  }
  return px;
}
