import type { Effect } from "../effects";
import {
  hash,
  mix,
  put,
  quantize,
  rgb,
  ring,
  stamp,
  TAU,
  wrap,
  type Pixels,
  type Point,
  type Rgb,
} from "../pixels";
import { calm, PLUS, WHITE } from "../scene-kit";

const pal = (...hex: string[]): Rgb[] => hex.map(rgb);

const PLUM = rgb("#8a3566");
const HAZE = rgb("#f5c8e2");
const GLOW = rgb("#fff3a0");
const STICK = rgb("#fff8fb");
const SKY = pal("#f3a3d1", "#f8b6d7", "#ffd2d0", "#ffe3c7");
const SPRINKLES = pal(
  "#ff4f9a",
  "#ffe14d",
  "#2fd0e8",
  "#ff8a3d",
  "#ffffff",
  "#8c5cf0",
);
const SWIRLS = [
  pal("#ff4f9a", "#ffe0ee"),
  pal("#25c7e6", "#dcf8ff"),
  pal("#9a6af2", "#ffd6ee"),
  pal("#ff8e3a", "#fff1a8"),
  pal("#2fcf8f", "#e6fff2"),
  pal("#ff5468", "#ffe9e6"),
];
const GUMS = pal(
  "#ff5468",
  "#ffae2e",
  "#ffe14d",
  "#46d98f",
  "#a97cf5",
  "#ff7cb8",
  "#35c8e8",
);

// g is the ground line the floor starts on, and s sizes everything against the
// 63 px of scenery the tested 118x88 stage has above it.
type View = { px: Pixels; feet: Point; g: number; s: number; lite: boolean };

type Lolly = {
  x: number;
  stick: number;
  r: number;
  lean: number;
  swirl: number;
  arms: number;
  sway: number;
};

type Drop = { x: number; r: number; gum: number };

type Hill = {
  base: number;
  mounds: [number, number, number][];
  body: Rgb[];
  frost: Rgb[];
  shade: Rgb;
  thick: number;
  period: number;
  drip: number;
  sprinkles: number;
  seed: number;
  haze: number;
  lollies: Lolly[];
  drops: Drop[];
};

const HILLS: Hill[] = [
  {
    base: 0.68,
    mounds: [
      [0.12, 0.22, 0.15],
      [0.52, 0.22, 0.18],
      [0.92, 0.24, 0.14],
    ],
    body: pal("#cdb2f3", "#b79aeb"),
    frost: pal("#fbf6ff", "#eadfff", "#d9c8fa"),
    shade: rgb("#a98adf"),
    thick: 2,
    period: 5,
    drip: 3,
    sprinkles: 14,
    seed: 3,
    haze: 0.35,
    lollies: [
      { x: 0.22, stick: 10, r: 3, lean: 0, swirl: 0, arms: 1, sway: 0.1 },
      { x: 0.36, stick: 9, r: 3, lean: 1, swirl: 3, arms: 1, sway: 0.5 },
      { x: 0.7, stick: 10, r: 3, lean: -1, swirl: 2, arms: 1, sway: 0.8 },
    ],
    drops: [{ x: 0.5, r: 2, gum: 5 }],
  },
  {
    base: 0.82,
    mounds: [
      [0.3, 0.2, 0.13],
      [0.72, 0.22, 0.15],
      [0.0, 0.16, 0.08],
    ],
    body: pal("#8fe3c8", "#6fd0b2"),
    frost: pal("#f3fffa", "#d6fbeb", "#b5efd8"),
    shade: rgb("#58b99b"),
    thick: 3,
    period: 7,
    drip: 4,
    sprinkles: 20,
    seed: 11,
    haze: 0.12,
    lollies: [
      { x: 0.27, stick: 12, r: 4, lean: -2, swirl: 2, arms: 3, sway: 0.7 },
      { x: 0.76, stick: 14, r: 5, lean: 2, swirl: 5, arms: 1, sway: 0.0 },
    ],
    drops: [
      { x: 0.13, r: 3, gum: 2 },
      { x: 0.58, r: 3, gum: 6 },
    ],
  },
  {
    base: 0.93,
    mounds: [
      [0.06, 0.24, 0.12],
      [0.5, 0.22, 0.02],
      [0.95, 0.24, 0.13],
    ],
    body: pal("#ff8fb2", "#f4709f"),
    frost: pal("#fff3f7", "#ffd3e2", "#ffb4cd"),
    shade: rgb("#d9548c"),
    thick: 3,
    period: 9,
    drip: 6,
    sprinkles: 26,
    seed: 23,
    haze: 0,
    lollies: [
      { x: 0.1, stick: 25, r: 8, lean: 0, swirl: 1, arms: 1, sway: 0.2 },
      { x: 0.15, stick: 14, r: 5, lean: 7, swirl: 0, arms: 3, sway: 0.6 },
      { x: 0.2, stick: 8, r: 3, lean: 6, swirl: 3, arms: 1, sway: 0.4 },
      { x: 0.92, stick: 22, r: 7, lean: 0, swirl: 3, arms: 1, sway: 0.6 },
      { x: 0.86, stick: 12, r: 4, lean: -4, swirl: 2, arms: 3, sway: 0.1 },
    ],
    drops: [
      { x: 0.3, r: 4, gum: 0 },
      { x: 0.345, r: 3, gum: 3 },
      { x: 0.72, r: 5, gum: 4 },
      { x: 0.77, r: 3, gum: 1 },
    ],
  },
];

