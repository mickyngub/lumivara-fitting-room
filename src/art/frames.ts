import { pixels, put, rgb, stamp, TAU, type Pixels, type Rgb } from "./pixels";

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
  corner: keyof typeof PATTERNS;
  crest: "none" | keyof typeof CRESTS;
  gem: string;
  gemLight: string;
  sideGems?: boolean;
  bottomGem?: boolean;
  runes?: string;
  rings?: string[];
  trim?: {
    kind: "dots" | "wave" | "stripes";
    colour: string;
    light?: string;
    every?: number;
  };
  drips?: boolean;
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
  {
    id: "sakura",
    name: "ซากุระ",
    colours: {
      outline: "#4a1530",
      dark: "#b8407a",
      mid: "#f088b8",
      light: "#ffd6ea",
      inner: "#b8407a",
    },
    band: 4,
    corner: "blossom",
    crest: "blossom",
    gem: "#ffe066",
    gemLight: "#ffffff",
    trim: { kind: "dots", colour: "#ffffff", light: "#ffe066", every: 8 },
  },
  {
    id: "frost",
    name: "น้ำแข็ง",
    colours: {
      outline: "#173a6b",
      dark: "#5d9bd6",
      mid: "#a8dcff",
      light: "#ffffff",
      inner: "#e8f7ff",
    },
    band: 4,
    corner: "snowflake",
    crest: "snowflake",
    gem: "#bfefff",
    gemLight: "#ffffff",
    drips: true,
    sideGems: true,
  },
  {
    id: "inferno",
    name: "เพลิง",
    colours: {
      outline: "#2a0500",
      dark: "#b8240f",
      mid: "#f26a1f",
      light: "#ffd34d",
      inner: "#ffd34d",
    },
    band: 4,
    rings: ["#2a0500", "#ffb733", "#f26a1f", "#b8240f"],
    corner: "flame",
    crest: "flame",
    gem: "#fff1a8",
    gemLight: "#ffffff",
    bottomGem: true,
  },
  {
    id: "neon",
    name: "นีออน",
    colours: {
      outline: "#07000f",
      dark: "#1a0630",
      mid: "#ff3df0",
      light: "#ffc2fb",
      inner: "#3df5ff",
    },
    band: 4,
    rings: ["#07000f", "#ff3df0", "#ffc2fb", "#ff3df0"],
    corner: "bracket",
    crest: "none",
    gem: "#3df5ff",
    gemLight: "#e6ffff",
  },
  {
    id: "celestial",
    name: "ดวงดาว",
    colours: {
      outline: "#0b0a2a",
      dark: "#1d1b5e",
      mid: "#2e2c86",
      light: "#5b58c9",
      inner: "#f5c84c",
    },
    band: 5,
    corner: "star",
    crest: "moon",
    gem: "#ffd56b",
    gemLight: "#fff6c8",
    trim: { kind: "dots", colour: "#ffd56b", light: "#fff6c8", every: 9 },
  },
  {
    id: "rainbow",
    name: "สายรุ้ง",
    colours: {
      outline: "#3a1a4a",
      dark: "#5ab8ff",
      mid: "#ffb84a",
      light: "#ffffff",
      inner: "#b38cff",
    },
    band: 5,
    rings: ["#3a1a4a", "#ff5a6e", "#ffb84a", "#7ee06a", "#5ab8ff"],
    corner: "heart",
    crest: "heart",
    gem: "#ff7eb6",
    gemLight: "#ffffff",
  },
  {
    id: "forest",
    name: "ป่า",
    colours: {
      outline: "#1f1408",
      dark: "#4a3216",
      mid: "#7a5428",
      light: "#b08850",
      inner: "#4a3216",
    },
    band: 5,
    corner: "leaf",
    crest: "leaf",
    gem: "#4fb848",
    gemLight: "#b8f07a",
    trim: { kind: "wave", colour: "#4fb848", light: "#b8f07a" },
  },
  {
    id: "ocean",
    name: "ทะเล",
    colours: {
      outline: "#062a35",
      dark: "#0e6b7d",
      mid: "#1fa7b8",
      light: "#8ff0f0",
      inner: "#0e6b7d",
    },
    band: 5,
    corner: "shell",
    crest: "shell",
    gem: "#ffe8f0",
    gemLight: "#ffffff",
    trim: { kind: "wave", colour: "#e8ffff" },
    sideGems: true,
  },
  {
    id: "skull",
    name: "กะโหลก",
    colours: {
      outline: "#1a1410",
      dark: "#8a7f6a",
      mid: "#d8cfb8",
      light: "#fffaf0",
      inner: "#3a3228",
    },
    band: 4,
    corner: "skull",
    crest: "skull",
    gem: "#7dff6a",
    gemLight: "#e0ffd8",
  },
  {
    id: "thunder",
    name: "สายฟ้า",
    colours: {
      outline: "#120f00",
      dark: "#2b2600",
      mid: "#ffd21f",
      light: "#fff3a0",
      inner: "#2b2600",
    },
    band: 5,
    corner: "bolt",
    crest: "bolt",
    gem: "#ffe14d",
    gemLight: "#ffffff",
    trim: { kind: "stripes", colour: "#1a1600" },
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
  blossom: [
    ".oo.oo.",
    "ollollo",
    "olmgmlo",
    ".oghgo.",
    "olmgmlo",
    "ollollo",
    ".oo.oo.",
  ],
  snowflake: [
    ".o.o.o.",
    "olololo",
    ".olllo.",
    "olldllo",
    ".olllo.",
    "olololo",
    ".o.o.o.",
  ],
  flame: [
    "...o...",
    "..odoo.",
    ".odmodo",
    ".odmdmo",
    "odmlmdo",
    "odlglgo",
    ".ooooo.",
  ],
  bracket: [
    "..ooooo",
    ".ohhhho",
    "ohggggo",
    "ohgoooo",
    "ohgo...",
    "ohgo...",
    "oooo...",
  ],
  star: [
    "...o...",
    "..oho..",
    "ooohooo",
    "ohhgggo",
    ".ogggo.",
    ".ogogo.",
    ".oo.oo.",
  ],
  heart: [
    ".oo.oo.",
    "ohgoggo",
    "ogggggo",
    "ogggggo",
    ".ogggo.",
    "..ogo..",
    "...o...",
  ],
  leaf: [
    "....oo.",
    "...ohho",
    "..ohhgo",
    ".ohhggo",
    ".ohggo.",
    ".oggo..",
    "..oo...",
  ],
  shell: [
    "..ooo..",
    ".ohhho.",
    "ohoohgo",
    "ohogogo",
    "ogooogo",
    ".ogggo.",
    "..ooo..",
  ],
  skull: [
    ".ooooo.",
    "ollllmo",
    "olglgmo",
    "ololomo",
    "omlolmo",
    ".odmdo.",
    "..ooo..",
  ],
  bolt: [
    "..ooo..",
    ".odhgo.",
    "odhgddo",
    "odgggdo",
    "oddgddo",
    ".ogddo.",
    "..ooo..",
  ],
};

