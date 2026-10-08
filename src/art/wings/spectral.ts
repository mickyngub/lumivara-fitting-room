import type { DrawnWing } from "../wings";
import { put, rgb, type Pixels } from "../pixels";

const W = 38;
const H = 44;
const DEG = Math.PI / 180;

type Wisp = {
  y: number;
  deg: number;
  len: number;
  width: number;
  bend: number;
  wave: number;
  curl: number;
  phase: number;
};

type Sample = { x: number; y: number; tx: number; ty: number; t: number };

const WISPS: Wisp[] = [
  {
    y: 32.8,
    deg: 18,
    len: 23,
    width: 7,
    bend: 6,
    wave: 8,
    curl: -250,
    phase: 0.4,
  },
  {
    y: 31.2,
    deg: -2,
    len: 31,
    width: 8,
    bend: 18,
    wave: 12,
    curl: -270,
    phase: 1.3,
  },
  {
    y: 29.6,
    deg: -20,
    len: 36,
    width: 9,
    bend: 24,
    wave: 14,
    curl: -280,
    phase: 2.2,
  },
  {
    y: 28,
    deg: -38,
    len: 38,
    width: 9,
    bend: 28,
    wave: 14,
    curl: -280,
    phase: 3.1,
  },
  {
    y: 26.4,
    deg: -56,
    len: 36,
    width: 9,
    bend: 26,
    wave: 12,
    curl: -280,
    phase: 4,
  },
  {
    y: 24.8,
    deg: -74,
    len: 31,
    width: 8,
    bend: 22,
    wave: 10,
    curl: -270,
    phase: 4.9,
  },
];

const OUT = rgb("#0c3f55");
const TONE = ["#f8ffff", "#d2f7f5", "#92dedf", "#4aa4b2"].map(rgb);
const HOLLOW = rgb("#1f6f84");

function spine(w: Wisp): Sample[] {
  const step = 0.5;
  const n = Math.round(w.len / step);
  const out: Sample[] = [];
  let x = 0.5;
  let y = w.y;
  let a = w.deg * DEG;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push({ x, y, tx: Math.cos(a), ty: Math.sin(a), t });
    const u = Math.max(0, (t - 0.6) / 0.4);
    a +=
      ((t < 0.6 ? (w.bend * DEG) / (0.6 * w.len) : 0) +
        ((w.wave * DEG * Math.PI * 2) / w.len) * Math.cos(Math.PI * 2 * t) +
        (w.curl * DEG * 3 * u * u) / (0.4 * w.len)) *
      step;
    x += Math.cos(a) * step;
    y += Math.sin(a) * step;
  }
  return out;
}

const halfAt = (w: Wisp, t: number) =>
  Math.max(
    0.55,
    ((w.width / 2) * (1 - t) ** 1.1 + 0.4 * (1 - t)) *
      (1 + 0.1 * Math.sin(Math.PI * 2 * 2.3 * t + w.phase)) +
      (t > 0.08 && t < 0.8
        ? 0.3 * Math.sin(Math.PI * 2 * 4.1 * t + w.phase * 2)
        : 0),
  );

type Cell = { half: number; side: number; gap: number; t: number };

function cells(w: Wisp, path: Sample[]): Cell[] {
  const out: Cell[] = new Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let gap = Infinity;
      let at = path[0];
      for (const p of path) {
        const g = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) - halfAt(w, p.t);
        if (g < gap) {
          gap = g;
          at = p;
        }
      }
      const lit = Math.sign(at.tx * 0.8 - at.ty * 0.6) || 1;
      const side = ((x + 0.5 - at.x) * at.ty - (y + 0.5 - at.y) * at.tx) * lit;
      out[y * W + x] = { half: halfAt(w, at.t), side, gap, t: at.t };
    }
  return out;
}

/** Dark slits in the open space between neighbouring wisps, fainter toward the tails. */
function hollows(px: Pixels, paths: Sample[][]): void {
  const slits = new Map<number, number>();
  for (let i = 0; i + 1 < WISPS.length; i++)
    for (let t = 0.12; t < 0.72; t += 0.02) {
      const a = paths[i][Math.round(t * (paths[i].length - 1))];
      const b = paths[i + 1][Math.round(t * (paths[i + 1].length - 1))];
      const free =
        Math.hypot(a.x - b.x, a.y - b.y) -
        halfAt(WISPS[i], t) -
        halfAt(WISPS[i + 1], t);
      if (free < 1.8) continue;
      const r = Math.min(2.6, (free / 2) * 0.85);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const alpha = 0.42 - 0.24 * ((t - 0.12) / 0.6);
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++)
          if (Math.hypot(x + 0.5 - mx, y + 0.5 - my) < r)
            slits.set(y * W + x, Math.max(alpha, slits.get(y * W + x) ?? 0));
    }
  for (const [key, a] of slits)
    put(px, key % W, Math.floor(key / W), HOLLOW, Math.round(a * 10) / 10);
}

function paint(px: Pixels): void {
  const paths = WISPS.map(spine);
  hollows(px, paths);
  WISPS.forEach((w, i) => {
    const c = cells(w, paths[i]);
    const inside = (x: number, y: number) =>
      x >= 0 && y >= 0 && x < W && y < H && c[y * W + x].gap < 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const cell = c[y * W + x];
        if (cell.gap < 0) {
          const lean = cell.side / cell.half;
          const core = Math.abs(lean);
          const tone = lean > 0.05 ? 0 : lean > -0.4 ? 1 : lean > -0.78 ? 2 : 3;
          const a = core < 0.45 ? 0.95 : core < 0.8 ? 0.82 : 0.68;
          put(
            px,
            x,
            y,
            TONE[tone],
            Math.round(a * (1 - 0.18 * cell.t) * 8) / 8,
          );
        } else if (
          cell.half > 1.5 &&
          cell.t > 0.22 &&
          [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ].some(([dx, dy]) => inside(x + dx, y + dy))
        )
          put(px, x, y, OUT, 0.6);
      }
  });
}

export const spectral: DrawnWing = {
  id: "own-spectral",
  name: "Spectral Wings",
  description:
    "ปีกวิญญาณสีฟ้าอมเขียวซีดเกือบขาว เป็นริ้วควันโปร่งแสงพุ่งออกจากโคนปีก เรียวแหลมเป็นหางควันม้วนเป็นวง มีโพรงสีเขียวอมฟ้าเข้มจาง ๆ แทรกอยู่ระหว่างริ้ว มีควันสีม่วงและแดงหมุนวนรอบตัวและประกายไฟลอยขึ้น กระพือช้า ๆ ตอนยืน เร็วขึ้นตอนเดิน",
  aura: "demon",
  far: 0xa8c8d0,
  drop: 0,
  w: W,
  h: H,
  root: { x: 0, y: 30 },
  paint,
};
