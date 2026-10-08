import type { Effect } from "../effects";
import { calm, PLUS, WHITE } from "../scene-kit";
import {
  hash,
  mix,
  put,
  quantize,
  rgb,
  ring,
  TAU,
  verticalGradient,
  wrap,
  type Pixels,
  type Rgb,
} from "../pixels";

const PINK = rgb("#ff2e97");
const CYAN = rgb("#19e8ff");
const VIOLET = rgb("#a566ff");
const LIME = rgb("#b6ff3d");
const WARM = rgb("#ffcf7a");
const PALE = rgb("#ffe6a8");
const EMBER = rgb("#ff9a4a");
const RED = rgb("#ff4a4a");
const RAIN = rgb("#a9bde0");
const BOARD = rgb("#0a0614");
const NIGHT = rgb("#0d0a22");
const TRIM = rgb("#2b2260");
const CITY_GLOW = rgb("#d13fa0");
const LIFT = rgb("#1d1a47");

const GLYPHS: Record<string, string[]> = {
  box: ["#####", "#...#", "#...#", "#...#", "#####"],
  field: ["#####", "#.#.#", "#####", "#.#.#", "#####"],
  hill: ["..#..", "#.#.#", "#.#.#", "#.#.#", "#####"],
  work: ["#####", "..#..", "..#..", "..#..", "#####"],
  ten: ["..#..", "..#..", "#####", "..#..", "..#.."],
  tree: ["..#..", "#####", ".###.", "#.#.#", "..#.."],
  rice: ["#.#.#", ".###.", "#####", ".###.", "#.#.#"],
  cup: ["#####", ".###.", "..#..", "..#..", ".###."],
  bolt: ["..##", ".##.", "####", ".##.", "##.."],
  next: ["#..", ".#.", "..#", ".#.", "#.."],
  back: ["..#", ".#.", "#..", ".#.", "..#"],
  two: ["###", "..#", "###", "#..", "###"],
  four: ["#.#", "#.#", "###", "..#", "..#"],
};

type Light = {
  x: number;
  y: number;
  w: number;
  h: number;
  c: Rgb;
  seed: number;
};
type Sign = Light & { glyphs: string[]; tall: boolean; buzz: boolean };
type Block = {
  x0: number;
  x1: number;
  top: number;
  bottom: number;
  wall: Rgb;
  edge: Rgb;
  inner: number;
  seed: number;
  flip: boolean;
};

const ramp = (stops: Rgb[], t: number): Rgb => {
  const s = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(s));
  return mix(stops[i], stops[i + 1], s - i);
};

const buzz = (phase: number, seed: number): number => {
  const t = wrap(phase * 3 + seed);
  return t < 0.06 || (t > 0.11 && t < 0.14) || (t > 0.5 && t < 0.52) ? 0.18 : 1;
};

function glyph(
  px: Pixels,
  rows: string[],
  x: number,
  y: number,
  c: Rgb,
  a: number,
): void {
  rows.forEach((row, r) =>
    [...row].forEach((ch, i) => {
      if (ch === "#") put(px, x + i, y + r, c, a);
    }),
  );
}

function glow(px: Pixels, s: Light, level: number): void {
  const reach = 6;
  for (let y = s.y - reach; y < s.y + s.h + reach; y++)
    for (let x = s.x - reach; x < s.x + s.w + reach; x++) {
      const d = Math.hypot(
        Math.max(s.x - x, 0, x - (s.x + s.w - 1)),
        Math.max(s.y - y, 0, y - (s.y + s.h - 1)),
      );
      if (d >= reach) continue;
      const q = quantize((1 - d / reach) ** 1.6 * level, 3, x, y);
      if (q > 0) put(px, x, y, s.c, q * 0.4);
    }
}