const crestAt = ({ px, g, lite }: View, hill: Hill, x: number): number => {
  const u = x / px.w;
  let lift = 0;
  for (const [c, half, height] of hill.mounds) {
    const t = (u - c) / half;
    if (Math.abs(t) < 1) lift += height * 0.5 * (1 + Math.cos(Math.PI * t));
  }
  return Math.round(g * (hill.base - lift * (lite ? 1.6 : 1)));
};

const frostAt = ({ s }: View, hill: Hill, x: number): number => {
  const period = Math.max(3, Math.round(hill.period * s));
  const first = Math.floor(x / period) - 1;
  let drip = 0;
  for (let i = first; i <= first + 2; i++) {
    const c = (i + 0.5 + 0.35 * (hash(hill.seed + i * 2.3) - 0.5)) * period;
    const half = period * (0.3 + 0.18 * hash(hill.seed + i * 4.1));
    const t = (x - c) / half;
    if (Math.abs(t) < 1)
      drip = Math.max(
        drip,
        hill.drip *
          s *
          (0.2 + 0.8 * hash(hill.seed + i * 7.7)) *
          Math.sqrt(1 - t * t),
      );
  }
  return Math.round(Math.max(1, hill.thick * s) + drip);
};

function sprinkle(
  px: Pixels,
  x: number,
  y: number,
  c: Rgb,
  turn: number,
  limit: number,
): void {
  put(px, x, y, c);
  if (px.w < 60 || (turn && y + 1 >= limit)) return;
  put(px, x + (turn === 1 ? 0 : 1), y + (turn ? 1 : 0), c);
}

function paintHill(v: View, hill: Hill): void {
  const { px, g, lite } = v;
  const [rim, top, edge] = hill.frost;
  const [hi, lo] = hill.body;
  for (let x = 0; x < px.w; x++) {
    const y0 = crestAt(v, hill, x);
    const f = frostAt(v, hill, x);
    const slope = crestAt(v, hill, x + 2) - crestAt(v, hill, x - 2);
    const tilt = Math.max(-1, Math.min(1, slope / 4)) * 0.4;
    for (let y = Math.max(0, y0); y < px.h; y++) {
      const d = y - y0;
      put(
        px,
        x,
        y,
        d === 0
          ? rim
          : lite
            ? hi
            : d < f - 1
              ? top
              : d < f
                ? edge
                : d === f
                  ? mix(hi, hill.shade, 0.7)
                  : mix(hi, lo, quantize((d - f) / (g * 0.3) + tilt, 3, x, y)),
      );
    }
  }
  const n = lite ? 0 : Math.round((px.w / 118) * hill.sprinkles);
  for (let i = 0; i < n; i++) {
    const x = Math.floor(hash(hill.seed + i * 5.3) * px.w);
    const y0 = crestAt(v, hill, x);
    const f = frostAt(v, hill, x);
    const y =
      y0 + 1 + Math.floor(hash(hill.seed + i * 8.9) * Math.max(1, f - 1));
    const c =
      SPRINKLES[Math.floor(hash(hill.seed + i * 1.9) * SPRINKLES.length)];
    sprinkle(px, x, y, c, Math.floor(hash(hill.seed + i * 3.3) * 3), y0 + f);
  }
}

