import { mix, put, rgb, type Pixels, type Rgb } from "../pixels";
import { layer, type Shape, type Xy } from "../wing-shapes";
import type { DrawnWing } from "../wings";

const LEAD = rgb("#1a1226");
const GOLD = ["#fff3a8", "#f4c63e", "#b9801c"].map(rgb);
const WHITE: Rgb = [255, 255, 255];
const JEWELS = {
  ruby: ["#ff6b7d", "#d81f45", "#8c1030"],
  sapphire: ["#6aa6ff", "#2457d6", "#14307f"],
  emerald: ["#5be8a0", "#12a661", "#0a6a3f"],
  amber: ["#ffd96a", "#f2a416", "#b0680c"],
  amethyst: ["#c78bff", "#8a3fd0", "#52208a"],
};
type Jewel = keyof typeof JEWELS;

const PANES: Record<string, Jewel> = {
  centre: "ruby",
  hub: "amber",
  A01: "sapphire",
  A234: "amethyst",
  B0: "ruby",
  B1: "emerald",
  B2: "sapphire",
  B3: "ruby",
  T0: "sapphire",
  T1: "amber",
  T2: "amethyst",
  T3: "sapphire",
  T4: "emerald",
};
const GLINTS = [
  "centre",
  "A01",
  "B0",
  "T1",
  "B2",
  "T3",
  "T0",
  "A234",
  "T2",
  "B1",
];

const W = 38;
const H = 44;
const ROOT: Xy = [0, 33];
const RAD = Math.PI / 180;
// Angles are measured around the root, bent by SWIRL so lead lines arc like feather shafts.
const SWIRL = (24 * RAD) / 40;
const EDGE = -70 * RAD;
const FEATHER = 15 * RAD;
const HUB = 8;
const CENTRE = 3.6;
const BAND = 3;
const HALF = 0.5;
const ARCH = 0.7;

const TIP = [43, 40.5, 38, 34, 29];
const NOTCH = [43, 32, 29.5, 26.5, 23, 18.5];
const INNER_END = [18.5, 18.5, 16, 16, 16];
const SPLIT = [...NOTCH.slice(1, 5), INNER_END[4]];
const WALL_FROM = [HUB, INNER_END[1], HUB, INNER_END[3], INNER_END[4]];

type Spot =
  | { kind: "lead" }
  | { kind: "band"; d: number; r: number }
  | { kind: "glass"; pane: string };

function spot(x: number, y: number): Spot | undefined {
  const r = Math.hypot(x - ROOT[0], y - ROOT[1]);
  const a = Math.atan2(y - ROOT[1], x - ROOT[0]) - SWIRL * r;
  if (r < HUB + HALF) {
    if (Math.abs(r - HUB) < HALF || Math.abs(r - CENTRE) < HALF)
      return { kind: "lead" };
    return { kind: "glass", pane: r < CENTRE ? "centre" : "hub" };
  }
  if (a < EDGE) {
    const out = r * Math.sin(EDGE - a);
    const taper = Math.min(1, (TIP[0] - 0.5 - r) / 7);
    if (taper <= 0 || out > HALF + BAND * taper) return undefined;
    return out < HALF ? { kind: "lead" } : { kind: "band", d: out - HALF, r };
  }
  const k = (a - EDGE) / FEATHER;
  const i = Math.floor(k);
  if (i >= TIP.length) return undefined;
  const across = k - i;
  const tipAt = i === 0 ? 0 : 0.5;
  const reach =
    across < tipAt
      ? NOTCH[i] + (TIP[i] - NOTCH[i]) * (across / tipAt) ** ARCH
      : NOTCH[i + 1] +
        (TIP[i] - NOTCH[i + 1]) * ((1 - across) / (1 - tipAt)) ** ARCH;
  if (r > reach) return undefined;
  const wall = (lateral: number, j: number) =>
    lateral < HALF &&
    j < TIP.length &&
    r >= WALL_FROM[j] &&
    r <= NOTCH[j] + HALF;
  if (
    wall(r * (a - EDGE - i * FEATHER), i) ||
    wall(r * (EDGE + (i + 1) * FEATHER - a), i + 1) ||
    Math.abs(r - INNER_END[i]) < HALF ||
    Math.abs(r - SPLIT[i]) < HALF
  )
    return { kind: "lead" };
  const pane =
    r < INNER_END[i]
      ? i < 2
        ? "A01"
        : "A234"
      : r < SPLIT[i]
        ? `B${i}`
        : `T${i}`;
  return { kind: "glass", pane };
}

const GRID = Array.from({ length: H }, (_, y) =>
  Array.from({ length: W }, (_, x) => spot(x + 0.5, y + 0.5)),
);
const at = (x: number, y: number): Spot | undefined => GRID[y]?.[x];
const samePane = (s: Spot | undefined, pane: string) =>
  s?.kind === "glass" && s.pane === pane;

/** Each glint sits at the pane's top-left pixel that has room around it. */
const GLINT_SPOTS = GLINTS.flatMap((pane): [string, Xy][] => {
  let best: Xy | undefined;
  let bestScore = Infinity;
  GRID.forEach((row, y) =>
    row.forEach((s, x) => {
      if (!samePane(s, pane)) return;
      const roomy = [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
        [1, 1],
      ].every(([dx, dy]) => samePane(at(x + dx, y + dy), pane));
      const score = x * 0.6 + y * 0.8 + (roomy ? 0 : 50);
      if (score < bestScore) {
        bestScore = score;
        best = [x, y];
      }
    }),
  );
  return best ? [[pane, best]] : [];
});

const inside: Shape = (x, y) =>
  spot(x, y) ? { t: 0, side: 0, half: 1 } : undefined;

function colour(x: number, y: number): Rgb {
  const s = at(x, y)!;
  if (s.kind === "lead") return LEAD;
  if (s.kind === "band") {
    const rivet = s.d > 1 && s.d < 2 && Math.round(s.r) % 7 === 0;
    return GOLD[rivet ? 2 : s.d < 1 ? 0 : s.d < 2 ? 1 : 2];
  }
  const ramp = JEWELS[PANES[s.pane]].map(rgb);
  const apart = (dx: number, dy: number) =>
    !samePane(at(x + dx, y + dy), s.pane);
  const lit = apart(-1, 0) || apart(0, -1);
  const shade = apart(1, 0) || apart(0, 1);
  return ramp[lit && !shade ? 0 : shade && !lit ? 2 : 1];
}

function paint(px: Pixels): void {
  layer(px, inside, LEAD, (_hit, x, y) => colour(x, y));
  for (const [pane, [x, y]] of GLINT_SPOTS) {
    const light = rgb(JEWELS[PANES[pane]][0]);
    put(px, x, y, mix(light, WHITE, 0.8));
    put(px, x + 1, y + 1, mix(light, WHITE, 0.45));
  }
}

export const stainedGlass: DrawnWing = {
  id: "own-stained-glass",
  name: "Stained Glass Wings",
  description:
    "ปีกกระจกสีแบบหน้าต่างโบสถ์ แผ่นกระจกสีทับทิม ไพลิน มรกต อำพัน และอเมทิสต์ คั่นด้วยเส้นตะกั่วสีเข้ม ขอบปีกด้านหน้ามีกรอบสีทอง มีประกายวาวบนกระจกบางแผ่น มีประกายแสงสีทองร่วงจากปีก กระพือช้า ๆ ตอนยืน เร็วขึ้นตอนเดิน",
  aura: "gold",
  far: 0xc0b8d8,
  drop: 0,
  w: W,
  h: H,
  root: { x: 0, y: 33 },
  paint,
};