function sign(px: Pixels, s: Sign, level: number): void {
  const { x, y, w, h } = s;
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) put(px, x + i, y + j, BOARD);
  const tube = mix(BOARD, s.c, 0.25 + 0.75 * level);
  for (let i = 1; i < w - 1; i++) {
    put(px, x + i, y, tube);
    put(px, x + i, y + h - 1, tube);
  }
  for (let j = 1; j < h - 1; j++) {
    put(px, x, y + j, tube);
    put(px, x + w - 1, y + j, tube);
  }
  const all = s.glyphs.map((g) => GLYPHS[g]);
  const mid = Math.floor(all.length / 2);
  const gap = s.tall ? 1 : 2;
  const along = (r: string[]) => (s.tall ? r.length : r[0].length);
  const across = (r: string[]) => (s.tall ? r[0].length : r.length);
  const span = (rs: string[][]) =>
    rs.reduce((a, r) => a + along(r), 0) + gap * (rs.length - 1);
  const rows = [all, all.slice(mid, mid + 1)].find(
    (rs) =>
      rs.length &&
      span(rs) <= (s.tall ? h : w) - 2 &&
      rs.every((r) => across(r) <= (s.tall ? w : h) - 2),
  );
  if (!rows) return;
  let at = s.tall
    ? y + Math.round((h - span(rows)) / 2)
    : x + Math.round((w - span(rows)) / 2);
  const ink = mix(s.c, WHITE, 0.3);
  for (const r of rows) {
    if (s.tall)
      glyph(px, r, x + Math.round((w - r[0].length) / 2), at, ink, level);
    else glyph(px, r, at, y + Math.round((h - r.length) / 2), ink, level);
    at += along(r) + gap;
  }
}

function reflect(
  px: Pixels,
  phase: number,
  s: Light,
  from: number,
  len: number,
  level: number,
): void {
  const sway = (t: number) =>
    Math.round(
      (s.w > 3 ? 1.1 : 0.6) * Math.sin(TAU * (t * 1.5 - phase + s.seed)),
    );
  for (let x = Math.max(0, s.x); x < Math.min(px.w, s.x + s.w); x++) {
    let lit = 0;
    for (let y = Math.max(0, s.y); y < Math.min(px.h, s.y + s.h); y++) {
      const i = (y * px.w + x) * 4;
      if (px.data[i] + px.data[i + 1] + px.data[i + 2] > 330) lit++;
    }
    if (!lit) continue;
    const col =
      s.h < 4 ? 1 : Math.max(0.12, Math.min(1, (lit - 2) / (s.h * 0.55)));
    for (let y = from; y < Math.min(px.h, from + len); y++) {
      const t = (y - from) / len;
      const wave = Math.sin(TAU * (y / 5 - phase * 2 + s.seed));
      const v = (1 - t) * (0.72 + 0.28 * wave) * col * level * 1.3;
      const a = v > 0.62 ? 0.8 : v > 0.4 ? 0.5 : v > 0.2 ? 0.28 : 0;
      if (a) put(px, x + sway(t), y, s.c, a);
    }
  }
}