type Swirl = {
  a: Rgb;
  b: Rgb;
  edge: Rgb;
  arms: number;
  spin: number;
  shine: boolean;
};

function swirlDisc(
  px: Pixels,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  { a, b, edge, arms, spin, shine }: Swirl,
): void {
  const pitch = Math.max(3, rx * (arms === 1 ? 0.7 : 0.9));
  for (let y = -ry; y <= ry; y++)
    for (let x = -rx; x <= rx; x++) {
      const yy = (y * rx) / ry;
      const d = Math.hypot(x, yy);
      if (d > rx + 0.5) continue;
      let c = edge;
      if (d <= rx - 0.5) {
        const t = wrap((Math.atan2(yy, x) / TAU) * arms + d / pitch + spin);
        c = t < 0.5 ? a : b;
        if (d > rx - 1.5 && x + yy > 0) c = mix(c, PLUM, 0.16);
      }
      put(px, cx + x, cy + y, c);
    }
  if (shine && rx >= 3 && ry >= 3) {
    const sx = cx - Math.round(rx * 0.45);
    const sy = cy - Math.round(ry * 0.5);
    put(px, sx, sy, WHITE);
    if (rx >= 4) {
      put(px, sx + 1, sy, WHITE);
      put(px, sx, sy + 1, WHITE);
    }
  }
}

function glint(px: Pixels, x: number, y: number, b: number, a = 1): void {
  put(px, x, y, WHITE, Math.min(1, b * 1.4) * a);
  if (b > 0.45)
    for (const [dx, dy] of PLUS)
      put(px, x + dx, y + dy, GLOW, Math.min(1, b * 1.1) * a);
  if (b > 0.8)
    for (const [dx, dy] of PLUS)
      put(px, x + dx * 2, y + dy * 2, GLOW, b * 0.6 * a);
}

function lolly(v: View, hill: Hill, l: Lolly, phase: number): void {
  const { px, s } = v;
  if (l.r * s < 1.4) return;
  const r = Math.max(2, Math.round(l.r * s));
  const bx = Math.round(l.x * px.w);
  const by = crestAt(v, hill, bx) + 2;
  const sway = Math.sin(TAU * (phase + l.sway)) * (r >= 5 ? 1 : 0.6);
  const cx = Math.min(
    px.w - r - 2,
    Math.max(r + 1, bx + Math.round(l.lean * s + sway)),
  );
  const cy = by - Math.round(l.stick * s) - r;
  const [a, b] = SWIRLS[l.swirl].map((c) => mix(c, HAZE, hill.haze));
  const white = mix(STICK, HAZE, hill.haze);
  for (let y = cy + r - 1; y <= by; y++) {
    const t = (y - cy - r) / Math.max(1, by - cy - r);
    const x = Math.round(cx + (bx - cx) * t);
    for (let k = 0; k < (r >= 6 ? 2 : 1); k++)
      put(px, x + k, y, ((y + k) >> 1) % 2 ? a : white);
  }
  swirlDisc(px, cx, cy, r, r, {
    a,
    b,
    edge: mix(a, PLUM, 0.5 - hill.haze),
    arms: l.arms,
    spin: l.swirl % 2 ? -phase : phase,
    shine: true,
  });
  const pulse = Math.max(0, 1 - 7 * Math.abs(wrap(phase + l.sway) - 0.5));
  if (r >= 5 && pulse > 0.2)
    glint(px, cx - Math.round(r * 0.45), cy - Math.round(r * 0.5), pulse);
}

function gumdrop(
  px: Pixels,
  cx: number,
  base: number,
  r: number,
  c: Rgb,
): void {
  const h = Math.max(3, Math.round(r * 1.3));
  const lit = mix(c, WHITE, 0.5);
  const dim = mix(c, PLUM, 0.2);
  const deep = mix(c, PLUM, 0.42);
  for (let x = -r; x <= r; x++) put(px, cx + x, base + 1, PLUM, 0.16);
  for (let y = -h; y <= 0; y++)
    for (let x = -r; x <= r; x++) {
      const nx = x / (r + 0.5);
      const ny = y / (h + 0.5);
      if (nx * nx + ny * ny > 1) continue;
      const light = -0.6 * nx - 0.8 * ny;
      const sugar = r >= 4 && hash(x * 12.9 + y * 78.2 + cx) > 0.88;
      put(
        px,
        cx + x,
        base + y,
        y === 0 ? deep : light > 0.6 || sugar ? lit : light < -0.15 ? dim : c,
      );
    }
  const sx = cx - Math.round(r * 0.45);
  const sy = base - Math.round(h * 0.7);
  put(px, sx, sy, WHITE);
  if (r >= 4) put(px, sx + 1, sy, WHITE);
}