/** Corner patterns that stay upright at the bottom corners instead of mirroring top to bottom. */
const UPRIGHT: FrameStyle["corner"][] = [
  "flame",
  "star",
  "heart",
  "skull",
  "bolt",
];

const CRESTS = {
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
  blossom: mirrored([
    "....oo.",
    "..oollo",
    ".ololmg",
    "olglogh",
    ".ololmg",
    "..oollo",
    "....oo.",
  ]),
  snowflake: mirrored([
    "..ooo",
    ".olol",
    "oooll",
    "ollld",
    "oooll",
    ".olol",
    "..ooo",
  ]),
  flame: mirrored([
    ".....o",
    "....od",
    ".o..od",
    "odoodm",
    "oddoml",
    ".omdml",
    ".omllg",
    "..oooo",
  ]),
  moon: [
    "..ooo........",
    ".ohgo.....o..",
    "ohgo.....ogo.",
    "ohgo....oghgo",
    "oggo.....ogo.",
    "ogggoo....o..",
    ".oggggo......",
    "..oooo.......",
  ],
  heart: [
    ".ooo.ooo.",
    "ohhgogggo",
    "ohggggggo",
    "ogggggggo",
    ".ogggggo.",
    "..ogggo..",
    "...ogo...",
    "....o....",
  ],
  leaf: mirrored([
    ".ooo..",
    "ohggo.",
    "oghggo",
    ".oghgo",
    "..oohg",
    "....og",
    "....og",
    ".....o",
  ]),
  shell: mirrored([
    ".oo.oo",
    "ohgogg",
    "ohgogg",
    "oggogg",
    ".oggog",
    "..oggo",
    ".ogogg",
    "..oooo",
  ]),
  skull: mirrored([
    "..ooo",
    ".olll",
    "ollll",
    "ologl",
    "olool",
    "omllo",
    ".omdm",
    "..ooo",
  ]),
  bolt: [
    "..ooooo..",
    ".oddhggo.",
    "oddhggddo",
    "odhggggdo",
    "odddggddo",
    "oddggdddo",
    ".odgdddo.",
    "..ooooo..",
  ],
};