function building(
  px: Pixels,
  phase: number,
  b: Block,
  fine: boolean,
): Light | null {
  const { x0, x1, top, bottom, wall, seed, flip } = b;
  const trim = mix(wall, rgb("#4a3a9a"), 0.45);
  for (let y = top; y < bottom; y++)
    for (let x = x0; x < x1; x++) {
      const lift = quantize(((y - top) / (bottom - top)) * 0.6, 3, x, y);
      let c = mix(wall, LIFT, lift * 0.6);
      if ((x - x0) % 9 === 8) c = mix(c, BOARD, 0.5);
      if ((y - top) % 13 === 12) c = mix(c, trim, 0.5);
      put(px, x, y, c);
    }
  for (let x = x0; x < x1; x++) {
    put(px, x, top, trim);
    put(px, x, top + 1, mix(wall, BOARD, 0.5));
  }
  for (let y = top; y < bottom; y++) put(px, b.inner, y, b.edge);
  if (!fine) return null;

  const dim = mix(wall, rgb("#2a2468"), 0.5);
  const tv = [CYAN, PINK, VIOLET];
  for (let r = 0, wy = top + 5; wy < bottom - 12; r++, wy += 8)
    for (let c = 0, wx = x0 + 3; wx < x1 - 4; c++, wx += 5) {
      const h = hash(seed + r * 7.3 + c * 3.1);
      const lit = h < 0.68;
      const flick = lit && hash(seed + r * 2.1 + c * 9.7) > 0.88;
      const col = flick
        ? tv[Math.floor(wrap(phase * 3 + h) * 3)]
        : h < 0.3
          ? WARM
          : h < 0.46
            ? PALE
            : h < 0.54
              ? PINK
              : CYAN;
      const c2 = lit ? mix(wall, col, flick ? 0.85 : 0.9) : dim;
      for (let j = 0; j < 3; j++)
        for (let i = 0; i < 2; i++) put(px, wx + i, wy + j, c2);
    }
  const pipe = flip ? x1 - 4 : x0 + 2;
  for (let y = top + 2; y < bottom; y++) {
    put(px, pipe, y, BOARD);
    if (y % 9 === 0) put(px, pipe + 1, y, trim);
  }

  const ax = x0 + Math.round((x1 - x0) * (flip ? 0.78 : 0.25));
  for (let y = top - 6; y < top; y++) put(px, ax, y, BOARD);
  put(px, ax - 1, top - 4, BOARD);
  put(px, ax + 1, top - 4, BOARD);
  const on = wrap(phase * 2 + seed * 0.1) < 0.5;
  put(px, ax, top - 7, RED, on ? 1 : 0.25);
  if (on) for (const [dx, dy] of PLUS) put(px, ax + dx, top - 7 + dy, RED, 0.3);
  if (flip) {
    const tx = x0 + 6;
    for (let j = 0; j < 4; j++)
      for (let i = 0; i < 6; i++) put(px, tx + i, top - 7 + j, BOARD);
    for (let i = 1; i < 5; i++) put(px, tx + i, top - 8, BOARD);
    for (const lx of [tx + 1, tx + 4])
      for (let j = 0; j < 3; j++) put(px, lx, top - 3 + j, BOARD);
    for (let j = 0; j < 4; j++) put(px, tx, top - 7 + j, trim);
  } else {
    for (const [bx, bw] of [
      [x0 + 14, 6],
      [x0 + 22, 4],
    ])
      for (let i = 0; i < bw; i++) {
        put(px, bx + i, top - 2, trim);
        put(px, bx + i, top - 1, BOARD);
      }
  }

  const door = flip ? x1 - 11 : x0 + 11;
  for (let j = 0; j < 9; j++)
    for (let i = 0; i < 5; i++)
      put(px, door + i, bottom - 9 + j, i === 0 || j === 0 ? trim : BOARD);
  const lantern: Light = {
    x: door + 1,
    y: bottom - 12,
    w: 3,
    h: 2,
    c: EMBER,
    seed: 0.9,
  };
  glow(px, lantern, 0.8);
  for (let j = 0; j < lantern.h; j++)
    for (let i = 0; i < lantern.w; i++)
      put(px, lantern.x + i, lantern.y + j, mix(EMBER, WHITE, 0.45));
  return lantern;
}

function puddle(
  px: Pixels,
  phase: number,
  cx: number,
  cy: number,
  rx: number,
  tint: Rgb,
  seed: number,
): void {
  const ry = Math.max(1, Math.round(rx * 0.25));
  const sheen = rgb("#4a3a9a");
  for (let dy = -ry; dy <= ry; dy++)
    for (let dx = -rx; dx <= rx; dx++) {
      const wob = 1 + 0.2 * Math.sin(TAU * ((dx / rx) * 0.9 + seed * 0.37));
      if ((dx / rx) ** 2 + (dy / (ry * wob)) ** 2 > 1) continue;
      put(px, cx + dx, cy + dy, dy < 0 ? mix(sheen, tint, 0.35) : sheen, 0.6);
    }
  for (let i = 0; i < Math.max(2, Math.round(rx * 0.7)); i++)
    put(
      px,
      cx - Math.round(rx * 0.55) + i,
      cy - Math.max(0, ry - 1),
      mix(tint, WHITE, 0.55),
    );
  for (let n = 0; n < 2; n++) {
    if (wrap(phase * 2 + hash(seed * 3 + n * 5.1)) > 0.45) continue;
    put(
      px,
      cx + Math.round((hash(seed + n * 2.7) - 0.5) * rx * 1.4),
      cy + Math.round((hash(seed * 2 + n) - 0.5) * ry),
      WHITE,
      0.9,
    );
  }
}