function paintHills(v: View, phase: number): void {
  for (const hill of HILLS) {
    for (const l of hill.lollies) lolly(v, hill, l, phase);
    paintHill(v, hill);
    if (v.lite) continue;
    for (const d of hill.drops) {
      const x = Math.round(d.x * v.px.w);
      const r = Math.max(2, Math.round(d.r * v.s));
      gumdrop(v.px, x, crestAt(v, hill, x) + 3, r, GUMS[d.gum]);
    }
  }
}

type Lobe = [number, number, number];

function cloud(
  px: Pixels,
  cx: number,
  cy: number,
  u: number,
  lobes: Lobe[],
  tones: Rgb[],
): void {
  for (let y = Math.floor(cy - 2.6 * u); y <= cy + 0.7 * u; y++)
    for (let x = Math.floor(cx - 3.6 * u); x <= cx + 3.6 * u; x++) {
      const bottom = cy + 0.7 * u - 0.5 * u * ((x - cx) / (3.4 * u)) ** 2;
      if (y > bottom) continue;
      let height = 0;
      let light = 0;
      for (const [lx, ly, lr] of lobes) {
        const r = lr * u;
        const dx = (x - cx - lx * u) / r;
        const dy = (y - cy - ly * u) / r;
        const q = 1 - dx * dx - dy * dy;
        if (q <= 0 || Math.sqrt(q) * r <= height) continue;
        height = Math.sqrt(q) * r;
        light = -0.5 * dx - 0.7 * dy + 0.5 * Math.sqrt(q);
      }
      if (!height) continue;
      let t = light > 0.82 ? 0 : light > 0.55 ? 1 : light > 0 ? 2 : 3;
      if (bottom - y < 1) t = 4;
      else if (bottom - y < 0.8 * u) t = Math.max(t, 3);
      put(px, x, y, tones[t]);
    }
}

const PINK_CLOUD = pal("#fff6fa", "#ffe4f1", "#ffcfe6", "#f6add4", "#e690c4");
const LILAC_CLOUD = pal("#f9f4ff", "#ebe0ff", "#d8c7fb", "#bda6ef", "#a68de0");
const PUFF: Lobe[] = [
  [-2.3, 0.15, 0.85],
  [-1.3, -0.35, 1.15],
  [-0.1, -0.85, 1.45],
  [1.25, -0.4, 1.2],
  [2.3, 0.1, 0.9],
];
const PUFF_SMALL: Lobe[] = [
  [-1.5, 0.1, 0.8],
  [-0.4, -0.5, 1.2],
  [0.9, -0.15, 1.0],
  [1.8, 0.2, 0.7],
];

const CLOUDS = [
  { y: 0.28, u: 4.6, copies: 2, lobes: PUFF, tones: PINK_CLOUD, at: 0.2 },
  {
    y: 0.43,
    u: 3.4,
    copies: 2,
    lobes: PUFF_SMALL,
    tones: LILAC_CLOUD,
    at: 0.62,
  },
  {
    y: 0.14,
    u: 2.6,
    copies: 3,
    lobes: PUFF_SMALL,
    tones: PINK_CLOUD,
    at: 0.05,
  },
];

function paintSky({ px, g }: View): void {
  for (let y = 0; y < px.h; y++)
    for (let x = 0; x < px.w; x++) {
      const t =
        quantize(Math.min(1, y / (g * 0.78)), 9, x, y) * (SKY.length - 1);
      const i = Math.min(SKY.length - 2, Math.floor(t));
      put(px, x, y, mix(SKY[i], SKY[i + 1], t - i));
    }
}