const DRIPS = [2, 4, 1, 3, 2, 5, 1, 3];

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

/** Every step pixels along an edge, centred on it like the crest and clear of the corners. */
function spaced(len: number, step: number): number[] {
  const c = Math.round((len - 1) / 2);
  const at: number[] = [];
  for (let p = c - Math.floor((c - 9) / step) * step; p < len - 9; p += step)
    at.push(p);
  return at;
}

/** The band's trim; `clear` is how far either side of the top centre the crest keeps for itself. */
function paintTrim(px: Pixels, style: FrameStyle, clear: number): void {
  const { w, h } = px;
  const { band, trim } = style;
  if (!trim) return;
  const c = rgb(trim.colour);
  const light = trim.light ? rgb(trim.light) : undefined;
  const mid = Math.floor(band / 2);
  if (trim.kind === "stripes") {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const e = edgeDistance(x, y, w, h);
        if (e >= 1 && e <= band - 2 && Math.floor((x + y) / 2) % 2 === 0)
          put(px, x, y, c);
      }
    }
  } else if (trim.kind === "dots") {
    const dot = (x: number, y: number) => {
      if (!light || band < 4) return put(px, x, y, c);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ])
        put(px, x + dx, y + dy, c);
      put(px, x, y, light);
    };
    for (const x of spaced(w, trim.every ?? 7)) {
      if (Math.abs(x - Math.round((w - 1) / 2)) > clear) dot(x, mid);
      dot(x, h - 1 - mid);
    }
    for (const y of spaced(h, trim.every ?? 7)) {
      dot(mid, y);
      dot(w - 1 - mid, y);
    }
  } else {
    const wave = (a: number) =>
      Math.min(
        band - 2,
        Math.max(1, mid + Math.round(Math.sin((a * TAU) / 8))),
      );
    // At a % 8 === 6 the wave is at its outermost; the fleck sits just inside that peak.
    const run = (
      len: number,
      plot: (a: number, e: number, colour: Rgb) => void,
    ) => {
      for (let a = RADIUS; a < len - RADIUS; a++) {
        plot(a, wave(a), c);
        if (light && a % 8 === 6) plot(a, wave(a) + 1, light);
      }
    };
    run(w, (x, e, colour) => {
      put(px, x, e, colour);
      put(px, x, h - 1 - e, colour);
    });
    run(h, (y, e, colour) => {
      put(px, e, y, colour);
      put(px, w - 1 - e, y, colour);
    });
  }
}

/** The card's border as pixel art: transparent inside, so the plate, picture and labels show through. */
export function paintFrame(style: FrameStyle, grid = FRAME_GRID): Pixels {
  const { w, h, picture } = grid;
  const px = pixels(w, h);
  const pal = paletteOf(style);
  const rings = style.rings?.map(rgb);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const e = edgeDistance(x, y, w, h);
      if (e < 0 || e >= style.band) continue;
      const nearTopLeft = Math.min(x, y) <= Math.min(w - 1 - x, h - 1 - y);
      const c = rings
        ? rings[e]
        : e === 0
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
  const cx = Math.round((w - 1) / 2);
  const crest = style.crest === "none" ? undefined : CRESTS[style.crest];
  const clear = crest ? Math.floor(crest[0].length / 2) + 1 : -1;
  paintTrim(px, style, clear);
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
  if (style.drips) {
    // Icicles hang from the band and stop at the picture's margin, which the crest keeps to as well.
    const room = picture.y + 2 - style.band;
    for (let x = picture.x + 3, i = 0; x <= right - 4; x += 4, i++) {
      if (Math.abs(x - cx) <= clear) continue;
      const n = Math.min(DRIPS[i % DRIPS.length], room);
      for (let k = 0; k < n; k++) put(px, x, style.band + k, k ? pal.m : pal.l);
    }
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
    const pattern =
      cy > h / 2 && !UPRIGHT.includes(style.corner)
        ? [...corner].reverse()
        : corner;
    stamp(px, pattern, origin(cx), origin(cy), pal, flip);
  }
  if (style.sideGems) {
    const y = Math.round(picture.y + picture.h / 2) - 2;
    stamp(px, PATTERNS.gem, Math.round(style.band / 2) - 2, y, pal);
    stamp(px, PATTERNS.gem, w - 1 - Math.round(style.band / 2) - 2, y, pal);
  }
  if (style.bottomGem)
    stamp(px, PATTERNS.gem, Math.round(w / 2) - 2, h - 5, pal);
  if (crest) stamp(px, crest, cx - Math.floor(crest[0].length / 2), 0, pal);
  return px;
}