export const neonRain: Effect = {
  id: "neon-rain",
  name: "เมืองนีออน",
  plate: "#120c2e",
  paint(px, feet, phase) {
    phase = wrap(phase);
    const W = px.w;
    const H = px.h;
    const fine = H >= 56;
    const sk = Math.min(1, W / 118);
    const s = (n: number, min = 1) =>
      Math.max(fine ? min : 1, Math.round(n * sk));
    const ground = Math.round(Math.min(H * 0.74, feet.y - H * 0.09));
    const horizon = ground - Math.round(H * 0.07);
    const nearW = Math.min(Math.round(W * 0.27), 38);
    const topL = Math.round(H * 0.08);
    const topR = Math.round(H * 0.16);

    verticalGradient(px, [rgb("#06071e"), rgb("#0d0b2b"), rgb("#171040")], 10);
    const glowTop = Math.round(horizon - H * 0.45);
    for (let y = Math.max(0, glowTop); y < horizon; y++)
      for (let x = 0; x < W; x++) {
        const v = ((y - glowTop) / (horizon - glowTop)) ** 1.7;
        const q = quantize(v * 0.95, 6, x, y);
        if (q > 0) put(px, x, y, CITY_GLOW, q * 0.55);
      }

    const layers = [
      { n: 7, lo: 0.3, hi: 0.55, top: "#2b2c78", low: "#5b3498", seed: 3 },
      { n: 9, lo: 0.18, hi: 0.4, top: "#202266", low: "#482d92", seed: 9 },
    ];
    layers.forEach((layer, li) => {
      const cell = W / layer.n;
      const [topC, lowC] = [rgb(layer.top), rgb(layer.low)];
      const edgeC = mix(lowC, rgb("#9a70e0"), 0.4);
      for (let i = 0; i < layer.n; i++) {
        const cx =
          (i + 0.5) * cell + (hash(i * 3.1 + layer.seed) - 0.5) * cell * 0.6;
        const w = Math.max(
          2,
          Math.round(cell * (0.55 + 0.4 * hash(i * 5.3 + layer.seed))),
        );
        const x0 = Math.round(cx - w / 2);
        const top =
          horizon -
          Math.round(
            H * (layer.lo + (layer.hi - layer.lo) * hash(i * 7.7 + layer.seed)),
          );
        const crown = w >= 6 && hash(i * 2.3 + layer.seed) > 0.45 ? 3 : 0;
        for (let y = top - crown; y < horizon; y++)
          for (let x = x0; x < x0 + w; x++) {
            if (y < top && (x < x0 + 1 || x > x0 + w - 2)) continue;
            const t = (y - top + crown) / (horizon - top + crown);
            put(
              px,
              x,
              y,
              x === x0 + w - 1 && w > 3
                ? mix(edgeC, lowC, t)
                : mix(topC, lowC, quantize(t ** 1.3, 4, x, y)),
            );
          }
        if (w >= 5 && !crown && hash(i * 4.9 + layer.seed) > 0.5)
          for (let y = top - 4; y < top; y++)
            put(px, x0 + Math.floor(w / 2), y, topC);
        if (w >= 5)
          for (let wy = top + 3; wy < horizon - 3; wy += 4)
            for (let wx = x0 + 1; wx < x0 + w - 1; wx += 3) {
              const h = hash(wx * 3.7 + wy * 1.3 + layer.seed);
              if (h < 0.3)
                put(
                  px,
                  wx,
                  wy,
                  h < 0.12 ? WARM : h < 0.2 ? CYAN : PINK,
                  li ? 0.85 : 0.5,
                );
            }
        if (li === 1 && i === 3) {
          const on = wrap(phase * 2) < 0.5;
          put(px, x0 + Math.floor(w / 2), top - crown - 1, RED, on ? 1 : 0.25);
        }
      }
    });

    const asphalt = [rgb("#7a2c8c"), rgb("#27164d"), rgb("#0b0919")];

    for (let y = horizon; y < H; y++) {
      const t = (y - horizon) / Math.max(1, H - 1 - horizon);
      for (let x = 0; x < W; x++)
        put(px, x, y, ramp(asphalt, quantize(t ** 0.6, 7, x, y)));
    }

    const lampColours = [PINK, CYAN, WARM, LIME, RED];
    for (let i = 0; i < Math.max(3, Math.round(W / 12)); i++) {
      const x = Math.round(
        nearW + hash(i * 4.1 + 2) * Math.max(1, W - 2 * nearW),
      );
      const y = horizon + 1 + Math.round(hash(i * 6.3) * 2);
      const c = lampColours[i % lampColours.length];
      for (const [dx, dy] of PLUS) put(px, x + dx, y + dy, c, 0.35);
      put(px, x, y, mix(c, WHITE, 0.5));
      const lamp = { x, y, w: 1, h: 1, c, seed: i * 0.13 };
      reflect(px, phase, lamp, y + 2, Math.round(H * 0.12), 0.9);
    }

    const lanterns = [
      building(
        px,
        phase,
        {
          x0: 0,
          x1: nearW,
          top: topL,
          bottom: ground,
          wall: rgb("#0f0c26"),
          edge: rgb("#7a3fc0"),
          inner: nearW - 1,
          seed: 11,
          flip: false,
        },
        fine,
      ),
      building(
        px,
        phase,
        {
          x0: W - nearW,
          x1: W,
          top: topR,
          bottom: ground,
          wall: rgb("#120d2a"),
          edge: rgb("#2f7ac0"),
          inner: W - nearW,
          seed: 29,
          flip: true,
        },
        fine,
      ),
    ];
    for (let x = 0; x < W; x++)
      if (x < nearW || x >= W - nearW) {
        put(px, x, ground, TRIM);
        put(px, x, ground + 1, NIGHT);
      }

    if (fine)
      for (const [ya, yb, sag] of [
        [topL + 12, topR + 10, 0.07],
        [topL + 18, topR + 15, 0.05],
      ])
        for (let x = nearW; x <= W - nearW; x++) {
          const t = (x - nearW) / (W - 2 * nearW);
          put(px, x, ya + (yb - ya) * t + H * sag * 4 * t * (1 - t), BOARD);
        }

    const tall = Math.round(H * 0.33);
    const tallW = s(9, 7);
    const rightTall = W - nearW - 1;
    const violetX = rightTall + tallW + 1;
    const signs: Sign[] = [
      {
        x: nearW + 1 - tallW,
        y: topL + 9,
        w: tallW,
        h: tall,
        c: PINK,
        glyphs: ["box", "field", "hill", "work"],
        tall: true,
        seed: 0.1,
        buzz: false,
      },
      {
        x: s(2),
        y: ground - Math.round(H * 0.24),
        w: s(20),
        h: s(7, 7),
        c: CYAN,
        glyphs: ["next", "cup", "back"],
        tall: false,
        seed: 0.35,
        buzz: true,
      },
      {
        x: rightTall,
        y: topR + 8,
        w: tallW,
        h: tall,
        c: LIME,
        glyphs: ["ten", "tree", "rice", "box"],
        tall: true,
        seed: 0.6,
        buzz: false,
      },
      {
        x: violetX,
        y: ground - Math.round(H * 0.38),
        w: Math.min(s(23), W - 1 - violetX),
        h: s(7, 7),
        c: VIOLET,
        glyphs: ["bolt", "work", "bolt"],
        tall: false,
        seed: 0.85,
        buzz: true,
      },
      {
        x: W - s(21),
        y: ground - Math.round(H * 0.24),
        w: s(11, 11),
        h: s(7, 7),
        c: PINK,
        glyphs: ["two", "four"],
        tall: false,
        seed: 0.5,
        buzz: false,
      },
    ];
    const levels = signs.map((g) => (g.buzz ? buzz(phase, g.seed) : 1));
    signs.forEach((g, i) => glow(px, g, levels[i] * 0.9));
    const machine: Light = {
      x: W - nearW + s(11),
      y: ground - 12,
      w: s(6),
      h: 11,
      c: CYAN,
      seed: 0.2,
    };
    if (fine) {
      glow(px, machine, 0.5);
      for (let j = 0; j < machine.h; j++)
        for (let i = 0; i < machine.w; i++)
          put(
            px,
            machine.x + i,
            machine.y + j,
            i === 0 || i === machine.w - 1 || j === machine.h - 1
              ? NIGHT
              : j < 2
                ? CYAN
                : j % 3 === 0
                  ? mix(CYAN, WHITE, 0.6)
                  : [PINK, LIME, WARM][(i + j) % 3],
          );
    }
    signs.forEach((g, i) => sign(px, g, levels[i]));

    const puddles: [number, number, number, Rgb][] = [
      [0.2, 0.3, 8, PINK],
      [0.8, 0.22, 9, LIME],
      [0.36, 0.78, 11, CYAN],
      [0.68, 0.85, 12, VIOLET],
      [0.52, 0.5, 7, PINK],
    ];
    puddles.forEach(([u, v, hw, tint], n) =>
      puddle(
        px,
        phase,
        Math.round(u * W),
        Math.round(ground + 3 + v * (H - ground - 6)),
        s(hw),
        tint,
        n + 1,
      ),
    );

    const len = Math.round(H * 0.34);
    if (fine)
      reflect(px, phase, machine, ground + 2, Math.round(len * 0.6), 0.8);
    for (const l of lanterns)
      if (l) reflect(px, phase, l, ground + 2, Math.round(len * 0.4), 0.8);
    signs.forEach((g, i) => reflect(px, phase, g, ground + 2, len, levels[i]));

    const rainCount = Math.round((W * H) / 55);
    for (let i = 0; i < rainCount; i++) {
      const near = i % 3 === 0;
      const rl = near ? 5 : 3 + (i % 2);
      const p = wrap(phase * (near ? 5 : 4) + hash(i * 1.9));
      const y = -rl + p * (H + 2 * rl);
      const x = hash(i * 5.3) * (W + 36) - 6 - 0.35 * (y + rl);
      const a = (near ? 0.6 : 0.34) * calm(px, feet, x, y);
      for (let j = 0; j < rl; j++)
        put(px, x + j * 0.35, y - j, RAIN, a * (1 - (j / rl) * 0.8));
    }

    for (let i = 0; i < Math.round((W * (H - ground)) / 70); i++) {
      const t = phase * 3 + hash(i * 2.3);
      const age = t - Math.floor(t);
      if (age > 0.36) continue;
      const pass = Math.floor(t) % 3;
      const x = Math.round(hash(i * 4.7 + pass * 13.1) * W);
      const y = Math.round(
        ground + 3 + hash(i * 6.1 + pass * 7.7) * (H - ground - 5),
      );
      const c = mix(mix(RAIN, x < W / 2 ? CYAN : VIOLET, 0.3), WHITE, 0.25);
      if (age < 0.12) put(px, x, y, c);
      else if (age < 0.24) {
        put(px, x - 1, y - 1, c);
        put(px, x + 1, y - 1, c);
        put(px, x, y, c, 0.7);
      } else {
        put(px, x - 2, y, c, 0.5);
        put(px, x + 2, y, c, 0.5);
      }
    }

    ring(px, feet, 24, 7, rgb("#7fe8ff"), 0.5);
  },
};