function paintClouds({ px, g, s }: View, phase: number): void {
  for (const c of CLOUDS) {
    const u = Math.max(1, c.u * s);
    const reach = 3.8 * u;
    const copies = Math.max(1, Math.round((c.copies * px.w) / 118));
    for (let k = 0; k < copies; k++) {
      const x = wrap((k + phase) / copies + c.at) * (px.w + reach * 2) - reach;
      cloud(px, x, c.y * g, u, c.lobes, c.tones);
    }
  }
}

function paintSparkles({ px, feet, g }: View, phase: number): void {
  const count = Math.round((px.w * g) / 480);
  for (let i = 0; i < count; i++) {
    const x = Math.round(wrap(0.07 + i * 0.618034) * (px.w - 1));
    const y = Math.round((0.07 + 0.76 * wrap(0.31 + i * 0.754878)) * g);
    const b =
      (0.5 + 0.5 * Math.sin(TAU * (phase * (1 + (i % 2)) + hash(i * 4.1)))) **
      3;
    if (b >= 0.2) glint(px, x, y, b, calm(px, feet, x, y));
  }
}

const FLOOR = {
  rim: rgb("#fffdf8"),
  cream: rgb("#fff4e6"),
  seam: rgb("#f7c9c4"),
  body: pal("#ffdcd6", "#ffc4c8"),
};

const floorTop = ({ px, g, s }: View, x: number): number => {
  const u = x / px.w;
  return Math.round(
    g +
      s *
        (1.6 * Math.sin(TAU * (u * 2 + 0.2)) +
          0.9 * Math.sin(TAU * (u * 5 + 0.7))),
  );
};

const lipAt = ({ s, lite }: View, x: number): number => {
  if (lite) return 2;
  const period = Math.max(3, Math.round(8 * s));
  const scallop = Math.abs(Math.sin((Math.PI * x) / period)) ** 0.8;
  return Math.max(2, Math.round(s * (2.2 + 2.6 * scallop)));
};

type Prop = { kind: string; x: number; t: number; c: number };

const PROPS: Prop[] = [
  { kind: "mint", x: 0.2, t: 0.45, c: 0 },
  { kind: "bean", x: 0.13, t: 0.15, c: 6 },
  { kind: "bean", x: 0.9, t: 0.12, c: 5 },
  { kind: "star", x: 0.79, t: 0.38, c: 2 },
  { kind: "heart", x: 0.7, t: 0.8, c: 0 },
  { kind: "bonbon", x: 0.26, t: 0.85, c: 4 },
  { kind: "mint", x: 0.84, t: 0.82, c: 0 },
];

const propAt = ({ px, g }: View, p: Prop): [number, number] => [
  Math.round(p.x * px.w),
  Math.round(g + p.t * (px.h - g)),
];

function paintFloor(v: View): void {
  const { px, feet, g, lite } = v;
  for (let x = 0; x < px.w; x++) {
    const top = floorTop(v, x);
    const lip = lipAt(v, x);
    for (let y = top; y < px.h; y++) {
      const d = y - top;
      put(
        px,
        x,
        y,
        d === 0
          ? FLOOR.rim
          : d < lip
            ? FLOOR.cream
            : d === lip
              ? FLOOR.seam
              : mix(
                  FLOOR.body[0],
                  FLOOR.body[1],
                  quantize((d - lip) / (px.h - top), 4, x, y),
                ),
      );
    }
  }
  if (lite) return;
  const props = PROPS.map((p) => propAt(v, p));
  for (let i = 0; i < Math.round((px.w * (px.h - g)) / 280); i++) {
    const x = Math.floor(hash(i * 6.1 + 2) * px.w);
    const top = floorTop(v, x) + lipAt(v, x) + 3;
    const y = Math.floor(top + hash(i * 3.7 + 1) * (px.h - top));
    if (((x - feet.x) / 34) ** 2 + ((y - feet.y) / 12) ** 2 < 1) continue;
    if (props.some(([cx, cy]) => Math.hypot(cx - x, (cy - y) * 1.6) < 9))
      continue;
    const c = SPRINKLES[Math.floor(hash(i * 2.9) * SPRINKLES.length)];
    sprinkle(px, x, y, c, Math.floor(hash(i * 8.3) * 3), px.h);
  }
}

const SPRITES: Record<string, string[]> = {
  bean: ["..aaaa..", ".aAAaaa.", ".aaaaadd", "..dddd.."],
  star: [
    "...a...",
    "..aAa..",
    "aaaAaaa",
    ".aaaaad",
    "..aaad.",
    ".aa.ad.",
    ".a...d.",
  ],
  heart: [".aa.aa.", "aAaaaaa", "aaaaaad", ".aaaad.", "..aad..", "...d..."],
  bonbon: [
    "w..aaaaa..w",
    "ww.aAaad.ww",
    "wwwaaaaawww",
    "ww.aaadd.ww",
    "w..adddd..w",
  ],
};

const MINT: Swirl = {
  a: rgb("#ff4d63"),
  b: rgb("#fff6f6"),
  edge: rgb("#b0304f"),
  arms: 4,
  spin: 0,
  shine: true,
};

const RUG: Swirl = {
  a: rgb("#ffc2d6"),
  b: rgb("#fff0ee"),
  edge: rgb("#f4a0bc"),
  arms: 8,
  spin: 0,
  shine: false,
};

function paintProp(v: View, p: Prop): void {
  const { px, s } = v;
  const [x, y] = propAt(v, p);
  if (p.kind === "mint")
    return swirlDisc(
      px,
      x,
      y,
      Math.round(5 * s),
      Math.max(2, Math.round(3 * s)),
      MINT,
    );
  const rows = SPRITES[p.kind];
  const c = GUMS[p.c];
  const ox = x - Math.floor(rows[0].length / 2);
  const oy = y - Math.floor(rows.length / 2);
  for (let i = 0; i < rows[0].length; i++)
    put(px, ox + i, oy + rows.length, PLUM, 0.1);
  stamp(px, rows, ox, oy, {
    a: c,
    A: mix(c, WHITE, 0.5),
    d: mix(c, PLUM, 0.3),
    w: WHITE,
  });
}

function cane(
  { px, s }: View,
  x: number,
  base: number,
  height: number,
  dir: number,
): void {
  const w = Math.max(1, Math.round(3 * s));
  const hook = Math.max(2, Math.round(4 * s));
  const top = Math.round(base - height + hook);
  const cells = new Set<number>();
  const key = (cx: number, cy: number) => (cy + 64) * 4096 + cx + 64;
  const mark = (cx: number, cy: number) => {
    for (let dy = 0; dy < w; dy++)
      for (let dx = 0; dx < w; dx++) cells.add(key(cx + dx, cy + dy));
  };
  for (let y = top; y <= base; y++) mark(x, y);
  for (let a = Math.PI; a <= TAU + 0.6; a += 0.1 / hook)
    mark(
      Math.round(x + dir * hook + dir * hook * Math.cos(a)),
      Math.round(top + hook * Math.sin(a) - (w - 1) / 2),
    );
  const edge = rgb("#b0304f");
  const red = rgb("#ff4d63");
  const white = rgb("#fff6f6");
  for (let y = top - hook - 2; y <= base + 1; y++)
    for (let cx = x - hook * 2 - 2; cx <= x + hook * 2 + 2; cx++) {
      if (cells.has(key(cx, y))) put(px, cx, y, (cx + y) % 6 < 3 ? red : white);
      else if (
        cells.has(key(cx - 1, y)) ||
        cells.has(key(cx + 1, y)) ||
        cells.has(key(cx, y - 1)) ||
        cells.has(key(cx, y + 1))
      )
        put(px, cx, y, edge);
    }
}

function paintFront(v: View): void {
  const { px, feet, s } = v;
  swirlDisc(px, feet.x, feet.y, 30, 10, RUG);
  cane(v, Math.round(px.w * 0.03), px.h - 4, 24 * s, 1);
  cane(v, Math.round(px.w * 0.955), px.h - 9, 20 * s, -1);
  for (const p of PROPS) paintProp(v, p);
}

export const candyLand: Effect = {
  id: "candy-land",
  name: "ดินแดนขนม",
  plate: "#c46a96",
  paint(px, feet, phase) {
    phase = wrap(phase);
    const lite = px.w < 60;
    const g = lite ? Math.round(px.h * 0.72) : feet.y - 8;
    const v: View = { px, feet, g, s: g / 63, lite };
    paintSky(v);
    paintClouds(v, phase);
    paintHills(v, phase);
    paintFloor(v);
    if (!lite) paintFront(v);
    paintSparkles(v, phase);
    ring(px, feet, 24, 7, rgb("#e87aa6"), 0.7);
  },
};
